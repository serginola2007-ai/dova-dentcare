/* Sección Presupuestos (Movimientos → Presupuestos).
   - Lista de todos los presupuestos de la clínica, con búsqueda (nombre, C.I. o N.º),
     estado, fechas y odontólogo; detalle con sus tratamientos, PDF y cambios de estado.
   - Nuevo presupuesto: NO se puede guardar sin la C.I. del paciente (si no la
     tiene cargada, se carga acá) ni sin al menos un tratamiento del catálogo.
     El servidor hace la misma verificación (no depende de esta pantalla).
   Uso: DovaPresupuestos.seccion(root, navegar) */
const DovaPresupuestos = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, badge, etiqueta, hoy, sumarDias, toast } = X;
  const NIVEL = { borrador: 'info', enviado: 'atencion', aceptado: 'ok', rechazado: 'critica', vencido: 'critica', cancelado: 'critica' };
  const SIGUIENTE = { borrador: ['enviado', 'aceptado', 'cancelado'], enviado: ['aceptado', 'rechazado', 'vencido', 'cancelado'], vencido: ['enviado', 'cancelado'], rechazado: [], aceptado: ['cancelado'], cancelado: [] };
  const TEXTO = { enviado: 'Marcar enviado', aceptado: 'Aceptado', rechazado: 'Rechazado', vencido: 'Vencido', cancelado: 'Cancelar' };
  const ESTADOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado'];
  const num = (v) => Number(v) || 0;
  let navegar = () => {};
  const filtros = { q: '', estado: '', desde: '', hasta: '', odontologoId: '' };

  async function seccion(root, nav) {
    navegar = nav || navegar;
    root.innerHTML = '<div data-pres-vista></div>';
    await lista(root.firstElementChild);
  }

  // ------------------------------------------------------------ Lista
  async function lista(c) {
    const odos = await X.opcionesOdontologos().catch(() => []);
    const crear = puede('presupuestos.manage');
    c.innerHTML = `
      <div class="dova-pres-cab">
        <h2 class="dova-view-title">Presupuestos</h2>
        ${crear ? '<button type="button" class="dova-btn-primary" data-pres-nuevo>+ Nuevo presupuesto</button>' : ''}
      </div>
      <form class="dova-ext-filtros" data-pres-filtros>
        <div style="flex:1;min-width:200px"><label for="pres-q">Buscar</label><input id="pres-q" name="q" type="search" placeholder="Nombre, C.I. o N.º" value="${esc(filtros.q)}" autocomplete="off"/></div>
        <div><label for="pres-estado">Estado</label><select id="pres-estado" name="estado"><option value="">Todos</option>${ESTADOS.map((e) => `<option value="${e}" ${filtros.estado === e ? 'selected' : ''}>${esc(etiqueta(e))}</option>`).join('')}</select></div>
        <div><label for="pres-desde">Desde</label><input id="pres-desde" name="desde" type="date" value="${esc(filtros.desde)}"/></div>
        <div><label for="pres-hasta">Hasta</label><input id="pres-hasta" name="hasta" type="date" value="${esc(filtros.hasta)}"/></div>
        <div><label for="pres-odo">Odontólogo</label><select id="pres-odo" name="odontologoId"><option value="">Todos</option>${odos.map(([id, n]) => `<option value="${id}" ${String(filtros.odontologoId) === String(id) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      </form>
      <p class="dova-nota" data-pres-resumen></p>
      <div data-pres-tabla>${X.cargando}</div>`;
    const f = c.querySelector('[data-pres-filtros]');
    let t = null;
    const recargar = () => cargarTabla(c);
    f.addEventListener('submit', (e) => { e.preventDefault(); recargar(); });
    f.addEventListener('input', (e) => { if (e.target.name === 'q') { clearTimeout(t); t = setTimeout(() => { if (f.isConnected) recargar(); }, 300); } });
    f.addEventListener('change', (e) => { if (e.target.name !== 'q') recargar(); });
    const bn = c.querySelector('[data-pres-nuevo]');
    if (bn) bn.addEventListener('click', () => nuevo(c));
    await cargarTabla(c);
  }

  async function cargarTabla(c) {
    const f = c.querySelector('[data-pres-filtros]');
    if (!f) return; // se cambió de pantalla (por ejemplo a "Nuevo presupuesto") antes de que termine la búsqueda
    Object.keys(filtros).forEach((k) => { filtros[k] = f[k] ? f[k].value.trim() : ''; });
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    const caja = c.querySelector('[data-pres-tabla]');
    let r;
    try { r = await DOVA.get(`/presupuestos${qs ? `?${qs}` : ''}`); } catch (e) { caja.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return; }
    if (!caja.isConnected) return;
    const anio = (r.resumenAnio || []);
    const de = (e) => anio.find((x) => x.estado === e) || { cantidad: 0, total: 0 };
    c.querySelector('[data-pres-resumen]').textContent = `Este año: ${de('aceptado').cantidad} aceptado(s) por ${fmtGs(de('aceptado').total)} · ${de('enviado').cantidad + de('borrador').cantidad} esperando respuesta.`;
    caja.innerHTML = `<div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-pres-tabla">
      <thead><tr><th>N.º</th><th>Fecha</th><th>Paciente</th><th>C.I.</th><th>Odontólogo</th><th>Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>${r.items.map((p) => `<tr>
        <td>${p.id}</td><td>${fmtFecha(p.fecha)}</td>
        <td><button type="button" class="dova-btn-link" data-ir-pac="${p.paciente_id}">${esc(`${p.paciente_nombre} ${p.paciente_apellido}`)}</button></td>
        <td>${esc(p.paciente_ci || '—')}</td><td>${esc(p.odontologo_nombre || '—')}</td>
        <td class="num">${fmtGs(p.total)}</td><td>${badge(etiqueta(p.estado), NIVEL[p.estado])}</td>
        <td class="dova-ext-acciones"><button type="button" class="dova-btn-link" data-ver-pres="${p.id}">Ver</button></td></tr>`).join('')
        || '<tr><td colspan="8">No hay presupuestos con estos filtros.</td></tr>'}</tbody></table></div>
      ${r.items.length >= 100 ? '<p class="dova-nota">Se muestran los 100 más recientes. Usá los filtros para encontrar otros.</p>' : ''}`;
    caja.querySelectorAll('[data-ver-pres]').forEach((b) => b.addEventListener('click', () => detalle(Number(b.dataset.verPres), () => cargarTabla(c))));
    caja.querySelectorAll('[data-ir-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.irPac)));
  }

  // ------------------------------------------------------------ Detalle
  async function detalle(id, alCambiar) {
    let p;
    try { p = await DOVA.get(`/presupuestos/${id}`); } catch (e) { toast(e.message, 'error'); return; }
    const maneja = puede('presupuestos.manage');
    const box = X.modal(`Presupuesto N.º ${p.id}`, `
      <p><strong>${esc(`${p.paciente_nombre} ${p.paciente_apellido}`)}</strong> · ${fmtFecha(p.fecha)}${p.vencimiento ? ` · válido hasta ${fmtFecha(p.vencimiento)}` : ''} · ${badge(etiqueta(p.estado), NIVEL[p.estado])}</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Pieza</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>${(p.items || []).map((i) => `<tr><td>${esc(i.descripcion)}</td><td>${esc(i.pieza || '—')}</td><td>${num(i.cantidad)}</td><td class="num">${fmtGs(i.precio_unitario)}</td><td class="num">${fmtGs(num(i.cantidad) * num(i.precio_unitario))}</td></tr>`).join('')}</tbody></table></div>
      <p class="dova-op-total">${num(p.descuento) ? `Descuento ${num(p.descuento)}% · ` : ''}Total: <strong>${fmtGs(p.total)}</strong></p>
      ${p.observaciones ? `<p class="dova-nota">${esc(p.observaciones)}</p>` : ''}
      <p class="dova-error-text" data-error style="display:none"></p>
      <div class="dova-modal-actions">
        <button type="button" class="dova-btn-secundario" data-pdf>PDF</button>
        ${maneja ? (SIGUIENTE[p.estado] || []).map((s) => `<button type="button" class="dova-btn-secundario ${['rechazado', 'cancelado', 'vencido'].includes(s) ? 'dova-ext-peligro' : ''}" data-est="${s}">${TEXTO[s]}</button>`).join('') : ''}
        <button type="button" class="dova-btn-secundario" data-ficha>Ver ficha</button>
        <button type="button" class="dova-btn-primary" data-cerrar-modal>Cerrar</button>
      </div>`, { ancho: 'ancho' });
    if (!box) return;
    const err = box.querySelector('[data-error]');
    box.querySelector('[data-pdf]').addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/presupuesto/${p.id}`, `presupuesto-${p.id}.pdf`).catch((e) => toast(e.message, 'error')));
    box.querySelector('[data-ficha]').addEventListener('click', () => { X.cerrarModal(); navegar('paciente', p.paciente_id); });
    box.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
      err.style.display = 'none';
      try {
        await DOVA.patch(`/presupuestos/${p.id}/estado`, { estado: b.dataset.est });
        X.cerrarModal(); toast('Estado actualizado', 'ok'); if (alCambiar) alCambiar();
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    }));
  }

  // ------------------------------------------------------------ Nuevo
  async function nuevo(c) {
    const [trats, odos] = await Promise.all([X.catalogo('tratamientos', '/tratamientos').catch(() => []), X.opcionesOdontologos().catch(() => [])]);
    const activos = trats.filter((t) => t.activo !== false);
    const yo = (DOVA.usuarioActual() || {}).odontologoId;
    c.innerHTML = `
      <div class="dova-pres-cab"><h2 class="dova-view-title">Nuevo presupuesto</h2><button type="button" class="dova-btn-secundario" data-volver>Volver a la lista</button></div>
      <form data-pres-form novalidate>
        <h3 class="dova-section-title">1. Paciente</h3>
        <div class="dova-ext-form-grid">
          ${DovaOperativo.campoPacienteHtml('pacienteId')}
          <div class="dova-ext-campo" data-ci-campo hidden><label for="pres-ci">C.I. del paciente *</label><input id="pres-ci" name="pacienteCi" maxlength="20" autocomplete="off" placeholder="Ej.: 4.123.456"/>
            <p class="dova-ext-ayuda">Este paciente no tiene la C.I. cargada. Es obligatoria para presupuestar y queda guardada en su ficha.</p></div>
          <p class="dova-nota" data-ci-actual hidden></p>
        </div>
        <h3 class="dova-section-title">2. Tratamientos</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-op-items"><thead><tr><th>Tratamiento *</th><th>Pieza</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th><th></th></tr></thead><tbody data-items></tbody></table></div>
        <button type="button" class="dova-btn-secundario" data-agregar>+ Agregar tratamiento</button>
        <h3 class="dova-section-title">3. Condiciones</h3>
        <div class="dova-ext-form-grid">
          <div class="dova-ext-campo"><label for="pres-odonto">Odontólogo</label><select id="pres-odonto" name="odontologoId"><option value="">—</option>${odos.map(([id, n]) => `<option value="${id}" ${String(id) === String(yo) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          <div class="dova-ext-campo"><label for="pres-venc">Válido hasta</label><input id="pres-venc" type="date" name="vencimiento" value="${sumarDias(hoy(), 30)}"/></div>
          <div class="dova-ext-campo"><label for="pres-desc">Descuento (%)</label><input id="pres-desc" type="number" name="descuento" min="0" max="100" value="0"/></div>
          <div class="dova-ext-campo dova-ext-campo-completo"><label for="pres-obs">Observaciones</label><textarea id="pres-obs" name="observaciones" rows="2" maxlength="1000"></textarea></div>
        </div>
        <p class="dova-op-total">Total: <strong data-total>Gs. 0</strong></p>
        <p class="dova-pres-falta" data-falta></p>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-volver>Cancelar</button><button class="dova-btn-primary" data-guardar disabled>Guardar presupuesto</button></div>
      </form>`;
    const form = c.querySelector('[data-pres-form]');
    const tbody = form.querySelector('[data-items]');
    const campoCi = form.querySelector('[data-ci-campo]');
    const ciActual = form.querySelector('[data-ci-actual]');
    const st = { pacienteId: null, tieneCi: false };
    c.querySelectorAll('[data-volver]').forEach((b) => b.addEventListener('click', () => lista(c)));

    const fila = () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-t required aria-label="Tratamiento"><option value="">Elegí un tratamiento…</option>${activos.map((t) => `<option value="${t.id}" data-p="${num(t.precio)}">${esc(t.nombre)}</option>`).join('')}</select></td>
        <td><input data-pieza maxlength="2" size="3" inputmode="numeric" aria-label="Pieza"/></td>
        <td><input data-cant type="number" min="1" value="1" style="width:64px" aria-label="Cantidad"/></td>
        <td><input data-precio type="number" min="0" step="1000" value="0" style="width:120px" aria-label="Precio unitario"/></td>
        <td data-sub class="num">Gs. 0</td><td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar aria-label="Quitar">Quitar</button></td>`;
      tbody.appendChild(tr);
      const sel = tr.querySelector('[data-t]');
      sel.addEventListener('change', () => { if (sel.value) tr.querySelector('[data-precio]').value = sel.selectedOptions[0].dataset.p; revisar(); });
      tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', revisar));
      tr.querySelector('[data-quitar]').addEventListener('click', () => { tr.remove(); revisar(); });
    };
    const items = () => [...tbody.querySelectorAll('tr')].filter((tr) => tr.querySelector('[data-t]').value).map((tr) => {
      const sel = tr.querySelector('[data-t]');
      return { tratamientoId: Number(sel.value), descripcion: sel.selectedOptions[0].textContent, pieza: tr.querySelector('[data-pieza]').value.trim() || undefined, cantidad: Number(tr.querySelector('[data-cant]').value || 1), precioUnitario: Number(tr.querySelector('[data-precio]').value || 0) };
    });
    // Lo que falta para poder guardar (el botón queda desactivado hasta completarlo).
    function revisar() {
      let s = 0;
      tbody.querySelectorAll('tr').forEach((tr) => { const sub = Number(tr.querySelector('[data-cant]').value || 0) * Number(tr.querySelector('[data-precio]').value || 0); s += sub; tr.querySelector('[data-sub]').textContent = fmtGs(sub); });
      form.querySelector('[data-total]').textContent = fmtGs(Math.round(s * (1 - Number(form.descuento.value || 0) / 100)));
      const falta = [];
      if (!st.pacienteId) falta.push('elegir el paciente');
      else if (!st.tieneCi && !form.pacienteCi.value.trim()) falta.push('cargar la C.I. del paciente');
      if (!items().length) falta.push('agregar al menos un tratamiento');
      const sinElegir = [...tbody.querySelectorAll('[data-t]')].some((x) => !x.value);
      if (items().length && sinElegir) falta.push('elegir el tratamiento de cada fila (o quitarla)');
      form.querySelector('[data-falta]').textContent = falta.length ? `Para guardar falta: ${falta.join(', ')}.` : '';
      form.querySelector('[data-guardar]').disabled = falta.length > 0;
      return falta;
    }
    DovaOperativo.activarBuscadorPaciente(form, async (id) => {
      st.pacienteId = id; st.tieneCi = false;
      campoCi.hidden = true; ciActual.hidden = true;
      try {
        const p = await DOVA.get(`/pacientes/${id}`);
        st.tieneCi = !!(p.ci && String(p.ci).trim());
        if (st.tieneCi) { ciActual.textContent = `C.I. ${p.ci}`; ciActual.hidden = false; } else { campoCi.hidden = false; form.pacienteCi.focus(); }
      } catch (e) { toast(e.message, 'error'); }
      revisar();
    });
    form.querySelector('[data-buscar-pac]').addEventListener('input', () => { st.pacienteId = null; campoCi.hidden = true; ciActual.hidden = true; revisar(); });
    form.pacienteCi.addEventListener('input', revisar);
    form.descuento.addEventListener('input', revisar);
    form.querySelector('[data-agregar]').addEventListener('click', () => { fila(); revisar(); });
    fila(); revisar();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      if (revisar().length) return;
      try {
        const p = await DOVA.post('/presupuestos', {
          pacienteId: st.pacienteId, pacienteCi: st.tieneCi ? undefined : form.pacienteCi.value.trim(), items: items(),
          descuento: Number(form.descuento.value || 0), vencimiento: form.vencimiento.value || undefined,
          odontologoId: form.odontologoId.value ? Number(form.odontologoId.value) : undefined, observaciones: form.observaciones.value.trim() || undefined,
        });
        toast(`Presupuesto N.º ${p.id} guardado`, 'ok');
        await lista(c);
        detalle(p.id, () => cargarTabla(c));
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }

  return { seccion };
})();
window.DovaPresupuestos = DovaPresupuestos;
