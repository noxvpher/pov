# POV + Mercado Pago

La guía de la doc, corriendo. Cobro real (en modo de prueba de MP) y venta cerrada en POV.

```bash
cp .env.example .env      # tu sk_test_ de POV + tu TEST-… de Mercado Pago
npm install
npm start

# en otra terminal, para que MP pueda notificarte:
ngrok http 4000           # y pegá esa URL en PUBLIC_URL
```

## El flujo

```
widget → pov:hold → /pagar → Preference de MP → el comprador paga
                                                      ↓
                              /mp-webhook ← notificación de MP
                                     ↓
                        POST /holds/{token}/confirm  →  entradas
```

## Las cuatro cosas que hacen que esto no falle

**`external_reference = holdToken`.** Es lo que une los dos mundos. Sin eso, cuando MP te notifique
el pago no vas a saber qué reserva cerrar — y no hay forma de reconstruirlo después.

**`Idempotency-Key` = id del pago de MP.** MP puede notificarte el mismo pago varias veces. Atada al
pago, confirmar dos veces devuelve la misma reserva en vez de intentar vender otra vez.

**No confíes en el cuerpo de la notificación.** MP manda un id; el estado se lo preguntás a MP. El
ejemplo hace `GET /v1/payments/{id}` y recién ahí mira `status === 'approved'`.

**Centavos vs unidades.** POV trabaja en **centavos enteros** y MP en unidades: `unit_price` es
`hold.amountCents / 100`. Es el lugar exacto donde se cuela un cobro de cien veces de más o de menos.

## El caso que hay que tener resuelto antes de salir a producción

Si el comprador se demora en el checkout de MP, **el bloqueo puede vencer**. El `confirm` rescata la
venta hasta 10 minutos después si las butacas siguen libres; si no, devuelve **410** con
`details.unavailableSeats`.

Ese 410 **no se reintenta: se reembolsa**. El ejemplo lo detecta y deja el log listo para enganchar
el refund de MP. Con `unavailableSeats` podés decirle al comprador *qué butaca* se perdió, en vez de
un error genérico.

Por eso la Preference se crea con `expiration_date_to = hold.expiresAt`: no tiene sentido aceptar un
pago después de que las butacas volvieron al inventario.
