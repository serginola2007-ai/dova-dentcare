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
      { id: 'recalls', texto: 'Controles periódicos', visible: puede('recalls.view', 'recalls.manage'), render: subRecalls },
      { id: 'controles', texto: 'Controles después de un tratamiento', render: subControles },
      { id: 'observacion', texto: 'Piezas en observación', render: subObservacion },
      { id: 'sinturno', texto: 'Tratamientos sin turno', visible: puede('planes_tratamiento.view', 'seguimiento.view'), render: subSinTurno },
      { id: 'presupuestos', texto: 'Presupuestos sin respuesta', visible: puede('presupuestos.view'), render: subPresupuestos },
      { id: 'recordatorios', texto: 'Recordatorios de turnos', visible: puede('agenda.view'), render: subRecordatorios },
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
        ${filas.map((r, i) => `<tr>${cols.map((x) => `<td>${x.v(r)}</td>`).join('')}<td class="dova-ext-acciones">${X.linkWhatsapp(r.whatsapp_link)}${puede('recalls.manage') ? `<button class="dova-btn-link" data-contacto="${i}">Registrar contacto</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Nada pendiente con estos filtros. 🎉</td></tr>'}
      </tbody></table></div>`;
      l.querySelectorAll('[data-contacto]').forEach((b) => b.addEventListener('click', () => DovaFicha.modalContactoRecall(filas[Number(b.dataset.contacto)], cargar)));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    c.querySelector('[data-csv]').addEventListener('click', () => X.descargarCsv(`controles-periodicos-${X.hoy()}.csv`, filas, cols));
    await cargar();
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

  async function subRecordatorios(c) {
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Turnos del día</label><input type="date" name="fecha" value="${X.sumarDias(X.hoy(), 1)}"/></div><button class="dova-btn-secundario">Ver</button></form><div data-l></div>`;
    const f = c.querySelector('[data-f]'); const l = c.querySelector('[data-l]');
    const cargar = async () => {
      const filas = await DOVA.get(`/seguimiento/recordatorios-turnos?fecha=${f.fecha.value}`);
      l.innerHTML = `<p class="dova-nota">Abrí el WhatsApp con el mensaje armado, envialo, y marcá "Enviado". Cuando el paciente responda, marcá "Confirmó".</p>
        <table class="dova-tabla"><thead><tr><th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Confirmación</th><th></th></tr></thead><tbody>
        ${filas.map((t) => `<tr><td>${esc(String(t.hora_inicio).slice(0, 5))}</td><td>${linkPac(t.paciente_id, t.nombre, t.apellido)}</td><td>${esc(t.odontologo_nombre || '-')}</td>
          <td>${badge(etiqueta(t.confirmacion), t.confirmacion === 'confirmado' ? 'ok' : t.confirmacion === 'recordatorio_enviado' ? 'info' : 'atencion')}${t.recordado_en ? `<br><span class="dova-nota">enviado ${X.fmtFechaHora(t.recordado_en)}</span>` : ''}</td>
          <td class="dova-ext-acciones">${X.linkWhatsapp(t.whatsapp_link)}<button class="dova-btn-link" data-enviado="${t.id}">Enviado</button><button class="dova-btn-link" data-conf="${t.id}">Confirmó</button><button class="dova-btn-link" data-reprog="${t.id}">Pide reprogramar</button></td></tr>`).join('') || '<tr><td colspan="5">No hay turnos ese día.</td></tr>'}</tbody></table>`;
      l.querySelectorAll('[data-enviado]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post(`/seguimiento/recordatorios-turnos/${b.dataset.enviado}/enviado`, {}); cargar(); }));
      l.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post(`/operaciones/confirmacion/${b.dataset.conf}`, { confirmacion: 'confirmado' }); X.toast('Turno confirmado', 'ok'); cargar(); }));
      l.querySelectorAll('[data-reprog]').forEach((b) => b.addEventListener('click', async () => { await DOVA.post(`/operaciones/confirmacion/${b.dataset.reprog}`, { confirmacion: 'pide_reprogramar' }); cargar(); }));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
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
      <table class="dova-tabla"><thead><tr><th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Estado</th><th>Espera</th><th>Atención</th><th></th></tr></thead><tbody>
      ${filas.map((t) => {
        const estado = t.finalizado_en ? badge('Atendido', 'ok') : t.en_sillon_en ? badge('En el sillón', 'info') : t.llegada_en ? badge('Esperando', 'atencion') : badge(etiqueta(t.estado));
        return `<tr><td>${esc(String(t.hora_inicio).slice(0, 5))}</td><td>${linkPac(t.paciente_id, t.nombre, t.apellido)}</td><td>${esc(t.odontologo_nombre || '-')}${t.sillon_nombre ? `<br><span class="dova-nota">${esc(t.sillon_nombre)}</span>` : ''}</td><td>${estado}</td>
          <td>${t.minutos_esperando != null ? badge(`${t.minutos_esperando} min`, t.minutos_esperando > 20 ? 'critica' : 'atencion') : t.minutos_espera != null ? `${t.minutos_espera} min` : '-'}</td><td>${t.minutos_atencion != null ? `${t.minutos_atencion} min` : '-'}</td>
          <td class="dova-ext-acciones">${puedeMover && !['atendido', 'no_asistio'].includes(t.estado) ? `${!t.llegada_en ? `<button class="dova-btn-link" data-paso="llegada" data-t="${t.id}">Llegó</button>` : ''}${t.llegada_en && !t.en_sillon_en ? `<button class="dova-btn-link" data-paso="sillon" data-t="${t.id}">Pasa al sillón</button>` : ''}${t.en_sillon_en && !t.finalizado_en ? `<button class="dova-btn-link" data-paso="finalizado" data-t="${t.id}">Terminó</button>` : ''}` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="7">No hay turnos hoy.</td></tr>'}</tbody></table>`;
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
    c.innerHTML = `<div class="dova-ext-caja"><div class="dova-ext-fichaje"><span class="dova-ext-estado-grande">${est.estado === 'trabajando' ? '🟢 Trabajando' : est.estado === 'en_pausa' ? '🟡 En pausa' : '⚪ Fuera'}</span>
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
      { id: 'comisiones', texto: 'Comisiones', visible: puede('comisiones.view', 'comisiones.manage'), render: subComisiones },
      { id: 'metas', texto: 'Metas', visible: puede('metas.manage', 'kpis.view', 'comisiones.view'), render: subMetas },
      { id: 'seguros', texto: 'Seguros y convenios', visible: puede('aseguradoras.manage'), render: subSeguros },
      { id: 'listas', texto: 'Listas de precios', visible: puede('listas_precios.manage'), render: subListas },
      { id: 'cierre', texto: 'Cerrar meses', visible: puede('clinica.config.manage'), render: subCierre },
    ]);
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

  async function subMetas(c) {
    const ods = await X.opcionesOdontologos();
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Mes</label><input type="month" name="periodo" value="${X.hoy().slice(0, 7)}"/></div><button class="dova-btn-secundario">Ver</button></form><div data-prog></div><div data-crud></div>`;
    const f = c.querySelector('[data-f]');
    const cargar = async () => {
      const r = await DOVA.get(`/finanzas/metas-progreso?periodo=${f.periodo.value}`);
      const val = (m, v) => (['produccion', 'cobranza'].includes(m.tipo) ? fmtGs(v) : m.tipo === 'tasa_aceptacion' ? `${v}%` : v);
      c.querySelector('[data-prog]').innerHTML = `<div class="dova-ext-kpis">${r.metas.map((m) => `<div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${m.avancePct ?? 0}%</div><div class="dova-ext-kpi-label">${esc(etiqueta(m.tipo))}${m.odontologo_nombre ? ` — ${esc(m.odontologo_nombre)}` : ''}</div><div class="dova-ext-progreso" role="progressbar" aria-valuenow="${m.avancePct || 0}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(m.avancePct || 0, 100)}%"></span></div><div class="dova-ext-kpi-sub">${val(m, m.actual)} de ${val(m, Number(m.objetivo))}</div></div>`).join('') || '<p class="dova-nota">No hay metas cargadas para este mes.</p>'}</div>`;
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
  async function auditoria(root, nav) {
    montar(root, nav);
    const usuarios = await X.catalogo('usuarios', '/seguimiento/equipo').catch(() => []);
    root.innerHTML = `<h2 class="dova-view-title">Historial de cambios</h2><p class="dova-subtitulo">Quién hizo qué y cuándo. Cada creación, edición, borrado, exportación y cambio de estado queda registrado.</p>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${X.sumarDias(X.hoy(), -7)}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      <div><label>Usuario</label><select name="usuarioId"><option value="">Todos</option>${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
      <div><label>Módulo</label><select name="modulo"><option value="">Todos</option></select></div><div><label>ID de paciente</label><input type="number" name="pacienteId"/></div><div><label>Buscar</label><input name="q"/></div><button class="dova-btn-primary">Buscar</button></form><div data-l></div>`;
    const f = root.querySelector('[data-f]');
    let primera = true;
    const cargar = async () => {
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
      const r = await DOVA.get(`/kpis/auditoria?${q}`);
      if (primera) { f.modulo.innerHTML += r.modulos.map((m) => `<option value="${esc(m)}">${esc(etiqueta(m))}</option>`).join(''); primera = false; }
      root.querySelector('[data-l]').innerHTML = `<p class="dova-nota">${r.registros.length} registro(s)${r.registros.length >= 200 ? ' (se muestran los 200 más recientes)' : ''}.</p>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>Detalle</th></tr></thead><tbody>
        ${r.registros.map((a, i) => `<tr><td>${X.fmtFechaHora(a.creado_en)}</td><td>${esc(a.usuario_nombre || 'sistema')}</td><td>${esc(etiqueta(a.accion))}</td><td>${esc(etiqueta(a.modulo))}</td><td>${esc(a.entidad_id || '-')}</td><td>${a.detalle ? `<button class="dova-btn-link" data-det="${i}">Ver</button>` : '-'}</td></tr>`).join('') || '<tr><td colspan="6">Sin registros.</td></tr>'}</tbody></table></div>`;
      root.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => X.modal('Detalle del registro', `<pre style="white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto">${esc(JSON.stringify(r.registros[Number(b.dataset.det)].detalle, null, 2))}</pre><div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' })));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
  }

  // ======================= EXTENSIONES DE VISTAS EXISTENTES =======================
  // Panel: resumen de seguimiento para quien lo puede ver.
  async function extenderDashboard(elMain, nav) {
    if (!puede('seguimiento.view', 'recalls.view')) return;
    let p; try { p = await DOVA.get('/seguimiento/panel'); } catch (_e) { return; }
    const titulo = elMain.querySelector('.dova-view-title');
    const cont = document.createElement('div');
    cont.innerHTML = `<h3 class="dova-section-title">Seguimiento de pacientes</h3><div class="dova-ext-kpis">
      ${kpi(p.recallsVencidos, 'Controles periódicos atrasados', { alerta: p.recallsVencidos > 0, ir: 'recalls' })}
      ${kpi(p.controlesVencidos + p.controlesSemana, 'Controles después de un tratamiento (atrasados o esta semana)', { alerta: p.controlesVencidos > 0, ir: 'controles' })}
      ${kpi(p.tratamientosSinTurno, 'Tratamientos sin turno', { alerta: p.tratamientosSinTurno > 0, ir: 'sinturno' })}
      ${kpi(p.turnosSinConfirmar, 'Turnos sin confirmar', { alerta: p.turnosSinConfirmar > 0, ir: 'recordatorios' })}
      ${p.cumpleanosHoy ? kpi(p.cumpleanosHoy, 'Cumpleaños hoy', { ir: 'cumpleanos' }) : ''}</div>`;
    if (titulo) titulo.insertAdjacentElement('afterend', cont); else elMain.prepend(cont);
    cont.querySelectorAll('[data-ir-sub]').forEach((b) => b.addEventListener('click', () => nav('seguimiento', b.dataset.irSub)));
  }

  // Configuración: tipos de recall y qué tratamiento dispara cada uno.
  async function extenderConfiguracion(elMain) {
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

  return { seguimiento, operaciones, finanzas, indicadores, auditoria, extenderDashboard, extenderConfiguracion, extenderConsulta, enlazarPacientes };
})();
window.DovaSecciones = DovaSecciones;
