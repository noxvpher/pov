<?php
/**
 * POV + PHP — cobrar y confirmar, del lado del servidor.
 *
 * Recibe `{ holdToken }` del navegador. **El importe no viaja desde el navegador**: se relee del
 * bloqueo acá. Es la regla que evita que el cliente fije lo que se cobra.
 */
require __DIR__ . '/config.php';
header('Content-Type: application/json');

$entrada = json_decode(file_get_contents('php://input'), true);
$holdToken = $entrada['holdToken'] ?? '';
if ($holdToken === '') {
    http_response_code(400);
    exit(json_encode(['error' => 'falta holdToken']));
}

/** GET a la API con la clave pública. */
function pov_get(string $ruta): array {
    $ch = curl_init(POV_BASE_URL . $ruta);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['X-POV-Key: ' . POV_PUBLIC_KEY],
    ]);
    $cuerpo = curl_exec($ch);
    curl_close($ch);
    return json_decode($cuerpo, true) ?: [];
}

// 1 · releer el bloqueo
$hold = pov_get('/api/v1/holds/' . rawurlencode($holdToken));
if (($hold['status'] ?? '') !== 'ACTIVE') {
    http_response_code(409);
    exit(json_encode(['error' => 'el bloqueo está ' . ($hold['status'] ?? 'ausente')]));
}

// 2 · tu cobro, con $hold['amountCents'] y $hold['currency'].
//     Acá está simulado. Con Mercado Pago o Stripe: ../mercadopago, ../stripe
$pagoRef = 'simulado_' . time();

/**
 * La clave de idempotencia se genera UNA vez por venta y se GUARDA con ella. Acá se deriva del
 * token del bloqueo para que el ejemplo sea corto; en tu sistema, guardala en la fila de la venta y
 * reutilizala en todos los reintentos. Generar una nueva por intento anula la protección.
 */
$idempotencyKey = 'venta_' . $holdToken;

// 3 · confirmar
$ch = curl_init(POV_BASE_URL . '/api/v1/holds/' . rawurlencode($holdToken) . '/confirm');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . POV_SECRET_KEY,
        'Idempotency-Key: ' . $idempotencyKey,
        'Content-Type: application/json',
    ],
    // Cuerpo OPCIONAL: quién compró y con qué pago.
    CURLOPT_POSTFIELDS => json_encode([
        'buyer' => ['name' => 'Ana Pérez', 'email' => 'ana@correo.com'],
        'externalPaymentRef' => $pagoRef,
    ]),
]);
$cuerpo = curl_exec($ch);
$estado = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$res = json_decode($cuerpo, true) ?: [];

if ($estado === 410) {
    // El bloqueo venció y las butacas ya no están: el rescate automático se intentó y falló.
    // Es la señal de REEMBOLSAR, no de reintentar.
    $perdidas = $res['error']['details']['unavailableSeats'] ?? [];
    http_response_code(409);
    exit(json_encode(['error' => 'hay que reembolsar', 'butacasPerdidas' => $perdidas]));
}
if ($estado !== 200) {
    http_response_code(502);
    exit(json_encode(['error' => $res['error']['code'] ?? 'confirm falló']));
}

echo json_encode([
    'ok' => true,
    'reservationId' => $res['reservationId'],
    'entradas' => array_map(fn($t) => ['butaca' => $t['seat']['id'], 'qr' => $t['qr']], $res['tickets']),
    'verEntradas' => POV_BASE_URL . '/r/' . $res['publicToken'],
    'cobrado' => ($hold['amountCents'] / 100) . ' ' . $hold['currency'],
]);
