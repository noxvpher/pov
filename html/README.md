# El widget, sin nada más

Un archivo HTML. Sin build, sin dependencias, sin servidor.

```bash
# abrilo directamente
xdg-open index.html      # o: open index.html   ·   o arrastralo al navegador
```

Vas a ver el plano de la sala, elegir butacas y —al apretar «Reservar»— el payload real que recibe
tu página.

## Qué mirar

- **Las dos líneas** del `<div data-pov>` y el `<script>`. Eso es la integración.
- **El listener de `pov:hold`**: ahí es donde empieza tu checkout, y `amountCents` es lo que hay que
  cobrar. En centavos enteros, calculado en el servidor.

## Qué NO hace

**No cierra la venta.** Para eso hace falta cobrar y llamar a `confirm` **desde tu servidor**, con tu
clave secreta. Está en [`../node`](../node) y en los demás ejemplos.

La clave de este ejemplo es la `pk_test_` pública de la cuenta demo de POV, y la función es de
prueba: podés jugar todo lo que quieras sin tocar inventario de nadie.
