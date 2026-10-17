/* DOVA — Pacientes (Reportes → Pacientes): lista con búsqueda, alta, eliminar e importar desde Excel. */
const DovaPacientes = (() => {
  const { esc, toast, manejarError, abrirModal } = DovaAyudantes;

  // ---------------- PACIENTES ----------------
  async function vistaPacientes() {
    const data = await manejarError(() => DOVA.get('/pacientes?pageSize=50'));
    const items = data.data || data.items || data; // tolera las distintas formas de paginación del backend
    const puedeBorrar = DOVA.tienePermiso('pacientes.delete');
    return `
      <h2 class="dova-view-title">Pacientes</h2>
      <div class="dova-toolbar">
        <input id="pacientes-buscar" type="search" placeholder="Buscar por nombre o C.I..." class="dova-input-buscar" autocomplete="off" />
        ${puedeBorrar ? '<button id="btn-ver-eliminados" class="dova-btn-secundario" aria-pressed="false">Ver eliminados</button>' : ''}
        ${DOVA.tienePermiso('pacientes.create') && window.DovaImportar ? '<button id="btn-importar-pacientes" class="dova-btn-secundario" type="button">Importar desde Excel</button>' : ''}
        ${DOVA.tienePermiso('pacientes.create') ? '<button id="btn-nuevo-paciente" class="dova-btn-primary">+ Nuevo paciente</button>' : ''}
      </div>
      <p class="dova-nota" id="pacientes-aviso" hidden></p>
      <table class="dova-tabla">
        <thead><tr><th>Nombre</th><th>C.I.</th><th>Teléfono</th><th>Acciones</th></tr></thead>
        <tbody id="pacientes-tbody">${filasPacientes(items, false)}</tbody>
      </table>
      <div id="modal-root"></div>
    `;
  }

  function filasPacientes(items, eliminados) {
    const puedeBorrar = DOVA.tienePermiso('pacientes.delete');
    return (items || []).map((p) => `
            <tr>
              <td>${esc(p.nombre)} ${esc(p.apellido)}</td>
              <td>${esc(p.ci || '-')}</td>
              <td>${esc(p.telefono || '-')}</td>
              <td class="dova-acciones-fila">${eliminados
                ? `<button class="dova-btn-link" data-restaurar-paciente="${p.id}">Restaurar</button>`
                : `<button class="dova-btn-link" data-ver-paciente="${p.id}">Ver ficha</button>${puedeBorrar ? ` <button class="dova-btn-link dova-btn-peligro" data-eliminar-paciente="${p.id}" data-nombre="${esc(p.nombre)} ${esc(p.apellido)}">Eliminar</button>` : ''}`}</td>
            </tr>`).join('') || `<tr><td colspan="4">${eliminados ? 'No hay pacientes eliminados.' : 'No se encontraron pacientes.'}</td></tr>`;
  }

  // Eliminar paciente (solo con permiso pacientes.delete, el admin lo tiene).
  // Es una baja: no se borra su historia clínica ni sus pagos/facturas, y se
  // puede restaurar desde "Ver eliminados".
  async function confirmarEliminarPaciente(id, nombre, alTerminar) {
    let r;
    try { r = await DOVA.get(`/pacientes/${id}/baja-resumen`); } catch (e) { toast(e.message, 'error'); return; }
    const avisos = [
      r.turnosFuturos ? `<li>Se van a <strong>cancelar ${r.turnosFuturos} turno${r.turnosFuturos > 1 ? 's' : ''}</strong> próximo${r.turnosFuturos > 1 ? 's' : ''}.</li>` : '',
      r.cuotasPendientes ? `<li>Tiene <strong>${r.cuotasPendientes} cuota${r.cuotasPendientes > 1 ? 's' : ''} sin pagar</strong>.</li>` : '',
      r.cuentaWeb ? '<li>Se cierra su cuenta en la página web.</li>' : '',
      (r.pagos || r.facturas) ? `<li>Sus ${r.pagos ? `${r.pagos} pago${r.pagos > 1 ? 's' : ''}` : ''}${r.pagos && r.facturas ? ' y ' : ''}${r.facturas ? `${r.facturas} factura${r.facturas > 1 ? 's' : ''}` : ''} se conservan en caja y reportes.</li>` : '',
    ].join('');
    abrirModal(`
      <h3>¿Eliminar a ${esc(nombre)}?</h3>
      <p>Deja de aparecer en Pacientes, en los buscadores y en la agenda.</p>
      ${avisos ? `<ul class="dova-lista-avisos">${avisos}</ul>` : ''}
      <p class="dova-nota">La historia clínica, los pagos y las facturas no se borran (la ley obliga a guardarlos). Si te equivocaste, lo recuperás en Pacientes → "Ver eliminados" → Restaurar.</p>
      <label for="conf-eliminar">Para confirmar, escribí <strong>ELIMINAR</strong></label>
      <input id="conf-eliminar" autocomplete="off" />
      <div class="dova-modal-actions">
        <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
        <button type="button" class="dova-btn-primary dova-btn-peligro-fondo" id="btn-conf-eliminar" disabled>Eliminar paciente</button>
      </div>`);
    const inp = document.getElementById('conf-eliminar'); const btn = document.getElementById('btn-conf-eliminar');
    inp.addEventListener('input', () => { btn.disabled = inp.value.trim().toUpperCase() !== 'ELIMINAR'; });
    inp.focus();
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await DOVA.del(`/pacientes/${id}`);
        document.getElementById('modal-root').innerHTML = '';
        toast(`${nombre} eliminado${res && res.turnosCancelados ? ` · ${res.turnosCancelados} turno(s) cancelado(s)` : ''}`, 'ok');
        alTerminar();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    });
  }

  function initPacientes(navegarAFicha) {
    const tbody = document.getElementById('pacientes-tbody');
    const buscar = document.getElementById('pacientes-buscar');
    const btnElim = document.getElementById('btn-ver-eliminados');
    const aviso = document.getElementById('pacientes-aviso');
    let eliminados = false; let ultimo = 0; let espera;
    const cargar = async () => {
      const n = ++ultimo;
      const q = buscar.value.trim();
      const url = `/pacientes?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}${eliminados ? '&eliminados=true' : ''}`;
      try {
        const data = await DOVA.get(url);
        if (n !== ultimo) return; // llegó una búsqueda más nueva
        tbody.innerHTML = filasPacientes(data.data || data.items || data, eliminados);
      } catch (e) { toast(e.message, 'error'); }
    };
    buscar.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 250); });
    if (window.DovaVivo) DovaVivo.vivo(tbody, ['pacientes'], cargar);
    if (btnElim) btnElim.addEventListener('click', () => {
      eliminados = !eliminados;
      btnElim.textContent = eliminados ? 'Ver activos' : 'Ver eliminados';
      btnElim.setAttribute('aria-pressed', String(eliminados));
      aviso.hidden = !eliminados;
      aviso.textContent = 'Pacientes eliminados: no aparecen en la agenda ni en los buscadores. "Restaurar" los vuelve a activar con toda su historia.';
      const nuevoBtn = document.getElementById('btn-nuevo-paciente'); if (nuevoBtn) nuevoBtn.hidden = eliminados;
      if (btnImp) btnImp.hidden = eliminados;
      cargar();
    });
    tbody.addEventListener('click', async (ev) => {
      const ver = ev.target.closest('[data-ver-paciente]');
      if (ver) { navegarAFicha(ver.dataset.verPaciente); return; }
      const del = ev.target.closest('[data-eliminar-paciente]');
      if (del) { confirmarEliminarPaciente(del.dataset.eliminarPaciente, del.dataset.nombre, cargar); return; }
      const res = ev.target.closest('[data-restaurar-paciente]');
      if (res) {
        res.disabled = true;
        try { await DOVA.post(`/pacientes/${res.dataset.restaurarPaciente}/restaurar`, {}); toast('Paciente restaurado', 'ok'); cargar(); } catch (e) { toast(e.message, 'error'); res.disabled = false; }
      }
    });
    const btnImp = document.getElementById('btn-importar-pacientes');
    if (btnImp) btnImp.addEventListener('click', () => DovaImportar.abrir(cargar));
    const btnNuevo = document.getElementById('btn-nuevo-paciente');
    if (btnNuevo) {
      btnNuevo.addEventListener('click', () => {
        abrirModal(`
          <h3>Nuevo paciente</h3>
          <form id="form-nuevo-paciente">
            <label>Nombre</label><input required id="np-nombre" />
            <label>Apellido</label><input required id="np-apellido" />
            <label>C.I.</label><input id="np-ci" />
            <label>Teléfono</label><input id="np-telefono" />
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Guardar</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-paciente').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/pacientes', {
            nombre: document.getElementById('np-nombre').value,
            apellido: document.getElementById('np-apellido').value,
            ci: document.getElementById('np-ci').value || undefined,
            telefono: document.getElementById('np-telefono').value || undefined,
          }));
          toast('Paciente creado', 'ok');
          location.reload();
        });
      });
    }
  }

  return { vistaPacientes, initPacientes, confirmarEliminarPaciente };
})();
window.DovaPacientes = DovaPacientes;
