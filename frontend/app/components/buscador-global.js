/* DOVA — buscador de la barra superior: pacientes, turnos y tratamientos agrupados por tipo. */
const DovaBuscadorGlobal = (() => {
  const { fmtGs, fmtFecha, esc } = DovaAyudantes;

  // ---------------- BÚSQUEDA GLOBAL ----------------
  // Búsqueda tradicional rápida (sección 26 del prompt: sin IA) sobre
  // pacientes/citas/tratamientos/presupuestos/pagos/evoluciones/tickets/
  // usuarios, filtrada server-side por permisos reales del usuario.
  const LABELS_BUSQUEDA = {
    pacientes: 'Pacientes', citas: 'Citas', tratamientos: 'Tratamientos',
    presupuestos: 'Presupuestos', pagos: 'Pagos', evoluciones: 'Evoluciones clínicas',
    tickets: 'Pedidos de ayuda técnica', usuarios: 'Usuarios', facturas: 'Facturas',
  };

  function vistaBuscadorGlobal() {
    return `
      <div class="dova-buscador-global">
        <input type="text" id="buscador-global-input" placeholder="Buscar pacientes, citas, facturas…" autocomplete="off" />
        <div id="buscador-global-resultados" class="dova-buscador-resultados" style="display:none;"></div>
      </div>`;
  }

  function renderResultadosBusqueda(data) {
    const categorias = Object.keys(LABELS_BUSQUEDA).filter((k) => data[k] && data[k].length);
    if (!categorias.length) {
      return '<p class="dova-nota" style="padding:12px;">Sin resultados.</p>';
    }
    return categorias.map((cat) => `
      <div class="dova-buscador-categoria">
        <div class="dova-buscador-categoria-titulo">${esc(LABELS_BUSQUEDA[cat])}</div>
        ${data[cat].map((item) => renderItemBusqueda(cat, item)).join('')}
      </div>
    `).join('');
  }

  function renderItemBusqueda(cat, item) {
    const nombrePac = item.paciente_nombre ? `${esc(item.paciente_nombre)} ${esc(item.paciente_apellido || '')}` : '';
    switch (cat) {
      case 'pacientes':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.id}">${esc(item.nombre)} ${esc(item.apellido)} <span class="dova-nota">C.I. ${esc(item.ci || '-')}</span></button>`;
      case 'citas':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.motivo || 'sin motivo')} <span class="dova-nota">${fmtFecha(item.fecha)}</span></button>`;
      case 'tratamientos':
        return `<button class="dova-buscador-item" data-tratamiento="${item.id}">${esc(item.nombre)} <span class="dova-nota">${fmtGs(item.precio)}</span></button>`;
      case 'presupuestos':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — Presupuesto <span class="dova-nota">${fmtGs(item.total)} · ${esc(item.estado)}</span></button>`;
      case 'pagos':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.concepto || 'Pago')} <span class="dova-nota">${fmtGs(item.monto)}</span></button>`;
      case 'evoluciones':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.procedimiento || item.diagnostico || 'Evolución')} <span class="dova-nota">${fmtFecha(item.fecha)}</span></button>`;
      case 'tickets':
        return `<button class="dova-buscador-item" data-ir-helpdesk="${item.id}">${esc(item.titulo)} <span class="dova-nota">${esc(item.estado)}</span></button>`;
      case 'facturas':
        return `<button class="dova-buscador-item" data-ir-factura="${item.id}">${esc(item.numero_completo)} — ${esc(item.cliente_nombre)} <span class="dova-nota">${fmtGs(item.total)} · ${esc(item.estado)}</span></button>`;
      case 'usuarios':
        return `<button class="dova-buscador-item" data-ir-usuarios="${item.id}">${esc(item.nombre)} <span class="dova-nota">@${esc(item.username)}</span></button>`;
      default:
        return '';
    }
  }

  function initBuscadorGlobal(navegar) {
    const input = document.getElementById('buscador-global-input');
    const resultados = document.getElementById('buscador-global-resultados');
    if (!input || !resultados) return;
    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { resultados.style.display = 'none'; resultados.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        try {
          const data = await DOVA.get(`/busqueda?q=${encodeURIComponent(q)}`);
          resultados.innerHTML = renderResultadosBusqueda(data);
          resultados.style.display = '';
          enlazarResultados();
        } catch (_e) { /* búsqueda silenciosa: no interrumpir con toasts por cada tecla */ }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dova-buscador-global')) { resultados.style.display = 'none'; }
    });

    function enlazarResultados() {
      resultados.querySelectorAll('[data-ir-paciente]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('paciente', Number(b.dataset.irPaciente)); });
      });
      resultados.querySelectorAll('[data-ir-helpdesk]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('helpdesk'); });
      });
      resultados.querySelectorAll('[data-ir-factura]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('facturacion', `factura/${b.dataset.irFactura}`); });
      });
      resultados.querySelectorAll('[data-ir-usuarios]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('usuarios'); });
      });
      resultados.querySelectorAll('[data-tratamiento]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; });
      });
    }
  }

  return { vistaBuscadorGlobal, initBuscadorGlobal };
})();
window.DovaBuscadorGlobal = DovaBuscadorGlobal;
