"""
POV + Python (Flask) — bloqueo → cobro → confirmación, y el receptor de webhooks.

Ejecutar:
    pip install -r requirements.txt
    export POV_SECRET_KEY=sk_test_pega_la_tuya
    flask --app app run --port 4000
"""

import os
import time
import uuid

import requests
from flask import Flask, jsonify, request

from firma import verificar_firma  # la verificación, en su propio módulo para poder probarla

app = Flask(__name__)

POV = os.environ.get("POV_BASE_URL", "https://pov.uy")
SHOWTIME = os.environ.get("POV_SHOWTIME", "shw_cine_2d")
PK = os.environ.get("POV_PUBLIC_KEY", "pk_test_f286048e92dff3b8caffd6e9ea41f1fb6aaf")
SK = os.environ.get("POV_SECRET_KEY", "")
WHSEC = os.environ.get("POV_WEBHOOK_SECRET", "")

# Tu "base de datos" de ventas. Lo importante es que la clave de idempotencia se guarda CON la
# venta: se genera una vez y se reutiliza en todos los reintentos.
VENTAS: dict[str, dict] = {}
EVENTOS_VISTOS: set[str] = set()


@app.get("/")
def pagina():
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Ejemplo POV + Flask</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}}
pre{{background:#f4f4f5;padding:1rem;border-radius:.5rem;overflow-x:auto}}</style></head><body>
<h1>Comprá tu entrada</h1>
<div data-pov data-showtime="{SHOWTIME}" data-key="{PK}"></div>
<script src="{POV}/v1/embed.js" async></script>
<h2>Estado</h2><pre id="log">Elegí butacas y apretá «Reservar».</pre>
<script>
  const nodo = document.querySelector('[data-pov]');
  const log = document.getElementById('log');
  nodo.addEventListener('pov:hold', async (e) => {{
    log.textContent = 'Bloqueo creado. Cobrando…';
    // Sólo el token: el importe lo relee el servidor.
    const r = await fetch('/comprar', {{
      method: 'POST', headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ holdToken: e.detail.holdToken }}),
    }});
    log.textContent = JSON.stringify(await r.json(), null, 2);
  }});
  nodo.addEventListener('pov:error', (e) => {{ log.textContent = e.detail.code + ': ' + e.detail.message; }});
</script></body></html>"""


@app.post("/comprar")
def comprar():
    hold_token = (request.get_json(silent=True) or {}).get("holdToken", "")
    if not hold_token:
        return jsonify(error="falta holdToken"), 400

    # 1 · releer el bloqueo EN EL SERVIDOR. El importe no viaja desde el navegador.
    r = requests.get(f"{POV}/api/v1/holds/{hold_token}", headers={"X-POV-Key": PK}, timeout=10)
    if r.status_code != 200:
        return jsonify(error=f"no se pudo leer el bloqueo ({r.status_code})"), 502
    hold = r.json()
    if hold.get("status") != "ACTIVE":
        return jsonify(error=f"el bloqueo está {hold.get('status')}"), 409

    # La clave de idempotencia nace ACÁ, con la venta, y se guarda. Generar una nueva por intento
    # anularía la protección: para POV cada intento sería otra venta.
    venta = VENTAS.setdefault(
        hold_token, {"idempotency_key": str(uuid.uuid4()), "pago_ref": f"simulado_{int(time.time())}"}
    )

    # 2 · tu cobro, con hold["amountCents"] y hold["currency"].
    #     Acá está simulado. Reales: ../mercadopago y ../stripe

    # 3 · confirmar
    r = requests.post(
        f"{POV}/api/v1/holds/{hold_token}/confirm",
        headers={
            "Authorization": f"Bearer {SK}",
            "Idempotency-Key": venta["idempotency_key"],
            "Content-Type": "application/json",
        },
        # Cuerpo OPCIONAL: quién compró y con qué pago.
        json={
            "buyer": {"name": "Ana Pérez", "email": "ana@correo.com"},
            "externalPaymentRef": venta["pago_ref"],
        },
        timeout=15,
    )

    if r.status_code == 410:
        # El rescate automático ya se intentó y las butacas se las llevó otro.
        # Es la señal de REEMBOLSAR, no de reintentar.
        perdidas = r.json().get("error", {}).get("details", {}).get("unavailableSeats", [])
        return jsonify(error="hay que reembolsar", butacasPerdidas=perdidas), 409
    if r.status_code != 200:
        return jsonify(error=r.json().get("error", {}).get("code", r.status_code)), 502

    reserva = r.json()
    return jsonify(
        ok=True,
        reservationId=reserva["reservationId"],
        entradas=[{"butaca": t["seat"]["id"], "qr": t["qr"]} for t in reserva["tickets"]],
        verEntradas=f"{POV}/r/{reserva['publicToken']}",
        cobrado=f"{hold['amountCents'] / 100:.2f} {hold['currency']}",
    )


@app.post("/pov-webhook")
def webhook():
    # `request.get_data()` devuelve el cuerpo CRUDO. La firma se calcula sobre esos bytes: si
    # parseás el JSON y lo volvés a serializar, no coincide.
    raw = request.get_data()
    if not verificar_firma(raw, request.headers.get("X-POV-Signature", ""), WHSEC):
        return "firma inválida", 400

    evento = request.get_json(force=True)

    # Deduplicá por `id`: un reintento trae el MISMO.
    if evento["id"] in EVENTOS_VISTOS:
        return "ok", 200
    EVENTOS_VISTOS.add(evento["id"])

    # Contestá rápido y hacé el trabajo después: más de 5 segundos y para POV la entrega falló.
    app.logger.info("[pov] %s %s", evento["type"], evento.get("data"))
    return "ok", 200
