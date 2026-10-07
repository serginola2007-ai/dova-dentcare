/* Arranque de DOVA (antes estaba en línea dentro de cada index.html). */
DovaApp.iniciar({
  mainId: 'main-root', menuId: 'menu-root', marcaId: 'marca-root',
  loginId: 'login-root', shellId: 'shell-root', logoutId: 'logout-btn',
});
// Botón claro/oscuro (solo el diseño que lo tiene), persistido en el navegador.
(function () {
  var btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  function temaActual() {
    var actual = document.documentElement.getAttribute('data-theme');
    if (actual === 'dark' || actual === 'light') return actual;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function actualizarIcono() { btn.innerHTML = DovaIcono(temaActual() === 'dark' ? 'sol' : 'luna', 16); }
  btn.addEventListener('click', function () {
    var nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('dova-tema', nuevo); } catch (e) { /* sin almacenamiento */ }
    actualizarIcono();
  });
  actualizarIcono();
})();
