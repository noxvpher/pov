'use client';

import { useState } from 'react';
import Script from 'next/script';

/**
 * POV + Next.js (App Router) — la página con el widget.
 *
 * Es un componente de cliente porque escucha los eventos del widget. El `confirm` NO vive acá:
 * vive en `app/api/confirmar/route.ts`, del lado del servidor, que es donde tiene que estar la
 * clave secreta.
 */
export default function Page() {
  const [log, setLog] = useState('Elegí butacas y apretá «Reservar».');

  return (
    <main style={{ font: '16px/1.6 system-ui, sans-serif', maxWidth: '60rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Comprá tu entrada</h1>

      <div
        data-pov
        data-showtime={process.env.NEXT_PUBLIC_POV_SHOWTIME}
        data-key={process.env.NEXT_PUBLIC_POV_PUBLIC_KEY}
        ref={(nodo) => {
          if (!nodo || nodo.dataset.listo) return;
          nodo.dataset.listo = '1';

          nodo.addEventListener('pov:hold', async (e) => {
            const detalle = (e as CustomEvent).detail as { holdToken: string };
            setLog('Bloqueo creado. Cobrando…');
            // Al servidor va SÓLO el token. El importe lo relee él: si viajara desde acá,
            // cualquiera podría pagar un peso por una platea.
            const r = await fetch('/api/confirmar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ holdToken: detalle.holdToken }),
            });
            setLog(JSON.stringify(await r.json(), null, 2));
          });

          nodo.addEventListener('pov:error', (e) => {
            const d = (e as CustomEvent).detail as { code: string; message: string };
            setLog(`${d.code}: ${d.message}`);
          });
        }}
      />

      {/* `afterInteractive`: el loader monta el iframe apenas la página es usable. */}
      <Script src={`${process.env.NEXT_PUBLIC_POV_BASE_URL}/v1/embed.js`} strategy="afterInteractive" />

      <h2>Estado</h2>
      <pre style={{ background: '#f4f4f5', padding: '1rem', borderRadius: '.5rem', overflowX: 'auto' }}>{log}</pre>
    </main>
  );
}
