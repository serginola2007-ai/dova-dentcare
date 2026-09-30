/* DOVA como app instalable (PWA).
   - Registra el service worker (/sw.js).
   - Muestra "Instalar app" cuando el navegador lo permite (Android, Chrome,
     Edge). En iPhone/iPad explica cómo agregarla a la pantalla de inicio.
   - Si ya está instalada (abierta como app), no muestra nada. */
const DovaPWA = (() => {
  let aviso = null; // evento beforeinstallprompt guardado
  const esApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW: DOVA funciona igual en el navegador */ }); });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aviso = e; actualizarBotones(); });
  window.addEventListener('appinstalled', () => { aviso = null; actualizarBotones(); if (window.Vistas) Vistas.toast('DOVA quedó instalada como app', 'ok'); });

  const disponible = () => !esApp() && (!!aviso || esIOS());

  async function instalar() {
    if (aviso) {
      aviso.prompt();
      try { await aviso.userChoice; } catch (_e) { /* cancelado */ }
      aviso = null; actualizarBotones();
      return;
    }
    if (esIOS() && window.Vistas) {
      Vistas.abrirModal(`<h3>Instalar DOVA en el iPhone / iPad</h3>
        <ol class="dova-pwa-pasos"><li>Abrí DOVA en <strong>Safari</strong>.</li><li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha ↑).</li><li>Elegí <strong>Agregar a inicio</strong> y confirmá con <strong>Agregar</strong>.</li></ol>
        <p class="dova-nota">DOVA aparece en la pantalla de inicio y se abre como una app, sin la barra del navegador.</p>
        <div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Entendido</button></div>`);
    }
  }

  // Botón en la barra superior (junto a "Cerrar sesión").
  function actualizarBotones() {
    const barra = document.querySelector('.dova-topbar');
    if (!barra) return;
    let b = document.getElementById('dova-instalar-btn');
    if (!disponible()) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.id = 'dova-instalar-btn'; b.type = 'button'; b.className = 'dova-instalar-btn';
      b.textContent = '📲 Instalar app'; b.title = 'Instalar DOVA como app en este dispositivo';
      b.addEventListener('click', instalar);
      const salir = document.getElementById('logout-btn');
      barra.insertBefore(b, salir || null);
    }
  }
  document.addEventListener('DOMContentLoaded', actualizarBotones);

  // Tarjeta para Configuración.
  function tarjetaHtml() {
    if (esApp()) return '<h3 class="dova-section-title">App</h3><p class="dova-nota">✓ Estás usando DOVA como app instalada en este dispositivo.</p>';
    return `<h3 class="dova-section-title">Instalar como app</h3>
      <div class="dova-card dova-card-clave"><p class="dova-nota">Instalá DOVA en este dispositivo (celular, tablet o compu): queda con su ícono, se abre en pantalla completa sin la barra del navegador y arranca más rápido.</p>
      ${disponible() ? '<button type="button" class="dova-btn-primary" data-instalar-app>📲 Instalar DOVA</button>'
        : '<p class="dova-nota">Si no ves el botón: en Chrome o Edge usá el menú ⋮ → <strong>Instalar DOVA</strong> (o "Agregar a la pantalla principal"); en iPhone, Safari → Compartir → <strong>Agregar a inicio</strong>.</p>'}</div>`;
  }
  function activarTarjeta(scope) { const b = (scope || document).querySelector('[data-instalar-app]'); if (b) b.addEventListener('click', instalar); }

  return { instalar, disponible, esApp, actualizarBotones, tarjetaHtml, activarTarjeta };
})();
window.DovaPWA = DovaPWA;
