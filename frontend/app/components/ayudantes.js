/* DOVA — ayudantes comunes a todas las pantallas (objeto global DovaAyudantes).
   - esc(texto): escapa un texto antes de ponerlo en innerHTML. SIEMPRE usarlo con datos del usuario o del servidor.
   - fmtGs(monto): "Gs. 200.000" (sin decimales, con espacio duro para que no se corte).
   - fmtFecha(fecha): "15/10/2026". hoyPy(): la fecha de hoy en Paraguay, "2026-10-15".
   - toast(mensaje, tipo): aviso breve abajo a la derecha. tipo: 'info' | 'ok' | 'error'.
   - manejarError(funcion): corre la función y, si falla, muestra el error en un aviso.
   - abrirModal(html): abre una ventana de diálogo; los botones con data-cerrar-modal la cierran. */
const DovaAyudantes = (() => {
  function fmtGs(n) { const v = Number(n || 0); return Number.isFinite(v) ? 'Gs.\u00a0' + Math.round(v).toLocaleString('es-PY') : '-'; } // el guaraní no usa decimales
  // Un día calendario ('AAAA-MM-DD') se arma en hora LOCAL: new Date('2026-01-05')
  // lo toma como medianoche UTC y en Paraguay (UTC-3) mostraba el 4/1.
  function fmtFecha(f) {
    if (!f) return '-';
    const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es-PY');
    return new Date(f).toLocaleDateString('es-PY');
  }
  // "Hoy" en Paraguay (con toISOString() era el día UTC: después de las 21 h ya daba mañana).
  function hoyPy() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date()); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function toast(msg, tipo = 'info') {
    let cont = document.getElementById('dova-toasts');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'dova-toasts';
      cont.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(cont);
    }
    const el = document.createElement('div');
    const colores = { info: '#2B2420', error: '#B8443A', ok: '#7A8B76' };
    el.style.cssText = `background:${colores[tipo] || colores.info};color:#F7F3EC;padding:11px 16px;border-radius:2px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,0.18);max-width:320px;`;
    el.textContent = msg;
    cont.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function manejarError(fn) {
    try { return await fn(); } catch (e) { toast(e.message || 'Ocurrió un error', 'error'); throw e; }
  }


  // ---------------- MODAL genérico ----------------
  function abrirModal(html) {
    // Si la vista no trae su propio contenedor de modales, se crea uno al
    // final del body (antes se usaba el body entero y abrir un modal en una
    // sección sin #modal-root borraba toda la página).
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div class="dova-modal-overlay">
        <div class="dova-modal-box">${html}</div>
      </div>`;
    root.querySelectorAll('[data-cerrar-modal]').forEach((b) => b.addEventListener('click', () => { root.innerHTML = ''; }));
  }

  return { fmtGs, fmtFecha, hoyPy, esc, toast, manejarError, abrirModal };
})();
window.DovaAyudantes = DovaAyudantes;
