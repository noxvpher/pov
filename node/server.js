/**
 * POV + Node (Express) — el flujo de venta completo, sin pasarela real.
 *
 * Los tres pasos que van después del widget:
 *
 *   1. el navegador recibe `pov:hold` y se lo manda a TU servidor
 *   2. tu servidor cobra          ← acá está simulado; en `../mercadopago` y `../stripe` es de verdad
 *   3. tu servidor llama a `confirm` con la clave secreta
 *
 * Más el receptor de webhooks, con la verificación de firma que es lo único que de verdad puede
 * salirte mal.
 *
 * Ejecutar:  cp .env.example .env  &&  npm install  &&  npm start
 */
import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { verificarFirma } from './firma.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

const POV = process.env.POV_BASE_URL ?? 'https://pov.uy';
const PK = process.env.POV_PUBLIC_KEY ?? '';
const SK = process.env.POV_SECRET_KEY ?? '';
const SHOWTIME = process.env.POV_SHOWTIME ?? '';
const WHSEC = process.env.POV_WEBHOOK_SECRET ?? '';

/**
 * Tu "base de datos" de ventas. Lo único importante de esta estructura es lo que guarda:
 *
 *  · `holdToken`      — lo que ata tu pago con el inventario de POV
 *  · `idempotencyKey` — se genera UNA vez, al empezar la venta, y se reutiliza en TODOS los
 *                       reintentos. Generarla dentro de la función que reintenta anula la
 *                       protección: cada intento sería una venta distinta para POV.
 */
const ventas = new Map();

/* ────────────────────────────── 1 · la página con el widget ───────────────────────────── */

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Ejemplo POV + Node</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}
pre{background:#f4f4f5;padding:1rem;border-radius:.5rem;overflow-x:auto}</style></head><body>
<h1>Comprá tu entrada</h1>
<div data-pov data-showtime="${SHOWTIME}" data-key="${PK}"></div>
<script src="${POV}/v1/embed.js" async></script>
<h2>Estado</h2><pre id="log">Elegí butacas y apretá «Reservar».</pre>
<script>
  const nodo = document.querySelector('[data-pov]');
  const log = document.getElementById('log');

  nodo.addEventListener('pov:hold', async (e) => {
    log.textContent = 'Bloqueo creado. Cobrando…';
    // El navegador NUNCA manda el importe: sólo el token. El servidor lo relee de POV.
    // Si el importe viajara desde acá, cualquiera podría pagar 1 peso por una platea.
    const r = await fetch('/comprar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: e.detail.holdToken, buyer: { name: 'Ana Pérez', email: 'ana@correo.com' } }),
    });
    const data = await r.json();
    log.textContent = JSON.stringify(data, null, 2);
  });

  nodo.addEventListener('pov:error', (e) => { log.textContent = e.detail.code + ': ' + e.detail.message; });
</script></body></html>`);
});

/* ─────────────────────── 2 y 3 · cobrar y confirmar, del lado del servidor ─────────────────────── */

app.post('/comprar', express.json(), async (req, res) => {
  const { holdToken, buyer } = req.body ?? {};
  if (!holdToken) return res.status(400).json({ error: 'falta holdToken' });

  try {
    // El importe se relee del bloqueo, en el servidor. Es la regla que evita que el navegador
    // fije lo que se cobra.
    const hold = await povGet(`/api/v1/holds/${holdToken}`);
    if (hold.status !== 'ACTIVE') {
      return res.status(409).json({ error: `el bloqueo está ${hold.status}` });
    }

    // La clave de idempotencia se crea ACÁ, al empezar la venta, y se guarda con ella.
    const venta = { holdToken, idempotencyKey: randomUUID(), estado: 'cobrando' };
    ventas.set(holdToken, venta);

    // ── 2 · tu cobro ──────────────────────────────────────────────────────────────────────
    // Acá va tu pasarela. Con `hold.amountCents` y `hold.currency`.
    // Ejemplos reales: ../mercadopago y ../stripe
    venta.pagoRef = `simulado_${Date.now()}`;
    venta.estado = 'cobrado';

    // ── 3 · confirmar ─────────────────────────────────────────────────────────────────────
    const reserva = await confirmar(venta, buyer);
    venta.estado = 'confirmada';
    venta.reservationId = reserva.reservationId;

    res.json({
      ok: true,
      reservationId: reserva.reservationId,
      entradas: reserva.tickets.map((t) => ({ butaca: t.seat.id, qr: t.qr })),
      // El enlace que le mandás al comprador: le muestra sus entradas y sus QR.
      verEntradas: `${POV}/r/${reserva.publicToken}`,
      cobrado: `${hold.amountCents / 100} ${hold.currency}`,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

/**
 * El confirm, con reintentos.
 *
 * Reintentar es seguro **porque la clave de idempotencia es la de la venta**, no una nueva por
 * intento. Si POV ya procesó el primero y se cortó la red antes de la respuesta, el segundo
 * devuelve la MISMA reserva en vez de crear otra.
 */
async function confirmar(venta, buyer, intento = 1) {
  const r = await fetch(`${POV}/api/v1/holds/${venta.holdToken}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SK}`,
      'Idempotency-Key': venta.idempotencyKey,
      'Content-Type': 'application/json',
    },
    // Cuerpo OPCIONAL: quién compró y con qué pago. Si no querés dárnoslo, no lo mandes.
    body: JSON.stringify({ buyer, externalPaymentRef: venta.pagoRef }),
  });

  if (r.ok) return r.json();

  const cuerpo = await r.json().catch(() => ({}));
  const code = cuerpo?.error?.code;

  // 410 con `unavailableSeats`: el bloqueo venció Y las butacas ya se las llevó otro. El rescate
  // automático ya se intentó. Es la señal de REEMBOLSAR, no de reintentar.
  if (r.status === 410) {
    const perdidas = cuerpo?.error?.details?.unavailableSeats ?? [];
    throw new Error(`hay que reembolsar: se perdieron las butacas ${perdidas.join(', ') || '(desconocidas)'}`);
  }
  // 429: esperá lo que dice el servidor. Reintentar en el acto sólo consume la próxima ventana.
  if (r.status === 429 && intento < 3) {
    const espera = Number(r.headers.get('retry-after') ?? 2);
    await new Promise((ok) => setTimeout(ok, espera * 1000));
    return confirmar(venta, buyer, intento + 1);
  }
  throw new Error(`${code ?? r.status}: ${cuerpo?.error?.message ?? 'confirm falló'}`);
}

async function povGet(ruta) {
  const r = await fetch(`${POV}${ruta}`, { headers: { 'X-POV-Key': PK } });
  if (!r.ok) throw new Error(`GET ${ruta} → ${r.status}`);
  return r.json();
}

/* ───────────────────────────────── el receptor de webhooks ───────────────────────────────── */

/**
 * `express.raw` y no `express.json`: la firma se calcula sobre **los bytes exactos** que llegaron.
 * Si dejás que Express parsee el JSON y después lo volvés a serializar, un espacio de más y la
 * firma no coincide — y el síntoma es "mis webhooks no validan", que no dice nada.
 */
app.post('/pov-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const firma = req.get('X-POV-Signature') ?? '';
  if (!verificarFirma(req.body, firma, WHSEC)) return res.status(400).send('firma inválida');

  const evento = JSON.parse(req.body.toString('utf8'));

  // Contestá 200 YA y hacé el trabajo después: si tardás más de 5 segundos, para POV la entrega
  // falló y va a reintentar aunque vos la hayas procesado bien.
  res.status(200).send('ok');

  // Deduplicá por `evento.id`: un reintento trae el MISMO id.
  if (yaProcesado(evento.id)) return;
  console.log(`[webhook] ${evento.type}`, evento.data);
});

const vistos = new Set();
function yaProcesado(id) {
  if (vistos.has(id)) return true;
  vistos.add(id);
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {
  const faltan = [
    !PK && 'POV_PUBLIC_KEY',
    !SK && 'POV_SECRET_KEY',
    !SHOWTIME && 'POV_SHOWTIME',
  ].filter(Boolean);
  if (faltan.length) console.warn(`⚠ faltan en .env: ${faltan.join(', ')}`);
  console.log(`▸ http://localhost:${PORT}`);
});

export { app };
