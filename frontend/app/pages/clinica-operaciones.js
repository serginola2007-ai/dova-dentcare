/* DOVA — Clínica (Movimientos → Clínica).
   Sala de espera, asistencia del personal, laboratorio, esterilización, equipos,
   sillones y días bloqueados, alertas. Uso: DovaOperaciones.operaciones(contenedor, navegar). */
const DovaOperaciones = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, etiqueta, badge, badgeFecha } = X;
  const { linkPac, montar } = DovaSeccionBase;
  const OPC = (lista) => lista.map((valor) => [valor, etiqueta(valor)]);

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

  return { operaciones };
})();
window.DovaOperaciones = DovaOperaciones;

DovaPantallas.registrar('operaciones', { dibujar: (contenedor, { navegar }) => DovaOperaciones.operaciones(contenedor, navegar) });
