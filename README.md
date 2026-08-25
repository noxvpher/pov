# Ejemplos de integración con POV

**POV** es un sistema de reservas de asientos embebible para cine, teatro y espectáculos:
selección 2D + sala 3D, dentro de la web del cliente. Este repositorio son los **ejemplos de
integración** — siete proyectos completos, para clonar y correr.

El producto en sí es cerrado; acá no está su código. Lo que está es todo lo que necesita escribir
quien lo integra.

| Ejemplo | Qué muestra | Corre con |
|---|---|---|
| [`html/`](html) | el widget, en dos líneas | abrir el archivo |
| [`node/`](node) | bloqueo → cobro → confirmación + webhooks | `npm start` |
| [`php/`](php) | lo mismo, en PHP plano | `php -S localhost:4000` |
| [`python/`](python) | lo mismo, en Flask | `flask --app app run` |
| [`nextjs/`](nextjs) | App Router: widget en el cliente, `confirm` en un Route Handler | `npm run dev` |
| [`mercadopago/`](mercadopago) | la venta con **cobro real** por Mercado Pago | `npm start` |
| [`stripe/`](stripe) | la venta con **cobro real** por Stripe | `npm start` |

```bash
git clone https://github.com/noxvpher/pov.git
cd pov/node && cp .env.example .env   # poné tus claves acá
npm install && npm start
```

Los `.env.example` traen **marcadores, no claves**. Las tuyas salen del panel: la `pk_test_` y la
`sk_test_` de *Integración → Claves*, el id de la función de *Programación → Código*. Empezá por las
de prueba — venden contra funciones de prueba, sin tocar inventario real ni cobrar un peso.

¿Todavía no tenés cuenta? Pedila en <https://pov.uy/precios>.

## Cómo funciona una venta

POV **no cobra**. Bloquea las butacas, tu sitio cobra con su pasarela, y tu servidor confirma:

1. El widget bloquea las butacas y te avisa por `postMessage` (`pov:hold`).
2. Cobrás con tu pasarela, como cobrás siempre.
3. Tu servidor llama a `POST /api/v1/holds/{token}/confirm` con tu clave secreta.

La clave `pk_` vive en el navegador y sólo puede bloquear. La `sk_` confirma, y **nunca** sale de tu
servidor.

## Los casos molestos, ya resueltos

Cada ejemplo los tiene resueltos, que es la diferencia entre un fragmento y algo que se pone en
producción:

- Un `409` al bloquear es **otro comprador**, no un error tuyo: se refresca el mapa.
- Un `410` con `unavailableSeats` al confirmar **no se reintenta, se reembolsa**.
- La firma del webhook se calcula sobre el **cuerpo crudo**, y hay que recorrer **todos** los `v1=`
  — quedarse con el primero funciona hasta el día que se rota el secreto.

## Documentación

<https://pov.uy/docs> — y cada ejemplo se puede bajar también como `.zip` desde
<https://pov.uy/docs/ejemplos>.

---

Copia automática de `examples/` del repositorio del producto. **Los cambios no se hacen acá**: se
hacen allá y se publican, así el código de esta página, el de los `.zip` y el de este repositorio
son siempre el mismo.
