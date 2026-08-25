/**
 * POV + Mercado Pago — la venta completa, con cobro de verdad.
 *
 *   1. el widget crea el bloqueo y avisa
 *   2. tu backend crea una Preference por el importe del bloqueo,
 *      con `external_reference = holdToken`      ← lo que une los dos mundos
 *   3. el comprador paga en Mercado Pago
 *   4. MP te notifica; verificás que el pago está aprobado
 *   5. confirmás en POV con `Idempotency-Key` = id del pago de MP
 *
 * Ejecutar:  cp .env.example .env  &&  npm install  &&  npm start
 */
import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.PORT ?? 4000;

const POV = process.env.POV_BASE_URL ?? 'https://pov.uy';
const PK = process.env.POV_PUBLIC_KEY ?? '';
const SK = process.env.POV_SECRET_KEY ?? '';
const SHOWTIME = process.env.POV_SHOWTIME ?? '';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN ?? '';
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>POV + Mercado Pago</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}</style></head><body>
<h1>Comprá tu entrada</h1>
<div data-pov data-showtime="${SHOWTIME}" data-key="${PK}"></div>
<script src="${POV}/v1/embed.js" async></script>
<script>
  const nodo = document.querySelector('[data-pov]');
  nodo.addEventListener('pov:hold', async (e) => {
    // Sólo el token: el importe lo relee el servidor de POV.
    const r = await fetch('/pagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: e.detail.holdToken }),
    });
    const { initPoint, error } = await r.json();
    if (error) return alert(error);
    window.location.href = initPoint;   // al checkout de Mercado Pago
  });
</script></body></html>`);
});

/* ─────────────────────────── 2 · crear la Preference ─────────────────────────── */

app.post('/pagar', express.json(), async (req, res) => {
  const { holdToken } = req.body ?? {};
  if (!holdToken) return res.status(400).json({ error: 'falta holdToken' });

  // El importe se relee del bloqueo. Nunca del navegador.
  const hold = await fetch(`${POV}/api/v1/holds/${holdToken}`, { headers: { 'X-POV-Key': PK } }).then((r) => r.json());
  if (hold.status !== 'ACTIVE') return res.status(409).json({ error: `el bloqueo está ${hold.status}` });

  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: `Entradas (${hold.seats.map((s) => s.id).join(', ')})`,
          quantity: 1,
          // MP trabaja en unidades, POV en CENTAVOS enteros. Convertir es obligatorio, y es el
          // lugar donde se cuela el error de cobrar cien veces de más o de menos.
          unit_price: hold.amountCents / 100,
          currency_id: hold.currency,
        },
      ],
      // ── LO QUE UNE LOS DOS MUNDOS ────────────────────────────────────────────────────────
      // Sin esto, cuando MP te notifique el pago no vas a saber qué reserva cerrar.
      external_reference: holdToken,
      notification_url: `${PUBLIC_URL}/mp-webhook`,
      back_urls: { success: `${PUBLIC_URL}/listo`, failure: `${PUBLIC_URL}/` },
      auto_return: 'approved',
      // El bloqueo dura 10 minutos: no tiene sentido aceptar un pago después.
      expires: true,
      expiration_date_to: hold.expiresAt,
    }),
  });

  const pref = await r.json();
  if (!r.ok) return res.status(502).json({ error: pref?.message ?? 'MP rechazó la preferencia' });
  res.json({ initPoint: pref.init_point });
});

/* ──────────────────── 4 y 5 · la notificación de MP y el confirm ──────────────────── */

app.post('/mp-webhook', express.json(), async (req, res) => {
  // Contestá 200 rápido: MP reintenta si tardás.
  res.sendStatus(200);

  const id = req.body?.data?.id;
  if (req.body?.type !== 'payment' || !id) return;

  try {
    // NUNCA confíes en el cuerpo de la notificación: pedile el pago a MP y mirá su estado.
    const pago = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    }).then((r) => r.json());

    if (pago.status !== 'approved') return console.log(`[mp] pago ${id} está ${pago.status}`);

    const holdToken = pago.external_reference;
    if (!holdToken) return console.error(`[mp] pago ${id} sin external_reference`);

    const r = await fetch(`${POV}/api/v1/holds/${holdToken}/confirm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SK}`,
        // La clave de idempotencia ES el id del pago de MP. MP puede notificarte el mismo pago
        // varias veces; atada al pago, confirmar dos veces devuelve la misma reserva.
        'Idempotency-Key': `mp_${pago.id}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buyer: { name: pago.payer?.first_name, email: pago.payer?.email },
        externalPaymentRef: String(pago.id),
      }),
    });

    if (r.status === 410) {
      const cuerpo = await r.json();
      const perdidas = cuerpo?.error?.details?.unavailableSeats ?? [];
      // Cobraste y no hay butacas: el rescate automático ya se intentó. Hay que devolver la plata,
      // y ahora sabés QUÉ butaca se perdió para poder explicárselo al comprador.
      console.error(`[mp] REEMBOLSAR el pago ${pago.id}: se perdieron ${perdidas.join(', ')}`);
      // await fetch(`https://api.mercadopago.com/v1/payments/${pago.id}/refunds`, …)
      return;
    }
    if (!r.ok) return console.error(`[mp] confirm falló: ${r.status}`);

    const reserva = await r.json();
    console.log(`[mp] venta cerrada · ${reserva.reservationId} · ${POV}/r/${reserva.publicToken}`);
  } catch (err) {
    console.error('[mp] error procesando la notificación', err);
  }
});

app.get('/listo', (_req, res) => res.send('<h1>¡Listo!</h1><p>Te mandamos las entradas por correo.</p>'));

app.listen(PORT, () => console.log(`▸ http://localhost:${PORT}`));
