/* DOVA — piezas comunes de las secciones con pestañas (Seguimiento, Clínica, Finanzas…).
   - montar(contenedor, navegar): guarda cómo navegar y hace que todo botón con data-ir-paciente
     (también los que se agregan después) abra la ficha de ese paciente.
   - linkPac(id, nombre, apellido): botón-enlace a la ficha. enlazarPacientes(contenedor): lo mismo a mano.
   - kpi(valor, texto, { alerta, sub, ir }): un indicador de la franja de números. */
const DovaSeccionBase = (() => {
  const X = DovaExt;
  const { esc } = X;

  let navegar = () => {};
  const linkPac = (id, nombre, apellido) => `<button class="dova-btn-link" data-ir-paciente="${id}">${esc(`${nombre || ''} ${apellido || ''}`.trim() || 'Paciente')}</button>`;
  function enlazarPacientes(root) { root.querySelectorAll('[data-ir-paciente]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.irPaciente))); }
  const obs = new MutationObserver((muts) => muts.forEach((m) => m.target.querySelectorAll && m.target.querySelectorAll('[data-ir-paciente]:not([data-enl])').forEach((b) => { b.dataset.enl = '1'; b.addEventListener('click', () => navegar('paciente', b.dataset.irPaciente)); })));

  function kpi(valor, label, { alerta, sub, ir } = {}) {
    const tag = ir ? 'button' : 'div';
    return `<${tag} class="dova-ext-kpi ${alerta ? 'alerta' : ''}" ${ir ? `data-ir-sub="${ir}"` : ''}><div class="dova-ext-kpi-valor">${valor ?? '—'}</div><div class="dova-ext-kpi-label">${esc(label)}</div>${sub ? `<div class="dova-ext-kpi-sub">${sub}</div>` : ''}</${tag}>`;
  }
  function montar(root, nav) {
    navegar = nav;
    obs.observe(root, { childList: true, subtree: true });
  }

  return { linkPac, enlazarPacientes, kpi, montar };
})();
window.DovaSeccionBase = DovaSeccionBase;
