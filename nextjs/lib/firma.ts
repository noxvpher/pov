import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma de un webhook de POV.
 *
 * Está en `lib/` y no dentro del Route Handler para poder reusarla y **para poder probarla**:
 * `examples/examples.test.ts` firma un payload con el mismo código que usa POV y lo verifica con
 * esta función.
 *
 * La cabecera viene como `t=1787012345,v1=3f8a…` y **puede traer más de un `v1=`**: durante una
 * rotación de secreto POV firma con el viejo y el nuevo, para que actualices tu copia cuando te
 * quede cómodo sin perder eventos.
 *
 * @param raw el cuerpo CRUDO (`await req.text()`). `req.json()` rompe la firma.
 */
export function verificarFirma(
  raw: string,
  header: string,
  secreto: string,
  toleranciaSeg = 300,
): boolean {
  if (!secreto) return false;

  const campos = (header ?? '').split(',').map((kv) => kv.split('='));
  const t = Number(campos.find(([k]) => k === 't')?.[1]);
  // Un objeto se quedaría con UN solo v1 y rechazarías eventos válidos justo el día que rotás.
  const firmas = campos.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || firmas.length === 0) return false;

  // Ventana temporal: descarta reenvíos viejos.
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false;

  const esperada = createHmac('sha256', secreto).update(`${t}.${raw}`).digest('hex');
  const a = Buffer.from(esperada, 'hex');
  // Alcanza con que UNA coincida. Comparación en tiempo constante: nunca `===`.
  return firmas.some((f) => {
    const b = Buffer.from(f, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
