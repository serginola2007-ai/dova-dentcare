/* Selector de diseño: si la sesión guardada prefiere OTRO diseño (moderno,
   minimalista, técnico), redirige ANTES de pintar nada. Archivo propio (y no
   un <script> en línea) para que la política de seguridad pueda prohibir
   todo script en línea. El diseño de esta carpeta viene en data-tema. */
(function () {
  var s = document.currentScript;
  var ESTE_TEMA = (s && s.getAttribute('data-tema')) || 'moderno';
  var TEMAS_VALIDOS = ['moderno', 'minimalista', 'tecnico'];
  try {
    var sesion = JSON.parse(localStorage.getItem('dova_session') || 'null');
    var pref = sesion && sesion.usuario && sesion.usuario.disenoPreferido;
    if (pref && TEMAS_VALIDOS.indexOf(pref) !== -1 && pref !== ESTE_TEMA) {
      var nuevaRuta = location.pathname.replace(new RegExp('/' + ESTE_TEMA + '(/|$)'), '/' + pref + '$1');
      location.replace(nuevaRuta + location.search + location.hash);
    }
  } catch (e) { /* sesión corrupta o sin almacenamiento: seguir acá */ }
  // Tema claro/oscuro guardado, aplicado antes de pintar (evita el parpadeo).
  if (s && s.getAttribute('data-modo-oscuro') === 'si') {
    try {
      var guardado = localStorage.getItem('dova-tema');
      if (guardado === 'dark' || guardado === 'light') document.documentElement.setAttribute('data-theme', guardado);
    } catch (e) { /* sin almacenamiento */ }
  }
})();
