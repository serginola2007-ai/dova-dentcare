/* Configuración → Seguridad:
   - sesiones abiertas en otros dispositivos, con opción de cerrarlas;
   - política de la clínica (minutos sin uso hasta bloquear la pantalla),
     solo para quien administra la clínica. */
const DovaSeguridad = (() => {
  const esc = (t) => Vistas.esc(t);
  const toast = (m, t) => Vistas.toast(m, t);
  const fecha = (f) => (f ? new Date(f).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '-');

  function seccionHtml() {
    return '<div id="dova-seguridad-panel" class="dova-seguridad-panel"><p class="dova-cargando">Cargando…</p></div>';
  }

  async function activar() {
    const panel = document.getElementById('dova-seguridad-panel');
    if (!panel) return;
    const puedePolitica = DOVA.tienePermiso('clinica.config.manage');
    let ses; let pol = null;
    try {
      [ses, pol] = await Promise.all([DOVA.get('/auth/sesiones'), puedePolitica ? DOVA.get('/clinica/seguridad') : Promise.resolve(null)]);
    } catch (e) { panel.innerHTML = `<p class="dova-error-text">${esc(e.message || 'No se pudo cargar la seguridad de la cuenta')}</p>`; return; }
    panel.innerHTML = `
      <h3 class="dova-section-title">Sesiones abiertas</h3>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-tabla-sesiones">
        <thead><tr><th>Dispositivo</th><th>IP</th><th>Inicio</th><th>Última actividad</th><th></th></tr></thead>
        <tbody>
          ${ses.map((s) => `<tr>
            <td>${esc(s.dispositivo)}${s.bloqueada ? ' <span class="dova-nota">(bloqueada)</span>' : ''}</td>
            <td>${esc(s.ip || '-')}</td><td>${esc(fecha(s.inicio))}</td><td>${esc(fecha(s.ultimoUso))}</td>
            <td>${s.actual ? '<span class="dova-etiqueta">Esta sesión</span>' : `<button type="button" class="dova-btn-link" data-cerrar-sesion="${esc(s.id)}">Cerrar</button>`}</td>
          </tr>`).join('') || '<tr><td colspan="5">No hay otras sesiones abiertas.</td></tr>'}
        </tbody>
      </table></div>
      <p class="dova-nota">Si no reconocés un dispositivo, cerrá esa sesión y cambiá tu contraseña.</p>

      ${pol ? `
      <h3 class="dova-section-title">Política de la clínica</h3>
      <form id="form-politica" class="dova-seguridad-bloque">
        <label for="pol-bloqueo">Bloquear la pantalla tras un tiempo sin uso</label>
        <select id="pol-bloqueo">${pol.opcionesBloqueo.map((m) => `<option value="${m}" ${m === pol.bloqueoMin ? 'selected' : ''}>${m === 0 ? 'Nunca' : `${m} minutos`}</option>`).join('')}</select>
        <p class="dova-nota">Para volver a usar DOVA se pide la contraseña. Rige para cada persona la próxima vez que abra DOVA.</p>
        <button type="submit" class="dova-btn-primary">Guardar política</button>
        <p class="dova-error-text" data-error style="display:none;"></p>
      </form>` : ''}`;

    panel.querySelectorAll('[data-cerrar-sesion]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await DOVA.post(`/auth/sesiones/${encodeURIComponent(btn.dataset.cerrarSesion)}/cerrar`); toast('Sesión cerrada', 'ok'); activar(); } catch (e) { btn.disabled = false; toast(e.message, 'error'); }
    }));
    const fp = panel.querySelector('#form-politica');
    if (fp) fp.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const e = fp.querySelector('[data-error]'); e.style.display = 'none';
      try {
        await DOVA.put('/clinica/seguridad', { bloqueoMin: Number(fp.querySelector('#pol-bloqueo').value) });
        toast('Política guardada', 'ok');
        activar();
      } catch (ex) { e.textContent = ex.message; e.style.display = 'block'; }
    });
  }

  return { seccionHtml, activar };
})();
window.DovaSeguridad = DovaSeguridad;
