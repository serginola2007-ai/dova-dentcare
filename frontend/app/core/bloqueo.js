/* Bloqueo de pantalla por inactividad.
   Después de los minutos que fija la clínica (Configuración → Seguridad,
   15 por defecto) sin tocar el teclado ni el mouse en ninguna pestaña, DOVA
   tapa la pantalla y pide la contraseña. El bloqueo es del SERVIDOR: la
   sesión no acepta pedidos (ni recargando la página) hasta desbloquearla.
   Cinco contraseñas mal cierran la sesión. Lo que estabas escribiendo queda
   en pantalla debajo del candado. */
const DovaBloqueo = (() => {
  const CLAVE_ACT = 'dova_actividad';
  const CLAVE_BLOQ = 'dova_bloqueo';
  const CLAVE_DESB = 'dova_desbloqueo';
  let minutos = 0;
  let ultima = Date.now();
  let ultimaGuardada = 0;
  let timer = null;
  let visible = false;
  let iniciado = false;

  const leer = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch (_e) { return 0; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_e) { /* sin almacenamiento */ } };
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function actividad() {
    if (visible) return;
    ultima = Date.now();
    // Compartida entre pestañas: trabajar en una no bloquea las otras.
    if (ultima - ultimaGuardada > 5000) { ultimaGuardada = ultima; escribir(CLAVE_ACT, ultima); }
  }

  function revisar() {
    if (visible || !minutos || !DOVA.estaAutenticado()) return;
    const desde = Math.max(ultima, leer(CLAVE_ACT));
    if (Date.now() - desde >= minutos * 60000) bloquear();
  }

  async function bloquear() {
    if (visible) return;
    mostrar();
    escribir(CLAVE_BLOQ, Date.now());
    await DOVA.bloquear();
  }

  function mostrar() {
    if (visible || !DOVA.estaAutenticado()) return;
    visible = true;
    if (window.DovaVivo) DovaVivo.detener();
    document.body.classList.add('dova-bloqueada');
    const modal = document.getElementById('modal-root');
    if (modal) modal.setAttribute('aria-hidden', 'true');
    const u = DOVA.usuarioActual() || {};
    const c = DOVA.clinicaActual() || {};
    const capa = document.createElement('div');
    capa.id = 'dova-candado';
    capa.className = 'dova-candado';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'dova-candado-titulo');
    capa.innerHTML = `
      <form class="dova-candado-caja" id="form-candado" autocomplete="on">
        <div class="dova-candado-icono">${window.DovaIcono ? DovaIcono('candado') : ''}</div>
        <h2 id="dova-candado-titulo">Pantalla bloqueada</h2>
        <p class="dova-nota">${esc(u.nombre || u.username || '')}${c.nombre ? ` · ${esc(c.nombre)}` : ''}<br>Se bloqueó por inactividad. Ingresá tu contraseña para seguir donde estabas.</p>
        <input type="text" name="username" autocomplete="username" value="${esc(u.username || '')}" hidden />
        <label for="candado-clave">Contraseña</label>
        <input type="password" id="candado-clave" autocomplete="current-password" required />
        <p class="dova-error-text" id="candado-error" style="display:none;"></p>
        <div class="dova-candado-acciones">
          <button type="button" class="dova-btn-secundario" id="candado-salir">Salir</button>
          <button type="submit" class="dova-btn-primary">Desbloquear</button>
        </div>
      </form>`;
    document.body.appendChild(capa);
    const input = capa.querySelector('#candado-clave');
    const err = capa.querySelector('#candado-error');
    setTimeout(() => input.focus(), 50);
    capa.querySelector('#candado-salir').addEventListener('click', salir);
    capa.querySelector('#form-candado').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.style.display = 'none';
      const btn = capa.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await DOVA.desbloquear(input.value);
        escribir(CLAVE_DESB, Date.now());
        ocultar();
      } catch (ex) {
        if (ex.status === 401) { salir(true); return; }
        err.textContent = ex.message || 'No se pudo desbloquear';
        err.style.display = 'block';
        input.value = '';
        input.focus();
        btn.disabled = false;
      }
    });
  }

  function ocultar() {
    if (!visible) return;
    visible = false;
    const capa = document.getElementById('dova-candado');
    if (capa) capa.remove();
    document.body.classList.remove('dova-bloqueada');
    const modal = document.getElementById('modal-root');
    if (modal) modal.removeAttribute('aria-hidden');
    ultima = Date.now(); escribir(CLAVE_ACT, ultima);
    if (window.DovaVivo) DovaVivo.iniciar();
  }

  async function salir(yaCerrada) {
    if (yaCerrada === true) DOVA.limpiarSesion();
    else await DOVA.logout();
    location.reload();
  }

  async function iniciar() {
    if (iniciado) return;
    iniciado = true;
    ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, actividad, { passive: true, capture: true }));
    window.addEventListener('dova:bloqueada', () => { if (!visible) escribir(CLAVE_BLOQ, Date.now()); mostrar(); });
    window.addEventListener('storage', (e) => {
      if (e.key === CLAVE_BLOQ && e.newValue) { DOVA.marcarBloqueada(); mostrar(); }
      if (e.key === CLAVE_DESB && e.newValue && visible) { DOVA.marcarDesbloqueada(); ocultar(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
    if (DOVA.estaBloqueada()) mostrar();
    try {
      const p = await DOVA.get('/auth/politica');
      minutos = Number(p.bloqueoMin) || 0;
    } catch (_e) { minutos = 0; }
    actividad();
    timer = setInterval(revisar, 15000);
    void timer;
  }

  // En una ventana: solo se anota la actividad (compartida), el candado lo maneja la página principal.
  function soloActividad() {
    ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, actividad, { passive: true, capture: true }));
  }

  return { iniciar, soloActividad, bloquear, activo: () => visible, minutos: () => minutos };
})();
window.DovaBloqueo = DovaBloqueo;
