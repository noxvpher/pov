# POV + Node (Express)

El flujo de venta completo: bloqueo → cobro → confirmación, más el receptor de webhooks.

```bash
cp .env.example .env      # y pegá tu sk_test_
npm install
npm start                 # http://localhost:4000
```

Con la `pk_` de la demo ya ves el widget y el bloqueo. **Para cerrar la venta necesitás tu propia
`sk_test_`**: creala en el panel, en Integración → Claves.

## Los tres pasos, en el código

| Paso | Dónde |
|---|---|
| El navegador recibe `pov:hold` y manda **sólo el token** a tu servidor | `server.js`, el `<script>` de la página |
| Tu servidor relee el importe de POV y cobra | `POST /comprar` |
| Tu servidor confirma con la `sk_` | `confirmar()` |

## Las cuatro cosas que este ejemplo existe para mostrar

**El navegador nunca manda el importe.** Manda el `holdToken`; el servidor relee `amountCents` de
POV. Si el importe viajara desde el navegador, cualquiera podría pagar un peso por una platea.

**La clave de idempotencia se crea al empezar la venta, no al reintentar.** Se guarda con la venta y
se reutiliza en todos los intentos. Generarla dentro de la función que reintenta anula la protección:
para POV cada intento sería una venta distinta.

**Un 410 con `unavailableSeats` no se reintenta: se reembolsa.** El rescate automático ya se intentó
y las butacas se las llevó otro. Reintentar ahí es girar en falso mientras el comprador espera.

**El webhook se lee CRUDO.** `express.raw`, no `express.json`. La firma se calcula sobre los bytes
exactos que llegaron; reserializar el JSON la rompe, y el síntoma —«mis webhooks no validan»— no
dice nada sobre la causa.

## Probar el webhook sin esperar

Exponé tu puerto (`ngrok http 4000`, `cloudflared tunnel --url http://localhost:4000`, lo que uses),
cargá esa URL en Integración → Webhooks, y dispará un evento por el camino real:

```bash
curl -X POST https://pov.uy/api/v1/test/events \
  -H "Authorization: Bearer $POV_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"reservation.confirmed"}'
```

Llega firmado igual que uno de verdad, con el mismo despacho y los mismos reintentos. Es lo que te
deja probar la verificación de firma, que es lo único que de verdad puede salirte mal.
