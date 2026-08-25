/**
 * POV + Stripe (tu propia cuenta) — la venta completa.
 *
 *   1. el widget crea el bloqueo y avisa
 *   2. tu backend crea un PaymentIntent por el importe del bloqueo,
 *      con `metadata.holdToken`                  ← lo que une los dos mundos
 *   3. el comprador paga con el Payment Element
 *   4. tu webhook recibe `payment_intent.succeeded`
 *   5. confirmás en POV con `Idempotency-Key` = id del PaymentIntent
 *
 * Este es TU Stripe, no el nuestro: es el plan Autogestionado y la plata te llega directo. Si
 * preferís que POV cobre, eso es la Pasarela POV y no requiere nada de esto.
 *
 * Ejecutar:  cp .env.example .env  &&  npm install  &&  npm start
 */
import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';

const app = express();
const PORT = process.env.PORT ?? 4000;

const POV = process.env.POV_BASE_URL ?? 'https://pov.uy';
const PK = process.env.POV_PUBLIC_KEY ?? '';
const SK = process.env.POV_SECRET_KEY ?? '';
const SHOWTIME = process.env.POV_SHOWTIME ?? '';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>POV + Stripe</title>
<script src="https://js.stripe.com/v3/"></script>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}
#pago{margin-top:1.5rem}button{padding:.6rem 1.2rem;font:inherit}</style></head><body>
<h1>Comprá tu entrada</h1>
<div data-pov data-showtime="${SHOWTIME}" data-key="${PK}"></div>
<script src="${POV}/v1/embed.js" async></script>
<div id="pago"></div>
<script>
  const stripe = Stripe('${process.env.STRIPE_PUBLISHABLE_KEY ?? ''}');
  const nodo = document.querySelector('[data-pov]');

  nodo.addEventListener('pov:hold', async (e) => {
    // Sólo el token: el importe lo relee el servidor de POV.
    const { clientSecret, error } = await fetch('/pagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: e.detail.holdToken }),
    }).then((r) => r.json());
    if (error) return alert(error);

    const elements = stripe.elements({ clientSecret });
    document.getElementById('pago').innerHTML =
      '<div id="element"></div><button id="btn">Pagar</button>';
    elements.create('payment').mount('#element');

    document.getElementById('btn').onclick = async () => {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.origin + '/listo' },
      });
      // Sólo se llega acá si el pago NO redirigió (por ejemplo, tarjeta rechazada).
      if (error) alert(error.message);
    };
  });

  // Si el comprador se arrepiente, soltá el bloqueo en vez de esperar los 10 minutos.
  window.addEventListener('beforeunload', () => {});
</script></body></html>`);
});

/* ─────────────────────────── 2 · crear el PaymentIntent ─────────────────────────── */

app.post('/pagar', express.json(), async (req, res) => {
  const { holdToken } = req.body ?? {};
  if (!holdToken) return res.status(400).json({ error: 'falta holdToken' });

  // El importe se relee del bloqueo. Nunca del navegador.
  const hold = await fetch(`${POV}/api/v1/holds/${holdToken}`, { headers: { 'X-POV-Key': PK } }).then((r) => r.json());
  if (hold.status !== 'ACTIVE') return res.status(409).json({ error: `el bloqueo está ${hold.status}` });

  const pi = await stripe.paymentIntents.create(
    {
      // Stripe y POV usan la MISMA unidad: la menor de la moneda. No hay que dividir por cien.
      amount: hold.amountCents,
      currency: hold.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // ── LO QUE UNE LOS DOS MUNDOS ──────────────────────────────────────────────────────
      // El webhook lo lee para saber qué reserva cerrar.
      metadata: { holdToken },
    },
    // Idempotencia del lado de Stripe: un doble clic no crea dos cobros.
    { idempotencyKey: `pov_${holdToken}` },
  );

  res.json({ clientSecret: pi.client_secret });
});

/* ──────────────────── 4 y 5 · el webhook de Stripe y el confirm ──────────────────── */

/**
 * `express.raw`: Stripe firma el cuerpo crudo, igual que POV. Si Express parsea el JSON antes, la
 * verificación falla y el síntoma no dice nada sobre la causa.
 */
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let evento;
  try {
    evento = stripe.webhooks.constructEvent(
      req.body,
      req.get('stripe-signature') ?? '',
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  } catch (err) {
    return res.status(400).send(`firma inválida: ${err.message}`);
  }
  res.sendStatus(200); // contestá rápido; el trabajo va después

  if (evento.type !== 'payment_intent.succeeded') return;
  const pi = evento.data.object;
  const holdToken = pi.metadata?.holdToken;
  if (!holdToken) return console.error(`[stripe] ${pi.id} sin metadata.holdToken`);

  const r = await fetch(`${POV}/api/v1/holds/${holdToken}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SK}`,
      // La clave es el id del PaymentIntent: Stripe puede reentregar el evento, y atada al pago
      // confirmar dos veces devuelve la misma reserva.
      'Idempotency-Key': pi.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      buyer: { email: pi.receipt_email ?? undefined },
      externalPaymentRef: pi.id,
    }),
  });

  if (r.status === 410) {
    const cuerpo = await r.json();
    const perdidas = cuerpo?.error?.details?.unavailableSeats ?? [];
    // Cobraste y no hay butacas. El rescate automático ya se intentó: hay que devolver la plata.
    console.error(`[stripe] REEMBOLSAR ${pi.id}: se perdieron ${perdidas.join(', ')}`);
    // await stripe.refunds.create({ payment_intent: pi.id });
    return;
  }
  if (!r.ok) return console.error(`[stripe] confirm falló: ${r.status}`);

  const reserva = await r.json();
  console.log(`[stripe] venta cerrada · ${reserva.reservationId} · ${POV}/r/${reserva.publicToken}`);
});

app.get('/listo', (_req, res) => res.send('<h1>¡Listo!</h1><p>Te mandamos las entradas por correo.</p>'));

app.listen(PORT, () => console.log(`▸ http://localhost:${PORT}`));
