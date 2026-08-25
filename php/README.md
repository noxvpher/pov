# POV + PHP

PHP plano, sin framework ni dependencias. Tres archivos.

```bash
export POV_SECRET_KEY=sk_test_pegá_la_tuya
php -S localhost:4000        # http://localhost:4000
```

| Archivo | Qué hace |
|---|---|
| `index.php` | la página con el widget y el listener de `pov:hold` |
| `comprar.php` | relee el bloqueo, cobra (simulado) y confirma con la `sk_` |
| `webhook.php` | recibe los eventos de POV y verifica la firma |

Con la `pk_` de la demo ya ves el widget. **Para cerrar la venta necesitás tu propia `sk_test_`.**

## Lo que hay que mirar

**`comprar.php` relee el importe de POV.** El navegador manda sólo el `holdToken`; si el importe
viajara desde el navegador, cualquiera podría pagar un peso por una platea.

**`webhook.php` usa `file_get_contents('php://input')`.** El cuerpo crudo, sin parsear: la firma se
calcula sobre los bytes exactos que llegaron.

**Recorre todos los `v1=`.** Durante una rotación de secreto viajan dos firmas; quedarse con la
primera hace que rechaces eventos válidos justo el día que rotás.

**Compara con `hash_equals`**, no con `===`.
