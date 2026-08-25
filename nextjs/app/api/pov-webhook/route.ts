import { verificarFirma } from '@/lib/firma';

/**
 * POV + Next.js — receptor de webhooks.
 *
 * **`await req.text()`, no `req.json()`**: la firma se calcula sobre los bytes exactos que llegaron.
 * Parsear y reserializar la rompe, y el síntoma —«mis webhooks no validan»— no dice nada.
 *
 * La verificación vive en `lib/firma.ts`, para poder reusarla y probarla.
 */

const WHSEC = process.env.POV_WEBHOOK_SECRET ?? '';
const vistos = new Set<string>();

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verificarFirma(raw, req.headers.get('x-pov-signature') ?? '', WHSEC)) {
    return new Response('firma inválida', { status: 400 });
  }

  const evento = JSON.parse(raw) as { id: string; type: string; data: unknown };

  // Deduplicá por `id`: un reintento trae el MISMO.
  if (vistos.has(evento.id)) return new Response('ok');
  vistos.add(evento.id);

  // Contestá rápido y hacé el trabajo después: más de 5 segundos y para POV la entrega falló.
  console.log('[pov]', evento.type, evento.data);
  return new Response('ok');
}
