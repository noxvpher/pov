# POV + Python (Flask)

```bash
pip install -r requirements.txt
export POV_SECRET_KEY=sk_test_pegá_la_tuya
flask --app app run --port 4000      # http://localhost:4000
```

Con la `pk_` de la demo ya ves el widget. **Para cerrar la venta necesitás tu propia `sk_test_`**
(panel → Integración → Claves).

| Ruta | Qué hace |
|---|---|
| `GET /` | la página con el widget |
| `POST /comprar` | relee el bloqueo, cobra (simulado) y confirma |
| `POST /pov-webhook` | recibe los eventos y verifica la firma |

## Lo que hay que mirar

**El importe se relee en el servidor.** El navegador manda sólo el `holdToken`.

**`request.get_data()`** para la firma: el cuerpo crudo, sin parsear.

**`verificar_firma` recorre todos los `v1=`** y compara con `hmac.compare_digest`. Quedarse con el
primero funciona hasta el día que rotás el secreto.

**Un 410 con `unavailableSeats` no se reintenta: se reembolsa.**
