# POV + Stripe (tu propia cuenta)

**Es tu Stripe, no el nuestro.** Plan Autogestionado: la plata te llega directo. Si preferís que POV
cobre y te liquide, eso es la Pasarela POV y no requiere nada de este ejemplo.

```bash
cp .env.example .env      # tu sk_test_ de POV + tus claves de prueba de Stripe
npm install
npm start

# en otra terminal:
stripe listen --forward-to localhost:4000/stripe-webhook
```

Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC.

## El flujo

```
widget → pov:hold → /pagar → PaymentIntent → Payment Element → el comprador paga
                                                                      ↓
                                       /stripe-webhook ← payment_intent.succeeded
                                              ↓
                                 POST /holds/{token}/confirm  →  entradas
```

## Las cuatro cosas que hacen que esto no falle

**`metadata.holdToken`.** Es lo que une los dos mundos: el webhook lo lee para saber qué reserva
cerrar.

**Confirmá desde el webhook, no desde el retorno del navegador.** El navegador puede cerrarse justo
después de pagar; el webhook no. Es la diferencia entre una venta cerrada y un comprador cobrado sin
entrada.

**`Idempotency-Key` = id del PaymentIntent.** Stripe puede reentregar el evento; atada al pago,
confirmar dos veces devuelve la misma reserva.

**No hay que dividir por cien.** Stripe y POV usan la misma unidad —la menor de la moneda—, así que
`amount: hold.amountCents` va tal cual. (Con Mercado Pago sí hay que convertir: ver `../mercadopago`.)

## El caso que hay que tener resuelto antes de salir a producción

El 3-D Secure puede tardar varios minutos y **el bloqueo dura 10**. El `confirm` rescata la venta
hasta 10 minutos después si las butacas siguen libres; si no, devuelve **410** con
`details.unavailableSeats`.

Ese 410 **no se reintenta: se reembolsa**. El ejemplo lo detecta y deja el `stripe.refunds.create`
listo para descomentar.
