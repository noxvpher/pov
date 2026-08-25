<?php
/**
 * Verificación de la firma de un webhook de POV.
 *
 * Está en su propio archivo para poder reusarlo y —sobre todo— **para poder probarlo**:
 * `examples/examples.test.ts` firma un payload con el mismo código que usa POV y lo verifica con
 * esta función.
 *
 * La cabecera viene como `t=1787012345,v1=3f8a…` y **puede traer más de un `v1=`**: durante una
 * rotación de secreto POV firma con el viejo y el nuevo, para que actualices tu copia cuando te
 * quede cómodo sin perder eventos.
 */
function pov_verificar(string $raw, string $header, string $secreto, int $tolerancia = 300): bool {
    if ($secreto === '') return false;

    $t = null;
    $firmas = [];
    foreach (explode(',', $header) as $par) {
        [$k, $v] = array_pad(explode('=', $par, 2), 2, '');
        if ($k === 'v1') $firmas[] = $v;
        elseif ($k === 't') $t = (int) $v;
    }
    if (!$t || count($firmas) === 0) return false;

    // Ventana temporal: descarta reenvíos viejos.
    if (abs(time() - $t) > $tolerancia) return false;

    $esperada = hash_hmac('sha256', $t . '.' . $raw, $secreto);
    foreach ($firmas as $f) {
        // Comparación en tiempo constante: nunca `===`.
        if (hash_equals($esperada, $f)) return true;
    }
    return false;
}
