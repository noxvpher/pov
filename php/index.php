<?php
/**
 * POV + PHP — la página con el widget.
 *
 * Configurá las claves en `config.php`.
 */
require __DIR__ . '/config.php';
?>
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Ejemplo POV + PHP</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}
pre{background:#f4f4f5;padding:1rem;border-radius:.5rem;overflow-x:auto}</style></head>
<body>
  <h1>Comprá tu entrada</h1>

  <div data-pov
       data-showtime="<?= htmlspecialchars(POV_SHOWTIME) ?>"
       data-key="<?= htmlspecialchars(POV_PUBLIC_KEY) ?>"></div>
  <script src="<?= htmlspecialchars(POV_BASE_URL) ?>/v1/embed.js" async></script>

  <h2>Estado</h2>
  <pre id="log">Elegí butacas y apretá «Reservar».</pre>

  <script>
    const nodo = document.querySelector('[data-pov]');
    const log = document.getElementById('log');

    nodo.addEventListener('pov:hold', async (e) => {
      log.textContent = 'Bloqueo creado. Cobrando…';
      // Sólo el token: el importe lo relee el servidor. Si viajara desde acá, cualquiera podría
      // pagar un peso por una platea.
      const r = await fetch('comprar.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdToken: e.detail.holdToken }),
      });
      log.textContent = JSON.stringify(await r.json(), null, 2);
    });

    nodo.addEventListener('pov:error', (e) => { log.textContent = e.detail.code + ': ' + e.detail.message; });
  </script>
</body>
</html>
