/* Seguridad de la cuenta (Configuración → Seguridad y el ingreso):
   - verificación en dos pasos con una app del celular (activar, desactivar,
     códigos de recuperación, segundo paso del login, activación obligatoria);
   - sesiones abiertas en otros dispositivos, con opción de cerrarlas;
   - política de la clínica (bloqueo por inactividad y 2 pasos obligatorio
     para administradores), solo para quien administra la clínica. */
const DovaSeguridad = (() => {
  const esc = (t) => Vistas.esc(t);
  const toast = (m, t) => Vistas.toast(m, t);
  const fecha = (f) => (f ? new Date(f).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '-');
  const err = (el, msg) => { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; };
  const CAMPO_CODIGO = (id, etiqueta = 'Código de 6 números') => `
    <label for="${id}">${etiqueta}</label>
    <input type="text" id="${id}" inputmode="numeric" autocomplete="one-time-code" maxlength="9" required class="dova-campo-codigo" placeholder="123456" />`;

  /* ---------- Segundo paso del ingreso ---------- */
  function pasoDosLogin(card, desafio, alTerminar) {
    card.innerHTML = `
      <h1 class="dova-login-title">Verificación en dos pasos</h1>
      <p class="dova-nota">Abrí la app de autenticación del celular (Google Authenticator, Microsoft Authenticator, Authy…) y escribí el código de DOVA.</p>
      <form id="form-2fa">
        ${CAMPO_CODIGO('codigo-2fa')}
        <button type="submit" class="dova-btn-primary">Verificar</button>
        <p class="dova-error-text" id="error-2fa" style="display:none;"></p>
      </form>
      <details class="dova-2fa-ayuda">
        <summary>¿No tenés el celular?</summary>
        <p class="dova-nota">Escribí en el mismo campo uno de tus códigos de recuperación (tienen la forma ABCD-EFGH). Si tampoco los tenés, pedile al administrador que reinicie tu verificación en dos pasos.</p>
      </details>
      <button type="button" class="dova-btn-link" id="volver-login">Volver a usuario y contraseña</button>`;
    const input = card.querySelector('#codigo-2fa');
    const e = card.querySelector('#error-2fa');
    input.focus();
    card.querySelector('#volver-login').addEventListener('click', () => location.reload());
    card.querySelector('#form-2fa').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err(e, '');
      const btn = card.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await DOVA.login2fa(desafio, input.value.trim());
        const quedan = r.usuario && r.usuario.codigosRecuperacionRestantes;
        if (quedan !== undefined) toast(quedan <= 3 ? `Te quedan ${quedan} códigos de recuperación. Generá nuevos en Configuración → Seguridad.` : `Entraste con un código de recuperación (te quedan ${quedan}).`, quedan <= 3 ? 'error' : 'info');
        alTerminar();
      } catch (ex) {
        err(e, ex.message || 'No se pudo verificar el código');
        input.value = ''; input.focus();
        btn.disabled = false;
        if (/venció/.test(ex.message || '')) setTimeout(() => location.reload(), 2500);
      }
    });
  }

  /* ---------- Asistente para activarla ---------- */
  function asistente(cont, { obligatorio = false, alTerminar } = {}) {
    cont.innerHTML = `
      <form id="form-2fa-clave" class="dova-2fa-paso">
        <p class="dova-nota">${obligatorio ? 'La clínica exige la verificación en dos pasos a los administradores. ' : ''}Además de la contraseña, para entrar vas a necesitar un código que cambia cada 30 segundos en tu celular. Así, aunque alguien sepa tu contraseña, no puede entrar.</p>
        <label for="clave-2fa">Para empezar, confirmá tu contraseña</label>
        <input type="password" id="clave-2fa" autocomplete="current-password" required />
        <button type="submit" class="dova-btn-primary">Continuar</button>
        <p class="dova-error-text" data-error style="display:none;"></p>
      </form>`;
    const f1 = cont.querySelector('#form-2fa-clave');
    f1.querySelector('input').focus();
    f1.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const e = f1.querySelector('[data-error]'); err(e, '');
      let datos;
      try { datos = await DOVA.post('/auth/2fa/iniciar', { clave: f1.querySelector('input').value }); } catch (ex) { err(e, ex.message); return; }
      pasoQr(cont, datos, alTerminar);
    });
  }
  function pasoQr(cont, datos, alTerminar) {
    const img = `data:image/svg+xml;base64,${btoa(datos.qrSvg)}`;
    cont.innerHTML = `
      <form id="form-2fa-confirmar" class="dova-2fa-paso">
        <ol class="dova-2fa-pasos">
          <li>Instalá en el celular una app de autenticación: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> o <strong>Authy</strong> (gratis).</li>
          <li>En la app, tocá «Agregar» y escaneá este código:</li>
        </ol>
        <div class="dova-2fa-qr"><img src="${img}" alt="Código QR para la app de autenticación" width="184" height="184" /></div>
        <p class="dova-nota">¿No podés escanear? Cargá esta clave a mano: <code class="dova-2fa-clave">${esc(datos.secreto)}</code></p>
        <ol class="dova-2fa-pasos" start="3"><li>Escribí el código de 6 números que muestra la app para DOVA.</li></ol>
        ${CAMPO_CODIGO('codigo-confirmar')}
        <button type="submit" class="dova-btn-primary">Activar</button>
        <p class="dova-error-text" data-error style="display:none;"></p>
      </form>`;
    const f = cont.querySelector('#form-2fa-confirmar');
    f.querySelector('#codigo-confirmar').focus();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const e = f.querySelector('[data-error]'); err(e, '');
      let r;
      try { r = await DOVA.post('/auth/2fa/confirmar', { codigo: f.querySelector('#codigo-confirmar').value.trim() }); } catch (ex) { err(e, ex.message); return; }
      DOVA.actualizarUsuario({ tiene2fa: true, debeActivar2fa: false });
      mostrarCodigos(cont, r.codigos, 'La verificación en dos pasos quedó activa.', alTerminar);
    });
  }
  function mostrarCodigos(cont, codigos, titulo, alTerminar) {
    const texto = `DOVA — códigos de recuperación de ${(DOVA.usuarioActual() || {}).username || ''}\nCada código sirve una sola vez para entrar si no tenés el celular.\n\n${codigos.join('\n')}\n`;
    cont.innerHTML = `
      <div class="dova-2fa-paso">
        <p><strong>${esc(titulo)}</strong></p>
        <p class="dova-nota">Guardá estos códigos de recuperación en un lugar seguro (papel, gestor de contraseñas). Si perdés el celular, cada uno te deja entrar una sola vez. No se vuelven a mostrar.</p>
        <ul class="dova-2fa-codigos">${codigos.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>
        <div class="dova-2fa-acciones">
          <button type="button" class="dova-btn-secundario" data-descargar>Descargar</button>
          <button type="button" class="dova-btn-secundario" data-copiar>Copiar</button>
        </div>
        <label class="dova-check"><input type="checkbox" data-guardados /> Ya los guardé</label>
        <button type="button" class="dova-btn-primary" data-listo disabled>Listo</button>
      </div>`;
    cont.querySelector('[data-descargar]').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
      const a = document.createElement('a'); a.href = url; a.download = 'dova-codigos-recuperacion.txt';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    });
    cont.querySelector('[data-copiar]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); toast('Códigos copiados', 'ok'); } catch (_e) { toast('No se pudo copiar: descargalos', 'error'); }
    });
    const listo = cont.querySelector('[data-listo]');
    cont.querySelector('[data-guardados]').addEventListener('change', (e) => { listo.disabled = !e.target.checked; });
    listo.addEventListener('click', () => alTerminar && alTerminar());
  }

  function activacionObligatoria(card, alTerminar) {
    card.innerHTML = '<h1 class="dova-login-title">Activá la verificación en dos pasos</h1><div id="asistente-2fa-obligatorio"></div><button type="button" class="dova-btn-link" id="salir-2fa">Salir</button>';
    card.querySelector('#salir-2fa').addEventListener('click', async () => { await DOVA.logout(); location.reload(); });
    asistente(card.querySelector('#asistente-2fa-obligatorio'), { obligatorio: true, alTerminar });
  }

  /* ---------- Configuración → Seguridad ---------- */
  function seccionHtml() {
    return '<div id="dova-seguridad-panel" class="dova-seguridad-panel"><p class="dova-cargando">Cargando…</p></div>';
  }

  async function activar() {
    const panel = document.getElementById('dova-seguridad-panel');
    if (!panel) return;
    const puedePolitica = DOVA.tienePermiso('clinica.config.manage');
    let est; let ses; let pol = null;
    try {
      [est, ses, pol] = await Promise.all([DOVA.get('/auth/2fa'), DOVA.get('/auth/sesiones'), puedePolitica ? DOVA.get('/clinica/seguridad') : Promise.resolve(null)]);
    } catch (e) { panel.innerHTML = `<p class="dova-error-text">${esc(e.message || 'No se pudo cargar la seguridad de la cuenta')}</p>`; return; }
    panel.innerHTML = `
      <h3 class="dova-section-title">Verificación en dos pasos</h3>
      <div class="dova-seguridad-bloque">
        ${est.activo
          ? `<p><span class="dova-etiqueta-2fa">Activa</span> desde ${esc(fecha(est.activadoEn))}. Te quedan <strong>${est.codigosRestantes}</strong> códigos de recuperación.</p>
             ${est.codigosRestantes <= 3 ? '<p class="dova-nota dova-nota-alerta">Te quedan pocos códigos de recuperación: generá nuevos.</p>' : ''}
             <div class="dova-2fa-acciones">
               <button type="button" class="dova-btn-secundario" id="btn-2fa-codigos">Generar códigos nuevos</button>
               <button type="button" class="dova-btn-secundario dova-btn-peligro" id="btn-2fa-desactivar">Desactivar</button>
             </div>`
          : `<p class="dova-nota">Con la verificación en dos pasos, además de la contraseña se pide un código del celular. Es la mejor protección si alguien llega a saber tu contraseña.</p>
             <button type="button" class="dova-btn-primary" id="btn-2fa-activar">Activar</button>`}
      </div>

      <h3 class="dova-section-title">Sesiones abiertas</h3>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-tabla-sesiones">
        <thead><tr><th>Dispositivo</th><th>IP</th><th>Inicio</th><th>Última actividad</th><th></th></tr></thead>
        <tbody>
          ${ses.map((s) => `<tr>
            <td>${esc(s.dispositivo)}${s.bloqueada ? ' <span class="dova-nota">(bloqueada)</span>' : ''}</td>
            <td>${esc(s.ip || '-')}</td><td>${esc(fecha(s.inicio))}</td><td>${esc(fecha(s.ultimoUso))}</td>
            <td>${s.actual ? '<span class="dova-etiqueta-2fa">Esta sesión</span>' : `<button type="button" class="dova-btn-link" data-cerrar-sesion="${esc(s.id)}">Cerrar</button>`}</td>
          </tr>`).join('') || '<tr><td colspan="5">No hay otras sesiones abiertas.</td></tr>'}
        </tbody>
      </table></div>
      <p class="dova-nota">Si no reconocés un dispositivo, cerrá esa sesión y cambiá tu contraseña.</p>

      ${pol ? `
      <h3 class="dova-section-title">Política de la clínica</h3>
      <form id="form-politica" class="dova-seguridad-bloque">
        <label for="pol-bloqueo">Bloquear la pantalla tras un tiempo sin uso</label>
        <select id="pol-bloqueo">${pol.opcionesBloqueo.map((m) => `<option value="${m}" ${m === pol.bloqueoMin ? 'selected' : ''}>${m === 0 ? 'Nunca' : `${m} minutos`}</option>`).join('')}</select>
        <label class="dova-check"><input type="checkbox" id="pol-2fa" ${pol.exigir2faAdmin ? 'checked' : ''} ${!est.activo && !pol.exigir2faAdmin ? 'disabled' : ''} /> Exigir verificación en dos pasos a los administradores</label>
        <p class="dova-nota">${pol.adminsCon2fa} de ${pol.admins} administradores la tienen activa.${!est.activo && !pol.exigir2faAdmin ? ' Para exigirla, activá primero la tuya.' : ''}</p>
        <button type="submit" class="dova-btn-primary">Guardar política</button>
        <p class="dova-error-text" data-error style="display:none;"></p>
      </form>` : ''}`;

    const b = (id) => panel.querySelector(id);
    if (b('#btn-2fa-activar')) b('#btn-2fa-activar').addEventListener('click', () => {
      Vistas.abrirModal('<h3>Activar la verificación en dos pasos</h3><div id="modal-2fa"></div><div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button></div>');
      asistente(document.getElementById('modal-2fa'), { alTerminar: () => { document.getElementById('modal-root').innerHTML = ''; toast('Verificación en dos pasos activa', 'ok'); activar(); } });
    });
    const conClaveYCodigo = (titulo, texto, boton, ruta, alOk) => {
      Vistas.abrirModal(`<h3>${esc(titulo)}</h3><form id="form-2fa-accion"><p class="dova-nota">${esc(texto)}</p>
        <label for="acc-clave">Contraseña</label><input type="password" id="acc-clave" autocomplete="current-password" required />
        ${CAMPO_CODIGO('acc-codigo', 'Código de la app (o uno de recuperación)')}
        <p class="dova-error-text" data-error style="display:none;"></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">${esc(boton)}</button></div></form>`);
      const f = document.getElementById('form-2fa-accion');
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const e = f.querySelector('[data-error]'); err(e, '');
        try { alOk(await DOVA.post(ruta, { clave: f.querySelector('#acc-clave').value, codigo: f.querySelector('#acc-codigo').value.trim() })); } catch (ex) { err(e, ex.message); }
      });
    };
    if (b('#btn-2fa-desactivar')) b('#btn-2fa-desactivar').addEventListener('click', () => conClaveYCodigo('Desactivar la verificación en dos pasos', 'Tu cuenta va a quedar protegida solo con la contraseña. Se avisa a los administradores.', 'Desactivar', '/auth/2fa/desactivar', () => {
      document.getElementById('modal-root').innerHTML = '';
      DOVA.actualizarUsuario({ tiene2fa: false });
      toast('Verificación en dos pasos desactivada', 'ok'); activar();
    }));
    if (b('#btn-2fa-codigos')) b('#btn-2fa-codigos').addEventListener('click', () => conClaveYCodigo('Generar códigos de recuperación nuevos', 'Los códigos anteriores dejan de servir.', 'Generar', '/auth/2fa/codigos', (r) => {
      const box = document.querySelector('#modal-root .dova-modal-box');
      mostrarCodigos(box, r.codigos, 'Códigos nuevos generados.', () => { document.getElementById('modal-root').innerHTML = ''; activar(); });
    }));
    panel.querySelectorAll('[data-cerrar-sesion]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await DOVA.post(`/auth/sesiones/${encodeURIComponent(btn.dataset.cerrarSesion)}/cerrar`); toast('Sesión cerrada', 'ok'); activar(); } catch (e) { btn.disabled = false; toast(e.message, 'error'); }
    }));
    const fp = b('#form-politica');
    if (fp) fp.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const e = fp.querySelector('[data-error]'); err(e, '');
      try {
        await DOVA.put('/clinica/seguridad', { bloqueoMin: Number(fp.querySelector('#pol-bloqueo').value), exigir2faAdmin: fp.querySelector('#pol-2fa').checked });
        toast('Política guardada. Rige para cada persona la próxima vez que abra DOVA.', 'ok');
        activar();
      } catch (ex) { err(e, ex.message); }
    });
  }

  return { pasoDosLogin, activacionObligatoria, seccionHtml, activar };
})();
window.DovaSeguridad = DovaSeguridad;
