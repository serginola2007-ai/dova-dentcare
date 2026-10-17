/* DOVA — pantalla de ingreso y cambio de contraseña.
   - vistaLogin() / initLogin(alEntrar): usuario, contraseña y "Entro a otra clínica".
   - formCambioClaveHtml() / initCambioClave(): el formulario de cambio de contraseña (también lo usa Configuración).
   - Si la cuenta tiene la contraseña inicial, obliga a cambiarla antes de entrar. */
const DovaIngreso = (() => {
  const { esc, toast } = DovaAyudantes;

  // ---------------- LOGIN ----------------
  // Código de la clínica (slug): viene de ?clinica=… o de la última vez en este equipo.
  function codigoClinicaGuardado() {
    try {
      const q = new URLSearchParams(location.search).get('clinica');
      if (q && /^[a-z0-9][a-z0-9-]{0,79}$/i.test(q)) return q.toLowerCase();
      return localStorage.getItem('dova.clinica') || '';
    } catch (_e) { return ''; }
  }
  function vistaLogin() {
    return `
      <div class="dova-login-wrap">
        <div class="dova-login-marca">
          <img src="/iconos/icono-192.png" alt="" width="56" height="56" />
          <div><div class="dova-login-producto">DOVA</div><div class="dova-login-sub">Gestión odontológica<span data-login-clinica></span></div></div>
        </div>
        <div class="dova-login-card">
          <h1 class="dova-login-title">Iniciar sesión</h1>
          <form id="form-login">
            <label>Usuario</label>
            <input type="text" id="login-username" required autocomplete="username" />
            <label>Contraseña</label>
            <input type="password" id="login-password" required autocomplete="current-password" />
            <details class="dova-login-clinica"${codigoClinicaGuardado() ? ' open' : ''}>
              <summary>Entro a otra clínica</summary>
              <label for="login-clinica">Código de la clínica</label>
              <input type="text" id="login-clinica" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(codigoClinicaGuardado())}" placeholder="Te lo da el proveedor de DOVA" />
            </details>

            <button type="submit" class="dova-btn-primary dova-login-ingresar">Ingresar</button>
            <p id="login-error" class="dova-error-text" style="display:none;"></p>
          </form>
        </div>
      </div>`;
  }
  function initLogin(onSuccess) {
    const form = document.getElementById('form-login');
    // Nombre de la clínica debajo de la marca (público; si no está disponible, no se muestra).
    DOVA.get('/web/publico/info').then((i) => { const el = document.querySelector('[data-login-clinica]'); if (el && i && i.nombre) el.textContent = ` · ${i.nombre}`; }).catch(() => {});

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      errorEl.style.display = 'none';
      try {
        const clinicaEl = document.getElementById('login-clinica');
        const clinica = clinicaEl ? clinicaEl.value.trim().toLowerCase() : '';
        await DOVA.login(username, password, clinica);
        try { if (clinica) localStorage.setItem('dova.clinica', clinica); else localStorage.removeItem('dova.clinica'); } catch (_e) { /* sin almacenamiento: no pasa nada */ }
        const u = DOVA.usuarioActual();
        if (u && u.debeCambiarClave) {
          pedirCambioDeClave(password, () => onSuccess());
          return;
        }
        onSuccess();
      } catch (err) {
        errorEl.textContent = err.message || 'No se pudo iniciar sesión. Revisá tu conexión a internet.';
        errorEl.style.display = 'block';
      }
    });
  }

  // Formulario de cambio de contraseña (se reutiliza en el primer ingreso y
  // en Configuración > Seguridad).
  function formCambioClaveHtml({ pedirActual = true } = {}) {
    return `
      <form id="form-cambio-clave" class="dova-form-clave">
        ${pedirActual ? '<label>Contraseña actual</label><input type="password" name="actual" required autocomplete="current-password" />' : ''}
        <label>Nueva contraseña</label>
        <input type="password" name="nueva" required minlength="8" autocomplete="new-password" />
        <label>Repetí la nueva contraseña</label>
        <input type="password" name="repetir" required minlength="8" autocomplete="new-password" />
        <p class="dova-nota">Mínimo 8 caracteres. Evitá tu nombre de usuario o claves obvias.</p>
        <button type="submit" class="dova-btn-primary">Guardar contraseña</button>
        <p class="dova-error-text" data-error-clave style="display:none;"></p>
      </form>`;
  }
  function initCambioClave(form, obtenerActual, alTerminar) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('[data-error-clave]');
      err.style.display = 'none';
      const nueva = form.nueva.value;
      if (nueva !== form.repetir.value) { err.textContent = 'Las dos contraseñas nuevas no coinciden.'; err.style.display = 'block'; return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await DOVA.cambiarClave(obtenerActual(), nueva);
        alTerminar();
      } catch (ex) {
        err.textContent = ex.message || 'No se pudo cambiar la contraseña';
        err.style.display = 'block';
        btn.disabled = false;
      }
    });
  }
  // Primer ingreso con la contraseña inicial (admin/admin): hay que cambiarla
  // antes de entrar. No se puede saltear.
  function pedirCambioDeClave(claveActual, alTerminar) {
    const card = document.querySelector('.dova-login-card');
    card.innerHTML = `
      <h1 class="dova-login-title">Elegí una contraseña nueva</h1>
      <p class="dova-nota">Estás usando la contraseña inicial del sistema. Por seguridad, cambiala antes de continuar.</p>
      ${formCambioClaveHtml({ pedirActual: false })}`;
    initCambioClave(document.getElementById('form-cambio-clave'), () => claveActual, () => { toast('Contraseña actualizada', 'ok'); alTerminar(); });
  }

  return { vistaLogin, initLogin, formCambioClaveHtml, initCambioClave };
})();
window.DovaIngreso = DovaIngreso;
