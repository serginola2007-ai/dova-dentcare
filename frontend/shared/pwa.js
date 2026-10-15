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
      b.textContent = 'Instalar app'; b.title = 'Instalar DOVA como app en este dispositivo';
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
      ${disponible() ? '<button type="button" class="dova-btn-primary" data-instalar-app>Instalar DOVA</button>'
        : '<p class="dova-nota">Si no ves el botón: en Chrome o Edge usá el menú ⋮ → <strong>Instalar DOVA</strong> (o "Agregar a la pantalla principal"); en iPhone, Safari → Compartir → <strong>Agregar a inicio</strong>.</p>'}</div>`;
  }
  function activarTarjeta(scope) { const b = (scope || document).querySelector('[data-instalar-app]'); if (b) b.addEventListener('click', instalar); }

  // ---- Avisos en el dispositivo (push) ----
  const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const aBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
  async function suscripcionActual() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
  async function activarAvisos() {
    const est = await DOVA.get('/push');
    if (!est.habilitado) throw new Error('Los avisos en el dispositivo no están habilitados en este servidor');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('El navegador no dio permiso para mostrar avisos');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(est.clavePublica) });
    await DOVA.post('/push/suscripcion', { suscripcion: sub.toJSON() });
  }
  async function desactivarAvisos() {
    const sub = await suscripcionActual();
    if (sub) { await DOVA.post('/push/baja', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  }
  async function pintarAvisos(box) {
    const cont = box.querySelector('[data-avisos-estado]'); const btn = box.querySelector('[data-avisos-toggle]'); const prueba = box.querySelector('[data-avisos-prueba]');
    if (!pushSoportado()) { cont.textContent = 'Este navegador no permite avisos en el dispositivo. En iPhone, primero instalá DOVA en la pantalla de inicio.'; btn.hidden = true; return; }
    let est; try { est = await DOVA.get('/push'); } catch (_e) { box.hidden = true; return; }
    if (!est.habilitado) { box.hidden = true; return; }
    const sub = await suscripcionActual().catch(() => null);
    const activo = !!sub && Notification.permission === 'granted';
    cont.textContent = Notification.permission === 'denied' ? 'Bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.' : (activo ? 'Avisos activados en este dispositivo.' : 'Recibí en este dispositivo los avisos de DOVA (turnos, cobros, mensajes), aunque no la tengas abierta.');
    btn.hidden = Notification.permission === 'denied'; btn.textContent = activo ? 'Desactivar avisos' : 'Activar avisos'; btn.dataset.activo = activo ? '1' : '0';
    prueba.hidden = !activo;
  }
  function avisosHtml() {
    return `<div class="dova-card dova-card-clave" data-avisos-box><h3 class="dova-section-title">Avisos en este dispositivo</h3>
      <p class="dova-nota" data-avisos-estado aria-live="polite">Cargando…</p>
      <p class="dova-nota">El aviso solo dice que hay algo nuevo; el detalle (nombres, montos) se ve al abrir DOVA.</p>
      <div class="dova-modal-actions"><button type="button" class="dova-btn-primary" data-avisos-toggle hidden></button><button type="button" class="dova-btn-secundario" data-avisos-prueba hidden>Enviarme un aviso de prueba</button></div></div>`;
  }
  function activarAvisosUI(scope) {
    const box = (scope || document).querySelector('[data-avisos-box]'); if (!box) return;
    const toast = (m, t) => { if (window.Vistas) Vistas.toast(m, t); };
    box.querySelector('[data-avisos-toggle]').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { if (b.dataset.activo === '1') await desactivarAvisos(); else await activarAvisos(); } catch (e) { toast(e.message || 'No se pudo cambiar el aviso', 'error'); }
      b.disabled = false; pintarAvisos(box);
    });
    box.querySelector('[data-avisos-prueba]').addEventListener('click', async () => {
      try { const r = await DOVA.post('/push/prueba', {}); toast(r.enviados ? 'Aviso enviado' : 'No se pudo enviar el aviso', r.enviados ? 'ok' : 'error'); } catch (e) { toast(e.message, 'error'); }
    });
    pintarAvisos(box);
  }

  return { instalar, disponible, esApp, actualizarBotones, tarjetaHtml, activarTarjeta, avisosHtml, activarAvisosUI };
})();
window.DovaPWA = DovaPWA;
