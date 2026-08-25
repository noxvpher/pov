import crypto from 'node:crypto';

/**
 * Verificación de la firma de un webhook de POV.
 *
 * Está en su propio archivo por dos motivos: lo vas a reusar en cada endpoint que reciba eventos, y
 * así **se puede probar** — que es lo que hace `examples/examples.test.ts`, firmando un payload con
 * el mismo código que usa POV y verificándolo con esta función.
 *
 * La cabecera viene como `t=1787012345,v1=3f8a…` y **puede traer más de un `v1=`**: durante una
 * rotación de secreto, POV firma cada evento con el viejo y el nuevo para que puedas actualizar tu
 * copia cuando te quede cómodo, sin perder un solo evento.
 *
 * @param {Buffer|string} rawBody el cuerpo CRUDO, sin parsear. Reserializar el JSON rompe la firma.
 * @param {string} header valor de `X-POV-Signature`.
 * @param {string} secreto tu `whsec_…`.
 * @param {number} toleranciaSeg cuánto se acepta de desfasaje de reloj, para acotar los reenvíos.
 */
export function verificarFirma(rawBody, header, secreto, toleranciaSeg = 300) {
  if (!secreto) return false;
  const campos = String(header ?? '')
    .split(',')
    .map((kv) => kv.split('='));
  const t = Number(campos.find(([k]) => k === 't')?.[1]);
  // OJO: un objeto (`Object.fromEntries`) se quedaría con UN solo `v1` y rechazarías eventos
  // válidos justo el día que rotás el secreto.
  const firmas = campos.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || firmas.length === 0) return false;

  // Ventana temporal: descarta reenvíos viejos.
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false;

  const esperada = crypto.createHmac('sha256', secreto).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(esperada, 'hex');
  // Alcanza con que UNA coincida. Comparación en tiempo constante: nunca `===`.
  return firmas.some((f) => {
    const b = Buffer.from(f, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
