/* Modo claro / oscuro: se aplica ANTES de pintar nada (evita el parpadeo). Archivo propio (y no
   un <script> en línea) para que la política de seguridad pueda prohibir todo script en línea.
   DOVA tiene un único diseño; el modo lo elige cada usuario en Configuración y queda guardado
   en este navegador. Sin elección guardada, claro. */
(function () {
  try {
    var guardado = localStorage.getItem('dova-tema');
    document.documentElement.setAttribute('data-theme', guardado === 'dark' ? 'dark' : 'light');
  } catch (e) { /* sin almacenamiento: queda el modo claro */ }
})();
