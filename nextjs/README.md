# POV + Next.js (App Router)

```bash
cp .env.example .env.local     # y pegá tu sk_test_
npm install
npm run dev                    # http://localhost:4000
```

| Archivo | Qué hace |
|---|---|
| `app/page.tsx` | la página con el widget (cliente: escucha `pov:hold`) |
| `app/api/confirmar/route.ts` | relee el bloqueo, cobra y confirma con la `sk_` |
| `app/api/pov-webhook/route.ts` | recibe los eventos y verifica la firma |

## Lo que hay que mirar

**`POV_SECRET_KEY` va sin `NEXT_PUBLIC_`.** Cualquier variable con ese prefijo se inlinea en el
bundle del navegador, y una clave secreta en el bundle es una clave publicada. Es el error más fácil
de cometer en Next y el más difícil de ver: no falla nada, simplemente tu clave queda en el JS que
descarga cualquiera.

**El `confirm` es un Route Handler, no una Server Action.** Lo llama `fetch` desde el listener del
widget, que es JavaScript del navegador y no un formulario.

**`await req.text()` en el webhook, no `req.json()`.** La firma se calcula sobre los bytes exactos
que llegaron.

**El importe se relee del bloqueo, en el servidor.** Al Route Handler va sólo el `holdToken`.
