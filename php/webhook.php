<?php
/**
 * POV + PHP — receptor de webhooks.
 *
 * Lo único que de verdad puede salir mal es la firma, y siempre por lo mismo: calcularla sobre el
 * JSON reserializado en vez de sobre los bytes que llegaron, o quedarse con el primer `v1=`.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/firma.php';   // la verificación, en su propio archivo para poder probarla

// El cuerpo CRUDO. No lo parsees antes de firmar.
$raw = file_get_contents('php://input');
$header = $_SERVER['HTTP_X_POV_SIGNATURE'] ?? '';

if (!pov_verificar($raw, $header, POV_WEBHOOK_SECRET)) {
    http_response_code(400);
    exit('firma inválida');
}

$evento = json_decode($raw, true);

// Contestá 200 YA. Si tardás más de 5 segundos, para POV la entrega falló y va a reintentar aunque
// vos la hayas procesado bien.
http_response_code(200);
echo 'ok';
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

// Deduplicá por `id`: un reintento trae el MISMO.
$yaVistos = __DIR__ . '/eventos-vistos.txt';
$id = $evento['id'] ?? '';
if ($id !== '' && str_contains(@file_get_contents($yaVistos) ?: '', $id)) exit;
@file_put_contents($yaVistos, $id . "\n", FILE_APPEND);

error_log('[pov] ' . ($evento['type'] ?? '?') . ' ' . json_encode($evento['data'] ?? []));
