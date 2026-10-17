/* DOVA — Seguimiento (Movimientos → Seguimiento).
   Pacientes para contactar, controles periódicos y post-tratamiento, piezas en observación,
   tratamientos sin turno, presupuestos sin respuesta, recordatorios de turnos, reactivación,
   cumpleaños, tareas, biopsias y llamadas/mensajes. Uso: DovaSeguimiento.seguimiento(contenedor, navegar, pestañaInicial). */
const DovaSeguimiento = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, etiqueta, badge, badgeFecha } = X;
  const { linkPac, kpi, montar } = DovaSeccionBase;
  const OPC = (lista) => lista.map((valor) => [valor, etiqueta(valor)]);

  // ================================ SEGUIMIENTO ================================
  async function seguimiento(root, nav, subInicial) {
    montar(root, nav);
    const p = await DOVA.get('/seguimiento/panel');
    root.innerHTML = `<h2 class="dova-view-title">Seguimiento de pacientes</h2>
      <p class="dova-subtitulo">Todo lo que hay que hacer para que ningún paciente se pierda: controles vencidos, tratamientos sin turno, pacientes para reactivar y recordatorios.</p>
      <div class="dova-ext-kpis">
        ${kpi(p.recallsVencidos, 'Controles periódicos atrasados', { alerta: p.recallsVencidos > 0, ir: 'recalls', sub: `${p.recallsProximos} en los próximos 30 días` })}
        ${kpi(p.controlesVencidos, 'Controles vencidos', { alerta: p.controlesVencidos > 0, ir: 'controles', sub: `${p.controlesSemana} esta semana` })}
        ${kpi(p.observacionesVencidas, 'Piezas para reevaluar', { alerta: p.observacionesVencidas > 0, ir: 'observacion' })}
        ${kpi(p.tratamientosSinTurno, 'Tratamientos sin turno', { alerta: p.tratamientosSinTurno > 0, ir: 'sinturno' })}
        ${kpi(p.turnosSinConfirmar, 'Turnos sin confirmar (hoy y mañana)', { alerta: p.turnosSinConfirmar > 0, ir: 'recordatorios', sub: `${p.turnosManana} turnos mañana` })}
        ${kpi(p.pacientesParaReactivar, 'Pacientes sin venir hace 1 año', { ir: 'reactivacion' })}
        ${kpi(p.cumpleanosHoy, 'Cumpleaños hoy', { ir: 'cumpleanos' })}
        ${kpi(p.biopsiasPendientes, 'Biopsias sin resultado', { alerta: p.biopsiasPendientes > 0, ir: 'biopsias' })}
        ${kpi(p.laboratorioAtrasado, 'Trabajos de laboratorio atrasados', { alerta: p.laboratorioAtrasado > 0 })}
        ${kpi(p.tareasPendientes, 'Tareas pendientes', { ir: 'tareas' })}
        ${p.nps ? kpi(p.nps.puntaje, 'Satisfacción de pacientes (últimos 6 meses)', { sub: `${p.nps.encuestas} encuestas` }) : ''}
      </div>
      <div data-subs></div>`;
    const subs = root.querySelector('[data-subs]');
    const pest = [
      { id: 'bandeja', texto: 'Para contactar', render: subBandeja },
      { id: 'recalls', texto: 'Controles periódicos', visible: puede('recalls.view', 'recalls.manage'), render: subRecalls },
      { id: 'controles', texto: 'Controles después de un tratamiento', render: subControles },
      { id: 'observacion', texto: 'Piezas en observación', render: subObservacion },
      { id: 'sinturno', texto: 'Tratamientos sin turno', visible: puede('planes_tratamiento.view', 'seguimiento.view'), render: subSinTurno },
      { id: 'presupuestos', texto: 'Presupuestos sin respuesta', visible: puede('presupuestos.view'), render: subPresupuestos },
      { id: 'recordatorios', texto: 'Recordatorios de turnos', visible: puede('agenda.view', 'recordatorios.propios'), render: subRecordatorios },
      { id: 'reactivacion', texto: 'Pacientes que no volvieron', render: subReactivacion },
      { id: 'cumpleanos', texto: 'Cumpleaños', render: subCumpleanos },
      { id: 'tareas', texto: 'Tareas', visible: puede('tareas.manage'), render: subTareas },
      { id: 'biopsias', texto: 'Biopsias', visible: puede('especialidades.edit', 'pacientes.clinical.view'), render: subBiopsiasPend },
      { id: 'comunicaciones', texto: 'Llamadas y mensajes', render: subComunicaciones },
    ];
    X.subPestanas(subs, pest, { inicial: subInicial });
    root.querySelectorAll('[data-ir-sub]').forEach((b) => b.addEventListener('click', () => {
      const t = subs.querySelector(`[data-subtab="${b.dataset.irSub}"]`); if (t) { t.click(); t.scrollIntoView({ behavior: 'smooth' }); }
    }));
  }

  // ------------------------- BANDEJA DE SEGUIMIENTO -------------------------
  const EST_CASO = { pendiente: ['Pendiente', 'atencion'], en_curso: ['En gestión', 'info'], resuelto: ['Resuelto', 'ok'], descartado: ['Descartado', 'critica'] };
  const RES_CASO = [['contactado', 'Contactado'], ['no_contesta', 'No contesta'], ['mensaje_dejado', 'Mensaje dejado'], ['agendado', 'Agendó turno'], ['volvera_a_llamar', 'Volverá a llamar'], ['pago', 'Pagó / acordó pago'], ['rechaza', 'No le interesa'], ['numero_erroneo', 'Número equivocado'], ['otro', 'Otro']];
  async function subBandeja(c, estado = {}) {
    const st = { vista: 'hoy', tipo: '', meses: 12, pagina: 1, ...estado };
    const maneja = puede('seguimiento.manage', 'recalls.manage');
    c.innerHTML = X.cargando;
    const q = new URLSearchParams({ vista: st.vista, meses: st.meses, pagina: st.pagina, ...(st.tipo ? { tipo: st.tipo } : {}) }).toString();
    const [d, resp] = await Promise.all([DOVA.get(`/seguimiento/bandeja?${q}`), DOVA.get('/seguimiento/responsables').catch(() => [])]);
    const filas = d.filas;
    const chips = Object.entries(d.tipos).filter(([k]) => d.resumen[k] || st.tipo === k)
      .map(([k, t]) => `<button type="button" class="dova-ext-chip ${st.tipo === k ? 'activo' : ''}" data-tipo="${k}">${esc(t)} <strong>${d.resumen[k] || 0}</strong></button>`).join('');
    const cols = [
      { t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido), csv: (r) => `${r.paciente_nombre} ${r.paciente_apellido}` },
      { t: 'Motivo', v: (r) => `${badge(r.tipo_nombre, r.tipo === 'saldo_pendiente' || r.tipo === 'tratamiento_atrasado' ? 'critica' : 'info')}<br><span class="dova-nota">${esc(r.detalle || '')}</span>${r.yaNoDetectado ? '<br><span class="dova-nota">(ya no se detecta: podés cerrarlo)</span>' : ''}`, csv: (r) => `${r.tipo_nombre}: ${r.detalle || ''}` },
      { t: 'Desde', v: (r) => (r.fecha ? fmtFecha(r.fecha) : '-'), csv: (r) => (r.fecha ? String(r.fecha).slice(0, 10) : '') },
      { t: 'Monto', v: (r) => (r.monto ? fmtGs(r.monto) : '-'), csv: (r) => r.monto || '' },
      { t: 'Gestión', v: (r) => (r.caso ? `${badge(EST_CASO[r.caso.estado][0], EST_CASO[r.caso.estado][1])}${r.caso.responsable_nombre ? ` <span class="dova-nota">${esc(r.caso.responsable_nombre)}</span>` : ''}${r.caso.proximo_contacto ? `<br>Próximo contacto: ${badgeFecha(r.caso.proximo_contacto)}` : ''}${r.caso.intentos ? `<br><span class="dova-nota">${r.caso.intentos} contacto(s) · ${esc(etiqueta(r.caso.ultimo_resultado || ''))}</span>` : ''}` : '<span class="dova-nota">Sin gestionar</span>'),
        csv: (r) => (r.caso ? `${EST_CASO[r.caso.estado][0]}${r.caso.proximo_contacto ? ` (${String(r.caso.proximo_contacto).slice(0, 10)})` : ''}` : 'Sin gestionar') },
      { t: 'Teléfono', v: (r) => esc(r.telefono || '-'), csv: (r) => r.telefono || '' },
    ];
    c.innerHTML = `<form class="dova-ext-filtros" data-f>
        <div><label>Mostrar</label><select name="vista"><option value="hoy">Para contactar hoy</option><option value="todos">Todos los casos</option><option value="mios">Asignados a mí</option></select></div>
        <div><label>"No volvió" después de</label><select name="meses">${[6, 9, 12, 18, 24].map((m) => `<option value="${m}">${m} meses</option>`).join('')}</select></div>
        <button class="dova-btn-secundario">Actualizar</button>
        <button type="button" class="dova-btn-link" data-csv>Descargar lista (Excel)</button>
        ${maneja ? '<button type="button" class="dova-btn-primary" data-nuevo>+ Nuevo seguimiento</button>' : ''}</form>
      <p class="dova-nota">Se calcula en el momento con los datos de la clínica. Al resolver o descartar un caso deja de aparecer (los resueltos vuelven a evaluarse a los 30 días).</p>
      <div class="dova-ext-chips">${st.tipo ? '<button type="button" class="dova-ext-chip" data-tipo="">Todos</button>' : ''}${chips}</div>
      <p class="dova-nota">${d.total} caso(s)${d.paginas > 1 ? ` · página ${d.pagina} de ${d.paginas}` : ''}.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr>${cols.map((x) => `<th>${x.t}</th>`).join('')}<th></th></tr></thead><tbody>
      ${filas.map((r, i) => `<tr class="${r.caso && r.caso.proximo_contacto && String(r.caso.proximo_contacto).slice(0, 10) < X.hoy() ? 'dova-ext-fila-aviso' : ''}">${cols.map((x) => `<td>${x.v(r)}</td>`).join('')}
        <td class="dova-ext-acciones">${X.linkWhatsapp(r.whatsapp_link)}${maneja ? `<button class="dova-btn-link" data-gestionar="${i}">Gestionar</button>` : ''}${r.caso ? `<button class="dova-btn-link" data-historial="${r.caso.id}">Historial</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}">No hay pacientes para contactar con estos filtros.</td></tr>`}
      </tbody></table></div>
      ${d.paginas > 1 ? `<div class="dova-ext-paginas"><button type="button" class="dova-btn-secundario" data-pag="${d.pagina - 1}" ${d.pagina <= 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${d.pagina} de ${d.paginas}</span><button type="button" class="dova-btn-secundario" data-pag="${d.pagina + 1}" ${d.pagina >= d.paginas ? 'disabled' : ''}>Siguiente →</button></div>` : ''}`;
    const f = c.querySelector('[data-f]'); f.vista.value = st.vista; f.meses.value = String(st.meses);
    const recargar = (cambios = {}) => subBandeja(c, { ...st, vista: f.vista.value, meses: Number(f.meses.value), ...cambios });
    f.addEventListener('submit', (e) => { e.preventDefault(); recargar({ pagina: 1 }); });
    c.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => recargar({ tipo: b.dataset.tipo, pagina: 1 })));
    c.querySelectorAll('[data-pag]').forEach((b) => b.addEventListener('click', () => { recargar({ pagina: Number(b.dataset.pag) }); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    c.querySelector('[data-csv]').addEventListener('click', async () => {
      try { const todo = await DOVA.get(`/seguimiento/bandeja?${new URLSearchParams({ vista: st.vista, meses: st.meses, porPagina: 500, ...(st.tipo ? { tipo: st.tipo } : {}) })}`); X.descargarCsv(`seguimiento-${X.hoy()}.csv`, todo.filas, cols); } catch (e) { X.toast(e.message, 'error'); }
    });
    const opResp = resp.map((u) => [u.id, u.nombre]);
    c.querySelectorAll('[data-gestionar]').forEach((b) => b.addEventListener('click', () => {
      const r = filas[Number(b.dataset.gestionar)];
      const k = r.caso || {};
      X.modalForm(`Seguimiento — ${r.paciente_nombre} ${r.paciente_apellido}`, [
        { k: 'resultado', label: 'Resultado del contacto', tipo: 'select', opciones: RES_CASO },
        { k: 'canal', label: 'Canal', tipo: 'select', req: true, opciones: [['llamada', 'Llamada'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'Email'], ['presencial', 'En persona']] },
        { k: 'nota', label: 'Nota', tipo: 'textarea', ancho: 'completo' },
        { k: 'proximoContacto', label: 'Próximo contacto', tipo: 'fecha' },
        { k: 'responsableId', label: 'Responsable', tipo: 'select', opciones: opResp },
        { k: 'estado', label: 'Estado', tipo: 'select', req: true, opciones: [['pendiente', 'Pendiente'], ['en_curso', 'En gestión'], ['resuelto', 'Resuelto'], ['descartado', 'Descartado (escribí el motivo en la nota)']] },
      ], { canal: 'llamada', estado: k.estado === 'pendiente' || !k.estado ? 'en_curso' : k.estado, responsableId: k.responsable_id || (DOVA.usuarioActual() || {}).id, proximoContacto: k.proximo_contacto ? String(k.proximo_contacto).slice(0, 10) : '' }, async (v) => {
        let caso = r.caso;
        if (!caso) caso = await DOVA.post('/seguimiento/casos', { pacienteId: r.paciente_id, tipo: r.tipo, referenciaTipo: r.referencia_tipo, referenciaId: r.referencia_id, motivo: `${r.tipo_nombre}: ${r.detalle || ''}` });
        await DOVA.post(`/seguimiento/casos/${caso.id}/gestion`, { ...v, responsableId: v.responsableId ? Number(v.responsableId) : null, proximoContacto: v.proximoContacto || null });
        X.toast('Seguimiento registrado', 'ok'); recargar();
      }, { extraHtml: `<p class="dova-nota"><strong>${esc(r.tipo_nombre)}</strong>: ${esc(r.detalle || '')}</p>` });
    }));
    c.querySelectorAll('[data-historial]').forEach((b) => b.addEventListener('click', async () => {
      const k = await DOVA.get(`/seguimiento/casos/${b.dataset.historial}`);
      X.modal(`Historial — ${k.paciente_nombre} ${k.paciente_apellido}`, `<p>${badge(k.tipo_nombre, 'info')} ${esc(k.motivo || '')}</p>
        <p class="dova-nota">Abierto el ${X.fmtFechaHora(k.creado_en)}${k.responsable_nombre ? ` · responsable: ${esc(k.responsable_nombre)}` : ''}</p>
        <ul class="dova-cli-lista">${k.historial.map((x) => `<li><strong>${X.fmtFechaHora(x.fecha)}</strong> · ${esc(etiqueta(x.canal))}${x.resultado ? ` · ${esc(etiqueta(x.resultado))}` : ''} · ${esc(x.usuario_nombre || '')}${x.contenido ? `<br>${esc(x.contenido)}` : ''}</li>`).join('') || '<li class="dova-vacio">Sin gestiones todavía.</li>'}</ul>
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`);
    }));
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => {
      X.modal('Nuevo seguimiento', `<form data-fn class="dova-ext-form-grid">${DovaTurnos.campoPacienteHtml()}
        <div class="dova-ext-campo dova-ext-campo-completo"><label>Motivo *</label><textarea name="motivo" rows="2" maxlength="2000" required placeholder="Ej.: avisar que llegó el resultado del estudio"></textarea></div>
        <div class="dova-ext-campo"><label>Próximo contacto</label><input type="date" name="proximoContacto" value="${X.hoy()}"/></div>
        <div class="dova-ext-campo"><label>Responsable</label><select name="responsableId"><option value="">—</option>${opResp.map(([i, n]) => `<option value="${i}" ${i === (DOVA.usuarioActual() || {}).id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <p class="dova-error-text dova-ext-campo-completo" data-error hidden></p>
        <div class="dova-modal-actions dova-ext-campo-completo"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Crear</button></div></form>`);
      const fn = document.querySelector('.dova-modal-box [data-fn]');
      DovaTurnos.activarBuscadorPaciente(fn);
      fn.addEventListener('submit', async (e) => {
        e.preventDefault(); const err = fn.querySelector('[data-error]'); err.hidden = true;
        try {
          if (!fn.pacienteId.value) throw new Error('Elegí el paciente');
          await DOVA.post('/seguimiento/casos', { pacienteId: Number(fn.pacienteId.value), tipo: 'manual', motivo: fn.motivo.value, proximoContacto: fn.proximoContacto.value || null, responsableId: fn.responsableId.value ? Number(fn.responsableId.value) : null });
          X.cerrarModal(); X.toast('Seguimiento creado', 'ok'); recargar({ vista: 'todos' });
        } catch (er) { err.textContent = er.message; err.hidden = false; }
      });
    });
    X.vivo(c, ['seguimiento_casos', 'turnos', 'pagos', 'presupuestos'], () => { if (!document.querySelector('.dova-modal-box')) recargar(); });
  }

  async function subRecalls(c) {
    const tipos = await X.catalogo('recallTipos', '/recalls/tipos').catch(() => []);
    const ods = await X.opcionesOdontologos();
    c.innerHTML = `<form class="dova-ext-filtros" data-f>
      <div><label>Vista</label><select name="vista"><option value="vencidos">Vencidos</option><option value="proximos">Próximos</option><option value="sin_turno">Vencidos o próximos sin turno</option><option value="todos">Todos los activos</option></select></div>
      <div><label>Próximos días</label><input type="number" name="dias" value="30" min="1" max="365"/></div>
      <div><label>Tipo</label><select name="tipoId"><option value="">Todos</option>${tipos.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div>
      <div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${ods.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>
      <button class="dova-btn-secundario">Filtrar</button><button type="button" class="dova-btn-link" data-csv>Descargar lista (Excel)</button></form><div data-l></div>`;
    const f = c.querySelector('[data-f]'); const l = c.querySelector('[data-l]');
    let filas = [];
    const cols = [
      { t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido), csv: (r) => `${r.paciente_nombre} ${r.paciente_apellido}` },
      { t: 'Control', v: (r) => esc(r.tipo_nombre), csv: (r) => r.tipo_nombre },
      { t: 'Debía volver', v: (r) => `${badgeFecha(r.proxima_fecha)}${r.dias_vencido > 0 ? `<br><span class="dova-nota">hace ${r.dias_vencido} días</span>` : ''}`, csv: (r) => r.proxima_fecha },
      { t: 'Turno', v: (r) => (r.proximo_turno ? badge(`Tiene turno ${fmtFecha(r.proximo_turno)}`, 'ok') : badge('Sin turno', 'atencion')), csv: (r) => r.proximo_turno || '' },
      { t: 'Contactos', v: (r) => `${r.intentos_contacto}${r.ultimo_contacto_resultado ? ` · ${esc(etiqueta(r.ultimo_contacto_resultado))}` : ''}`, csv: (r) => r.intentos_contacto },
      { t: 'Teléfono', v: (r) => esc(r.paciente_whatsapp || r.paciente_telefono || '-'), csv: (r) => r.paciente_whatsapp || r.paciente_telefono || '' },
    ];
    const cargar = async () => {
      l.innerHTML = X.cargando;
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v !== ''))).toString();
      filas = await DOVA.get(`/recalls/lista?${q}`);
      l.innerHTML = `<p class="dova-nota">${filas.length} paciente(s).</p><div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr>${cols.map((x) => `<th>${x.t}</th>`).join('')}<th></th></tr></thead><tbody>
        ${filas.map((r, i) => `<tr>${cols.map((x) => `<td>${x.v(r)}</td>`).join('')}<td class="dova-ext-acciones">${r.whatsapp_link && puede('recalls.manage', 'seguimiento.manage') ? `<button class="dova-btn-link dova-link-wa" data-enlace-control="${r.id}" title="Le llega un enlace para elegir día y hora, con los horarios libres reales">Mandar enlace para reservar</button>` : X.linkWhatsapp(r.whatsapp_link)}${puede('recalls.manage') ? `<button class="dova-btn-link" data-contacto="${i}">Registrar contacto</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Nada pendiente con estos filtros.</td></tr>'}
      </tbody></table></div>`;
      l.querySelectorAll('[data-contacto]').forEach((b) => b.addEventListener('click', () => DovaFicha.modalContactoRecall(filas[Number(b.dataset.contacto)], cargar)));
      l.querySelectorAll('[data-enlace-control]').forEach((b) => b.addEventListener('click', async () => {
        const w = window.open('', '_blank'); // antes del pedido: si no, el navegador la bloquea
        try { const r = await DOVA.post(`/mensajes/controles/${b.dataset.enlaceControl}/enlace`); if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url; X.toast('Mensaje armado con el enlace para reservar', 'ok'); } catch (e) { if (w) w.close(); X.toast(e.message, 'error'); }
      }));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    c.querySelector('[data-csv]').addEventListener('click', () => X.descargarCsv(`controles-periodicos-${X.hoy()}.csv`, filas, cols));
    await cargar();
    if (window.DovaAvisos) DovaAvisos.bannerArchivo(c, 'recalls', cargar);
  }

  function subControles(c) {
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Hasta</label><input type="date" name="hasta" value="${X.sumarDias(X.hoy(), 30)}"/></div>
      <div><label>Origen</label><select name="origenTipo"><option value="">Todos</option>${['endodoncia', 'implante', 'ortodoncia', 'biopsia', 'periodoncia', 'protesis', 'cirugia', 'preventivo', 'observacion', 'otro'].map((o) => `<option value="${o}">${etiqueta(o)}</option>`).join('')}</select></div>
      <button class="dova-btn-secundario">Filtrar</button></form><div data-l></div>`;
    const f = c.querySelector('[data-f]');
    const cargar = () => X.tablaCrud({
      root: c.querySelector('[data-l]'), endpoint: '/especialidades/controles', query: `estado=pendiente&hasta=${f.hasta.value}${f.origenTipo.value ? `&origenTipo=${f.origenTipo.value}` : ''}`,
      puedeEditar: puede('seguimiento.manage', 'especialidades.edit'),
      claseFila: (r) => (r.fecha_programada < X.hoy() ? 'dova-ext-fila-alerta' : ''),
      columnas: [{ t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) }, { t: 'Control', v: (r) => esc(r.titulo) }, { t: 'Fecha', v: (r) => badgeFecha(r.fecha_programada) }, { t: 'Odontólogo', v: (r) => esc(r.odontologo_nombre || '-') }, { t: 'Teléfono', v: (r) => esc(r.paciente_whatsapp || r.paciente_telefono || '-') }],
      campos: [{ k: 'fechaProgramada', label: 'Fecha', tipo: 'fecha' }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['pendiente', 'realizado', 'no_asistio', 'cancelado']) }, { k: 'resultado', label: 'Resultado', tipo: 'select', opciones: OPC(['sanado', 'en_curacion', 'no_sanado', 'incierto', 'sano', 'mucositis', 'periimplantitis', 'estable', 'progreso', 'recidiva', 'retencion_completa', 'retencion_parcial', 'perdido', 'requiere_tratamiento', 'normal']) }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      vacio: 'No hay controles pendientes hasta esa fecha.',
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    if (window.DovaAvisos) DovaAvisos.bannerArchivo(c, 'controles', cargar);
    return cargar();
  }

  function subObservacion(c) {
    return X.tablaCrud({
      root: c, endpoint: '/especialidades/observaciones', query: 'estado=en_observacion', puedeEditar: puede('especialidades.edit', 'pacientes.clinical.edit', 'odontograma.edit'),
      claseFila: (r) => (r.fecha_reevaluacion && r.fecha_reevaluacion <= X.hoy() ? 'dova-ext-fila-aviso' : ''),
      columnas: [{ t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) }, { t: 'Pieza', v: (r) => `<strong>${esc(r.pieza)}</strong> ${esc(r.superficie || '')}` }, { t: 'Hallazgo', v: (r) => esc(r.hallazgo) }, { t: 'Detectado', v: (r) => fmtFecha(r.fecha_deteccion) }, { t: 'Reevaluar', v: (r) => badgeFecha(r.fecha_reevaluacion) }],
      campos: [{ k: 'fechaReevaluacion', label: 'Reevaluar el', tipo: 'fecha' }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['en_observacion', 'estable', 'progreso', 'tratada', 'descartada']) }, { k: 'resultado', label: 'Resultado', tipo: 'textarea' }],
      vacio: 'No hay piezas en observación.',
    });
  }

  async function subSinTurno(c) {
    const filas = await DOVA.get('/seguimiento/tratamientos-sin-turno');
    c.innerHTML = `<p class="dova-nota">Planes de tratamiento pendientes, aprobados o en curso de pacientes que no tienen ningún turno reservado. Ordenados por prioridad y antigüedad.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Paciente</th><th>Tratamiento</th><th>Estado</th><th>Progreso</th><th>Sin movimiento</th><th>Valor</th><th></th></tr></thead><tbody>
      ${filas.map((r) => `<tr><td>${linkPac(r.paciente_id, r.nombre, r.apellido)}</td><td>${esc(r.plan_nombre)}${r.pieza ? ` (${esc(r.pieza)})` : ''} ${['alta', 'urgente'].includes(r.prioridad) ? badge(r.prioridad, 'critica') : ''}</td><td>${esc(etiqueta(r.estado))}</td><td>${r.sesiones_realizadas}/${r.sesiones_totales}</td><td>${r.dias_sin_movimiento} días</td><td>${fmtGs(r.precio)}</td><td>${X.linkWhatsapp(r.whatsapp_link)}</td></tr>`).join('') || '<tr><td colspan="7">Todos los tratamientos en curso tienen turno.</td></tr>'}
      </tbody></table></div>`;
  }

  async function subPresupuestos(c) {
    const filas = await DOVA.get('/seguimiento/presupuestos-sin-respuesta');
    c.innerHTML = `<p class="dova-nota">Presupuestos presentados que el paciente todavía no aceptó ni rechazó: una llamada a tiempo sube la tasa de aceptación.</p>
      <table class="dova-tabla"><thead><tr><th>Paciente</th><th>Fecha</th><th>Días</th><th>Total</th><th>Vence</th><th>Estado</th></tr></thead><tbody>
      ${filas.map((r) => `<tr><td>${linkPac(r.paciente_id, r.nombre, r.apellido)}</td><td>${fmtFecha(r.fecha)}</td><td>${r.dias}</td><td>${fmtGs(r.total)}</td><td>${badgeFecha(r.vencimiento)}</td><td>${esc(etiqueta(r.estado))}</td></tr>`).join('') || '<tr><td colspan="6">No hay presupuestos esperando respuesta.</td></tr>'}</tbody></table>`;
  }

  // Recordatorios de turnos por WhatsApp: automáticos con WhatsApp Business,
  // o desde el WhatsApp de la recepción con un toque. El mensaje lleva un
  // enlace privado para que el paciente confirme o cancele solo.
  const ESTADO_ENVIO = { enviando: ['Enviando…', 'info'], enviado: ['Enviado', 'info'], entregado: ['Entregado', 'info'], leido: ['Leído', 'ok'], respondido: ['Respondió', 'ok'], fallo: ['No se pudo enviar', 'critica'] };
  async function subRecordatorios(c) {
    const puedeCfg = puede('agenda.config', 'clinica.config.manage');
    const puedeEnviar = puede('agenda.edit', 'whatsapp.send', 'recordatorios.propios');
    const yo = DOVA.usuarioActual() || {};
    const veTodos = puede('agenda.edit', 'whatsapp.send');
    let cfg = await DOVA.get('/recordatorios/config');
    const horas = Array.from({ length: 16 }, (_, i) => i + 6);
    const dibujarCfg = () => `
      <div class="dova-rec-estado">
        <div><span class="dova-punto ${cfg.whatsappConectado ? 'dova-punto-ok' : ''}"></span><strong>WhatsApp Business:</strong> ${cfg.whatsappConectado ? 'conectado' : 'no conectado'}
          <span class="dova-nota">${cfg.whatsappConectado ? '— DOVA manda los recordatorios solo.' : '— los mandás desde tu WhatsApp con el botón verde (el mensaje ya va armado).'}</span></div>
        <div><span class="dova-punto ${cfg.automatico && cfg.whatsappConectado ? 'dova-punto-ok' : ''}"></span><strong>Envío automático:</strong> ${cfg.automatico ? `todos los días a las ${cfg.hora} h, ${cfg.dias === 1 ? 'el día anterior' : `${cfg.dias} días antes`}` : 'apagado'}${cfg.automatico && !cfg.whatsappConectado ? ' <span class="dova-nota">(se activa cuando WhatsApp Business esté conectado)</span>' : ''}</div>
      </div>
      ${puedeCfg ? `<details class="dova-rec-config"><summary>Configurar envío automático</summary>
        <form data-cfg class="dova-ext-filtros">
          <label class="dova-check"><input type="checkbox" name="automatico" ${cfg.automatico ? 'checked' : ''}/> Mandar los recordatorios solo</label>
          <div><label>Hora de envío</label><select name="hora">${horas.map((h) => `<option value="${h}" ${h === cfg.hora ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
          <div><label>Anticipación</label><select name="dias">${[1, 2, 3].map((d) => `<option value="${d}" ${d === cfg.dias ? 'selected' : ''}>${d === 1 ? 'El día anterior' : `${d} días antes`}</option>`).join('')}</select></div>
          <button class="dova-btn-primary">Guardar</button>
        </form>
        <p class="dova-nota">Así le llega al paciente:</p><blockquote class="dova-rec-ejemplo">${esc(cfg.ejemplo)}</blockquote>
        ${cfg.whatsappConectado ? '' : '<p class="dova-nota">Para que se manden solos hace falta conectar WhatsApp Business (una sola vez). Los pasos están en <code>docs/WHATSAPP.md</code>.</p>'}
      </details>
      <details class="dova-rec-config" data-remitentes><summary>WhatsApp de cada odontólogo</summary><div data-rem-l><p class="dova-cargando">Cargando…</p></div></details>` : ''}`;
    c.innerHTML = `<div data-cfgbox>${dibujarCfg()}</div>
      <form class="dova-ext-filtros" data-f><div><label>Turnos del día</label><input type="date" name="fecha" value="${X.sumarDias(X.hoy(), cfg.dias || 1)}"/></div>${veTodos && yo.odontologoId ? '<label class="dova-check"><input type="checkbox" name="mios" /> Solo mis pacientes</label>' : ''}<button class="dova-btn-secundario">Ver</button><span data-masivo></span></form><div data-l></div>`;
    // WhatsApp de cada odontólogo (quien configura): número, id de Meta y si sus recordatorios salen de su número.
    const cargarRemitentes = async () => {
      const box = c.querySelector('[data-rem-l]'); if (!box) return;
      const r = await DOVA.get('/recordatorios/remitentes');
      box.innerHTML = `<p class="dova-nota">Cada doctor puede registrar su celular en Configuración → Mi WhatsApp. Para que los recordatorios automáticos de sus pacientes salgan de su número, ese número se conecta a WhatsApp Business en Meta y acá se carga el "Phone number ID" que da Meta. Sin eso, salen del número de la clínica.</p>
        <table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Celular</th><th>Phone number ID (Meta)</th><th>Enviar desde su número</th><th></th></tr></thead><tbody>
        ${r.odontologos.map((o) => `<tr data-odo="${o.id}"><td>${esc(o.nombre)}${o.usuario ? '' : ' <span class="dova-nota">(sin usuario)</span>'}</td>
          <td><input type="tel" name="numero" value="${esc(o.whatsapp_numero || '')}" placeholder="0981 123 456" maxlength="30"/></td>
          <td><input type="text" name="phoneId" value="${esc(o.whatsapp_phone_id || '')}" inputmode="numeric" maxlength="30" placeholder="Solo si está conectado"/></td>
          <td><label class="dova-check"><input type="checkbox" name="envia" ${o.whatsapp_envia ? 'checked' : ''}/> Sí</label></td>
          <td><button type="button" class="dova-btn-secundario" data-guardar-rem>Guardar</button></td></tr>`).join('') || '<tr><td colspan="5">No hay odontólogos activos.</td></tr>'}</tbody></table>`;
      box.querySelectorAll('[data-guardar-rem]').forEach((b) => b.addEventListener('click', async () => {
        const tr = b.closest('tr');
        try {
          await DOVA.put(`/recordatorios/remitentes/${tr.dataset.odo}`, { numero: tr.querySelector('[name=numero]').value.trim() || null, phoneId: tr.querySelector('[name=phoneId]').value.trim() || null, envia: tr.querySelector('[name=envia]').checked });
          X.toast('Guardado', 'ok');
        } catch (ex) { X.toast(ex.message, 'error'); cargarRemitentes(); }
      }));
    };
    // "toggle" no burbujea: se escucha en captura para que siga andando cuando se redibuja la configuración.
    if (!c.dataset.escuchaRem) { // una sola vez por contenedor, aunque se vuelva a abrir la pestaña
      c.dataset.escuchaRem = '1';
      c.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('[data-remitentes]') && e.target.open) cargarRemitentes(); }, true);
    }
    const enlazarCfg = () => {
      const fc = c.querySelector('[data-cfg]');
      if (fc) fc.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { cfg = await DOVA.put('/recordatorios/config', { automatico: fc.automatico.checked, hora: Number(fc.hora.value), dias: Number(fc.dias.value) }); X.toast('Configuración guardada', 'ok'); c.querySelector('[data-cfgbox]').innerHTML = dibujarCfg(); enlazarCfg(); } catch (ex) { X.toast(ex.message, 'error'); }
      });
    };
    enlazarCfg();
    const f = c.querySelector('[data-f]'); const l = c.querySelector('[data-l]');
    const cargar = async () => {
      const r = await DOVA.get(`/recordatorios/turnos?fecha=${f.fecha.value}${f.mios && f.mios.checked ? '&mios=1' : ''}`);
      const pendientes = r.turnos.filter((t) => !t.noEnviable && (!t.envio || t.envio.estado === 'fallo') && t.confirmacion !== 'confirmado');
      c.querySelector('[data-masivo]').innerHTML = r.whatsappConectado && puedeEnviar && pendientes.length ? `<button type="button" class="dova-btn-primary" data-todos>Enviar ${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}</button>` : '';
      l.innerHTML = `<p class="dova-nota">El mensaje trae un enlace para que el paciente confirme o cancele con un toque; cuando lo hace, se actualiza solo acá y en la agenda.${r.soloMios && !veTodos ? ' Ves los turnos de tus pacientes: abrí "Mandar por mi WhatsApp" desde tu celular para que salgan de tu número.' : ''}</p>
        <table class="dova-tabla"><thead><tr><th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Sale de</th><th>Recordatorio</th><th>Confirmación</th><th></th></tr></thead><tbody>
        ${r.turnos.map((t) => {
          const e = t.envio ? ESTADO_ENVIO[t.envio.estado] || [t.envio.estado, 'info'] : null;
          const estadoEnvio = t.noEnviable ? `<span class="dova-nota">${esc(t.noEnviable)}</span>`
            : e ? `${badge(e[0], e[1])}${t.envio.canal === 'whatsapp_manual' ? ' <span class="dova-nota">a mano</span>' : ''}${t.envio.respuesta ? `<br><span class="dova-nota">«${esc(t.envio.respuesta)}»</span>` : ''}${t.envio.error ? `<br><span class="dova-nota">${esc(t.envio.error)}</span>` : ''}`
            : badge('Sin enviar', 'atencion');
          const acciones = [];
          if (puedeEnviar && !t.noEnviable) {
            if (r.whatsappConectado && (!t.envio || t.envio.estado === 'fallo')) acciones.push(`<button class="dova-btn-link" data-enviar="${t.id}">${t.envio ? 'Reintentar' : 'Enviar'}</button>`);
            acciones.push(`<button class="dova-btn-link dova-link-wa" data-manual="${t.id}">${t.envio ? 'Reenviar por mi WhatsApp' : 'Mandar por mi WhatsApp'}</button>`);
          }
          if (puede('agenda.edit') && veTodos) {
            if (t.confirmacion !== 'confirmado') acciones.push(`<button class="dova-btn-link" data-conf="${t.id}">Confirmó</button>`);
            if (t.confirmacion !== 'pide_reprogramar') acciones.push(`<button class="dova-btn-link" data-reprog="${t.id}">Pide reprogramar</button>`);
          }
          return `<tr><td>${esc(t.hora)}</td><td>${linkPac(t.paciente_id, t.nombre, t.apellido)}</td><td>${esc(t.odontologo_nombre || '-')}</td><td><span class="dova-nota">${esc(t.remitente || '')}</span></td><td>${estadoEnvio}</td>
            <td>${badge(etiqueta(t.confirmacion), t.confirmacion === 'confirmado' ? 'ok' : t.confirmacion === 'pide_reprogramar' ? 'critica' : 'atencion')}</td>
            <td class="dova-ext-acciones">${acciones.join('')}</td></tr>`;
        }).join('') || '<tr><td colspan="7">No hay turnos ese día.</td></tr>'}</tbody></table>`;
      l.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', async () => {
        try { await DOVA.post(`/recordatorios/turnos/${b.dataset.enviar}/enviar`); X.toast('Recordatorio enviado', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); }
        cargar();
      }));
      l.querySelectorAll('[data-manual]').forEach((b) => b.addEventListener('click', async () => {
        // La ventana se abre en el mismo toque (si no, el navegador la bloquea) y después se le pone el mensaje.
        const ventana = window.open('', '_blank');
        try {
          const x = await DOVA.post(`/recordatorios/turnos/${b.dataset.manual}/enlace`);
          if (ventana) ventana.location.href = x.url; else location.href = x.url;
          cargar();
        } catch (ex) { if (ventana) ventana.close(); X.toast(ex.message, 'error'); }
      }));
      const todos = c.querySelector('[data-todos]');
      if (todos) todos.addEventListener('click', async () => {
        let ok = 0; let mal = 0;
        for (const t of pendientes) { try { await DOVA.post(`/recordatorios/turnos/${t.id}/enviar`); ok += 1; } catch (_e) { mal += 1; } }
        X.toast(`${ok} enviado${ok === 1 ? '' : 's'}${mal ? `, ${mal} con error` : ''}`, mal ? 'error' : 'ok');
        cargar();
      });
      l.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post(`/operaciones/confirmacion/${b.dataset.conf}`, { confirmacion: 'confirmado' }); X.toast('Turno confirmado', 'ok'); cargar(); }));
      l.querySelectorAll('[data-reprog]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post(`/operaciones/confirmacion/${b.dataset.reprog}`, { confirmacion: 'pide_reprogramar' }); cargar(); }));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
    X.vivo(c, ['turnos'], cargar);
  }


  async function subReactivacion(c) {
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Sin venir hace más de (meses)</label><input type="number" name="meses" value="12" min="3" max="60"/></div><button class="dova-btn-secundario">Buscar</button></form><div data-l></div>`;
    const f = c.querySelector('[data-f]'); const l = c.querySelector('[data-l]');
    const cargar = async () => {
      const filas = await DOVA.get(`/seguimiento/reactivacion?meses=${f.meses.value}`);
      l.innerHTML = `<p class="dova-nota">${filas.length} paciente(s) sin turno futuro.</p><table class="dova-tabla"><thead><tr><th>Paciente</th><th>Última visita</th><th>Hace</th><th>Último intento</th><th></th></tr></thead><tbody>
        ${filas.map((p) => `<tr><td>${linkPac(p.id, p.nombre, p.apellido)}</td><td>${fmtFecha(p.ultima_visita)}</td><td>${Math.floor(p.dias_sin_venir / 30)} meses</td><td>${p.ultimo_intento ? X.fmtFechaHora(p.ultimo_intento) : '-'}</td>
          <td class="dova-ext-acciones">${X.linkWhatsapp(p.whatsapp_link)}${puede('seguimiento.manage') ? `<button class="dova-btn-link" data-reg="${p.id}">Marcar contactado</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin pacientes para reactivar.</td></tr>'}</tbody></table>`;
      l.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post('/seguimiento/comunicaciones', { pacienteId: Number(b.dataset.reg), canal: 'whatsapp', motivo: 'reactivacion', resultado: 'enviado', contenido: 'Mensaje de reactivación' }); X.toast('Registrado', 'ok'); cargar(); }));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
  }

  async function subCumpleanos(c) {
    const filas = await DOVA.get('/seguimiento/cumpleanos?dias=14');
    c.innerHTML = `<table class="dova-tabla"><thead><tr><th>Paciente</th><th>Fecha</th><th>Cumple</th><th></th></tr></thead><tbody>
      ${filas.map((p) => `<tr><td>${linkPac(p.id, p.nombre, p.apellido)} ${p.es_hoy ? badge('¡hoy!', 'ok') : ''}</td><td>${fmtFecha(p.fecha_nacimiento).replace(/\/\d{4}$/, '')}</td><td>${p.cumple_anios} años</td>
        <td class="dova-ext-acciones">${X.linkWhatsapp(p.whatsapp_link, 'Saludar por WhatsApp')}${puede('seguimiento.manage') ? `<button class="dova-btn-link" data-reg="${p.id}">Marcar saludado</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No hay cumpleaños en los próximos 14 días.</td></tr>'}</tbody></table>`;
    c.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post('/seguimiento/comunicaciones', { pacienteId: Number(b.dataset.reg), canal: 'whatsapp', motivo: 'cumpleanos', resultado: 'enviado' }); b.replaceWith(document.createTextNode('✓ saludado')); }));
  }

  async function subTareas(c) {
    const usuarios = await X.catalogo('usuarios', '/seguimiento/equipo').catch(() => []);
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Estado</label><select name="estado"><option value="pendiente">Pendientes</option><option value="en_curso">En curso</option><option value="hecha">Hechas</option><option value="">Todas</option></select></div>
      <div><label>Asignadas a</label><select name="asignadoA"><option value="">Cualquiera</option><option value="${DOVA.usuarioActual().id}">A mí</option>${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div><button class="dova-btn-secundario">Filtrar</button></form><div data-l></div>`;
    const f = c.querySelector('[data-f]');
    const cargar = () => X.tablaCrud({
      root: c.querySelector('[data-l]'), endpoint: '/seguimiento/tareas', query: new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString(),
      puedeCrear: true, puedeEditar: true, puedeBorrar: true, nuevoTexto: '+ Nueva tarea',
      columnas: [{ t: 'Tarea', v: (r) => `<strong>${esc(r.titulo)}</strong>${r.descripcion ? `<br><span class="dova-nota">${esc(r.descripcion)}</span>` : ''}` }, { t: 'Paciente', v: (r) => (r.paciente_id ? linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) : '-') }, { t: 'Asignada a', v: (r) => esc(r.asignado_nombre || '-') }, { t: 'Vence', v: (r) => (['hecha', 'cancelada'].includes(r.estado) ? fmtFecha(r.vencimiento) : badgeFecha(r.vencimiento)) }, { t: 'Prioridad', v: (r) => badge(etiqueta(r.prioridad), ['alta', 'urgente'].includes(r.prioridad) ? 'critica' : 'info') }, { t: 'Estado', v: (r) => esc(etiqueta(r.estado)) }],
      acciones: [{ texto: 'Hecha', visible: (r) => !['hecha', 'cancelada'].includes(r.estado), fn: async (r, rec) => { await DOVA.put(`/seguimiento/tareas/${r.id}`, { estado: 'hecha' }); rec(); } }],
      campos: DovaFicha.camposTarea(usuarios),
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    return cargar();
  }

  function subBiopsiasPend(c) {
    return X.tablaCrud({
      root: c, endpoint: '/especialidades/biopsias', puedeEditar: puede('especialidades.edit'),
      claseFila: (r) => (['tomada', 'enviada'].includes(r.estado) ? 'dova-ext-fila-aviso' : ''),
      columnas: [{ t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) }, { t: 'Toma', v: (r) => fmtFecha(r.fecha_toma) }, { t: 'Zona', v: (r) => esc(r.zona) }, { t: 'Laboratorio', v: (r) => esc(r.laboratorio_patologia || '-') }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), ['tomada', 'enviada'].includes(r.estado) ? 'atencion' : 'ok') }],
      campos: [{ k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['tomada', 'enviada', 'resultado_recibido', 'informada_paciente', 'cerrada']) }, { k: 'laboratorioPatologia', label: 'Laboratorio' }, { k: 'diagnosticoHistopatologico', label: 'Diagnóstico histopatológico', tipo: 'textarea' }, { k: 'requiereSeguimiento', label: 'Requiere seguimiento', tipo: 'bool' }],
    });
  }

  function subComunicaciones(c) {
    return X.tablaCrud({
      root: c, endpoint: '/seguimiento/comunicaciones', query: 'limite=200',
      columnas: [{ t: 'Fecha', v: (r) => X.fmtFechaHora(r.fecha) }, { t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) }, { t: 'Canal', v: (r) => esc(etiqueta(r.canal)) }, { t: 'Motivo', v: (r) => esc(etiqueta(r.motivo)) }, { t: 'Resultado', v: (r) => esc(r.resultado ? etiqueta(r.resultado) : '-') }, { t: 'Por', v: (r) => esc(r.usuario_nombre || '-') }],
    });
  }

  return { seguimiento };
})();
window.DovaSeguimiento = DovaSeguimiento;

DovaPantallas.registrar('seguimiento', { dibujar: (contenedor, { navegar, params }) => DovaSeguimiento.seguimiento(contenedor, navegar, params) });
