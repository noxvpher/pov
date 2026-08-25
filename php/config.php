<?php
/**
 * Claves de la integración.
 *
 * La `pk_` y la función son las de la demo pública de POV: sirven para ver el widget andando.
 * La `sk_` es TUYA y no sale del servidor — sacala del panel, en Integración → Claves.
 */
define('POV_BASE_URL', getenv('POV_BASE_URL') ?: 'https://pov.uy');
define('POV_SHOWTIME', getenv('POV_SHOWTIME') ?: 'shw_cine_2d');
define('POV_PUBLIC_KEY', getenv('POV_PUBLIC_KEY') ?: 'pk_test_f286048e92dff3b8caffd6e9ea41f1fb6aaf');

define('POV_SECRET_KEY', getenv('POV_SECRET_KEY') ?: 'sk_test_pega_la_tuya');
define('POV_WEBHOOK_SECRET', getenv('POV_WEBHOOK_SECRET') ?: 'whsec_pega_el_tuyo');
