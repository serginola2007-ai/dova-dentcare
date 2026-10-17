/* DOVA — pestañas de operación de la ficha del paciente.
   Cobros, Presupuestos (también desde el odontograma), Planes de pago, Facturas, Turnos del paciente
   y Consentimientos con firma en pantalla. Se suman a la ficha con extenderFicha(idPaciente, navegar).
   También exporta modalCobro() y modalPresupuesto() para usarlos desde otras pantallas. */
const DovaFichaOperativa = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy, sumarDias, etiqueta, badge, cargando } = X;
  const { confirmar, modalTurno, ESTADO_NIVEL, opcionesMetodos, hora5 } = DovaTurnos;
  const num = (valor) => Number(valor || 0);
  let navegarFicha = null; // lo fija extenderFicha() para ir a facturas desde la ficha

  // =================================================================
  // FICHA DEL PACIENTE: cobros, presupuestos, planes de pago, turnos y consentimientos
  // =================================================================
  async function modalCobro(pid, { cuota = null, alGuardar } = {}) {
    let cuotas = [];
    if (!cuota) {
      try {
        const planes = await DOVA.get(`/planes-pago/paciente/${pid}`);
        const det = await Promise.all(planes.filter((p) => p.estado !== 'cancelado').map((p) => DOVA.get(`/planes-pago/${p.id}`)));
        cuotas = det.flatMap((p) => (p.cuotas || []).filter((q) => q.estado !== 'pagada').map((q) => ({ ...q, plan: p.id })));
      } catch (_e) { cuotas = []; }
    }
    const mets = await opcionesMetodos();
    const opFac = await DovaFacturacion.opcionesCobro();
    // Presupuestos vigentes: el cobro queda asociado (sirve para saber cuánto falta pagar y para facturar).
    const press = !cuota && puede('presupuestos.view') ? (await DOVA.get(`/presupuestos/paciente/${pid}`).catch(() => [])).filter((p) => ['aceptado', 'enviado'].includes(p.estado)) : [];
    const campos = [
      { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1 },
      { k: 'metodo', label: 'Medio de pago', tipo: 'select', req: true, opciones: mets },
      ...(press.length ? [{ k: 'presupuestoId', label: 'Presupuesto', tipo: 'select', opciones: press.map((p) => [p.id, `N.º ${p.id} · ${fmtFecha(p.fecha)} · ${fmtGs(p.total)}`]), ayuda: 'Opcional. Asocia el cobro a ese presupuesto.' }] : []),
      ...(cuota ? [] : [{ k: 'cuotaId', label: 'Aplicar a una cuota', tipo: 'select', opciones: cuotas.map((q) => [q.id, `Plan #${q.plan} — cuota ${q.numero} · ${fmtGs(q.monto)} · vence ${fmtFecha(q.vencimiento)}`]), ayuda: cuotas.length ? 'Opcional. Si elegís una cuota, el monto se completa solo.' : 'El paciente no tiene cuotas pendientes.' }]),
      { k: 'concepto', label: 'Concepto', ancho: 'completo', max: 200 },
    ];
    const form = X.modalForm(cuota ? `Cobrar cuota ${cuota.numero}` : 'Registrar cobro', campos, cuota ? { monto: num(cuota.monto), metodo: 'efectivo', concepto: `Cuota ${cuota.numero}` } : { metodo: 'efectivo' }, async (d, formEl) => {
      const datos = { ...d, pacienteId: pid, monto: Number(d.monto) };
      if (cuota) datos.cuotaId = cuota.id; else if (d.cuotaId) datos.cuotaId = Number(d.cuotaId); else delete datos.cuotaId;
      if (d.presupuestoId) datos.presupuestoId = Number(d.presupuestoId); else delete datos.presupuestoId;
      const fac = DovaFacturacion.leerBloqueFactura(formEl);
      const r = await DOVA.post('/pagos', datos);
      toast(r.cajaReflejada ? 'Cobro registrado en la caja' : 'Cobro registrado. La caja está cerrada: se va a sumar cuando se abra hoy.', r.cajaReflejada ? 'ok' : 'info');
      if (fac) await DovaFacturacion.facturarIngreso({ pagoId: r.id }, fac);
      if (alGuardar) alGuardar(r);
    }, { textoBoton: 'Registrar cobro', extraHtml: DovaFacturacion.bloqueFacturaHtml(opFac) });
    DovaFacturacion.activarBloqueFactura(form);
    const selC = form.querySelector('[name="cuotaId"]');
    if (selC) selC.addEventListener('change', () => { const q = cuotas.find((x) => String(x.id) === selC.value); if (q) form.querySelector('[name="monto"]').value = num(q.monto); });
  }

  async function cobros(c, pid) {
    const pagos = await DOVA.get(`/pagos/paciente/${pid}`);
    const puedeCobrar = puede('pagos.create');
    const verFac = puede('facturacion.ver', 'facturacion.ver_propias'); const crearFac = puede('facturacion.crear');
    const mets = Object.fromEntries(await opcionesMetodos());
    const colFactura = (p) => {
      if (p.factura_id) return `${verFac ? `<button class="dova-btn-link" data-ir-factura="${p.factura_id}">Factura generada ${esc(p.factura_numero)}</button>` : `<span class="dova-nota">Factura ${esc(p.factura_numero)}</span>`}${puede('facturacion.imprimir') ? ` <button class="dova-btn-link" data-imprimir-factura="${p.factura_id}" data-num="${esc(p.factura_numero)}">Imprimir</button>` : ''}`;
      if (p.estado !== 'anulado' && crearFac) return `<button class="dova-btn-link" data-generar-factura="${p.id}">Generar factura</button>`;
      return '<span class="dova-nota">—</span>';
    };
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Cobros</h3>${puedeCobrar ? '<button class="dova-btn-primary" data-cobrar>+ Registrar cobro</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Monto</th><th>Estado</th><th>Cobró</th><th>Factura</th><th></th></tr></thead><tbody>
      ${pagos.map((p, i) => `<tr class="${p.estado === 'anulado' ? 'dova-op-fila-apagada' : ''}"><td>${fmtFecha(p.fecha)}</td><td>${esc(p.concepto || '-')}</td><td>${esc(mets[p.metodo] || etiqueta(p.metodo))}</td><td>${fmtGs(p.monto)}</td>
        <td>${p.estado === 'anulado' ? `${badge('Anulado', 'critica')}${p.anulado_motivo ? `<br><span class="dova-nota">${esc(p.anulado_motivo)}</span>` : ''}` : badge('Pagado', 'ok')}</td><td>${esc(p.usuario_nombre || '-')}</td><td>${colFactura(p)}</td>
        <td class="dova-ext-acciones"><button class="dova-btn-link" data-recibo="${p.id}">Recibo PDF</button>${puede('pagos.anular') && p.estado !== 'anulado' ? `<button class="dova-btn-link dova-ext-peligro" data-anular="${i}">Anular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">Sin cobros.</td></tr>'}
      </tbody></table></div>`;
    const b = c.querySelector('[data-cobrar]');
    if (b) b.addEventListener('click', () => modalCobro(pid, { alGuardar: () => cobros(c, pid) }));
    c.querySelectorAll('[data-ir-factura]').forEach((x) => x.addEventListener('click', () => navegarFicha && navegarFicha('facturacion', `factura/${x.dataset.irFactura}`)));
    c.querySelectorAll('[data-imprimir-factura]').forEach((x) => x.addEventListener('click', () => DovaFacturacion.imprimirPdf(x.dataset.imprimirFactura, x.dataset.num)));
    // "Generar factura" en un paso (hereda todo del cobro); para editar conceptos, desde Facturación → Nueva factura.
    c.querySelectorAll('[data-generar-factura]').forEach((x) => x.addEventListener('click', async () => {
      x.disabled = true;
      const op = await DovaFacturacion.opcionesCobro();
      const f = await DovaFacturacion.facturarIngreso({ pagoId: x.dataset.generarFactura }, { imprimir: op.imprimirAlFacturar && puede('facturacion.imprimir') });
      if (f) cobros(c, pid); else x.disabled = false;
    }));
    c.querySelectorAll('[data-recibo]').forEach((x) => x.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/pago/${x.dataset.recibo}`, `recibo-${x.dataset.recibo}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-anular]').forEach((x) => x.addEventListener('click', () => {
      const p = pagos[Number(x.dataset.anular)];
      X.modal('Anular cobro', `<p>${fmtGs(p.monto)} del ${fmtFecha(p.fecha)} (${esc(mets[p.metodo] || etiqueta(p.metodo))}).</p>
        <p class="dova-nota">El cobro no se borra: queda anulado con el motivo, quién y cuándo. Si había entrado a la caja de hoy, se registra la devolución en la caja.</p>
        <label>Motivo de la anulación<textarea data-motivo rows="2" maxlength="500" placeholder="Ej.: se cobró dos veces"></textarea></label>
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary dova-btn-peligro-fondo" data-si>Anular cobro</button></div>`);
      const box = document.querySelector('.dova-modal-box');
      box.querySelector('[data-si]').addEventListener('click', async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        try {
          const r = await DOVA.post(`/pagos/${p.id}/anular`, { motivo: box.querySelector('[data-motivo]').value });
          X.cerrarModal(); toast(r.devolucionEnCaja ? 'Cobro anulado y devolución registrada en la caja' : 'Cobro anulado', 'ok'); cobros(c, pid);
        } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      });
    }));
  }

  const PRES_NIVEL = { borrador: 'info', enviado: 'atencion', aceptado: 'ok', rechazado: 'critica', vencido: 'critica', cancelado: 'critica' };
  const PRES_SIGUIENTE = { borrador: ['enviado', 'aceptado', 'cancelado'], enviado: ['aceptado', 'rechazado', 'vencido', 'cancelado'], vencido: ['enviado', 'cancelado'], rechazado: [], aceptado: ['cancelado'], cancelado: [] };
  const PRES_TEXTO = { enviado: 'Marcar enviado', aceptado: 'Aceptado', rechazado: 'Rechazado', vencido: 'Vencido', cancelado: 'Cancelar' };

  async function presupuestos(c, pid) {
    const [lista, planesPago] = await Promise.all([DOVA.get(`/presupuestos/paciente/${pid}`), puede('planes_pago.manage', 'pagos.view') ? DOVA.get(`/planes-pago/paciente/${pid}`).catch(() => []) : []]);
    const maneja = puede('presupuestos.manage');
    const conPlan = new Set(planesPago.filter((p) => p.estado !== 'cancelado').map((p) => p.presupuesto_id));
    const verFac = puede('facturacion.ver', 'facturacion.ver_propias'); const crearFac = puede('facturacion.crear');
    // Total / pagado / pendiente / facturas de cada presupuesto vigente.
    const res = {};
    await Promise.all(lista.filter((p) => ['aceptado', 'enviado'].includes(p.estado)).slice(0, 30).map(async (p) => { try { res[p.id] = await DOVA.get(`/facturacion/presupuesto/${p.id}/resumen`); } catch (_e) { /* sin datos */ } }));
    const detalleCuenta = (p) => {
      const r = res[p.id]; if (!r) return '';
      const facs = (r.facturas || []).filter((f) => f.estado !== 'anulada');
      return `<div class="dova-nota">Pagado ${fmtGs(r.pagado)} · Pendiente <strong>${fmtGs(r.pendiente)}</strong>${verFac ? ` · Facturado ${fmtGs(r.facturado)}` : ''}</div>
        ${verFac && facs.length ? `<div class="dova-nota">Facturas: ${facs.map((f) => `<button class="dova-btn-link" data-ir-factura="${f.id}">${esc(f.numero_completo)}</button>`).join(', ')}</div>` : ''}`;
    };
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Presupuestos</h3>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo presupuesto</button>' : ''}</div>
      <p class="dova-nota">También podés generar un presupuesto desde un plan de tratamiento (pestaña Resumen → Ver etapas).</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Total</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>
      ${lista.map((p, i) => `<tr><td>${fmtFecha(p.fecha)}</td><td>${fmtGs(p.total)}${num(p.descuento) ? ` <span class="dova-nota">(−${num(p.descuento)}%)</span>` : ''}</td><td>${badge(etiqueta(p.estado), PRES_NIVEL[p.estado])}</td><td class="dova-nota">${esc(p.observaciones || '')}${detalleCuenta(p)}</td>
        <td class="dova-ext-acciones"><button class="dova-btn-link" data-pdf="${p.id}">PDF</button>
          ${crearFac && p.estado === 'aceptado' && res[p.id] && res[p.id].facturado < res[p.id].total ? `<button class="dova-btn-link" data-generar-factura-pres="${p.id}">Generar factura</button>` : ''}
          ${maneja ? (PRES_SIGUIENTE[p.estado] || []).map((s) => `<button class="dova-btn-link ${['rechazado', 'cancelado', 'vencido'].includes(s) ? 'dova-ext-peligro' : ''}" data-est="${s}" data-i="${i}">${PRES_TEXTO[s]}</button>`).join('') : ''}
          ${p.estado === 'aceptado' && puede('planes_tratamiento.manage', 'presupuestos.manage') ? `<button class="dova-btn-link" data-a-plan="${p.id}">Crear plan de tratamiento</button>` : ''}
          ${p.estado === 'aceptado' && puede('planes_pago.manage') && !conPlan.has(p.id) ? `<button class="dova-btn-link" data-financiar="${i}">Financiar en cuotas</button>` : ''}
          ${p.estado === 'aceptado' && conPlan.has(p.id) ? badge('con plan de pago', 'info') : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin presupuestos.</td></tr>'}
      </tbody></table></div>`;
    const recargar = () => presupuestos(c, pid);
    X.vivo(c, ['presupuestos', 'pagos', 'planes_pago', 'cuotas'], recargar);
    c.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/presupuesto/${b.dataset.pdf}`, `presupuesto-${b.dataset.pdf}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
      const p = lista[Number(b.dataset.i)];
      try { await DOVA.patch(`/presupuestos/${p.id}/estado`, { estado: b.dataset.est }); toast('Presupuesto actualizado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-ir-factura]').forEach((x) => x.addEventListener('click', () => navegarFicha && navegarFicha('facturacion', `factura/${x.dataset.irFactura}`)));
    c.querySelectorAll('[data-generar-factura-pres]').forEach((x) => x.addEventListener('click', () => navegarFicha && navegarFicha('facturacion', `nueva/presupuesto/${x.dataset.generarFacturaPres}`)));
    c.querySelectorAll('[data-financiar]').forEach((b) => b.addEventListener('click', () => modalPlanPago(pid, lista[Number(b.dataset.financiar)], recargar)));
    // Presupuesto aceptado → un plan de tratamiento por cada ítem (sin duplicar).
    c.querySelectorAll('[data-a-plan]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await DOVA.post(`/presupuestos/${b.dataset.aPlan}/planes`, {});
        toast(r.creados.length ? `Se crearon ${r.creados.length} plan(es) de tratamiento: ${r.creados.map((x) => x.nombre).join(', ')}` : 'Los planes de este presupuesto ya estaban creados', 'ok');
      } catch (e) { toast(e.message, 'error'); }
      b.disabled = false;
    }));
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => modalPresupuesto(pid, recargar));
  }

  async function modalPresupuesto(pid, alGuardar, { items: iniciales = [] } = {}) {
    const trats = await X.catalogo('tratamientos', '/tratamientos').catch(() => []);
    const odos = await X.opcionesOdontologos();
    // La C.I. es obligatoria para presupuestar: si el paciente no la tiene, se pide acá.
    const pac = await DOVA.get(`/pacientes/${pid}`).catch(() => null);
    const sinCi = !pac || !pac.ci || !String(pac.ci).trim();
    X.modal('Nuevo presupuesto', `
      <form data-pres>
        ${sinCi ? '<div class="dova-ext-campo"><label for="mp-ci">C.I. del paciente *</label><input id="mp-ci" name="pacienteCi" maxlength="20" required autocomplete="off"/><p class="dova-ext-ayuda">El paciente no tiene la C.I. cargada: es obligatoria para guardar el presupuesto.</p></div>' : ''}
        <div class="dova-ext-form-grid">
          <div class="dova-ext-campo"><label>Odontólogo</label><select name="odontologoId"><option value="">—</option>${odos.map(([id, n]) => `<option value="${id}" ${String(id) === String((DOVA.usuarioActual() || {}).odontologoId) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          <div class="dova-ext-campo"><label>Válido hasta</label><input type="date" name="vencimiento" value="${sumarDias(hoy(), 30)}"/></div>
          <div class="dova-ext-campo"><label>Descuento (%)</label><input type="number" name="descuento" min="0" max="100" value="0"/></div>
        </div>
        <table class="dova-tabla dova-op-items"><thead><tr><th>Tratamiento / descripción</th><th>Pieza</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th><th></th></tr></thead><tbody data-items></tbody></table>
        <button type="button" class="dova-btn-secundario" data-agregar>+ Agregar ítem</button>
        <p class="dova-op-total">Total: <strong data-total>Gs. 0</strong></p>
        <div class="dova-ext-campo dova-ext-campo-completo"><label>Observaciones</label><textarea name="observaciones" rows="2"></textarea></div>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Guardar presupuesto</button></div>
      </form>`, { ancho: 'ancho' });
    const form = document.querySelector('[data-pres]');
    const tbody = form.querySelector('[data-items]');
    const fila = (ini) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-t><option value="">— Otro (escribir) —</option>${trats.filter((t) => t.activo !== false).map((t) => `<option value="${t.id}" data-p="${num(t.precio)}">${esc(t.nombre)}</option>`).join('')}</select><input data-desc placeholder="Descripción" style="margin-top:4px"/></td>
        <td><input data-pieza maxlength="2" size="3" inputmode="numeric"/></td><td><input data-cant type="number" min="1" value="1" style="width:64px"/></td>
        <td><input data-precio type="number" min="0" step="1000" value="0" style="width:120px"/></td><td data-sub>Gs. 0</td><td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar>✕</button></td>`;
      tbody.appendChild(tr);
      const sel = tr.querySelector('[data-t]');
      sel.addEventListener('change', () => {
        const o = sel.selectedOptions[0];
        if (sel.value) { tr.querySelector('[data-desc]').value = o.textContent; tr.querySelector('input[data-precio]').value = o.dataset.p; }
        total();
      });
      tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', total));
      tr.querySelector('[data-quitar]').addEventListener('click', () => { tr.remove(); total(); });
      if (ini && typeof ini === 'object' && !(ini instanceof Event)) {
        if (ini.tratamientoId) sel.value = String(ini.tratamientoId);
        tr.querySelector('[data-desc]').value = ini.descripcion || (sel.value ? sel.selectedOptions[0].textContent : '');
        tr.querySelector('[data-pieza]').value = ini.pieza || '';
        tr.querySelector('input[data-precio]').value = ini.precioUnitario !== undefined ? ini.precioUnitario : (sel.value ? sel.selectedOptions[0].dataset.p : 0);
      }
    };
    const leerItems = () => [...tbody.querySelectorAll('tr')].map((tr) => ({
      tratamientoId: tr.querySelector('[data-t]').value ? Number(tr.querySelector('[data-t]').value) : undefined,
      descripcion: tr.querySelector('[data-desc]').value.trim(),
      pieza: tr.querySelector('[data-pieza]').value.trim() || undefined,
      cantidad: Number(tr.querySelector('[data-cant]').value || 1),
      precioUnitario: Number(tr.querySelector('input[data-precio]').value || 0),
    }));
    function total() {
      let s = 0;
      tbody.querySelectorAll('tr').forEach((tr) => { const sub = Number(tr.querySelector('[data-cant]').value || 0) * Number(tr.querySelector('input[data-precio]').value || 0); s += sub; tr.querySelector('[data-sub]').textContent = fmtGs(sub); });
      const desc = Number(form.descuento.value || 0);
      form.querySelector('[data-total]').textContent = fmtGs(Math.round(s * (1 - desc / 100)));
    }
    form.descuento.addEventListener('input', total);
    form.querySelector('[data-agregar]').addEventListener('click', () => fila());
    if (iniciales.length) { iniciales.forEach((i) => fila(i)); total(); } else fila();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      const items = leerItems().filter((i) => i.descripcion || i.tratamientoId);
      try {
        if (!items.length) throw new Error('Agregá al menos un tratamiento');
        if (sinCi && !form.pacienteCi.value.trim()) throw new Error('Cargá la C.I. del paciente para poder guardar el presupuesto');
        await DOVA.post('/presupuestos', {
          pacienteId: pid, pacienteCi: sinCi ? form.pacienteCi.value.trim() : undefined, items, descuento: Number(form.descuento.value || 0), vencimiento: form.vencimiento.value || undefined,
          odontologoId: form.odontologoId.value ? Number(form.odontologoId.value) : undefined, observaciones: form.observaciones.value.trim() || undefined,
        });
        X.cerrarModal(); toast('Presupuesto guardado', 'ok'); if (alGuardar) alGuardar();
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }

  function modalPlanPago(pid, pres, alGuardar) {
    const form = X.modalForm(`Financiar presupuesto de ${fmtGs(pres.total)}`, [
      { k: 'entrega', label: 'Entrega inicial (Gs.)', tipo: 'numero', min: 0 },
      { k: 'cantidadCuotas', label: 'Cantidad de cuotas', tipo: 'numero', req: true, min: 1, max: 60, paso: 1 },
      { k: 'fechaInicio', label: 'Vence la primera cuota', tipo: 'fecha', req: true },
    ], { entrega: 0, cantidadCuotas: 3, fechaInicio: sumarDias(hoy(), 30) }, async (d) => {
      await DOVA.post('/planes-pago', { pacienteId: pid, presupuestoId: pres.id, total: num(pres.total), entrega: Number(d.entrega || 0), cantidadCuotas: Number(d.cantidadCuotas), fechaInicio: d.fechaInicio });
      toast('Plan de pago creado', 'ok'); if (alGuardar) alGuardar();
    }, { textoBoton: 'Crear plan de pago', extraHtml: '<p class="dova-nota" data-cuota></p>' });
    const calc = () => {
      const n = Number(form.cantidadCuotas.value || 0); const e = Number(form.entrega.value || 0);
      form.querySelector('[data-cuota]').textContent = n > 0 ? `${n} cuota(s) mensuales de aprox. ${fmtGs(Math.round((num(pres.total) - e) / n))}` : '';
    };
    form.cantidadCuotas.addEventListener('input', calc); form.entrega.addEventListener('input', calc); calc();
  }

  async function planesDePago(c, pid) {
    const planes = await DOVA.get(`/planes-pago/paciente/${pid}`);
    const det = await Promise.all(planes.map((p) => DOVA.get(`/planes-pago/${p.id}`)));
    const puedeCobrar = puede('pagos.create');
    const h = hoy();
    c.innerHTML = det.length ? det.map((p) => `
      <div class="dova-ext-caja">
        <h4>Plan #${p.id} — ${fmtGs(p.total)} ${badge(etiqueta(p.estado), p.estado === 'pagado' || p.estado === 'finalizado' ? 'ok' : 'info')}</h4>
        <p class="dova-nota">Entrega ${fmtGs(p.entrega)} · ${p.cantidad_cuotas} cuotas desde ${fmtFecha(p.fecha_inicio)}</p>
        <table class="dova-tabla"><thead><tr><th>Cuota</th><th>Vence</th><th>Monto</th><th>Estado</th><th></th></tr></thead><tbody>
        ${(p.cuotas || []).map((q) => `<tr><td>${q.numero}</td><td>${fmtFecha(q.vencimiento)}</td><td>${fmtGs(q.monto)}</td>
          <td>${q.estado === 'pagada' ? badge('Pagada', 'ok') : String(q.vencimiento).slice(0, 10) < h ? badge('Vencida', 'critica') : badge('Pendiente', 'info')}</td>
          <td>${puedeCobrar && q.estado !== 'pagada' ? `<button class="dova-btn-link" data-cobrar-cuota="${p.id}:${q.id}">Cobrar</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>`).join('') : '<p class="dova-vacio">Sin planes de pago. Se crean desde un presupuesto aceptado (subpestaña Presupuestos → "Financiar en cuotas").</p>';
    c.querySelectorAll('[data-cobrar-cuota]').forEach((b) => b.addEventListener('click', () => {
      const [planId, cuotaId] = b.dataset.cobrarCuota.split(':').map(Number);
      const q = det.find((p) => p.id === planId).cuotas.find((x) => x.id === cuotaId);
      modalCobro(pid, { cuota: q, alGuardar: () => planesDePago(c, pid) });
    }));
  }

  async function turnosPaciente(c, pid, navegar) {
    const turnos = await DOVA.get(`/agenda?pacienteId=${pid}`);
    const h = hoy();
    const prox = turnos.filter((t) => String(t.fecha).slice(0, 10) >= h && ['reservado', 'confirmado'].includes(t.estado)).sort((a, b) => (String(a.fecha) + a.hora_inicio).localeCompare(String(b.fecha) + b.hora_inicio));
    const pasados = turnos.filter((t) => !prox.includes(t)).sort((a, b) => (String(b.fecha) + b.hora_inicio).localeCompare(String(a.fecha) + a.hora_inicio));
    const nombre = document.querySelector('.dova-ficha-header h2, .dova-view-title');
    const filasHtml = (l) => l.map((t) => `<tr class="${['cancelado', 'no_asistio', 'reprogramado'].includes(t.estado) ? 'dova-op-fila-apagada' : ''}"><td>${fmtFecha(t.fecha)}</td><td>${hora5(t.hora_inicio)}</td><td>${esc(t.odontologo_nombre)}</td><td>${esc(t.tratamiento_nombre || t.motivo || '-')}</td><td>${badge(etiqueta(t.estado), ESTADO_NIVEL[t.estado] || 'info')}</td>
      <td class="dova-ext-acciones">${puede('agenda.edit') && ['reservado', 'confirmado'].includes(t.estado) ? `<button class="dova-btn-link" data-repro="${t.id}">Reprogramar</button><button class="dova-btn-link dova-ext-peligro" data-cancelar="${t.id}">Cancelar</button>` : ''}</td></tr>`).join('');
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Próximos turnos</h3>${puede('agenda.create') ? '<button class="dova-btn-primary" data-nuevo-turno>+ Dar turno</button>' : ''}</div>
      <table class="dova-tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Odontólogo</th><th>Tratamiento</th><th>Estado</th><th></th></tr></thead><tbody>${filasHtml(prox) || '<tr><td colspan="6">Sin turnos próximos.</td></tr>'}</tbody></table>
      <h3 class="dova-section-title">Historial de turnos</h3>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Odontólogo</th><th>Tratamiento</th><th>Estado</th><th></th></tr></thead><tbody>${filasHtml(pasados.slice(0, 50)) || '<tr><td colspan="6">Sin turnos anteriores.</td></tr>'}</tbody></table></div>`;
    const recargar = () => turnosPaciente(c, pid, navegar);
    X.vivo(c, ['turnos'], recargar);
    const bn = c.querySelector('[data-nuevo-turno]');
    if (bn) bn.addEventListener('click', () => modalTurno({ fijo: { pacienteId: pid, pacienteNombre: nombre ? nombre.textContent.trim() : '' }, alGuardar: recargar }));
    c.querySelectorAll('[data-repro]').forEach((b) => b.addEventListener('click', () => modalTurno({ turno: turnos.find((t) => String(t.id) === b.dataset.repro), alGuardar: recargar })));
    c.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('¿Cancelar el turno?', 'El horario queda libre para otro paciente.', 'Cancelar turno'))) return;
      try { await DOVA.patch(`/agenda/${b.dataset.cancelar}/estado`, { estado: 'cancelado' }); toast('Turno cancelado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  // ---- Consentimientos con firma en pantalla ----
  // Lienzo de firma: dedo, lápiz o mouse (pointer events). Un toque suelto
  // no cuenta como firma: hace falta un trazo de cierto largo.
  function lienzoFirma(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1b1b';
    let dibujando = false; let largo = 0; let ult = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]; };
    canvas.addEventListener('pointerdown', (e) => { dibujando = true; ult = pos(e); ctx.beginPath(); ctx.moveTo(...ult); try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* */ } e.preventDefault(); });
    canvas.addEventListener('pointermove', (e) => { if (!dibujando) return; const p = pos(e); largo += Math.hypot(p[0] - ult[0], p[1] - ult[1]); ult = p; ctx.lineTo(...p); ctx.stroke(); e.preventDefault(); });
    const fin = () => { dibujando = false; };
    canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin); canvas.addEventListener('pointerleave', fin);
    return {
      limpiar: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); largo = 0; },
      vacio: () => largo < 60,
      datos: () => canvas.toDataURL('image/png'),
    };
  }

  /* Modo firma en tablet: pantalla completa solo con el texto, quién firma,
     la casilla "Leí y acepto" y el recuadro para firmar con el dedo. El
     paciente no ve ni puede tocar el resto de DOVA. */
  function modoFirma(k, paciente, alTerminar) {
    const capa = document.createElement('div');
    capa.className = 'dova-firma-tablet';
    capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true');
    const nombrePac = `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim();
    capa.innerHTML = `
      <div class="dova-firma-caja">
        <p class="dova-firma-clinica">${esc(((DOVA.clinicaActual() || {}).nombre) || '')}</p>
        <h2>Consentimiento informado</h2>
        <p class="dova-firma-proc">${esc(k.procedimiento)}</p>
        <div class="dova-firma-texto" tabindex="0">${esc(k.texto || '')}</div>
        <fieldset class="dova-firma-quien"><legend>¿Quién firma?</legend>
          <label class="dova-check"><input type="radio" name="rel" value="paciente" checked /> El paciente: <strong>${esc(nombrePac)}</strong></label>
          <label class="dova-check"><input type="radio" name="rel" value="responsable" /> Su responsable (madre, padre, tutor)</label>
          <div class="dova-firma-resp" hidden>
            <div><label>Nombre del responsable</label><input type="text" name="fnombre" maxlength="150" autocomplete="off" /></div>
            <div><label>C.I. del responsable</label><input type="text" name="fdoc" maxlength="30" inputmode="numeric" autocomplete="off" /></div>
          </div>
        </fieldset>
        <label class="dova-check dova-firma-acepto"><input type="checkbox" name="acepto" /> Leí el texto, me lo explicaron y acepto.</label>
        <p class="dova-firma-etq">Firmá acá con el dedo</p>
        <canvas class="dova-firma-lienzo" data-lienzo></canvas>
        <div class="dova-firma-fila"><button type="button" class="dova-btn-secundario" data-borrar>Borrar y volver a firmar</button></div>
        <details class="dova-firma-prof"><summary>Firma del profesional (opcional)</summary><canvas class="dova-firma-lienzo dova-firma-lienzo-chico" data-lienzo-o></canvas><button type="button" class="dova-btn-link" data-borrar-o>Borrar</button></details>
        <p class="dova-error-text" data-error hidden></p>
        <div class="dova-firma-acciones"><button type="button" class="dova-btn-secundario" data-cancelar>Cancelar</button><button type="button" class="dova-btn-primary" data-firmar-ya>Firmar</button></div>
      </div>`;
    document.body.appendChild(capa);
    document.body.classList.add('dova-firmando');
    try { if (capa.requestFullscreen) capa.requestFullscreen().catch(() => {}); } catch (_e) { /* sin pantalla completa */ }
    // El lienzo toma el ancho real de la pantalla (nítido en tablets de alta densidad).
    const ajustar = (cv, alto) => { const r = cv.getBoundingClientRect(); const d = window.devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(alto * d); cv.style.height = `${alto}px`; };
    const cvp = capa.querySelector('[data-lienzo]'); const cvo = capa.querySelector('[data-lienzo-o]');
    ajustar(cvp, 200); const fp = lienzoFirma(cvp);
    let fo = null;
    capa.querySelector('.dova-firma-prof').addEventListener('toggle', (e) => { if (e.target.open && !fo) { ajustar(cvo, 130); fo = lienzoFirma(cvo); } });
    const resp = capa.querySelector('.dova-firma-resp');
    capa.querySelectorAll('[name=rel]').forEach((r) => r.addEventListener('change', () => { resp.hidden = capa.querySelector('[name=rel]:checked').value !== 'responsable'; }));
    capa.querySelector('[data-borrar]').addEventListener('click', () => fp.limpiar());
    capa.querySelector('[data-borrar-o]').addEventListener('click', () => fo && fo.limpiar());
    const salir = () => { try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_e) { /* */ } capa.remove(); document.body.classList.remove('dova-firmando'); };
    capa.querySelector('[data-cancelar]').addEventListener('click', salir);
    const err = capa.querySelector('[data-error]');
    cvp.addEventListener('pointerdown', () => { err.hidden = true; });
    capa.querySelector('[data-firmar-ya]').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; err.hidden = true;
      const rel = capa.querySelector('[name=rel]:checked').value;
      const mal = (m) => { err.textContent = m; err.hidden = false; };
      if (!capa.querySelector('[name=acepto]').checked) return mal('Marcá "Leí el texto y acepto" antes de firmar.');
      if (rel === 'responsable' && (!capa.querySelector('[name=fnombre]').value.trim() || !capa.querySelector('[name=fdoc]').value.trim())) return mal('Escribí el nombre y la C.I. del responsable.');
      if (fp.vacio()) return mal('Falta la firma.');
      b.disabled = true;
      try {
        await DOVA.post(`/clinico/consentimientos/${k.id}/firmar`, {
          firmaPaciente: fp.datos(), firmaOdontologo: fo && !fo.vacio() ? fo.datos() : undefined, acepta: true, firmanteRelacion: rel,
          firmanteNombre: rel === 'responsable' ? capa.querySelector('[name=fnombre]').value.trim() : undefined,
          firmanteDocumento: rel === 'responsable' ? capa.querySelector('[name=fdoc]').value.trim() : undefined,
        });
        capa.querySelector('.dova-firma-caja').innerHTML = `<div class="dova-firma-gracias"><h2>¡Gracias!</h2><p>El consentimiento quedó firmado.</p><p class="dova-nota">Devolvé la tablet a la recepción.</p><button type="button" class="dova-btn-primary" data-listo>Listo</button></div>`;
        capa.querySelector('[data-listo]').addEventListener('click', () => { salir(); alTerminar(); });
      } catch (e) { b.disabled = false; mal(e.message); }
    });
  }

  async function consentimientos(c, pid) {
    const lista = await DOVA.get(`/clinico/consentimientos/paciente/${pid}`);
    const maneja = puede('consentimientos.manage');
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Consentimientos informados</h3>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo consentimiento</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Procedimiento</th><th>Odontólogo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((k, i) => `<tr><td>${fmtFecha(k.fecha || k.creado_en)}</td><td>${esc(k.procedimiento)}</td><td>${esc(k.odontologo_nombre || '-')}</td>
        <td>${k.estado === 'firmado' ? `${badge('Firmado', 'ok')}${k.firmado_en ? `<br><span class="dova-nota">${esc(X.fmtFechaHora(k.firmado_en))}${k.firmante_relacion === 'responsable' ? ` · por ${esc(k.firmante_nombre || '')}` : ''}</span>` : ''}${k.verificado === false ? `<br>${badge('No coincide con su huella', 'critica')}` : ''}` : k.estado === 'anulado' ? badge('Anulado', 'critica') : badge('Pendiente de firma', 'atencion')}</td>
        <td class="dova-ext-acciones">${maneja && k.estado === 'pendiente' ? `<button class="dova-btn-link" data-firmar="${i}">Firmar en tablet</button>` : ''}${maneja && k.estado !== 'anulado' ? `<button class="dova-btn-link dova-ext-peligro" data-anular="${k.id}" data-firmado="${k.estado === 'firmado' ? 1 : ''}">Anular</button>` : ''}<button class="dova-btn-link" data-pdf="${k.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="5">Sin consentimientos.</td></tr>'}
      </tbody></table></div>`;
    const recargar = () => consentimientos(c, pid);
    c.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/consentimiento/${b.dataset.pdf}`, `consentimiento-${b.dataset.pdf}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.firmado) {
        X.modalForm('Anular consentimiento firmado', [{ k: 'motivo', label: 'Motivo (queda registrado)', tipo: 'textarea', req: true, ancho: 'completo', max: 500 }], {}, async (d) => {
          await DOVA.post(`/clinico/consentimientos/${b.dataset.anular}/anular`, { motivo: d.motivo }); toast('Anulado', 'ok'); recargar();
        });
        return;
      }
      if (!(await confirmar('¿Anular el consentimiento?', 'Queda registrado como anulado.', 'Anular'))) return;
      try { await DOVA.post(`/clinico/consentimientos/${b.dataset.anular}/anular`, {}); toast('Anulado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', async () => {
      const plantillas = await DOVA.get('/clinico/consentimientos/plantillas').catch(() => []);
      const form = X.modalForm('Nuevo consentimiento', [
        { k: 'plantilla', label: 'Plantilla', tipo: 'select', opciones: plantillas.map((p) => [p.codigo, etiqueta(p.codigo)]) },
        { k: 'procedimiento', label: 'Procedimiento', req: true, ancho: 'completo', max: 200 },
        { k: 'texto', label: 'Texto (podés ajustarlo)', tipo: 'textarea', filas: 5 },
      ], {}, async (d) => {
        const odo = (DOVA.usuarioActual() || {}).odontologoId;
        await DOVA.post('/clinico/consentimientos', { ...d, pacienteId: pid, odontologoId: odo || undefined });
        toast('Consentimiento creado: falta la firma', 'ok'); recargar();
      }, { ancho: 'ancho' });
      form.plantilla.addEventListener('change', () => { const p = plantillas.find((x) => x.codigo === form.plantilla.value); if (p) { form.texto.value = p.texto; if (!form.procedimiento.value) form.procedimiento.value = etiqueta(p.codigo); } });
    });
    c.querySelectorAll('[data-firmar]').forEach((b) => b.addEventListener('click', async () => {
      const k = lista[Number(b.dataset.firmar)];
      const pac = await DOVA.get(`/pacientes/${pid}`).catch(() => ({}));
      modoFirma(k, pac, () => { toast('Consentimiento firmado', 'ok'); recargar(); });
    }));
  }

  // Agrega a la ficha: subpestañas de cobros/presupuestos/planes en "Cuenta",
  // turnos en "Agenda" y consentimientos en "Documentación".
  /* Presupuesto desde el odontograma: se tocan las piezas, se elige el
     tratamiento de cada una (con una sugerencia según el hallazgo) y se arma
     el presupuesto con los precios del catálogo. */
  const SUGERENCIA = {
    caries: /resina|composite|restaur|obtura/i, fractura: /corona|restaur|resina/i, extraccion_indicada: /extracci/i,
    endodoncia: /endodon|conducto/i, ausente: /implante|pr[oó]tesis|puente/i,
  };
  const CON_HALLAZGO = ['caries', 'fractura', 'extraccion_indicada'];
  function presupuestoDesdeOdontograma(pid) {
    const panel = document.querySelector('.dova-tab-panel[data-panel="odontograma"]');
    const grid = panel && panel.querySelector('.dova-odontograma-grid');
    if (!grid) return;
    const elegidas = new Map(); // pieza -> { tratamientoId, precio }
    let trats = []; let activo = false;
    const barra = document.createElement('div');
    barra.className = 'dova-odo-pres';
    barra.innerHTML = '<button type="button" class="dova-btn-secundario" data-modo-pres>Armar presupuesto desde el odontograma</button>';
    grid.before(barra);
    const lista = document.createElement('div'); lista.className = 'dova-odo-pres-lista'; lista.hidden = true;
    grid.after(lista);
    const estadoDe = (b) => ((b.className.match(/pieza-([a-z_]+)/) || [])[1] || 'sano');
    const sugerir = (estado) => { const re = SUGERENCIA[estado]; const t = re && trats.find((x) => re.test(x.nombre)); return t || null; };
    const pintarLista = () => {
      grid.querySelectorAll('[data-ver-pieza]').forEach((b) => b.classList.toggle('dova-pieza-elegida', elegidas.has(b.dataset.verPieza)));
      const filas = [...elegidas.entries()];
      lista.innerHTML = `<p class="dova-nota">${filas.length ? 'Elegí el tratamiento de cada pieza (con el precio del catálogo).' : 'Tocá las piezas que van en el presupuesto.'}</p>
        ${filas.length ? `<table class="dova-tabla"><thead><tr><th>Pieza</th><th>Tratamiento</th><th>Precio</th><th></th></tr></thead><tbody>
        ${filas.map(([p, x]) => `<tr data-fila-pieza="${esc(p)}"><td><strong>${esc(p)}</strong> <span class="dova-nota">${esc(etiqueta(x.estado))}</span></td>
          <td><select data-trat-pieza aria-label="Tratamiento de la pieza ${esc(p)}"><option value="">— Elegí —</option>${trats.map((t) => `<option value="${t.id}" ${x.tratamientoId === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></td>
          <td>${fmtGs((trats.find((t) => t.id === x.tratamientoId) || {}).precio || 0)}</td>
          <td><button type="button" class="dova-btn-link dova-ext-peligro" data-sacar-pieza>Sacar</button></td></tr>`).join('')}</tbody></table>` : ''}
        <div class="dova-modal-actions" style="justify-content:flex-start">
          <button type="button" class="dova-btn-link" data-marcar-hallazgos>Marcar las piezas con hallazgos</button>
          <button type="button" class="dova-btn-secundario" data-salir-pres>Cancelar</button>
          <button type="button" class="dova-btn-primary" data-crear-pres ${filas.length ? '' : 'disabled'}>Crear presupuesto (${filas.length})</button></div>`;
      lista.querySelectorAll('[data-trat-pieza]').forEach((sel) => sel.addEventListener('change', () => { elegidas.get(sel.closest('tr').dataset.filaPieza).tratamientoId = sel.value ? Number(sel.value) : null; pintarLista(); }));
      lista.querySelectorAll('[data-sacar-pieza]').forEach((b) => b.addEventListener('click', () => { elegidas.delete(b.closest('tr').dataset.filaPieza); pintarLista(); }));
      lista.querySelector('[data-marcar-hallazgos]').addEventListener('click', () => {
        grid.querySelectorAll('[data-ver-pieza]').forEach((b) => { const e = estadoDe(b); if (CON_HALLAZGO.includes(e) && !elegidas.has(b.dataset.verPieza)) elegidas.set(b.dataset.verPieza, { estado: e, tratamientoId: (sugerir(e) || {}).id || null }); });
        pintarLista();
      });
      lista.querySelector('[data-salir-pres]').addEventListener('click', salir);
      lista.querySelector('[data-crear-pres]').addEventListener('click', () => {
        const items = filas.map(([p, x]) => {
          const t = trats.find((y) => y.id === x.tratamientoId);
          return { tratamientoId: t ? t.id : undefined, descripcion: t ? t.nombre : `Pieza ${p}`, pieza: p, precioUnitario: t ? Math.round(Number(t.precio) || 0) : 0 };
        });
        if (items.some((i) => !i.tratamientoId)) { toast('Elegí el tratamiento de cada pieza (o sacala de la lista)', 'error'); return; }
        modalPresupuesto(pid, () => { salir(); toast('Presupuesto creado: está en Pagos y presupuestos', 'ok'); }, { items });
      });
    };
    const salir = () => { activo = false; elegidas.clear(); lista.hidden = true; panel.classList.remove('dova-odo-modo-pres'); grid.querySelectorAll('.dova-pieza-elegida').forEach((b) => b.classList.remove('dova-pieza-elegida')); barra.querySelector('[data-modo-pres]').hidden = false; };
    barra.querySelector('[data-modo-pres]').addEventListener('click', async () => {
      try { trats = (await X.catalogo('tratamientos', '/tratamientos')).filter((t) => t.activo !== false); } catch (e) { toast(e.message, 'error'); return; }
      activo = true; lista.hidden = false; panel.classList.add('dova-odo-modo-pres'); barra.querySelector('[data-modo-pres]').hidden = true;
      const ex = document.getElementById('pieza-expediente-root'); if (ex) ex.innerHTML = '';
      pintarLista();
    });
    // En modo presupuesto, tocar una pieza la suma o la saca (no abre el expediente).
    grid.addEventListener('click', (e) => {
      if (!activo) return;
      const b = e.target.closest('[data-ver-pieza]'); if (!b) return;
      e.stopPropagation(); e.preventDefault();
      const p = b.dataset.verPieza;
      if (elegidas.has(p)) elegidas.delete(p); else { const est = estadoDe(b); elegidas.set(p, { estado: est, tratamientoId: (sugerir(est) || {}).id || null }); }
      pintarLista();
    }, true);
  }

  function extenderFicha(pacienteId, navegar) {
    const pid = Number(pacienteId);
    navegarFicha = navegar;
    const reemplazarPanel = (id, visible, render) => {
      const panel = document.querySelector(`.dova-tab-panel[data-panel="${id}"]`);
      const tab = document.querySelector(`#ficha-tabs [data-tab="${id}"]`);
      if (!panel || !tab || !visible) return;
      let cargado = false;
      const cargar = () => { if (cargado) return; cargado = true; panel.innerHTML = cargando; Promise.resolve(render(panel)).catch((e) => { panel.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; cargado = false; }); };
      tab.addEventListener('click', cargar);
    };
    if (puede('presupuestos.manage')) presupuestoDesdeOdontograma(pid);
    reemplazarPanel('agenda', puede('agenda.view'), (p) => turnosPaciente(p, pid, navegar));
    reemplazarPanel('documentacion', puede('consentimientos.manage', 'pacientes.clinical.view'), (p) => {
      p.innerHTML = '<div data-consent></div><p class="dova-nota" style="margin-top:16px">Fotos, estudios y recetas están en la línea de tiempo (pestaña Historial clínico) y se cargan desde el Modo Consulta.</p>';
      return consentimientos(p.querySelector('[data-consent]'), pid);
    });
    // Panel "Administrativo" (presupuestos) → versión con acciones.
    reemplazarPanel('administrativo', puede('presupuestos.view', 'pagos.view', 'facturacion.ver', 'facturacion.ver_propias'), (p) => {
      X.subPestanas(p, [
        { id: 'cobros', texto: 'Cobros', visible: puede('pagos.view', 'pagos.create'), render: (c) => cobros(c, pid) },
        { id: 'pres', texto: 'Presupuestos', visible: puede('presupuestos.view'), render: (c) => presupuestos(c, pid) },
        { id: 'planes', texto: 'Planes de pago', visible: puede('planes_pago.manage', 'pagos.view'), render: (c) => planesDePago(c, pid) },
        { id: 'facturas', texto: 'Facturas', visible: puede('facturacion.ver', 'facturacion.ver_propias'), render: (c) => DovaFacturacion.panelPaciente(c, pid, navegar) },
      ]);
    });
  }

  return { extenderFicha, modalCobro, presupuestos, cobros, modalPresupuesto };
})();
window.DovaFichaOperativa = DovaFichaOperativa;
