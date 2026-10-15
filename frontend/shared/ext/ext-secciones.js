/* DOVA — secciones nuevas del menú (seguimiento integral):
   Seguimiento, Operaciones, Finanzas, Indicadores y Auditoría; además
   extiende el Panel, Configuración y el Modo consulta. */
const DovaSecciones = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, badge, badgeFecha, etiqueta } = X;
  const OPC = (arr) => arr.map((v) => [v, etiqueta(v)]);
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
      X.modal('Nuevo seguimiento', `<form data-fn class="dova-ext-form-grid">${DovaOperativo.campoPacienteHtml()}
        <div class="dova-ext-campo dova-ext-campo-completo"><label>Motivo *</label><textarea name="motivo" rows="2" maxlength="2000" required placeholder="Ej.: avisar que llegó el resultado del estudio"></textarea></div>
        <div class="dova-ext-campo"><label>Próximo contacto</label><input type="date" name="proximoContacto" value="${X.hoy()}"/></div>
        <div class="dova-ext-campo"><label>Responsable</label><select name="responsableId"><option value="">—</option>${opResp.map(([i, n]) => `<option value="${i}" ${i === (DOVA.usuarioActual() || {}).id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <p class="dova-error-text dova-ext-campo-completo" data-error hidden></p>
        <div class="dova-modal-actions dova-ext-campo-completo"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Crear</button></div></form>`);
      const fn = document.querySelector('.dova-modal-box [data-fn]');
      DovaOperativo.activarBuscadorPaciente(fn);
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

  // ================================ OPERACIONES ================================
  async function operaciones(root, nav) {
    montar(root, nav);
    root.innerHTML = `<h2 class="dova-view-title">La clínica, día a día</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'sala', texto: 'Sala de espera', visible: puede('agenda.view'), render: subSala },
      { id: 'fichaje', texto: 'Asistencia del personal', visible: puede('fichaje.use', 'fichaje.view_all'), render: subFichaje },
      { id: 'lab', texto: 'Laboratorio', visible: puede('laboratorio.manage'), render: subLab },
      { id: 'ester', texto: 'Esterilización', visible: puede('esterilizacion.manage'), render: subEsterilizacion },
      { id: 'equipos', texto: 'Equipos', visible: puede('equipos.manage'), render: subEquipos },
      { id: 'agendacfg', texto: 'Sillones y días bloqueados', visible: puede('agenda.config'), render: subAgendaCfg },
      { id: 'alertas', texto: 'Alertas', visible: puede('equipos.manage', 'esterilizacion.manage', 'inventario.view', 'laboratorio.manage'), render: subAlertasOp },
    ]);
  }

  async function subSala(c) {
    const filas = await DOVA.get('/operaciones/sala-espera');
    const puedeMover = puede('agenda.edit', 'historia_clinica.edit');
    const sillones = await DOVA.get('/operaciones/sillones').catch(() => []);
    c.innerHTML = `<p class="dova-nota">Registrá la llegada del paciente, cuando pasa al sillón y cuando termina: DOVA mide la espera y la duración real de la atención.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Estado</th><th>Espera</th><th>Atención</th><th></th></tr></thead><tbody>
      ${filas.map((t) => {
        const estado = t.finalizado_en ? badge('Atendido', 'ok') : t.en_sillon_en ? badge('En el sillón', 'info') : t.llegada_en ? badge('Esperando', 'atencion') : badge(etiqueta(t.estado));
        return `<tr><td>${esc(String(t.hora_inicio).slice(0, 5))}</td><td>${linkPac(t.paciente_id, t.nombre, t.apellido)}</td><td>${esc(t.odontologo_nombre || '-')}${t.sillon_nombre ? `<br><span class="dova-nota">${esc(t.sillon_nombre)}</span>` : ''}</td><td>${estado}</td>
          <td>${t.minutos_esperando != null ? badge(`${t.minutos_esperando} min`, t.minutos_esperando > 20 ? 'critica' : 'atencion') : t.minutos_espera != null ? `${t.minutos_espera} min` : '-'}</td><td>${t.minutos_atencion != null ? `${t.minutos_atencion} min` : '-'}</td>
          <td class="dova-ext-acciones">${puedeMover && !['atendido', 'no_asistio'].includes(t.estado) ? `${!t.llegada_en ? `<button class="dova-btn-link" data-paso="llegada" data-t="${t.id}">Llegó</button>` : ''}${t.llegada_en && !t.en_sillon_en ? `<button class="dova-btn-link" data-paso="sillon" data-t="${t.id}">Pasa al sillón</button>` : ''}${t.en_sillon_en && !t.finalizado_en ? `<button class="dova-btn-link" data-paso="finalizado" data-t="${t.id}">Terminó</button>` : ''}` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="7">No hay turnos hoy.</td></tr>'}</tbody></table></div>`;
    const mover = async (turnoId, paso, body = {}) => { await DOVA.post(`/operaciones/flujo/${turnoId}/${paso}`, body); subSala(c); };
    c.querySelectorAll('[data-paso]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.paso === 'sillon' && sillones.length) {
        X.modalForm('¿A qué sillón pasa?', [{ k: 'sillonId', label: 'Sillón', tipo: 'select', opciones: sillones.map((x) => [x.id, x.nombre]) }], {},
          (d) => mover(b.dataset.t, 'sillon', d.sillonId ? { sillonId: Number(d.sillonId) } : {}), { textoBoton: 'Pasa al sillón' });
        return;
      }
      try { await mover(b.dataset.t, b.dataset.paso); } catch (e) { X.toast(e.message, 'error'); }
    }));
  }

  async function subFichaje(c) {
    const est = await DOVA.get('/operaciones/fichaje/estado');
    const acciones = { fuera: [['entrada', 'Marcar entrada']], trabajando: [['inicio_pausa', 'Iniciar pausa'], ['salida', 'Marcar salida']], en_pausa: [['fin_pausa', 'Terminar pausa'], ['salida', 'Marcar salida']] }[est.estado];
    const inicioMes = `${X.hoy().slice(0, 7)}-01`;
    c.innerHTML = `<div class="dova-ext-caja"><div class="dova-ext-fichaje"><span class="dova-ext-estado-grande">${est.estado === 'trabajando' ? '<span class="dova-punto dova-punto-ok"></span>Trabajando' : est.estado === 'en_pausa' ? '<span class="dova-punto dova-punto-atencion"></span>En pausa' : '<span class="dova-punto"></span>Fuera'}</span>
      ${est.ultimo ? `<span class="dova-nota">Última marca: ${esc(etiqueta(est.ultimo.tipo))} · ${X.fmtFechaHora(est.ultimo.fecha)}</span>` : ''}
      ${acciones.map(([t, txt]) => `<button class="dova-btn-primary" data-marcar="${t}">${txt}</button>`).join('')}</div></div>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${inicioMes}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div><button class="dova-btn-secundario">Ver horas</button></form><div data-rep></div>`;
    c.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', async () => { try { await DOVA.post('/operaciones/fichaje', { tipo: b.dataset.marcar }); X.toast('Marca registrada', 'ok'); subFichaje(c); } catch (e) { X.toast(e.message, 'error'); } }));
    const f = c.querySelector('[data-f]');
    const rep = async () => {
      const r = await DOVA.get(`/operaciones/fichaje/reporte?desde=${f.desde.value}&hasta=${f.hasta.value}`);
      c.querySelector('[data-rep]').innerHTML = `<table class="dova-tabla"><thead><tr><th>Persona</th><th>Horas</th><th>Días trabajados</th><th>Detalle</th></tr></thead><tbody>
        ${r.usuarios.map((u) => `<tr><td>${esc(u.usuario)}${u.abierto ? ' ' + badge('jornada abierta', 'atencion') : ''}</td><td><strong>${u.horas}</strong></td><td>${Object.keys(u.dias).length}</td><td><span class="dova-nota">${Object.entries(u.dias).map(([d, m]) => `${fmtFecha(d)}: ${Math.round(m / 6) / 10} h`).join(' · ')}</span></td></tr>`).join('') || '<tr><td colspan="4">Sin marcas en el período.</td></tr>'}</tbody></table>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); rep(); });
    await rep();
  }

  async function subLab(c) {
    c.innerHTML = '<div data-trab></div><div data-labs></div>';
    const [labs, ods] = await Promise.all([DOVA.get('/operaciones/laboratorios').catch(() => []), X.opcionesOdontologos()]);
    X.tablaCrud({
      root: c.querySelector('[data-trab]'), titulo: 'Trabajos de laboratorio', endpoint: '/operaciones/trabajos-laboratorio', puedeEditar: true,
      claseFila: (r) => (r.atrasado ? 'dova-ext-fila-alerta' : r.estado === 'rehacer' ? 'dova-ext-fila-aviso' : ''),
      columnas: [
        { t: 'Paciente', v: (r) => linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido) }, { t: 'Trabajo', v: (r) => `${esc(r.trabajo)}${r.pieza ? ` — ${esc(r.pieza)}` : ''}` },
        { t: 'Laboratorio', v: (r) => esc(r.laboratorio_nombre || '-') }, { t: 'Entrega estimada', v: (r) => `${fmtFecha(r.fecha_estimada)} ${r.atrasado ? badge('atrasado', 'critica') : ''}` },
        { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'rehacer' ? 'critica' : ['instalado', 'entregado', 'controlado'].includes(r.estado) ? 'ok' : 'info') },
        { t: 'Turno para colocar', v: (r) => (r.proximo_turno ? fmtFecha(r.proximo_turno) : ['recibido', 'controlado'].includes(r.estado) ? badge('sin turno', 'atencion') : '-') },
      ],
      campos: DovaFicha.camposTrabajoLab(labs, ods),
      acciones: [
        { texto: 'Avisar al paciente', visible: (r) => ['recibido', 'controlado'].includes(r.estado), fn: async (r) => { const m = await DOVA.get(`/operaciones/trabajos-laboratorio-aviso/${r.id}`); if (m.whatsapp_link) window.open(m.whatsapp_link, '_blank', 'noopener'); await DOVA.post('/seguimiento/comunicaciones', { pacienteId: r.paciente_id, canal: 'whatsapp', motivo: 'laboratorio', resultado: 'enviado', contenido: m.texto }); X.toast('Aviso registrado', 'ok'); } },
        { texto: 'Archivos', fn: (r) => DovaFicha.archivosLab(r) },
        { texto: 'Orden', fn: (r) => X.imprimir('Orden de laboratorio', `<h1>Orden de laboratorio</h1><table><tr><th>Paciente</th><td>${esc(r.paciente_nombre)} ${esc(r.paciente_apellido)}</td></tr><tr><th>Laboratorio</th><td>${esc(r.laboratorio_nombre || '')}</td></tr><tr><th>Trabajo</th><td>${esc(r.trabajo)}</td></tr><tr><th>Pieza(s)</th><td>${esc(r.pieza || '')}</td></tr><tr><th>Material</th><td>${esc(r.material || '')}</td></tr><tr><th>Color</th><td>${esc(r.color_tono || '')}</td></tr><tr><th>Instrucciones</th><td>${esc(r.instrucciones || '')}</td></tr><tr><th>Odontólogo</th><td>${esc(r.odontologo_nombre || '')}</td></tr><tr><th>Enviado</th><td>${fmtFecha(r.fecha_envio)}</td></tr><tr><th>Entrega solicitada</th><td>${fmtFecha(r.fecha_estimada)}</td></tr></table><p class="nota">Firma y sello: ____________________</p>`) },
      ],
      vacio: 'No hay trabajos de laboratorio.',
    });
    X.tablaCrud({
      root: c.querySelector('[data-labs]'), titulo: 'Laboratorios', endpoint: '/operaciones/laboratorios', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Contacto', v: (r) => esc([r.contacto, r.telefono, r.email].filter(Boolean).join(' · ') || '-') }, { t: 'Entrega', v: (r) => `${r.dias_entrega} días hábiles` }, { t: 'Trabajos abiertos', v: (r) => esc(r.trabajos_abiertos) }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'contacto', label: 'Contacto' }, { k: 'telefono', label: 'Teléfono' }, { k: 'email', label: 'Email' }, { k: 'diasEntrega', label: 'Días hábiles de entrega', tipo: 'numero' }, { k: 'direccion', label: 'Dirección', tipo: 'textarea' }, { k: 'servicios', label: 'Servicios y precios', tipo: 'textarea' }],
    });
  }

  async function subEsterilizacion(c) {
    const equipos = await DOVA.get('/operaciones/equipos').catch(() => []);
    c.innerHTML = `<div class="dova-ext-caja"><h4>Usar un paquete en un paciente</h4><p class="dova-nota">Escaneá o escribí el código del paquete: queda trazado qué ciclo de esterilización se usó con cada paciente.</p>
      <form class="dova-ext-filtros" data-usar><div><label>Código del paquete</label><input name="codigo" required/></div><div><label>ID de paciente</label><input name="pacienteId" type="number" required/></div><button class="dova-btn-primary">Registrar uso</button></form></div>
      <div data-ciclos></div><div data-paquetes></div>`;
    c.querySelector('[data-usar]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await DOVA.post('/operaciones/esterilizacion/paquetes/usar', { codigo: e.target.codigo.value, pacienteId: Number(e.target.pacienteId.value) }); X.toast(`Paquete ${r.paquete} (ciclo ${r.ciclo}) registrado`, 'ok'); e.target.reset(); subEsterilizacion(c); } catch (ex) { X.toast(ex.message, 'error'); }
    });
    const verPaquetes = (ciclo) => X.tablaCrud({
      root: c.querySelector('[data-paquetes]'), titulo: `Paquetes del ciclo ${ciclo.numero}`, endpoint: '/operaciones/esterilizacion/paquetes', query: `cicloId=${ciclo.id}`, fijos: { cicloId: ciclo.id },
      puedeCrear: ciclo.estado !== 'rechazado', puedeBorrar: true, nuevoTexto: '+ Agregar paquete',
      columnas: [{ t: 'Código', v: (r) => `<strong>${esc(r.codigo)}</strong>` }, { t: 'Contenido', v: (r) => esc(r.descripcion || '-') }, { t: 'Vence', v: (r) => badgeFecha(r.fecha_vencimiento) }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'disponible' ? 'ok' : r.estado === 'usado' ? 'info' : 'critica') }, { t: 'Usado en', v: (r) => (r.paciente_id ? `${linkPac(r.paciente_id, r.paciente_nombre, r.paciente_apellido)} · ${X.fmtFechaHora(r.usado_en)}` : '-') }],
      campos: [{ k: 'codigo', label: 'Código', req: true }, { k: 'descripcion', label: 'Contenido (kit, cassette…)' }, { k: 'fechaVencimiento', label: 'Vence', tipo: 'fecha', ayuda: 'Vacío = 30 días' }],
    });
    X.tablaCrud({
      root: c.querySelector('[data-ciclos]'), titulo: 'Ciclos de esterilización', endpoint: '/operaciones/esterilizacion/ciclos', query: 'limite=100', puedeCrear: true, puedeEditar: true, nuevoTexto: '+ Registrar ciclo',
      descripcion: 'Un ciclo con cualquier indicador fallido queda RECHAZADO: sus paquetes no se pueden usar y, si alguno ya se usó, DOVA crea una tarea urgente.',
      claseFila: (r) => (r.estado === 'rechazado' ? 'dova-ext-fila-alerta' : r.estado === 'en_cuarentena' ? 'dova-ext-fila-aviso' : ''),
      columnas: [{ t: 'N.º', v: (r) => `<strong>${esc(r.numero)}</strong>` }, { t: 'Fecha', v: (r) => X.fmtFechaHora(r.fecha) }, { t: 'Equipo', v: (r) => esc(r.equipo_nombre || '-') }, { t: 'Parámetros', v: (r) => esc([r.temperatura_c && `${r.temperatura_c} °C`, r.presion_bar && `${r.presion_bar} bar`, r.duracion_min && `${r.duracion_min} min`].filter(Boolean).join(' · ') || '-') }, { t: 'Indicadores Q / B / BD', v: (r) => `${r.indicador_quimico} / ${r.indicador_biologico} / ${r.bowie_dick}` }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'liberado' ? 'ok' : r.estado === 'rechazado' ? 'critica' : 'atencion') }, { t: 'Paquetes', v: (r) => `${r.paquetes} (${r.paquetes_usados} usados)` }],
      campos: [{ k: 'numero', label: 'N.º de ciclo', req: true, soloCrear: true }, { k: 'equipoId', label: 'Equipo', tipo: 'select', opciones: equipos.map((e) => [e.id, e.nombre]) }, { k: 'metodo', label: 'Método', tipo: 'select', opciones: OPC(['vapor', 'calor_seco', 'quimico', 'plasma']) }, { k: 'temperaturaC', label: 'Temperatura (°C)', tipo: 'numero' }, { k: 'presionBar', label: 'Presión (bar)', tipo: 'numero', paso: '0.01' }, { k: 'duracionMin', label: 'Duración (min)', tipo: 'numero' }, { k: 'indicadorQuimico', label: 'Indicador químico', tipo: 'select', req: true, opciones: OPC(['pasa', 'falla', 'na']) }, { k: 'indicadorBiologico', label: 'Indicador biológico', tipo: 'select', req: true, opciones: OPC(['pasa', 'falla', 'pendiente', 'na']) }, { k: 'bowieDick', label: 'Bowie-Dick', tipo: 'select', req: true, opciones: OPC(['pasa', 'falla', 'na']) }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      valoresNuevo: () => ({ indicadorQuimico: 'pasa', indicadorBiologico: 'na', bowieDick: 'na', metodo: 'vapor', temperaturaC: 134, duracionMin: 18 }),
      acciones: [{ texto: 'Paquetes', fn: (r) => verPaquetes(r) }],
    });
  }

  function subEquipos(c) {
    c.innerHTML = '<div data-eq></div><div data-mant></div>';
    const verMant = (eq) => X.tablaCrud({
      root: c.querySelector('[data-mant]'), titulo: `Mantenimientos — ${eq.nombre}`, endpoint: '/operaciones/mantenimientos', query: `equipoId=${eq.id}`, fijos: { equipoId: eq.id }, puedeCrear: true, puedeBorrar: true,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Realizó', v: (r) => esc(r.realizado_por || '-') }, { t: 'Costo', v: (r) => (r.costo ? fmtGs(r.costo) : '-') }, { t: 'Detalle', v: (r) => esc(r.descripcion || '-') }],
      campos: [{ k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['preventivo', 'correctivo', 'calibracion', 'validacion', 'dosimetria']) }, { k: 'realizadoPor', label: 'Realizado por' }, { k: 'costo', label: 'Costo', tipo: 'numero' }, { k: 'descripcion', label: 'Detalle', tipo: 'textarea' }],
      alGuardar: () => subEquipos(c),
    });
    return X.tablaCrud({
      root: c.querySelector('[data-eq]'), titulo: 'Equipos', endpoint: '/operaciones/equipos', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      claseFila: (r) => (r.proximo_mantenimiento && r.proximo_mantenimiento <= X.hoy() ? 'dova-ext-fila-aviso' : ''),
      columnas: [{ t: 'Equipo', v: (r) => `<strong>${esc(r.nombre)}</strong><br><span class="dova-nota">${esc([etiqueta(r.tipo), r.marca, r.modelo].filter(Boolean).join(' · '))}</span>` }, { t: 'Serie', v: (r) => esc(r.numero_serie || '-') }, { t: 'Ubicación', v: (r) => esc(r.ubicacion || '-') }, { t: 'Último mant.', v: (r) => fmtFecha(r.ultimo_mantenimiento) }, { t: 'Próximo mant.', v: (r) => badgeFecha(r.proximo_mantenimiento) }, { t: 'Garantía', v: (r) => fmtFecha(r.garantia_hasta) }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'operativo' ? 'ok' : 'critica') }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['autoclave', 'sillon', 'compresor', 'rayos_x', 'sensor_rx', 'escaner_intraoral', 'lampara_fotocurado', 'ultrasonido', 'micromotor', 'turbina', 'aspiracion', 'localizador_apical', 'motor_endo', 'otro']) }, { k: 'marca', label: 'Marca' }, { k: 'modelo', label: 'Modelo' }, { k: 'numeroSerie', label: 'N.º de serie' }, { k: 'ubicacion', label: 'Ubicación' }, { k: 'fechaCompra', label: 'Compra', tipo: 'fecha' }, { k: 'garantiaHasta', label: 'Garantía hasta', tipo: 'fecha' }, { k: 'frecuenciaMantenimientoMeses', label: 'Mantenimiento cada (meses)', tipo: 'numero' }, { k: 'proximoMantenimiento', label: 'Próximo mantenimiento', tipo: 'fecha' }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['operativo', 'en_mantenimiento', 'fuera_de_servicio', 'baja']) }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      acciones: [{ texto: 'Mantenimientos', fn: (r) => verMant(r) }],
    });
  }

  async function subAgendaCfg(c) {
    const ods = await X.opcionesOdontologos();
    c.innerHTML = '<div data-sil></div><div data-blq></div>';
    const sil = await X.tablaCrud({
      root: c.querySelector('[data-sil]'), titulo: 'Sillones / boxes', endpoint: '/operaciones/sillones', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      descripcion: 'Si asignás sillón a los turnos, DOVA impide reservar dos pacientes en el mismo sillón a la misma hora.',
      columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Ubicación', v: (r) => esc(r.ubicacion || '-') }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'ubicacion', label: 'Ubicación' }],
    });
    X.tablaCrud({
      root: c.querySelector('[data-blq]'), titulo: 'Horarios bloqueados (feriados, vacaciones, almuerzo…)', endpoint: '/operaciones/bloqueos', query: `desde=${X.sumarDias(X.hoy(), -30)}`, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      descripcion: 'Feriados, vacaciones, almuerzo, capacitaciones… Un turno dentro de un bloqueo se rechaza salvo que se fuerce. Sin odontólogo = afecta a toda la clínica. Sin horas = día completo.',
      columnas: [{ t: 'Fecha', v: (r) => `${fmtFecha(r.fecha)}${r.fecha_hasta && r.fecha_hasta !== r.fecha ? ` → ${fmtFecha(r.fecha_hasta)}` : ''}` }, { t: 'Horario', v: (r) => (r.hora_desde ? `${String(r.hora_desde).slice(0, 5)}–${String(r.hora_hasta).slice(0, 5)}` : 'Todo el día') }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Afecta a', v: (r) => esc(r.odontologo_nombre || r.sillon_nombre || 'Toda la clínica') }, { t: 'Motivo', v: (r) => esc(r.motivo || '-') }],
      campos: [{ k: 'fecha', label: 'Desde', tipo: 'fecha', req: true }, { k: 'fechaHasta', label: 'Hasta (opcional)', tipo: 'fecha' }, { k: 'horaDesde', label: 'Hora inicio', tipo: 'hora' }, { k: 'horaHasta', label: 'Hora fin', tipo: 'hora' }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['feriado', 'vacaciones', 'almuerzo', 'reunion', 'capacitacion', 'urgencias', 'mantenimiento', 'otro']) }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'sillonId', label: 'Sillón', tipo: 'select', opciones: (sil || []).map((s) => [s.id, s.nombre]) }, { k: 'motivo', label: 'Motivo' }],
    });
  }

  async function subAlertasOp(c) {
    const a = await DOVA.get('/operaciones/alertas');
    const lista = (titulo, filas, fn) => `<div class="dova-ext-caja"><h4>${esc(titulo)} ${filas.length ? badge(filas.length, 'atencion') : badge('0', 'ok')}</h4>${filas.length ? `<ul class="dova-lista-simple">${filas.map(fn).join('')}</ul>` : '<p class="dova-nota">Nada pendiente.</p>'}</div>`;
    c.innerHTML = `<div class="dova-ext-dos-col"><div>
      ${lista('Mantenimientos vencidos o próximos (15 días)', a.mantenimientos, (e) => `<li>${esc(e.nombre)} — ${badgeFecha(e.proximo_mantenimiento)}</li>`)}
      ${lista('Garantías por vencer (30 días)', a.garantiasPorVencer, (e) => `<li>${esc(e.nombre)} — ${fmtFecha(e.garantia_hasta)}</li>`)}
      ${lista('Esterilizaciones esperando el resultado del control biológico', a.ciclosEnCuarentena, (e) => `<li>Ciclo ${esc(e.numero)} — ${X.fmtFechaHora(e.fecha)}</li>`)}
      </div><div>
      ${lista('Insumos por vencer (60 días)', a.insumosPorVencer, (i) => `<li>${esc(i.nombre)}${i.lote ? ` (lote ${esc(i.lote)})` : ''} — ${badgeFecha(i.fecha_vencimiento)} · stock ${esc(i.stock_actual)}</li>`)}
      ${lista('Insumos con stock bajo', a.insumosStockBajo, (i) => `<li>${esc(i.nombre)} — ${esc(i.stock_actual)} / mín. ${esc(i.stock_minimo)}</li>`)}
      <div class="dova-ext-caja"><h4>Paquetes estériles por vencer (3 días)</h4><p>${a.paquetesPorVencer ? badge(a.paquetesPorVencer, 'atencion') : badge('0', 'ok')}</p>${a.paquetesVencidos ? `<p class="dova-nota dova-nota-alerta">${a.paquetesVencidos} paquete(s) vencido(s): reprocesar antes de usar.</p>` : ''}</div>
      </div></div>`;
  }

  // ================================ FINANZAS ================================
  async function finanzas(root, nav) {
    montar(root, nav);
    root.innerHTML = `<h2 class="dova-view-title">Finanzas</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'deuda', texto: 'Quién debe y desde cuándo', visible: puede('cuenta_corriente.view', 'reportes.view'), render: subDeuda },
      { id: 'cobro', texto: 'Avisos de cobro', visible: puede('cobranza.manage'), render: subCobro },
      { id: 'online', texto: 'Cobro online', visible: puede('cobro_online.manage'), render: (c) => DovaPlataforma.cobroOnline(c) },
      { id: 'comisiones', texto: 'Comisiones', visible: puede('comisiones.view', 'comisiones.manage'), render: subComisiones },
      { id: 'rentabilidad', texto: 'Rentabilidad', visible: puede('rentabilidad.view'), render: subRentabilidad },
      { id: 'metas', texto: 'Metas', visible: puede('metas.manage', 'kpis.view', 'comisiones.view'), render: subMetas },
      { id: 'seguros', texto: 'Seguros y convenios', visible: puede('aseguradoras.manage'), render: subSeguros },
      { id: 'listas', texto: 'Listas de precios', visible: puede('listas_precios.manage'), render: subListas },
      { id: 'cierre', texto: 'Cerrar meses', visible: puede('clinica.config.manage'), render: subCierre },
    ]);
  }

  // Avisos de cobro por WhatsApp: cuotas por vencer o vencidas y presupuestos sin respuesta.
  async function subCobro(c) {
    const puedeCfg = puede('clinica.config.manage');
    const [cfg, l] = await Promise.all([DOVA.get('/cobranza/config'), DOVA.get('/cobranza/pendientes')]);
    const ultimo = (x) => (x.avisos || []).filter((a) => a.estado !== 'fallo').slice(-1)[0];
    const ESTADO = { enviando: 'Enviando', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', respondido: 'Respondió', fallo: 'No se pudo enviar' };
    const avisos = (x) => {
      const ok = (x.avisos || []).filter((a) => a.estado !== 'fallo');
      const fallo = (x.avisos || []).find((a) => a.estado === 'fallo');
      const u = ultimo(x);
      return `${ok.length ? `${ok.length} · <span class="dova-nota">${esc(ESTADO[u.estado] || u.estado)} ${fmtFecha(u.en)}${u.canal === 'whatsapp_manual' ? ' (a mano)' : ''}</span>` : '<span class="dova-nota">Ninguno</span>'}${fallo ? ` <span title="${esc(fallo.error || '')}">${badge('Falló', 'critica')}</span>` : ''}`;
    };
    const acciones = (x) => {
      if (x.noEnviable) return `<span class="dova-nota">${esc(x.noEnviable)}</span>`;
      if (x.etapa === null || x.etapa === undefined) return `<span class="dova-nota">${esc(x.motivo || '')}</span>`;
      return `${x.toca ? `${badge('Toca hoy', 'atencion')} ` : `<span class="dova-nota">${esc(x.motivo || '')}</span> `}
        ${l.whatsappConectado ? `<button type="button" class="dova-btn-link" data-cob-enviar="${x.tipo}:${x.id}">Enviar</button>` : ''}
        <button type="button" class="dova-btn-link dova-link-wa" data-cob-manual="${x.tipo}:${x.id}">Mandar por mi WhatsApp</button>`;
    };
    const dibujarCfg = () => `<details class="dova-rec-config" data-cob-cfg><summary>Configurar los avisos</summary>
      <form class="dova-ext-filtros dova-cob-form">
        <label class="dova-check"><input type="checkbox" name="automatico" ${cfg.automatico ? 'checked' : ''} ${cfg.whatsappConectado ? '' : 'disabled'}/> Mandar los avisos solos${cfg.whatsappConectado ? '' : ' (necesita WhatsApp Business)'}</label>
        <div><label>Hora de envío</label><select name="hora">${Array.from({ length: 13 }, (_, i) => i + 8).map((h) => `<option value="${h}" ${cfg.hora === h ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
        <div><label>Avisar antes de que venza</label><select name="diasAntes">${[0, 1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${cfg.diasAntes === d ? 'selected' : ''}>${d ? `${d} día${d === 1 ? '' : 's'} antes` : 'No avisar'}</option>`).join('')}</select></div>
        <div><label>Si vence sin pagar, repetir cada</label><select name="repetirDias">${[3, 5, 7, 10, 15, 30].map((d) => `<option value="${d}" ${cfg.repetirDias === d ? 'selected' : ''}>${d} días</option>`).join('')}</select></div>
        <div><label>Hasta cuántos avisos</label><select name="maxAvisos">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${cfg.maxAvisos === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <label class="dova-check"><input type="checkbox" name="presupuestos" ${cfg.presupuestos ? 'checked' : ''}/> Seguir los presupuestos sin respuesta</label>
        <div><label>Primer aviso del presupuesto</label><select name="presupuestoDias">${[2, 3, 5, 7, 10, 15].map((d) => `<option value="${d}" ${cfg.presupuestoDias === d ? 'selected' : ''}>${d} días después de enviado</option>`).join('')}</select></div>
        <button class="dova-btn-primary">Guardar</button>
      </form>
      <p class="dova-nota"><strong>Así le llega una cuota vencida:</strong></p><p class="dova-rec-ejemplo">${esc(cfg.ejemplos.cuota)}</p>
      <p class="dova-nota"><strong>Así le llega un presupuesto:</strong></p><p class="dova-rec-ejemplo">${esc(cfg.ejemplos.presupuesto)}</p>
      <p class="dova-nota">El enlace abre una página con lo que tiene pendiente, los datos para pagar y, si los pagos online están activos, para mandar el comprobante (llega a Página web → Pagos para revisar). En un presupuesto puede avisar que quiere empezar o que tiene una consulta: te llega a la campanita.</p>
    </details>`;
    c.innerHTML = `<div class="dova-rec-estado">
        <div><span class="dova-vivo-punto ${l.whatsappConectado ? 'ok' : ''}"></span> <strong>WhatsApp Business:</strong> ${l.whatsappConectado ? 'conectado' : 'sin conectar'} <span class="dova-nota">${l.whatsappConectado ? '' : '— los mandás desde tu WhatsApp con el botón verde (el mensaje ya va armado).'}</span></div>
        <div><strong>Envío automático:</strong> ${l.automatico ? `todos los días a las ${cfg.hora} h` : 'apagado'}</div>
        <div><strong>Para avisar hoy:</strong> ${l.tocanHoy}</div>
      </div>
      ${puedeCfg ? dibujarCfg() : ''}
      <label class="dova-check"><input type="checkbox" data-solo-hoy/> Ver solo los que toca avisar hoy</label>
      <h3 class="dova-section-title">Cuotas por vencer y vencidas</h3><div data-cuotas></div>
      <h3 class="dova-section-title">Presupuestos sin respuesta</h3><div data-press></div>`;
    const pintar = (lista) => {
      c.querySelector('[data-cuotas]').innerHTML = lista.cuotas.length ? `<table class="dova-tabla"><thead><tr><th>Paciente</th><th>Cuota</th><th>Monto</th><th>Vence</th><th>Avisos</th><th></th></tr></thead><tbody>
        ${lista.cuotas.map((x) => `<tr><td>${linkPac(x.pacienteId, x.paciente, '')}</td><td>${x.numero} de ${x.de}</td><td>${fmtGs(x.monto)}</td>
          <td>${fmtFecha(x.vencimiento)}${x.diasAtraso ? ` ${badge(`${x.diasAtraso} día${x.diasAtraso === 1 ? '' : 's'} de atraso`, 'critica')}` : ''}${x.enRevision ? ` ${badge('Comprobante en revisión', 'info')}` : ''}</td>
          <td>${avisos(x)}</td><td>${acciones(x)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">No hay cuotas por vencer ni vencidas.</p>';
      c.querySelector('[data-press]').innerHTML = lista.presupuestos.length ? `<table class="dova-tabla"><thead><tr><th>Paciente</th><th>Presupuesto</th><th>Total</th><th>Enviado hace</th><th>Avisos</th><th></th></tr></thead><tbody>
        ${lista.presupuestos.map((x) => `<tr><td>${linkPac(x.pacienteId, x.paciente, '')}</td><td>${fmtFecha(x.fecha)}${x.odontologo ? ` <span class="dova-nota">${esc(x.odontologo)}</span>` : ''}</td><td>${fmtGs(x.total)}</td>
          <td>${x.dias} día${x.dias === 1 ? '' : 's'}</td><td>${avisos(x)}</td><td>${acciones(x)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">No hay presupuestos esperando respuesta.</p>';
    };
    pintar(l);
    const recargar = () => subCobro(c);
    c.querySelector('[data-solo-hoy]').addEventListener('change', async (e) => { try { pintar(await DOVA.get(`/cobranza/pendientes${e.target.checked ? '?soloHoy=1' : ''}`)); } catch (ex) { X.toast(ex.message, 'error'); } });
    // onclick (no addEventListener): al recargar la pestaña no se suma un segundo manejador.
    c.onclick = async (e) => {
      const env = e.target.closest('[data-cob-enviar]'); const man = e.target.closest('[data-cob-manual]');
      if (env) {
        const [tipo, id] = env.dataset.cobEnviar.split(':'); env.disabled = true;
        try { await DOVA.post(`/cobranza/${tipo}/${id}/enviar`); X.toast('Aviso enviado', 'ok'); recargar(); } catch (ex) { X.toast(ex.message, 'error'); env.disabled = false; }
      } else if (man) {
        const [tipo, id] = man.dataset.cobManual.split(':');
        // La ventana se abre antes del pedido (si no, el navegador la bloquea).
        const w = window.open('', '_blank');
        try { const r = await DOVA.post(`/cobranza/${tipo}/${id}/enlace`); if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url; recargar(); } catch (ex) { if (w) w.close(); X.toast(ex.message, 'error'); }
      }
    };
    const f = c.querySelector('.dova-cob-form');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await DOVA.put('/cobranza/config', { automatico: f.automatico.checked, hora: Number(f.hora.value), diasAntes: Number(f.diasAntes.value), repetirDias: Number(f.repetirDias.value), maxAvisos: Number(f.maxAvisos.value), presupuestos: f.presupuestos.checked, presupuestoDias: Number(f.presupuestoDias.value) });
        X.toast('Configuración guardada', 'ok'); recargar();
      } catch (ex) { X.toast(ex.message, 'error'); }
    });
  }

  async function subDeuda(c) {
    const r = await DOVA.get('/finanzas/antiguedad-deuda');
    const t = r.totales;
    const cols = [
      { t: 'Paciente', v: (f) => linkPac(f.paciente.id, f.paciente.nombre, f.paciente.apellido), csv: (f) => `${f.paciente.nombre} ${f.paciente.apellido}` },
      { t: 'Saldo', v: (f) => `<strong>${fmtGs(f.saldo)}</strong>`, csv: (f) => f.saldo },
      { t: '0–30', v: (f) => (f.tramos['0_30'] ? fmtGs(f.tramos['0_30']) : '-'), csv: (f) => f.tramos['0_30'] },
      { t: '31–60', v: (f) => (f.tramos['31_60'] ? fmtGs(f.tramos['31_60']) : '-'), csv: (f) => f.tramos['31_60'] },
      { t: '61–90', v: (f) => (f.tramos['61_90'] ? fmtGs(f.tramos['61_90']) : '-'), csv: (f) => f.tramos['61_90'] },
      { t: '+90', v: (f) => (f.tramos['90_mas'] ? `<strong style="color:var(--rust)">${fmtGs(f.tramos['90_mas'])}</strong>` : '-'), csv: (f) => f.tramos['90_mas'] },
      { t: 'Último pago', v: (f) => fmtFecha(f.ultimoPago), csv: (f) => f.ultimoPago || '' },
      { t: 'Teléfono', v: (f) => esc(f.paciente.whatsapp || f.paciente.telefono || '-'), csv: (f) => f.paciente.whatsapp || f.paciente.telefono || '' },
    ];
    c.innerHTML = `<div class="dova-ext-kpis">${kpi(fmtGs(t.saldo), 'Total a cobrar')}${kpi(fmtGs(t['0_30']), '0–30 días')}${kpi(fmtGs(t['31_60']), '31–60 días')}${kpi(fmtGs(t['61_90']), '61–90 días', { alerta: t['61_90'] > 0 })}${kpi(fmtGs(t['90_mas']), 'Más de 90 días', { alerta: t['90_mas'] > 0 })}</div>
      <div class="dova-ext-toolbar"><span class="dova-nota">${r.filas.length} paciente(s) con saldo. Pagos imputados primero a las deudas más antiguas.</span><button class="dova-btn-link" data-csv>Descargar lista (Excel)</button></div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr>${cols.map((x) => `<th>${x.t}</th>`).join('')}<th></th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr>${cols.map((x) => `<td>${x.v(f)}</td>`).join('')}<td>${puede('seguimiento.manage', 'whatsapp.send') ? `<button class="dova-btn-link" data-cobrar="${f.paciente.id}" data-monto="${f.saldo}">WhatsApp</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">No hay saldos pendientes.</td></tr>'}</tbody></table></div>`;
    c.querySelector('[data-csv]').addEventListener('click', () => X.descargarCsv(`deudas-${X.hoy()}.csv`, r.filas, cols));
    c.querySelectorAll('[data-cobrar]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const m = await DOVA.post('/seguimiento/mensaje', { pacienteId: Number(b.dataset.cobrar), plantilla: 'cobranza', datos: { monto: Number(b.dataset.monto) } });
        if (!m.whatsapp_link) throw new Error('El paciente no tiene teléfono válido');
        window.open(m.whatsapp_link, '_blank', 'noopener');
        await DOVA.post('/seguimiento/comunicaciones', { pacienteId: Number(b.dataset.cobrar), canal: 'whatsapp', motivo: 'cobranza', resultado: 'enviado', contenido: m.texto });
      } catch (e) { X.toast(e.message, 'error'); }
    }));
  }

  async function subComisiones(c) {
    const gestiona = puede('comisiones.manage');
    const [ods, trats] = await Promise.all([X.opcionesOdontologos(), X.catalogo('tratamientos', '/tratamientos').catch(() => [])]);
    const inicio = `${X.hoy().slice(0, 7)}-01`;
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${inicio}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      ${gestiona ? `<div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${ods.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>` : ''}<button class="dova-btn-secundario">Calcular</button></form>
      <p class="dova-nota">Producción = sesiones realizadas × (precio neto del plan ÷ sesiones). Comisión = producción × % de la regla (específica del tratamiento o general), menos el costo de laboratorio × % general si la regla lo indica.</p>
      <div data-res></div>${gestiona ? '<div data-reglas></div><div data-liq></div>' : ''}`;
    const f = c.querySelector('[data-f]');
    const calcular = async () => {
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
      const r = await DOVA.get(`/finanzas/comisiones?${q}`);
      const res = c.querySelector('[data-res]');
      res.innerHTML = `<table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Sesiones</th><th>Trabajos realizados (Gs.)</th><th>Comisión antes de descontar</th><th>Costo de laboratorio</th><th>Comisión a pagar</th><th></th></tr></thead><tbody>
        ${r.odontologos.map((o, i) => `<tr><td><strong>${esc(o.odontologo)}</strong>${o.sinRegla ? ` ${badge(`${o.sinRegla} sin regla`, 'atencion')}` : ''}</td><td>${o.sesiones}</td><td>${fmtGs(o.produccion)}</td><td>${fmtGs(o.comisionBruta)}</td><td>${o.descuentoLaboratorio ? `− ${fmtGs(o.descuentoLaboratorio)}` : '-'}</td><td><strong>${fmtGs(o.comision)}</strong></td>
          <td class="dova-ext-acciones"><button class="dova-btn-link" data-det="${i}">Detalle</button>${gestiona ? `<button class="dova-btn-link" data-liquidar="${o.odontologoId}">Registrar pago de comisión</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Sin producción en el período.</td></tr>'}</tbody></table>`;
      res.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => {
        const o = r.odontologos[Number(b.dataset.det)];
        X.modal(`Detalle — ${o.odontologo}`, `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Paciente</th><th>Plan</th><th>Valor</th><th>%</th><th>Comisión</th></tr></thead><tbody>${o.detalle.map((d) => `<tr><td>${fmtFecha(d.fecha)}</td><td>${esc(d.paciente)}</td><td>${esc(d.plan)}</td><td>${fmtGs(d.valor)}</td><td>${d.porcentaje}%</td><td>${fmtGs(d.comision)}</td></tr>`).join('')}</tbody></table></div><div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
      }));
      res.querySelectorAll('[data-liquidar]').forEach((b) => b.addEventListener('click', async () => {
        try { await DOVA.post('/finanzas/comisiones/liquidar', { odontologoId: Number(b.dataset.liquidar), desde: f.desde.value, hasta: f.hasta.value }); X.toast('Liquidación generada', 'ok'); cargarLiq(); } catch (e) { X.toast(e.message, 'error'); }
      }));
    };
    const cargarLiq = () => gestiona && X.tablaCrud({
      root: c.querySelector('[data-liq]'), titulo: 'Liquidaciones', endpoint: '/finanzas/comision-liquidaciones', puedeEditar: true,
      columnas: [{ t: 'Odontólogo', v: (r) => esc(r.odontologo_nombre) }, { t: 'Período', v: (r) => `${fmtFecha(r.desde)} → ${fmtFecha(r.hasta)}` }, { t: 'Trabajos realizados', v: (r) => fmtGs(r.produccion) }, { t: 'Comisión', v: (r) => `<strong>${fmtGs(r.comision)}</strong>` }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'pagada' ? 'ok' : r.estado === 'anulada' ? 'critica' : 'atencion') }],
      campos: [{ k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['borrador', 'aprobada', 'pagada', 'anulada']) }],
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
    await calcular();
    if (gestiona) {
      X.tablaCrud({
        root: c.querySelector('[data-reglas]'), titulo: 'Reglas de comisión', endpoint: '/finanzas/comision-reglas', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
        descripcion: 'Una regla general por odontólogo (sin tratamiento) y, si hace falta, reglas específicas por tratamiento que tienen prioridad.',
        columnas: [{ t: 'Odontólogo', v: (r) => esc(r.odontologo_nombre) }, { t: 'Tratamiento', v: (r) => esc(r.tratamiento_nombre || 'General (todos)') }, { t: '%', v: (r) => `${Number(r.porcentaje)}%` }, { t: 'Descuenta laboratorio', v: (r) => (r.descontar_laboratorio ? 'Sí' : 'No') }, { t: 'Activa', v: (r) => (r.activa ? 'Sí' : 'No') }],
        campos: [{ k: 'odontologoId', label: 'Odontólogo', tipo: 'select', req: true, opciones: ods }, { k: 'tratamientoId', label: 'Tratamiento (vacío = general)', tipo: 'select', opciones: trats.map((t) => [t.id, t.nombre]) }, { k: 'porcentaje', label: 'Porcentaje', tipo: 'numero', req: true, min: 0, max: 100 }, { k: 'descontarLaboratorio', label: 'Descontar costo de laboratorio', tipo: 'bool' }, { k: 'activa', label: 'Activa', tipo: 'bool' }],
        valoresNuevo: () => ({ descontarLaboratorio: true, activa: true }),
      });
      cargarLiq();
    }
  }

  async function subRentabilidad(c) {
    const ods = await X.opcionesOdontologos();
    const inicio = `${X.hoy().slice(0, 7)}-01`;
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${inicio}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      <div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${ods.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div><button class="dova-btn-secundario">Calcular</button></form>
      <p class="dova-nota">Lo ganado = sesiones realizadas × (precio neto del plan ÷ sesiones). Se descuentan los insumos usados en cada sesión (a su precio de compra), el laboratorio y la comisión de los odontólogos. El laboratorio no está atado a un tratamiento: por eso aparece por odontólogo y en el total, no en cada tratamiento.</p>
      <div data-res></div>`;
    const f = c.querySelector('[data-f]');
    const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
    const cls = (v) => (v < 0 ? 'dova-ext-neg' : '');
    const calcular = async () => {
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
      const r = await DOVA.get(`/finanzas/rentabilidad?${q}`);
      const t = r.totales;
      c.querySelector('[data-res]').innerHTML = `<div class="dova-ext-kpis">
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.produccion)}</div><div class="dova-ext-kpi-label">Trabajos realizados</div></div>
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.costoInsumos + t.costoLaboratorio + t.comision)}</div><div class="dova-ext-kpi-label">Costos (insumos, laboratorio, comisión)</div></div>
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor ${cls(t.margen)}">${fmtGs(t.margen)}</div><div class="dova-ext-kpi-label">Margen (${pct(t.margenPct)})</div></div></div>
        ${r.avisos.insumosSinPrecio ? `<p class="dova-nota">${r.avisos.insumosSinPrecio} uso${r.avisos.insumosSinPrecio === 1 ? '' : 's'} de insumos sin precio de compra cargado: se contaron a cero. Cargá el precio en Inventario para que el margen sea real.</p>` : ''}
        <h3 class="dova-section-title">Por tratamiento</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Sesiones</th><th>Realizado</th><th>Insumos</th><th>Comisión</th><th>Margen</th><th>%</th></tr></thead><tbody>
          ${r.porTratamiento.map((x) => `<tr><td><strong>${esc(x.tratamiento)}</strong></td><td>${x.sesiones}</td><td>${fmtGs(x.produccion)}</td><td>${fmtGs(x.costoInsumos)}</td><td>${fmtGs(x.comision)}</td><td class="${cls(x.margen)}"><strong>${fmtGs(x.margen)}</strong></td><td>${pct(x.margenPct)}</td></tr>`).join('') || '<tr><td colspan="7" class="dova-vacio">No hay sesiones realizadas en ese período.</td></tr>'}
        </tbody></table></div>
        <h3 class="dova-section-title">Por odontólogo</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Sesiones</th><th>Realizado</th><th>Insumos</th><th>Laboratorio</th><th>Comisión</th><th>Margen</th><th>%</th></tr></thead><tbody>
          ${r.porOdontologo.map((x) => `<tr><td><strong>${esc(x.odontologo)}</strong></td><td>${x.sesiones}</td><td>${fmtGs(x.produccion)}</td><td>${fmtGs(x.costoInsumos)}</td><td>${fmtGs(x.costoLaboratorio)}</td><td>${fmtGs(x.comision)}</td><td class="${cls(x.margen)}"><strong>${fmtGs(x.margen)}</strong></td><td>${pct(x.margenPct)}</td></tr>`).join('') || '<tr><td colspan="8" class="dova-vacio">No hay sesiones realizadas en ese período.</td></tr>'}
        </tbody></table></div>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); calcular().catch((x) => X.toast(x.message, 'error')); });
    await calcular();
  }

  async function subMetas(c) {
    const ods = await X.opcionesOdontologos();
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Mes</label><input type="month" name="periodo" value="${X.hoy().slice(0, 7)}"/></div><button class="dova-btn-secundario">Ver</button></form><div data-prog></div><div data-crud></div>`;
    const f = c.querySelector('[data-f]');
    const cargar = async () => {
      const r = await DOVA.get(`/finanzas/metas-progreso?periodo=${f.periodo.value}`);
      const val = (m, v) => (['produccion', 'cobranza'].includes(m.tipo) ? fmtGs(v) : m.tipo === 'tasa_aceptacion' ? `${v}%` : v);
      c.querySelector('[data-prog]').innerHTML = `<div class="dova-ext-kpis">${r.metas.map((m) => `<div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${m.avancePct ?? 0}%</div><div class="dova-ext-kpi-label">${esc(etiqueta(m.tipo))}${m.odontologo_nombre ? ` — ${esc(m.odontologo_nombre)}` : ''}</div><div class="dova-ext-progreso" role="progressbar" aria-valuenow="${m.avancePct || 0}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(m.avancePct || 0, 100)}%"></span></div><div class="dova-ext-kpi-sub">${val(m, m.actual)} de ${val(m, Number(m.objetivo))}</div></div>`).join('') || '<p class="dova-vacio">No hay metas cargadas para este mes.</p>'}</div>`;
      if (puede('metas.manage')) X.tablaCrud({
        root: c.querySelector('[data-crud]'), titulo: 'Metas del mes', endpoint: '/finanzas/metas', query: `periodo=${f.periodo.value}`, fijos: { periodo: f.periodo.value }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
        columnas: [{ t: 'Tipo', v: (m) => esc(etiqueta(m.tipo)) }, { t: 'Odontólogo', v: (m) => esc(m.odontologo_nombre || 'Toda la clínica') }, { t: 'Objetivo', v: (m) => esc(Number(m.objetivo).toLocaleString('es-PY')) }],
        campos: [{ k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: OPC(['produccion', 'cobranza', 'pacientes_nuevos', 'turnos_atendidos', 'tasa_aceptacion']) }, { k: 'odontologoId', label: 'Odontólogo (vacío = clínica)', tipo: 'select', opciones: ods }, { k: 'objetivo', label: 'Objetivo', tipo: 'numero', req: true }],
        alGuardar: cargar,
      });
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
  }

  function subSeguros(c) {
    c.innerHTML = '<div data-a></div><div data-p></div>';
    const verPlanes = (a) => X.tablaCrud({
      root: c.querySelector('[data-p]'), titulo: `Planes — ${a.nombre}`, endpoint: '/finanzas/planes-cobertura', query: `aseguradoraId=${a.id}`, fijos: { aseguradoraId: a.id }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Plan', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Cobertura general', v: (r) => `${Number(r.cobertura_general)}%` }, { t: 'Por categoría', v: (r) => esc(Object.entries(r.cobertura || {}).map(([k, v]) => `${k}: ${v}%`).join(' · ') || '-') }, { t: 'Tope anual', v: (r) => (r.tope_anual ? fmtGs(r.tope_anual) : '-') }, { t: 'Autorización', v: (r) => (r.requiere_autorizacion ? 'Requiere' : 'No') }],
      campos: [{ k: 'nombre', label: 'Nombre del plan', req: true }, { k: 'coberturaGeneral', label: 'Cobertura general (%)', tipo: 'numero', min: 0, max: 100 }, { k: 'coberturaTexto', label: 'Cobertura por categoría', ancho: 'completo', ayuda: 'Formato: Categoría=porcentaje, separadas por coma. Ej.: Prevención=100, Endodoncia=60, Ortodoncia=0' }, { k: 'topeAnual', label: 'Tope anual (Gs.)', tipo: 'numero' }, { k: 'copagoFijo', label: 'Copago fijo (Gs.)', tipo: 'numero' }, { k: 'requiereAutorizacion', label: 'Requiere autorización previa', tipo: 'bool' }],
      valoresEditar: (r) => ({ ...r, coberturaTexto: Object.entries(r.cobertura || {}).map(([k, v]) => `${k}=${v}`).join(', ') }),
      preparar: (d) => {
        if ('coberturaTexto' in d) {
          d.cobertura = Object.fromEntries((d.coberturaTexto || '').split(',').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v !== undefined && v !== '').map(([k, v]) => [k, Number(v)]));
          delete d.coberturaTexto;
        }
      },
    });
    return X.tablaCrud({
      root: c.querySelector('[data-a]'), titulo: 'Seguros, prepagas y convenios', endpoint: '/finanzas/aseguradoras', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'RUC', v: (r) => esc(r.ruc || '-') }, { t: 'Contacto', v: (r) => esc([r.contacto, r.telefono].filter(Boolean).join(' · ') || '-') }, { t: 'Planes', v: (r) => esc(r.planes) }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['seguro', 'prepaga', 'convenio', 'mutual', 'empresa', 'ips']) }, { k: 'ruc', label: 'RUC' }, { k: 'contacto', label: 'Contacto' }, { k: 'telefono', label: 'Teléfono' }, { k: 'email', label: 'Email' }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      acciones: [{ texto: 'Planes', fn: (r) => verPlanes(r) }],
    });
  }

  async function subListas(c) {
    const [asegs, trats] = await Promise.all([DOVA.get('/finanzas/aseguradoras').catch(() => []), X.catalogo('tratamientos', '/tratamientos').catch(() => [])]);
    c.innerHTML = '<div data-l></div><div data-i></div>';
    const verItems = (l) => X.tablaCrud({
      root: c.querySelector('[data-i]'), titulo: `Precios — ${l.nombre}`, endpoint: '/finanzas/lista-precio-items', query: `listaId=${l.id}`, fijos: { listaId: l.id }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Tratamiento', v: (r) => esc(r.tratamiento_nombre) }, { t: 'Precio base', v: (r) => fmtGs(r.precio_base) }, { t: 'Precio en lista', v: (r) => `<strong>${fmtGs(r.precio)}</strong>` }, { t: 'Diferencia', v: (r) => { const d = Math.round(((r.precio - r.precio_base) / (r.precio_base || 1)) * 100); return `${d > 0 ? '+' : ''}${d}%`; } }],
      campos: [{ k: 'tratamientoId', label: 'Tratamiento', tipo: 'select', req: true, soloCrear: true, opciones: trats.map((t) => [t.id, `${t.nombre} (${fmtGs(t.precio)})`]) }, { k: 'precio', label: 'Precio', tipo: 'numero', req: true }],
    });
    return X.tablaCrud({
      root: c.querySelector('[data-l]'), titulo: 'Listas de precios', endpoint: '/finanzas/listas-precios', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      descripcion: 'Precios diferenciados por convenio o grupo. Se aplican a los pacientes con esa lista asignada, o a los que tienen cobertura de la aseguradora vinculada.',
      columnas: [{ t: 'Lista', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Aseguradora', v: (r) => esc(r.aseguradora_nombre || '-') }, { t: 'Tratamientos', v: (r) => esc(r.items) }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'aseguradoraId', label: 'Aseguradora vinculada', tipo: 'select', opciones: asegs.map((a) => [a.id, a.nombre]) }],
      acciones: [{ texto: 'Precios', fn: (r) => verItems(r) }],
    });
  }

  async function subCierre(c) {
    const r = await DOVA.get('/finanzas/bloqueo-contable');
    c.innerHTML = `<div class="dova-ext-caja"><h4>Cerrar meses ya revisados por el contador</h4><p>Hasta la fecha de cierre (inclusive) nadie puede registrar ajustes ni anular pagos. Usalo cuando el contador cierra un mes.</p>
      <p>Cierre actual: <strong>${r.fechaBloqueo ? fmtFecha(r.fechaBloqueo) : 'sin cierre'}</strong></p>
      <form class="dova-ext-filtros" data-f><div><label>Cerrar hasta</label><input type="date" name="f" max="${X.hoy()}" value="${r.fechaBloqueo || ''}"/></div><button class="dova-btn-primary">Guardar</button><button type="button" class="dova-btn-secundario" data-quitar>Quitar cierre</button></form></div>`;
    const guardar = async (v) => { try { await DOVA.put('/finanzas/bloqueo-contable', { fechaBloqueo: v }); X.toast('Cierre actualizado', 'ok'); subCierre(c); } catch (e) { X.toast(e.message, 'error'); } };
    c.querySelector('[data-f]').addEventListener('submit', (e) => { e.preventDefault(); guardar(e.target.f.value || null); });
    c.querySelector('[data-quitar]').addEventListener('click', () => guardar(null));
  }

  // ================================ INDICADORES ================================
  async function indicadores(root, nav) {
    montar(root, nav);
    const hoy = X.hoy();
    root.innerHTML = `<h2 class="dova-view-title">Estadísticas de la clínica</h2>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${hoy.slice(0, 7)}-01"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${hoy}"/></div>
      <div><label>Período rápido</label><select name="rapido"><option value="">—</option><option value="mes">Este mes</option><option value="3m">Últimos 3 meses</option><option value="anio">Este año</option><option value="12m">Últimos 12 meses</option></select></div><button class="dova-btn-primary">Ver</button></form>
      <div data-k></div><h3 class="dova-section-title">Tendencia mensual (últimos 12 meses)</h3><div class="dova-ext-graficos" data-g></div>`;
    const f = root.querySelector('[data-f]');
    f.rapido.addEventListener('change', () => {
      const v = f.rapido.value; if (!v) return;
      f.hasta.value = hoy;
      f.desde.value = v === 'mes' ? `${hoy.slice(0, 7)}-01` : v === 'anio' ? `${hoy.slice(0, 4)}-01-01` : X.sumarDias(hoy, v === '3m' ? -90 : -365);
    });
    const cargar = async () => {
      const k = await DOVA.get(`/kpis?desde=${f.desde.value}&hasta=${f.hasta.value}`);
      const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
      root.querySelector('[data-k]').innerHTML = `
        <h3 class="dova-section-title">Dinero</h3><div class="dova-ext-kpis">
          ${kpi(fmtGs(k.produccion.total), 'Trabajos realizados (Gs.)')}${kpi(fmtGs(k.cobranza.total), 'Cobrado', { sub: `${k.cobranza.pagos} pagos` })}
          ${kpi(pct(k.cobranza.tasaCobranza), 'Cobrado sobre lo realizado')}${kpi(k.cobranza.ticketPromedio ? fmtGs(k.cobranza.ticketPromedio) : '—', 'Cobro promedio por paciente')}
          ${kpi(k.agenda.produccionPorHora ? fmtGs(k.agenda.produccionPorHora) : '—', 'Ingreso por hora de atención')}</div>
        <h3 class="dova-section-title">Presupuestos</h3><div class="dova-ext-kpis">
          ${kpi(pct(k.presupuestos.tasaAceptacion), 'Presupuestos aceptados', { sub: `${k.presupuestos.aceptados} de ${k.presupuestos.presentados}` })}
          ${kpi(pct(k.presupuestos.tasaAceptacionMonto), 'Presupuestos aceptados (en Gs.)', { sub: `${fmtGs(k.presupuestos.montoAceptado)} de ${fmtGs(k.presupuestos.montoPresentado)}` })}</div>
        <h3 class="dova-section-title">Agenda</h3><div class="dova-ext-kpis">
          ${kpi(k.agenda.atendidos, 'Turnos atendidos', { sub: `de ${k.agenda.turnos} agendados` })}
          ${kpi(pct(k.agenda.tasaInasistencia), 'Pacientes que faltaron', { alerta: k.agenda.tasaInasistencia > 10, sub: `${k.agenda.noAsistio} no vinieron` })}
          ${kpi(pct(k.agenda.tasaCancelacion), 'Turnos cancelados', { sub: k.agenda.cancelacionesTardias !== null ? `${k.agenda.cancelacionesTardias} con < 24 h de aviso` : '' })}
          ${kpi(pct(k.agenda.tasaConfirmacion), 'Turnos confirmados')}
          ${kpi(k.agenda.sinCerrar, 'Turnos pasados sin cerrar', { alerta: k.agenda.sinCerrar > 0, sub: 'marcar atendido o no asistió' })}
          ${kpi(k.agenda.horasAtendidas, 'Horas de atención')}
          ${kpi(k.agenda.esperaPromedioMin !== null ? `${k.agenda.esperaPromedioMin} min` : '—', 'Espera promedio en sala')}
          ${kpi(k.agenda.atencionPromedioMin !== null ? `${k.agenda.atencionPromedioMin} min` : '—', 'Duración real promedio')}</div>
        <h3 class="dova-section-title">Pacientes</h3><div class="dova-ext-kpis">
          ${kpi(k.pacientes.nuevos, 'Pacientes nuevos', { sub: `${k.pacientes.primerasVisitas} primeras visitas atendidas` })}
          ${kpi(k.pacientes.activos, 'Pacientes activos (vinieron en los últimos 18 meses)')}${kpi(k.pacientes.inactivos, 'Pacientes inactivos')}
          ${kpi(pct(k.recalls.tasaAlDia), 'Controles periódicos al día', { sub: `${k.recalls.vencidos} vencidos de ${k.recalls.activos}` })}
          ${k.satisfaccion ? kpi(k.satisfaccion.nps, 'Satisfacción de pacientes', { sub: `${k.satisfaccion.encuestas} encuestas` }) : ''}</div>
        <div class="dova-ext-dos-col">
          <div><h3 class="dova-section-title">Por odontólogo</h3><table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Trabajos realizados</th><th>Atendidos</th><th>Faltaron</th></tr></thead><tbody>
            ${k.agenda.porOdontologo.map((o) => { const p = k.produccion.porOdontologo.find((x) => x.odontologo === o.nombre); return `<tr><td>${esc(o.nombre)}</td><td>${p ? fmtGs(p.produccion) : '-'}</td><td>${o.atendidos}</td><td>${pct(o.tasaInasistencia)}</td></tr>`; }).join('') || '<tr><td colspan="4">Sin datos.</td></tr>'}</tbody></table></div>
          <div><h3 class="dova-section-title">¿Cómo nos conocieron? (nuevos)</h3><table class="dova-tabla"><thead><tr><th>Fuente</th><th>Pacientes</th></tr></thead><tbody>
            ${k.pacientes.porFuente.map((x) => `<tr><td>${esc(etiqueta(x.fuente))}</td><td>${x.cantidad}</td></tr>`).join('') || '<tr><td colspan="2">Sin datos.</td></tr>'}</tbody></table>
            <h3 class="dova-section-title">Tratamientos más realizados</h3><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Sesiones</th></tr></thead><tbody>
            ${k.tratamientosMasRealizados.map((x) => `<tr><td>${esc(x.tratamiento)}</td><td>${x.sesiones}</td></tr>`).join('') || '<tr><td colspan="2">Sin datos.</td></tr>'}</tbody></table></div>
        </div>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
    const serie = await DOVA.get('/kpis/serie-mensual?meses=12');
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const et = serie.map((s) => `${MES[Number(s.periodo.slice(5)) - 1]} ${s.periodo.slice(2, 4)}`);
    const series = [
      { titulo: 'Cobranza', etiquetas: et, valores: serie.map((s) => s.cobranza), formato: 'gs' },
      { titulo: 'Trabajos realizados (Gs.)', etiquetas: et, valores: serie.map((s) => s.produccion), formato: 'gs' },
      { titulo: 'Turnos atendidos', etiquetas: et, valores: serie.map((s) => s.turnosAtendidos) },
      { titulo: 'Pacientes nuevos', etiquetas: et, valores: serie.map((s) => s.pacientesNuevos) },
      { titulo: 'Inasistencias', etiquetas: et, valores: serie.map((s) => s.inasistencias) },
    ];
    const g = root.querySelector('[data-g]');
    g.innerHTML = series.map((s) => X.grafico(s)).join('');
    X.activarGraficos(g, series);
  }

  // ================================ AUDITORÍA ================================
  // ================================ REPORTES ================================
  const FILTRO_UI = {
    odontologoId: (o) => ['Odontólogo', o.odontologos.map((x) => [x.id, `${x.nombre}${x.activo === false ? ' (inactivo)' : ''}`])],
    tratamientoId: (o) => ['Tratamiento', o.tratamientos.map((x) => [x.id, x.nombre])],
    usuarioId: (o) => ['Usuario', o.usuarios.map((x) => [x.id, x.nombre])],
    metodo: (o) => ['Método de pago', Object.entries(o.metodos)],
    estadoPlan: () => ['Estado', OPC(['pendiente', 'aprobado', 'en_proceso', 'finalizado', 'cancelado'])],
    estadoPago: () => ['Estado', [['pagado', 'Cobrado'], ['anulado', 'Anulado']]],
    estadoFactura: () => ['Estado', [['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']]],
  };
  const celda = (v, tipo) => {
    if (v === null || v === undefined || v === '') return '<span class="dova-nota">—</span>';
    if (tipo === 'gs') return fmtGs(v);
    if (tipo === 'pct') return `${String(v).replace('.', ',')} %`;
    if (tipo === 'num') return Number(v).toLocaleString('es-PY');
    if (tipo === 'fecha') return fmtFecha(v);
    return esc(v);
  };
  async function reportes(root, nav, inicial) {
    montar(root, nav);
    const [lista, op] = await Promise.all([DOVA.get('/reportes/centro'), DOVA.get('/reportes/centro-opciones')]);
    const grupos = [...new Set(lista.map((r) => r.grupo))];
    let actual = lista.find((r) => r.clave === inicial) || lista[0];
    const mes = `${X.hoy().slice(0, 8)}01`;
    const st = { desde: mes, hasta: X.hoy() };
    root.innerHTML = `<h2 class="dova-view-title">Reportes</h2>
      <p class="dova-subtitulo">Calculados en el momento con los datos guardados. Elegí un reporte, ajustá los filtros y exportalo si lo necesitás.</p>
      <div class="dova-rep">
        <nav class="dova-rep-menu" aria-label="Reportes">${grupos.map((g) => `<h4>${esc(g)}</h4>${lista.filter((r) => r.grupo === g).map((r) => `<button type="button" data-rep="${r.clave}">${esc(r.titulo)}</button>`).join('')}`).join('')}</nav>
        <label class="dova-rep-select"><span>Reporte</span><select data-rep-select>${grupos.map((g) => `<optgroup label="${esc(g)}">${lista.filter((r) => r.grupo === g).map((r) => `<option value="${r.clave}">${esc(r.titulo)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <section class="dova-rep-cuerpo" data-cuerpo></section>
      </div>`;
    const cuerpo = root.querySelector('[data-cuerpo]');
    const sel = root.querySelector('[data-rep-select]');
    const pintar = async () => {
      root.querySelectorAll('[data-rep]').forEach((b) => b.classList.toggle('activo', b.dataset.rep === actual.clave));
      sel.value = actual.clave;
      cuerpo.innerHTML = `<h3 class="dova-section-title">${esc(actual.titulo)}</h3><p class="dova-nota">${esc(actual.descripcion)}</p>
        <form class="dova-ext-filtros" data-f>
          ${actual.sinPeriodo ? '' : `<div><label>Desde</label><input type="date" name="desde" value="${st.desde}" required/></div><div><label>Hasta</label><input type="date" name="hasta" value="${st.hasta}" required/></div>`}
          ${actual.filtros.map((k) => { const [t, opc] = FILTRO_UI[k](op); return `<div><label>${t}</label><select name="${k}"><option value="">Todos</option>${opc.map(([v, n]) => `<option value="${esc(v)}" ${String(st[k] || '') === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`; }).join('')}
          <button class="dova-btn-primary">Ver</button>
          ${op.puedeExportar ? '<span class="dova-rep-export"><button type="button" class="dova-btn-secundario" data-exp="pdf">PDF</button><button type="button" class="dova-btn-secundario" data-exp="xlsx">Excel</button><button type="button" class="dova-btn-secundario" data-exp="csv">CSV</button></span>' : ''}
        </form><div data-res>${X.cargando}</div>`;
      const f = cuerpo.querySelector('[data-f]');
      const qs = (extra = {}) => { const o = Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v !== '')); Object.assign(st, o); return new URLSearchParams({ ...o, ...extra }).toString(); };
      const cargar = async () => {
        const res = cuerpo.querySelector('[data-res]'); res.innerHTML = X.cargando;
        try {
          const r = await DOVA.get(`/reportes/centro/${actual.clave}?${qs()}`);
          res.innerHTML = `<p class="dova-nota">${r.filas.length} fila(s)${r.sinPeriodo ? '' : ` · ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)}`}</p>
            <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-rep-tabla"><thead><tr>${r.columnas.map((c) => `<th class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
            ${r.filas.slice(0, 1000).map((fl) => `<tr>${r.columnas.map((c) => `<td class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${celda(fl[c.k], c.tipo)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${r.columnas.length}">No hay datos con estos filtros.</td></tr>`}
            </tbody>${r.totales && r.filas.length ? `<tfoot><tr>${r.columnas.map((c, i) => `<td class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${i === 0 ? '<strong>Total</strong>' : r.totales[c.k] !== undefined ? `<strong>${celda(r.totales[c.k], c.tipo)}</strong>` : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>
            ${r.filas.length > 1000 ? '<p class="dova-nota">En pantalla se muestran las primeras 1000 filas; la exportación incluye todas.</p>' : ''}`;
        } catch (e) { res.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
      cuerpo.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', async () => {
        const fmt = b.dataset.exp; b.disabled = true;
        try {
          const r = await DOVA.request(`/reportes/centro/${actual.clave}?${qs({ formato: fmt })}`, { raw: true });
          if (!r.ok) { let m = 'No se pudo exportar'; try { m = (await r.json()).error.message; } catch (_e) { /* */ } throw new Error(m); }
          const u = URL.createObjectURL(await r.blob());
          const a = document.createElement('a'); a.href = u; a.download = `${actual.clave}-${st.desde || ''}-${st.hasta || ''}.${fmt}`; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(u), 2000);
          X.toast('Reporte exportado', 'ok');
        } catch (e) { X.toast(e.message, 'error'); }
        b.disabled = false;
      }));
      await cargar();
    };
    const elegir = (clave) => { actual = lista.find((r) => r.clave === clave) || actual; if (location.hash.startsWith('#reportes')) { try { history.replaceState(null, '', `${location.pathname}${location.search}#reportes/${actual.clave}`); } catch (_e) { /* */ } } pintar(); };
    root.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.rep)));
    sel.addEventListener('change', () => elegir(sel.value));
    await pintar();
  }

  async function auditoria(root, nav) {
    montar(root, nav);
    const usuarios = await X.catalogo('usuarios', '/seguimiento/equipo').catch(() => []);
    root.innerHTML = `<h2 class="dova-view-title">Historial de cambios</h2><p class="dova-subtitulo">Quién hizo qué, cuándo, desde qué IP y con qué resultado. Cada creación, edición, anulación, exportación, ingreso y acceso denegado queda registrado.</p>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${X.sumarDias(X.hoy(), -7)}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      <div><label>Usuario</label><select name="usuarioId"><option value="">Todos</option>${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
      <div><label>Módulo</label><select name="modulo"><option value="">Todos</option></select></div>
      <div><label>Acción</label><select name="accion"><option value="">Todas</option></select></div>
      <div><label>Resultado</label><select name="resultado"><option value="">Todos</option><option value="ok">Correcto</option><option value="denegado">Denegado</option><option value="fallido">Fallido</option></select></div>
      <div><label>ID de paciente</label><input type="number" name="pacienteId"/></div><div><label>Buscar</label><input name="q"/></div>
      <button class="dova-btn-primary">Buscar</button><button type="button" class="dova-btn-secundario" data-csv>Descargar (CSV)</button></form><div data-l></div>`;
    const f = root.querySelector('[data-f]');
    let primera = true;
    const qs = () => new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
    const RES = { ok: ['Correcto', 'ok'], denegado: ['Denegado', 'critica'], fallido: ['Fallido', 'atencion'] };
    const detalleHtml = (d) => {
      if (d && d.antes && d.despues && typeof d.antes === 'object') {
        const claves = [...new Set([...Object.keys(d.antes), ...Object.keys(d.despues)])];
        const v = (x) => esc(x === null || x === undefined ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x));
        const otros = Object.fromEntries(Object.entries(d).filter(([k]) => !['antes', 'despues'].includes(k)));
        return `<table class="dova-tabla"><thead><tr><th>Dato</th><th>Antes</th><th>Después</th></tr></thead><tbody>${claves.map((k) => `<tr class="${JSON.stringify(d.antes[k]) !== JSON.stringify(d.despues[k]) ? 'dova-ext-fila-aviso' : ''}"><td>${esc(etiqueta(k))}</td><td>${v(d.antes[k])}</td><td>${v(d.despues[k])}</td></tr>`).join('')}</tbody></table>
          ${Object.keys(otros).length ? `<pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(otros, null, 2))}</pre>` : ''}`;
      }
      return `<pre style="white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto">${esc(JSON.stringify(d, null, 2))}</pre>`;
    };
    const cargar = async () => {
      const l = root.querySelector('[data-l]'); l.innerHTML = X.cargando;
      const r = await DOVA.get(`/kpis/auditoria?${qs()}`);
      if (primera) {
        f.modulo.innerHTML += r.modulos.map((m) => `<option value="${esc(m)}">${esc(etiqueta(m))}</option>`).join('');
        f.accion.innerHTML += (r.acciones || []).map((m) => `<option value="${esc(m)}">${esc(etiqueta(m))}</option>`).join('');
        primera = false;
      }
      l.innerHTML = `<p class="dova-nota">${r.registros.length} registro(s)${r.registros.length >= 200 ? ' (se muestran los 200 más recientes; la descarga incluye todos)' : ''}.</p>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>Resultado</th><th>IP</th><th>Detalle</th></tr></thead><tbody>
        ${r.registros.map((a, i) => { const rs = RES[a.resultado || 'ok'] || RES.ok; return `<tr class="${a.resultado && a.resultado !== 'ok' ? 'dova-ext-fila-alerta' : ''}"><td>${X.fmtFechaHora(a.creado_en)}</td><td>${esc(a.usuario_nombre || 'sistema')}</td><td>${esc(etiqueta(a.accion))}</td><td>${esc(etiqueta(a.modulo))}</td><td>${esc(a.entidad_id || '-')}</td><td>${badge(rs[0], rs[1])}</td><td><span class="dova-nota">${esc(a.ip || '-')}</span></td><td>${a.detalle ? `<button class="dova-btn-link" data-det="${i}">Ver</button>` : '-'}</td></tr>`; }).join('') || '<tr><td colspan="8">Sin registros.</td></tr>'}</tbody></table></div>`;
      l.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => X.modal('Detalle del registro', `${detalleHtml(r.registros[Number(b.dataset.det)].detalle)}<div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' })));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    root.querySelector('[data-csv]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await DOVA.request(`/kpis/auditoria?${qs()}&formato=csv`, { raw: true });
        if (!r.ok) throw new Error('No se pudo descargar');
        const u = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = u; a.download = `auditoria-${X.hoy()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
      } catch (er) { X.toast(er.message, 'error'); }
      b.disabled = false;
    });
    await cargar();
  }

  // ======================= EXTENSIONES DE VISTAS EXISTENTES =======================
  // Panel: resumen de seguimiento para quien lo puede ver.
  async function extenderDashboard(elMain, nav) {
    await puestaEnMarcha(elMain, nav);
    // El odontólogo ve su propio día; los números de toda la clínica son para recepción y administración.
    if ((DOVA.usuarioActual() || {}).odontologoId) return;
    if (!puede('seguimiento.view', 'recalls.view')) return;
    const lista = elMain.querySelector('[data-para-atender] .dova-atender-lista');
    if (!lista) return;
    let p; try { p = await DOVA.get('/seguimiento/panel'); } catch (_e) { return; }
    const fila = (n, label, sub, nivel) => (n ? `<li><button type="button" class="dova-atender-fila" data-ir-ruta="seguimiento" data-ir-sub-ruta="${sub}"${nivel ? ` data-nivel="${nivel}"` : ''}><span class="dova-atender-txt">${esc(label)}</span><span class="dova-atender-n">${Number(n).toLocaleString('es-PY')}</span></button></li>` : '');
    lista.insertAdjacentHTML('afterbegin', [
      fila(p.turnosSinConfirmar, 'Turnos sin confirmar', 'recordatorios', 'urgente'),
      fila(p.recallsVencidos, 'Controles periódicos atrasados', 'recalls', 'aviso'),
      fila(p.controlesVencidos + p.controlesSemana, 'Controles después de un tratamiento', 'controles', 'aviso'),
      fila(p.tratamientosSinTurno, 'Tratamientos sin turno', 'sinturno', 'aviso'),
      fila(p.cumpleanosHoy, 'Cumpleaños hoy', 'cumpleanos'),
    ].join(''));
  }

  // Mi WhatsApp: cada odontólogo registra su celular para los recordatorios de sus pacientes.
  async function tarjetaMiWhatsapp(elMain) {
    const yo = DOVA.usuarioActual() || {};
    if (!yo.odontologoId || !puede('recordatorios.propios', 'agenda.config')) return;
    let m; try { m = await DOVA.get('/recordatorios/mi-whatsapp'); } catch (_e) { return; }
    const cont = document.createElement('section');
    cont.className = 'dova-mi-whatsapp';
    const pintar = () => {
      const estado = m.whatsapp_envia ? 'Los recordatorios automáticos de tus pacientes salen de tu número.'
        : (m.whatsapp_numero ? 'Con este número podés mandar los recordatorios desde tu celular ("Mandar por mi WhatsApp"). Para que los automáticos salgan de tu número, pedile a la administración que lo conecte a WhatsApp Business.' : 'Todavía no registraste tu número: los recordatorios salen del número de la clínica.');
      cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Mi WhatsApp para recordatorios</h2>
        <p class="dova-nota">${esc(estado)}</p>
        <form class="dova-ext-filtros" data-mi-wa><div><label for="mi-wa-numero">Mi celular</label><input id="mi-wa-numero" type="tel" name="numero" maxlength="30" placeholder="0981 123 456" value="${esc(m.whatsapp_numero || '')}"/></div><button class="dova-btn-primario">Guardar</button></form>`;
      cont.querySelector('[data-mi-wa]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { m = { ...m, ...(await DOVA.put('/recordatorios/mi-whatsapp', { numero: e.target.numero.value.trim() || null })) }; X.toast('Número guardado', 'ok'); pintar(); } catch (ex) { X.toast(ex.message, 'error'); }
      });
    };
    pintar();
    elMain.appendChild(cont);
  }

  // Datos de la clínica (nombre, contacto, horario): los usan los comprobantes, los mensajes y la página web.
  async function tarjetaDatosClinica(elMain) {
    if (!puede('clinica.config.manage')) return;
    let c; try { c = await DOVA.get('/clinica'); } catch (_e) { return; }
    const campos = [['nombre', 'Nombre de la clínica', 'text', 150, true], ['direccion', 'Dirección', 'text', 300], ['telefono', 'Teléfono', 'tel', 40], ['whatsapp', 'WhatsApp', 'tel', 40],
      ['email', 'Email', 'email', 150], ['horario_atencion', 'Horario de atención', 'text', 300], ['ruc', 'RUC', 'text', 40], ['sitio_web', 'Sitio web', 'text', 300], ['instagram', 'Instagram', 'text', 150], ['facebook', 'Facebook', 'text', 150]];
    const cont = document.createElement('section');
    cont.id = 'cfg-clinica'; cont.className = 'dova-cfg-clinica';
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Datos de la clínica</h2>
      <p class="dova-nota">Se usan en los comprobantes, en los mensajes a los pacientes y en la página web.</p>
      <form data-cfg-clinica class="dova-cfg-clinica-form">
        ${campos.map(([k, t, tipo, max, req]) => `<div><label for="cc-${k}">${t}</label><input id="cc-${k}" name="${k}" type="${tipo}" maxlength="${max}" ${req ? 'required' : ''} value="${esc(c[k] || '')}"/></div>`).join('')}
        <label class="dova-check dova-cfg-clinica-web"><input type="checkbox" name="actualizarWeb" checked/> Usar también estos datos de contacto en la página web</label>
        <div class="dova-cfg-clinica-acc"><button class="dova-btn-primary">Guardar datos de la clínica</button></div>
      </form>
      <p class="dova-nota"><button type="button" class="dova-btn-link" data-mostrar-puesta>Mostrar en Inicio la lista de puesta en marcha</button></p>`;
    cont.querySelector('[data-mostrar-puesta]').addEventListener('click', async () => {
      try { await DOVA.put('/clinica/puesta-en-marcha', { oculta: false }); X.toast('Listo: aparece en Inicio mientras falte algo por configurar', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); }
    });
    cont.querySelector('[data-cfg-clinica]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const d = {};
      campos.forEach(([k]) => { d[k] = f[k].value.trim() || null; });
      d.actualizarWeb = f.actualizarWeb.checked;
      const b = f.querySelector('button'); b.disabled = true;
      try { await DOVA.put('/clinica', d); X.toast('Datos de la clínica guardados', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); } finally { b.disabled = false; }
    });
    elMain.appendChild(cont);
  }

  // Inicio: lo que falta configurar para empezar a usar DOVA (solo quien configura la clínica).
  async function puestaEnMarcha(elMain, nav) {
    if (!puede('clinica.config.manage')) return;
    let e; try { e = await DOVA.get('/clinica/puesta-en-marcha'); } catch (_e) { return; }
    if (e.completa || e.oculta) return;
    const cont = document.createElement('section');
    cont.className = 'dova-puesta';
    cont.innerHTML = `<div class="dova-puesta-cab"><h3 class="dova-section-title">Puesta en marcha: ${e.listos} de ${e.total} listos</h3>
        <span><button type="button" class="dova-btn-link" data-ver-puesta aria-expanded="false">Ver todo</button> · <button type="button" class="dova-btn-link" data-ocultar-puesta>Ocultar</button></span></div>
      <div class="dova-puesta-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${e.total}" aria-valuenow="${e.listos}"><span style="width:${Math.round((e.listos / e.total) * 100)}%"></span></div>
      <ul class="dova-puesta-lista">${e.items.map((i) => `<li class="${i.ok ? 'ok' : ''}"${i.ok ? ' hidden' : ''}>
        <span class="dova-puesta-estado">${i.ok ? 'Listo' : (i.opcional ? 'Opcional' : 'Falta')}</span>
        <span class="dova-puesta-texto"><strong>${esc(i.titulo)}</strong> <span class="dova-nota">${esc(i.detalle)}</span></span>
        ${i.ok ? '' : `<button type="button" class="dova-btn-secundario" data-puesta-ir="${esc(i.id)}">Ir</button>`}</li>`).join('')}</ul>`;
    cont.querySelector('[data-ver-puesta]').addEventListener('click', (ev) => {
      const ver = ev.currentTarget.getAttribute('aria-expanded') !== 'true';
      cont.querySelectorAll('.dova-puesta-lista li.ok').forEach((li) => { li.hidden = !ver; });
      ev.currentTarget.setAttribute('aria-expanded', String(ver));
      ev.currentTarget.textContent = ver ? 'Ver solo lo que falta' : 'Ver todo';
    });
    cont.querySelectorAll('[data-puesta-ir]').forEach((b) => b.addEventListener('click', async () => {
      const i = e.items.find((x) => x.id === b.dataset.puestaIr);
      if (i.sub) window.DovaSubPendiente = i.sub;
      try { await nav(i.ruta); } finally { window.DovaSubPendiente = null; }
      if (i.ancla) {
        if (window.DovaVentanas && DovaApp.escritorio && DovaApp.escritorio()) DovaVentanas.desplazarA(i.ruta, i.ancla);
        else setTimeout(() => { const a = document.getElementById(i.ancla); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 900);
      }
    }));
    cont.querySelector('[data-ocultar-puesta]').addEventListener('click', async () => {
      try { await DOVA.put('/clinica/puesta-en-marcha', { oculta: true }); cont.remove(); X.toast('Listo. La podés volver a ver en Configuración → Datos de la clínica.', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); }
    });
    const ancla = elMain.querySelector('.dova-inicio-sub') || elMain.querySelector('.dova-view-title');
    if (ancla) ancla.after(cont); else elMain.prepend(cont);
  }

  // Configuración: Mi WhatsApp, datos de la clínica, tipos de recall y qué tratamiento dispara cada uno.
  // Mensajes automáticos: turno liberado, controles periódicos, encuesta e indicaciones después del tratamiento.
  async function tarjetaMensajes(elMain) {
    if (!puede('clinica.config.manage')) return;
    let m; try { m = await DOVA.get('/mensajes/config'); } catch (_e) { return; }
    const cont = document.createElement('section');
    cont.id = 'cfg-mensajes'; cont.className = 'dova-cfg-mensajes';
    const op = (k, t, d, ej) => `<div class="dova-msg-op"><label class="dova-check"><input type="checkbox" name="${k}" ${m[k] ? 'checked' : ''} ${m.whatsappConectado ? '' : 'disabled'}/> <strong>${t}</strong></label>
      <p class="dova-nota">${d}</p><details><summary>Ver el mensaje</summary><p class="dova-rec-ejemplo">${esc(ej)}</p></details></div>`;
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Mensajes automáticos</h2>
      <p class="dova-nota">${m.whatsappConectado ? 'Salen solos por WhatsApp Business.' : 'Para que salgan solos hace falta conectar WhatsApp Business (docs/WHATSAPP.md). Mientras tanto, los turnos liberados y los controles se mandan a mano con un toque.'} Nunca a quien no acepta WhatsApp ni de noche.</p>
      <form data-cfg-mensajes>
        ${op('listaEspera', 'Ofrecer los turnos liberados a la lista de espera', 'Cuando alguien cancela, el horario se ofrece a los primeros de la lista de espera. El primero que lo toma desde su enlace queda agendado y confirmado.', m.ejemplos.oferta)}
        ${op('controles', 'Avisar los controles periódicos', 'Una semana antes del control (y un recordatorio 3 semanas después si no reservó), con un enlace para elegir día y hora sin cargar datos.', m.ejemplos.control)}
        ${op('encuesta', 'Encuesta después de la atención', 'Al día siguiente: "del 0 al 10, ¿nos recomendarías?". Con 9 o 10 se le pide una reseña en Google; con 6 o menos te avisa para llamarlo. Una vez cada 60 días como máximo.', m.ejemplos.encuesta)}
        ${op('indicaciones', 'Indicaciones después del tratamiento', `Al marcar el turno como atendido, el paciente recibe los cuidados para después (con un enlace para leerlos completos). Se cargan en Tratamientos → editar → "Indicaciones para después"${m.tratamientosConIndicaciones ? ` (hoy ${m.tratamientosConIndicaciones} tratamiento(s) las tienen).` : '. Todavía ningún tratamiento las tiene.'}`, m.ejemplos.indicaciones)}
        <div class="dova-ext-filtros"><div><label for="msg-hora">Hora de envío (controles y encuestas)</label><select id="msg-hora" name="hora">${Array.from({ length: 13 }, (_, i) => i + 8).map((h) => `<option value="${h}" ${m.hora === h ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
          <div style="flex:1;min-width:240px"><label for="msg-resena">Enlace para dejar una reseña en Google</label><input id="msg-resena" name="resenaUrl" type="url" maxlength="500" placeholder="https://g.page/r/…/review" value="${esc(m.resenaUrl || '')}"/></div></div>
        <p class="dova-nota">El enlace de reseña está en tu Perfil de Empresa de Google → "Pedir reseñas".</p>
        <button class="dova-btn-primary">Guardar</button>
      </form>`;
    cont.querySelector('[data-cfg-mensajes]').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try {
        m = await DOVA.put('/mensajes/config', { listaEspera: f.listaEspera.checked, controles: f.controles.checked, encuesta: f.encuesta.checked, indicaciones: f.indicaciones.checked, hora: Number(f.hora.value), resenaUrl: f.resenaUrl.value.trim() || null });
        X.toast('Mensajes automáticos guardados', 'ok');
      } catch (ex) { X.toast(ex.message, 'error'); }
    });
    elMain.appendChild(cont);
  }

  // Guías rápidas (PDF de una página por rol); la del propio rol, primero.
  function tarjetaGuias(elMain) {
    const rol = (DOVA.usuarioActual() || {}).rol || '';
    const guias = [['recepcion', 'Recepción', 'Agenda, pacientes, cobros, caja y mensajes'], ['odontologo', 'Odontólogo', 'Consulta, ficha, presupuesto desde el odontograma y radiografías'], ['administracion', 'Administración', 'Puesta en marcha, usuarios, precios, mensajes y control']];
    const mia = rol === 'admin' ? 'administracion' : rol === 'odontologo' ? 'odontologo' : 'recepcion';
    guias.sort((a, b) => (a[0] === mia ? -1 : b[0] === mia ? 1 : 0));
    const cont = document.createElement('section');
    cont.className = 'dova-guias'; cont.id = 'cfg-guias';
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Guías rápidas</h2>
      <p class="dova-nota">Una página por puesto, para imprimir o tener en el celular.</p>
      <ul class="dova-guias-lista">${guias.map(([k, t, d]) => `<li><a class="dova-btn-link" href="/docs/guias/guia-${k}.pdf" target="_blank" rel="noopener" download>Guía de ${esc(t)} (PDF)</a> <span class="dova-nota">${esc(d)}${k === mia ? ' · la tuya' : ''}</span></li>`).join('')}</ul>`;
    elMain.appendChild(cont);
  }

  async function extenderConfiguracion(elMain) {
    tarjetaGuias(elMain);
    await tarjetaMiWhatsapp(elMain);
    await tarjetaDatosClinica(elMain);
    await tarjetaMensajes(elMain);
    if (window.DovaAvisos) await DovaAvisos.tarjetaResumen(elMain);
    if (window.DovaPlataforma) await DovaPlataforma.tarjetaMiPlan(elMain);
    if (!puede('recalls.manage', 'clinica.config.manage', 'tratamientos.manage')) return;
    const cont = document.createElement('div');
    cont.innerHTML = '<h2 class="dova-view-title" style="margin-top:32px">Controles periódicos</h2><div data-tipos></div><div data-trat></div>';
    elMain.appendChild(cont);
    if (puede('recalls.manage', 'clinica.config.manage')) {
      await X.tablaCrud({
        root: cont.querySelector('[data-tipos]'), titulo: 'Tipos de control', endpoint: '/recalls/tipos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true,
        descripcion: 'Cada tipo define cada cuánto tiene que volver el paciente. El intervalo se puede cambiar por paciente.',
        columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Cada', v: (r) => `${r.intervalo_meses} meses` }, { t: 'Descripción', v: (r) => esc(r.descripcion || '-') }, { t: 'Activo', v: (r) => (r.activo ? 'Sí' : 'No') }],
        campos: [{ k: 'codigo', label: 'Código interno', req: true, soloCrear: true, ayuda: 'Sin espacios, ej. control_blanqueamiento' }, { k: 'nombre', label: 'Nombre', req: true }, { k: 'intervaloMeses', label: 'Intervalo (meses)', tipo: 'numero', req: true, min: 1, max: 60 }, { k: 'descripcion', label: 'Descripción', tipo: 'textarea' }, { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true }],
      });
    }
    if (puede('tratamientos.manage')) {
      const [trats, tipos] = await Promise.all([DOVA.get('/tratamientos'), DOVA.get('/recalls/tipos')]);
      const t = cont.querySelector('[data-trat]');
      t.innerHTML = `<h3 class="dova-section-title">¿Qué tratamiento programa cada control?</h3><p class="dova-nota">Cuando un turno con este tratamiento se marca como atendido (o se finaliza el plan), DOVA agenda solo el próximo control.</p>
        <table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Control que programa</th></tr></thead><tbody>
        ${trats.map((x) => `<tr><td>${esc(x.nombre)}</td><td><select data-trat-recall="${x.id}" style="margin:0"><option value="">— ninguno —</option>${tipos.filter((y) => y.activo).map((y) => `<option value="${y.id}" ${x.recall_tipo_id === y.id ? 'selected' : ''}>${esc(y.nombre)} (${y.intervalo_meses} m)</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
      t.querySelectorAll('[data-trat-recall]').forEach((s) => s.addEventListener('change', async () => {
        try { await DOVA.put(`/tratamientos/${s.dataset.tratRecall}`, { recallTipoId: s.value ? Number(s.value) : null }); X.toast('Guardado', 'ok'); } catch (e) { X.toast(e.message, 'error'); }
      }));
    }
  }

  // Modo consulta: alertas médicas arriba de todo.
  function extenderConsulta(elMain, pacienteId) {
    const cont = document.createElement('div');
    const h = elMain.querySelector('.dova-consulta-header') || elMain.firstElementChild;
    if (h) h.insertAdjacentElement('afterend', cont); else elMain.prepend(cont);
    X.bannerAlertas(Number(pacienteId), cont);
  }

  return { seguimiento, operaciones, finanzas, indicadores, auditoria, reportes, extenderDashboard, extenderConfiguracion, extenderConsulta, enlazarPacientes };
})();
window.DovaSecciones = DovaSecciones;
