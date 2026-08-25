import { randomUUID } from 'node:crypto';

/**
 * POV + Next.js — cobrar y confirmar, en el servidor.
 *
 * Es un Route Handler y no una Server Action a propósito: lo llama `fetch` desde el listener del
 * widget, que es JavaScript del navegador y no un formulario.
 *
 * **`POV_SECRET_KEY` sin `NEXT_PUBLIC_`**: cualquier variable con ese prefijo termina en el bundle
 * del navegador, y una clave secreta en el bundle es una clave publicada.
 */

const POV = process.env.NEXT_PUBLIC_POV_BASE_URL ?? 'https://pov.uy';
const PK = process.env.NEXT_PUBLIC_POV_PUBLIC_KEY ?? '';
const SK = process.env.POV_SECRET_KEY ?? '';

/** Clave de idempotencia por venta. En un sistema real se guarda con la venta, no en memoria. */
const claves = new Map<string, string>();

export async function POST(req: Request) {
  const { holdToken } = (await req.json().catch(() => ({}))) as { holdToken?: string };
  if (!holdToken) return Response.json({ error: 'falta holdToken' }, { status: 400 });

  // 1 · releer el bloqueo. El importe se lee de POV, nunca del navegador.
  const rHold = await fetch(`${POV}/api/v1/holds/${holdToken}`, { headers: { 'X-POV-Key': PK } });
  if (!rHold.ok) return Response.json({ error: 'no se pudo leer el bloqueo' }, { status: 502 });
  const hold = (await rHold.json()) as { status: string; amountCents: number; currency: string };
  if (hold.status !== 'ACTIVE') {
    return Response.json({ error: `el bloqueo está ${hold.status}` }, { status: 409 });
  }

  // 2 · tu cobro, con hold.amountCents y hold.currency. Reales: ../../mercadopago, ../../stripe
  const pagoRef = `simulado_${Date.now()}`;

  // La clave nace con la venta y se REUTILIZA en los reintentos. Una nueva por intento anularía
  // la protección: para POV cada intento sería otra venta.
  if (!claves.has(holdToken)) claves.set(holdToken, randomUUID());

  // 3 · confirmar
  const r = await fetch(`${POV}/api/v1/holds/${holdToken}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SK}`,
      'Idempotency-Key': claves.get(holdToken)!,
      'Content-Type': 'application/json',
    },
    // Cuerpo OPCIONAL: quién compró y con qué pago.
    body: JSON.stringify({
      buyer: { name: 'Ana Pérez', email: 'ana@correo.com' },
      externalPaymentRef: pagoRef,
    }),
  });

  const cuerpo = await r.json().catch(() => ({}));

  if (r.status === 410) {
    // El rescate automático ya se intentó: las butacas se las llevó otro. REEMBOLSAR, no reintentar.
    const perdidas = cuerpo?.error?.details?.unavailableSeats ?? [];
    return Response.json({ error: 'hay que reembolsar', butacasPerdidas: perdidas }, { status: 409 });
  }
  if (!r.ok) {
    return Response.json({ error: cuerpo?.error?.code ?? 'confirm falló' }, { status: 502 });
  }

  return Response.json({
    ok: true,
    reservationId: cuerpo.reservationId,
    entradas: cuerpo.tickets.map((t: { seat: { id: string }; qr: string }) => ({
      butaca: t.seat.id,
      qr: t.qr,
    })),
    verEntradas: `${POV}/r/${cuerpo.publicToken}`,
    cobrado: `${hold.amountCents / 100} ${hold.currency}`,
  });
}
