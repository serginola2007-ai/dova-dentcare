/* DOVA — Agenda (Movimientos → Agenda).
   Pestañas: Turnos (vistas Día por odontólogo, Semana, Mes y Lista) y Lista de espera.
   Dar, reprogramar, cancelar y cambiar el estado de un turno. Uso: DovaAgenda.agenda(contenedor, navegar). */
const DovaAgenda = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, toast, puede, hoy, sumarDias, etiqueta, badge, cargando } = X;
  const { campoPacienteHtml, activarBuscadorPaciente, catalogosTurno, confirmar, modalTurno, ESTADO_NIVEL, colorOdo, hora5 } = DovaTurnos;
  const OPC = (lista) => lista.map((valor) => [valor, etiqueta(valor)]);

  // =================================================================
  // AGENDA
  // =================================================================
  async function agenda(root, navegar) {
    root.innerHTML = `<h2 class="dova-view-title">Agenda</h2><div data-subs></div>`;
    // En el celular arranca en "Día" (una semana entera no entra en la pantalla).
    let vista = window.innerWidth < 700 ? 'dia' : 'semana';
    try { vista = localStorage.getItem('dova-agenda-vista') || vista; } catch (_e) { /* sin almacenamiento */ }
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'dia', texto: 'Turnos', visible: true, render: (c) => agendaVista(c, navegar, { fecha: hoy(), vista }) },
      { id: 'espera', texto: 'Lista de espera', visible: puede('lista_espera.manage'), render: (c) => listaEspera(c, navegar) },
    ]);
  }

  // ---- Calendario: vistas Día (columnas por odontólogo), Semana, Mes y Lista ----
  const VISTAS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['lista', 'Lista']];
  const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const diaSemana = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
  const lunesDe = (iso) => sumarDias(iso, -diaSemana(iso));
  const primeroDeMes = (iso) => `${iso.slice(0, 8)}01`;
  const sumarMesesIso = (iso, n) => { const d = new Date(`${primeroDeMes(iso)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const minutos = (h) => { const [a, b] = String(h).split(':'); return Number(a) * 60 + Number(b || 0); };
  const fmtLargo = (iso, opc) => { const t = new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PY', { ...opc, timeZone: 'UTC' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const OCULTOS = ['cancelado', 'reprogramado'];

  function rangoVista(e) {
    const f = e.fecha;
    if (e.vista === 'dia') return [f, f];
    if (e.vista === 'semana') { const l = lunesDe(f); return [l, sumarDias(l, 6)]; }
    if (e.vista === 'mes') { const ini = lunesDe(primeroDeMes(f)); return [ini, sumarDias(ini, 41)]; }
    return [f, e.dias ? sumarDias(f, e.dias - 1) : f];
  }
  function moverFecha(e, dir) {
    if (e.vista === 'semana') return sumarDias(e.fecha, 7 * dir);
    if (e.vista === 'mes') return sumarMesesIso(e.fecha, dir);
    if (e.vista === 'lista') return sumarDias(e.fecha, (e.dias || 1) * dir);
    return sumarDias(e.fecha, dir);
  }
  function tituloVista(e, desde, hasta) {
    if (e.vista === 'dia') return fmtLargo(e.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (e.vista === 'semana') return `${fmtLargo(desde, { day: 'numeric', month: 'short' })} – ${fmtLargo(hasta, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    if (e.vista === 'mes') return fmtLargo(primeroDeMes(e.fecha), { month: 'long', year: 'numeric' });
    return fmtLargo(e.fecha, { weekday: 'long', day: 'numeric', month: 'long' }) + (e.dias ? ' y 6 días más' : '');
  }

  // Estado del paciente en la clínica (llegó / en consulta / terminó).
  const horaIso = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  function flujoTurno(t) {
    if (['cancelado', 'reprogramado', 'no_asistio'].includes(t.estado)) return null;
    if (t.finalizado_en) return ['fin', `Finalizado ${horaIso(t.finalizado_en)}`];
    if (t.en_sillon_en) return ['consulta', `En consulta desde ${horaIso(t.en_sillon_en)}`];
    if (t.llegada_en) return ['espera', `En espera desde ${horaIso(t.llegada_en)}`];
    return null;
  }
  function chipTurno(t, i, odo, { corto } = {}) {
    const fl = flujoTurno(t);
    const clase = `dova-cal-chip dova-cal-${t.estado}${fl ? ` dova-cal-flujo-${fl[0]}` : ''}`;
    const nombre = `${t.paciente_nombre || ''} ${t.paciente_apellido || ''}`.trim();
    const titulo = `${hora5(t.hora_inicio)} · ${nombre} · ${t.tratamiento_nombre || t.motivo || ''} · ${t.odontologo_nombre} · ${fl ? fl[1] : etiqueta(t.estado)}`;
    return `<button type="button" class="${clase}" data-turno="${i}" style="--c:${colorOdo(odo)}" title="${esc(titulo)}">
      <strong>${hora5(t.hora_inicio)}</strong>${fl && fl[0] !== 'fin' ? ` <em class="dova-cal-flujo" title="${esc(fl[1])}">${fl[0] === 'espera' ? 'en espera' : 'en consulta'}</em>` : ''}${t.origen === 'web' ? ' <em class="dova-cal-web" title="Reservado desde la página web">web</em>' : ''} ${esc(corto ? (t.paciente_nombre || '') : nombre)}${!corto && (t.tratamiento_nombre || t.motivo) ? `<span>${esc(t.tratamiento_nombre || t.motivo)}</span>` : ''}
    </button>`;
  }

  async function agendaVista(c, navegar, estado) {
    const { odos } = await catalogosTurno();
    const e = { vista: 'semana', ...estado };
    try { localStorage.setItem('dova-agenda-vista', e.vista); } catch (_e) { /* sin almacenamiento */ }
    const [desde, hasta] = rangoVista(e);
    const q = new URLSearchParams({ desde, hasta });
    if (e.odontologoId) q.set('odontologoId', e.odontologoId);
    const todos = await DOVA.get(`/agenda?${q}`);
    const turnos = todos.filter((t) => (e.estadoFiltro ? (e.estadoFiltro === 'todos' || t.estado === e.estadoFiltro) : !OCULTOS.includes(t.estado)));
    const odoPorId = Object.fromEntries(odos.map((o) => [o.id, o]));
    const activos = turnos.filter((t) => !OCULTOS.includes(t.estado)).length;
    const puedeCrear = puede('agenda.create');
    const recargar = (cambios = {}) => agendaVista(c, navegar, { ...e, ...cambios });
    X.vivo(c, ['turnos', 'pacientes', 'odontologos'], () => recargar());

    c.innerHTML = `
      <div class="dova-toolbar dova-op-toolbar">
        <div class="dova-op-nav">
          <button class="dova-btn-secundario" data-mover="-1" title="Anterior" aria-label="Anterior">◀</button>
          <button class="dova-btn-secundario" data-hoy>Hoy</button>
          <button class="dova-btn-secundario" data-mover="1" title="Siguiente" aria-label="Siguiente">▶</button>
          <input type="date" value="${e.fecha}" data-fecha aria-label="Ir a la fecha" />
          <div class="dova-cal-vistas" role="group" aria-label="Vista">${VISTAS.map(([v, t]) => `<button type="button" class="${v === e.vista ? 'activo' : ''}" data-vista="${v}" aria-pressed="${v === e.vista}">${t}</button>`).join('')}</div>
          ${e.vista === 'lista' ? `<select data-rango aria-label="Rango"><option value="">Solo ese día</option><option value="7" ${e.dias === 7 ? 'selected' : ''}>7 días</option></select>` : ''}
          <select data-odo aria-label="Odontólogo"><option value="">Todos los odontólogos</option>${odos.map((o) => `<option value="${o.id}" ${String(o.id) === String(e.odontologoId || '') ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>
          <select data-est aria-label="Estado"><option value="">Turnos activos</option>${['reservado', 'confirmado', 'atendido', 'no_asistio', 'cancelado', 'reprogramado'].map((x) => `<option value="${x}" ${e.estadoFiltro === x ? 'selected' : ''}>${esc(etiqueta(x))}</option>`).join('')}<option value="todos" ${e.estadoFiltro === 'todos' ? 'selected' : ''}>Todos (incluye cancelados)</option></select>
        </div>
        ${puedeCrear ? '<button class="dova-btn-primary" data-nuevo-turno>+ Nuevo turno</button>' : ''}
      </div>
      <div class="dova-cal-cabecera"><h3 class="dova-section-title" style="margin:0">${esc(tituloVista(e, desde, hasta))}</h3>
        <span class="dova-nota">${activos} turno${activos === 1 ? '' : 's'}${puedeCrear && e.vista !== 'mes' && e.vista !== 'lista' ? ' · tocá un espacio libre para dar un turno' : ''}</span></div>
      <div class="dova-cal-leyenda">${odos.filter((o) => !e.odontologoId || String(o.id) === String(e.odontologoId)).map((o) => `<span><i style="background:${colorOdo(o)}"></i>${esc(o.nombre)}</span>`).join('')}</div>
      <div data-cal></div>`;

    const cal = c.querySelector('[data-cal]');
    if (e.vista === 'lista') await listaTurnos(cal, navegar, e, turnos, () => recargar());
    else if (e.vista === 'mes') cal.innerHTML = htmlMes(e, desde, turnos, odoPorId);
    else cal.innerHTML = htmlGrilla(e, desde, turnos, odos, odoPorId);

    c.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => recargar({ fecha: moverFecha(e, Number(b.dataset.mover)) })));
    c.querySelector('[data-hoy]').addEventListener('click', () => recargar({ fecha: hoy() }));
    c.querySelector('[data-fecha]').addEventListener('change', (ev) => ev.target.value && recargar({ fecha: ev.target.value }));
    c.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => recargar({ vista: b.dataset.vista })));
    const rango = c.querySelector('[data-rango]');
    if (rango) rango.addEventListener('change', (ev) => recargar({ dias: ev.target.value ? Number(ev.target.value) : 0 }));
    c.querySelector('[data-odo]').addEventListener('change', (ev) => recargar({ odontologoId: ev.target.value }));
    c.querySelector('[data-est]').addEventListener('change', (ev) => recargar({ estadoFiltro: ev.target.value }));
    const bn = c.querySelector('[data-nuevo-turno]');
    if (bn) bn.addEventListener('click', () => modalTurno({ fijo: { fecha: e.vista === 'semana' || e.vista === 'mes' ? (desde <= hoy() && hoy() <= hasta ? hoy() : e.fecha) : e.fecha, odontologoId: e.odontologoId }, alGuardar: () => recargar() }));
    // Calendario: tocar un turno abre su detalle; tocar un espacio libre da un turno ahí.
    cal.querySelectorAll('[data-turno]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); detalleTurno(turnos[Number(b.dataset.turno)], navegar, () => recargar()); }));
    if (puedeCrear) cal.querySelectorAll('[data-slot]').forEach((s) => s.addEventListener('click', (ev) => {
      if (ev.target !== s) return;
      const [fecha, hora, odontologoId] = s.dataset.slot.split('|');
      modalTurno({ fijo: { fecha, hora, odontologoId: odontologoId || e.odontologoId }, alGuardar: () => recargar() });
    }));
    cal.querySelectorAll('[data-ir-dia]').forEach((b) => b.addEventListener('click', (ev) => { if (ev.target.closest('[data-turno]')) return; recargar({ vista: 'dia', fecha: b.dataset.irDia }); }));
  }

  // Grilla por horas. Semana: una columna por día. Día: una columna por odontólogo.
  function htmlGrilla(e, desde, turnos, odos, odoPorId) {
    let columnas;
    if (e.vista === 'dia') {
      // Una columna por odontólogo (o solo el filtrado).
      const lista = e.odontologoId ? odos.filter((o) => String(o.id) === String(e.odontologoId)) : odos;
      columnas = lista.map((o) => ({ fecha: e.fecha, odo: o, titulo: esc(o.nombre), color: colorOdo(o) }));
      if (!columnas.length) columnas = [{ fecha: e.fecha, titulo: 'Turnos' }];
    } else {
      const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));
      const hayDomingo = turnos.some((t) => String(t.fecha).slice(0, 10) === dias[6]);
      columnas = (hayDomingo ? dias : dias.slice(0, 6)).map((d) => ({ fecha: d, titulo: `<button type="button" class="dova-cal-dia-btn" data-ir-dia="${d}">${DIAS_CORTOS[diaSemana(d)]} <b>${Number(d.slice(8))}</b></button>` }));
    }
    const enCol = (col) => turnos.filter((t) => String(t.fecha).slice(0, 10) === col.fecha && (!col.odo || t.odontologo_id === col.odo.id));
    // Rango horario: 8 a 19 h, ampliado si hay turnos antes o después.
    let hIni = 8; let hFin = 19;
    turnos.forEach((t) => { const m = minutos(t.hora_inicio); hIni = Math.min(hIni, Math.floor(m / 60)); hFin = Math.max(hFin, Math.ceil((m + (t.duracion_minutos || 30)) / 60)); });
    hFin = Math.min(hFin, 24);
    const horas = []; for (let h = hIni; h < hFin; h++) horas.push(h);
    const h = hoy();
    const minAhora = minutos(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    const cols = `56px repeat(${columnas.length}, minmax(${e.vista === 'dia' ? 180 : 120}px, 1fr))`;
    let html = `<div class="dova-cal-scroll"><div class="dova-cal-grilla" style="grid-template-columns:${cols}">`;
    html += '<div class="dova-cal-esquina"></div>';
    columnas.forEach((col) => { html += `<div class="dova-cal-col-titulo ${col.fecha === h && e.vista !== 'dia' ? 'hoy' : ''}" ${col.color ? `style="border-top:3px solid ${col.color}"` : ''}>${col.titulo}</div>`; });
    horas.forEach((hr) => {
      const hh = `${String(hr).padStart(2, '0')}:00`;
      html += `<div class="dova-cal-hora">${hh}</div>`;
      columnas.forEach((col) => {
        const enHora = enCol(col).filter((t) => Math.floor(minutos(t.hora_inicio) / 60) === hr).sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
        const esAhora = col.fecha === h && Math.floor(minAhora / 60) === hr;
        html += `<div class="dova-cal-celda ${col.fecha === h ? 'hoy' : ''} ${esAhora ? 'ahora' : ''}" data-slot="${col.fecha}|${hh}|${col.odo ? col.odo.id : ''}">${enHora.map((t) => chipTurno(t, turnos.indexOf(t), odoPorId[t.odontologo_id])).join('')}</div>`;
      });
    });
    return `${html}</div></div>`;
  }

  function htmlMes(e, desde, turnos, odoPorId) {
    const mes = e.fecha.slice(0, 7); const h = hoy();
    let html = `<div class="dova-cal-scroll"><div class="dova-cal-mes">${DIAS_CORTOS.map((d) => `<div class="dova-cal-mes-dia">${d}</div>`).join('')}`;
    for (let i = 0; i < 42; i++) {
      const d = sumarDias(desde, i);
      if (i === 35 && d.slice(0, 7) !== mes) break; // sexta semana solo si hace falta
      const delDia = turnos.filter((t) => String(t.fecha).slice(0, 10) === d).sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
      html += `<div class="dova-cal-mes-celda ${d.slice(0, 7) !== mes ? 'fuera' : ''} ${d === h ? 'hoy' : ''}" data-ir-dia="${d}" title="Ver el día">
        <div class="dova-cal-mes-num">${Number(d.slice(8))}</div>
        ${delDia.slice(0, 3).map((t) => chipTurno(t, turnos.indexOf(t), odoPorId[t.odontologo_id], { corto: true })).join('')}
        ${delDia.length > 3 ? `<div class="dova-cal-mas">+${delDia.length - 3} más</div>` : ''}
      </div>`;
    }
    return `${html}</div></div>`;
  }

  // Cambiar el estado de un turno (con confirmación si es cancelar / no asistió).
  async function cambiarEstadoTurno(t, nuevo, alTerminar) {
    if (['cancelado', 'no_asistio'].includes(nuevo)) {
      const ok = await confirmar(nuevo === 'cancelado' ? '¿Cancelar el turno?' : '¿Marcar que no asistió?', `${esc(t.paciente_nombre)} ${esc(t.paciente_apellido || '')} — ${fmtFecha(t.fecha)} ${hora5(t.hora_inicio)}`, nuevo === 'cancelado' ? 'Cancelar turno' : 'No asistió');
      if (!ok) return;
    }
    try { await DOVA.patch(`/agenda/${t.id}/estado`, { estado: nuevo }); toast('Turno actualizado', 'ok'); alTerminar(); } catch (ex) { toast(ex.message, 'error'); }
  }

  // Detalle de un turno tocado en el calendario, con todas sus acciones.
  function detalleTurno(t, navegar, alTerminar) {
    const editable = puede('agenda.edit') && ['reservado', 'confirmado'].includes(t.estado);
    X.modal(`${hora5(t.hora_inicio)} · ${t.paciente_nombre} ${t.paciente_apellido || ''}`, `
      <div class="dova-cal-detalle">
        <p>${badge(etiqueta(t.estado), ESTADO_NIVEL[t.estado] || 'info')} ${flujoTurno(t) ? badge(flujoTurno(t)[1], flujoTurno(t)[0] === 'fin' ? 'ok' : 'atencion') : ''} ${t.primera_vez ? badge('1ª vez', 'info') : ''} ${t.origen === 'web' ? badge('Reservado desde la página web', 'info') : ''}</p>
        <p><strong>${fmtLargo(String(t.fecha).slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })}</strong>, ${hora5(t.hora_inicio)} (${t.duracion_minutos} min)</p>
        <p>${esc(t.odontologo_nombre)}${t.sillon_nombre ? ` · ${esc(t.sillon_nombre)}` : ''}</p>
        <p>${esc(t.tratamiento_nombre || t.motivo || 'Sin tratamiento indicado')}</p>
        ${t.paciente_telefono ? `<p class="dova-nota">Tel. ${esc(t.paciente_telefono)}</p>` : ''}
        ${t.observaciones ? `<p class="dova-nota">${esc(t.observaciones)}</p>` : ''}
        ${t.estado === 'atendido' && t.tratamiento_id ? '<div data-indicaciones></div>' : ''}
        <div data-ctx-detalle></div>
      </div>
      <div class="dova-modal-actions dova-cal-acciones">
        <button class="dova-btn-secundario" data-d="ficha">Ver ficha</button>
        ${puede('agenda.edit') && ['reservado', 'confirmado'].includes(t.estado) && !t.llegada_en && String(t.fecha).slice(0, 10) === hoy() ? '<button class="dova-btn-secundario" data-d="llego">Llegó (en espera)</button>' : ''}
        ${DOVA.tienePermiso('historia_clinica.edit') && !['cancelado', 'no_asistio'].includes(t.estado) ? '<button class="dova-btn-primary" data-d="consulta">Iniciar consulta</button>' : ''}
        ${editable ? `
          ${t.estado === 'reservado' ? '<button class="dova-btn-secundario" data-d="confirmado">Confirmar</button>' : ''}
          <button class="dova-btn-secundario" data-d="reprogramar">Reprogramar</button>
          <button class="dova-btn-secundario" data-d="no_asistio">No asistió</button>
          <button class="dova-btn-secundario dova-ext-peligro" data-d="cancelado">Cancelar turno</button>
          <button class="dova-btn-primary" data-d="atendido">Atendido</button>` : '<button class="dova-btn-primary" data-cerrar-modal>Cerrar</button>'}
      </div>`, { ancho: 'ancho' });
    const box = document.querySelector('.dova-modal-box');
    const ctx = box.querySelector('[data-ctx-detalle]');
    DOVA.get(`/agenda/${t.id}/contexto-clinico`).then((r) => { ctx.innerHTML = DovaTurnos.contextoClinicoHtml(r); }).catch(() => { ctx.innerHTML = ''; });
    if (window.DovaAvisos) DovaAvisos.botonIndicaciones(box.querySelector('[data-indicaciones]'), t.id);
    box.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.d;
      X.cerrarModal();
      if (a === 'ficha') return navegar('paciente', t.paciente_id);
      if (a === 'consulta') return navegar('consulta', `${t.paciente_id}/t${t.id}`);
      if (a === 'reprogramar') return modalTurno({ turno: t, alGuardar: alTerminar });
      if (a === 'llego') return DOVA.post(`/operaciones/flujo/${t.id}/llegada`, {}).then(() => { toast('Paciente en sala de espera', 'ok'); alTerminar(); }).catch((e) => toast(e.message, 'error'));
      return cambiarEstadoTurno(t, a, alTerminar);
    }));
  }

  // Vista "Lista": tabla con acciones directas y contexto clínico desplegable.
  async function listaTurnos(c, navegar, e, turnos, recargar) {
    const puedeEditar = puede('agenda.edit');
    c.innerHTML = `
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla">
        <thead><tr><th></th>${e.dias ? '<th>Fecha</th>' : ''}<th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Tratamiento / motivo</th><th>Sillón</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${turnos.map((t, i) => `
          <tr class="${['cancelado', 'no_asistio', 'reprogramado'].includes(t.estado) ? 'dova-op-fila-apagada' : ''}">
            <td><button class="dova-btn-link" data-expandir="${i}" title="Contexto clínico">▸</button></td>
            ${e.dias ? `<td>${fmtFecha(t.fecha)}</td>` : ''}
            <td>${hora5(t.hora_inicio)} <span class="dova-nota">${t.duracion_minutos}′</span></td>
            <td><button class="dova-btn-link" data-ficha="${t.paciente_id}">${esc(t.paciente_nombre)} ${esc(t.paciente_apellido || '')}</button>${t.primera_vez ? ` ${badge('1ª vez', 'info')}` : ''}</td>
            <td>${esc(t.odontologo_nombre)}</td>
            <td>${esc(t.tratamiento_nombre || t.motivo || '-')}</td>
            <td>${esc(t.sillon_nombre || '-')}</td>
            <td>${badge(etiqueta(t.estado), ESTADO_NIVEL[t.estado] || 'info')}${t.confirmacion && t.confirmacion !== 'sin_confirmar' && t.estado === 'reservado' ? ` <span class="dova-nota">${esc(etiqueta(t.confirmacion))}</span>` : ''}</td>
            <td class="dova-ext-acciones">
              ${puedeEditar && ['reservado', 'confirmado'].includes(t.estado) ? `
                ${t.estado === 'reservado' ? `<button class="dova-btn-link" data-estado="confirmado" data-i="${i}">Confirmar</button>` : ''}
                <button class="dova-btn-link" data-estado="atendido" data-i="${i}">Atendido</button>
                <button class="dova-btn-link" data-reprogramar="${i}">Reprogramar</button>
                <button class="dova-btn-link" data-estado="no_asistio" data-i="${i}">No asistió</button>
                <button class="dova-btn-link dova-ext-peligro" data-estado="cancelado" data-i="${i}">Cancelar</button>` : ''}
              ${DOVA.tienePermiso('historia_clinica.edit') && !['cancelado', 'no_asistio'].includes(t.estado) ? `<button class="dova-btn-link" data-consulta="${t.paciente_id}/t${t.id}">Iniciar consulta</button>` : ''}
            </td>
          </tr>
          <tr data-ctx="${i}" style="display:none"><td colspan="${e.dias ? 9 : 8}"></td></tr>`).join('') || `<tr><td colspan="${e.dias ? 9 : 8}">Sin turnos ${e.dias ? 'en esos días' : 'ese día'}.</td></tr>`}
        </tbody></table></div>`;
    c.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.ficha)));
    c.querySelectorAll('[data-consulta]').forEach((b) => b.addEventListener('click', () => navegar('consulta', b.dataset.consulta)));
    c.querySelectorAll('[data-reprogramar]').forEach((b) => b.addEventListener('click', () => modalTurno({ turno: turnos[Number(b.dataset.reprogramar)], alGuardar: recargar })));
    c.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', () => cambiarEstadoTurno(turnos[Number(b.dataset.i)], b.dataset.estado, recargar)));
    c.querySelectorAll('[data-expandir]').forEach((b) => b.addEventListener('click', async () => {
      const i = b.dataset.expandir;
      const fila = c.querySelector(`[data-ctx="${i}"]`);
      if (fila.style.display !== 'none') { fila.style.display = 'none'; b.textContent = '▸'; return; }
      fila.style.display = ''; b.textContent = '▾';
      const celda = fila.querySelector('td');
      celda.innerHTML = cargando;
      try { celda.innerHTML = DovaTurnos.contextoClinicoHtml(await DOVA.get(`/agenda/${turnos[i].id}/contexto-clinico`)); } catch (ex) { celda.innerHTML = `<p class="dova-error-text">${esc(ex.message)}</p>`; }
    }));
  }

  async function listaEspera(c, navegar) {
    const { odos, trats } = await catalogosTurno();
    const [filas, of] = await Promise.all([DOVA.get('/clinico/lista-espera'), DOVA.get('/mensajes/ofertas').catch(() => ({ ofertas: [] }))]);
    const PRIO = { alta: 'critica', media: 'atencion', baja: 'info' };
    const ESTADO_OF = { abierta: ['Disponible', 'atencion'], tomada: ['Tomado', 'ok'], vencida: ['Pasó la fecha', 'info'], cancelada: ['Cerrado', 'info'] };
    // Turnos que se liberaron (cancelaciones) y se ofrecen a la lista de espera.
    const panelOfertas = of.ofertas.length ? `<section class="dova-ofertas"><h3 class="dova-section-title">Turnos liberados</h3>
      <p class="dova-nota">Cuando se cancela un turno, se ofrece a la lista de espera${of.whatsappConectado ? ' (por WhatsApp, solo, si está activado en Configuración → Mensajes automáticos)' : ''}. El primero que lo toma desde su enlace queda agendado y confirmado.</p>
      ${of.ofertas.map((o) => `<div class="dova-oferta">
        <div class="dova-oferta-cab"><strong>${fmtFecha(o.fecha)} ${esc(o.hora)}</strong> · ${esc(o.odontologo)} ${badge(ESTADO_OF[o.estado][0], ESTADO_OF[o.estado][1])}
          ${o.tomadoPor ? `<span class="dova-nota">— lo tomó ${esc(o.tomadoPor)}</span>` : ''}
          ${o.estado === 'abierta' ? `<button class="dova-btn-link" data-cerrar-oferta="${o.id}">Ya lo resolví</button>` : ''}</div>
        ${o.estado === 'abierta' ? (o.candidatos.length ? `<ul class="dova-oferta-lista">${o.candidatos.map((p) => `<li><span>${esc(p.nombre)}</span> ${badge(etiqueta(p.prioridad || 'media'), PRIO[p.prioridad] || 'info')}
          ${p.enviado ? `<span class="dova-nota">Ofrecido ${fmtFecha(p.enviado.creado_en)}${p.enviado.canal === 'whatsapp_manual' ? ' (a mano)' : ''}</span>` : ''}
          ${p.noEnviable ? `<span class="dova-nota">${esc(p.noEnviable)}</span>` : (p.enviado ? '' : `<button class="dova-btn-link dova-link-wa" data-ofrecer="${o.id}:${p.pacienteId}">Ofrecer por mi WhatsApp</button>`)}</li>`).join('')}</ul>` : '<p class="dova-nota">Nadie en la lista de espera para este horario.</p>') : ''}
      </div>`).join('')}</section>` : '';
    c.innerHTML = `${panelOfertas}
      <div class="dova-toolbar"><p class="dova-nota" style="margin:0">Pacientes que quieren un turno antes. Cuando se libera un horario, llamalos y asignales el turno.</p>
      <button class="dova-btn-primary" data-nuevo>+ Agregar a la lista</button></div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Desde</th><th>Paciente</th><th>Tratamiento</th><th>Odontólogo</th><th>Preferencia</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead><tbody>
      ${filas.map((r, i) => `<tr class="${['asignado', 'cancelado'].includes(r.estado) ? 'dova-op-fila-apagada' : ''}">
        <td>${fmtFecha(r.creado_en)}</td>
        <td><button class="dova-btn-link" data-ficha="${r.paciente_id}">${esc(r.paciente_nombre || '')} ${esc(r.paciente_apellido || '')}</button><br><span class="dova-nota">${esc(r.paciente_telefono || '')}</span></td>
        <td>${esc(r.tratamiento_nombre || '-')}</td><td>${esc(r.odontologo_nombre || '-')}</td>
        <td>${esc([r.preferencia_dia, r.preferencia_horario].filter(Boolean).join(' · ') || '-')}</td>
        <td>${badge(etiqueta(r.prioridad || 'media'), PRIO[r.prioridad] || 'info')}</td>
        <td>${esc(etiqueta(r.estado))}</td>
        <td class="dova-ext-acciones">${['esperando', 'contactado'].includes(r.estado) ? `
          ${r.estado === 'esperando' ? `<button class="dova-btn-link" data-est="contactado" data-i="${i}">Contactado</button>` : ''}
          ${puede('agenda.create') ? `<button class="dova-btn-link" data-asignar="${i}">Dar turno</button>` : ''}
          <button class="dova-btn-link dova-ext-peligro" data-est="cancelado" data-i="${i}">Quitar</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8">La lista de espera está vacía.</td></tr>'}
      </tbody></table></div>`;
    const recargar = () => listaEspera(c, navegar);
    X.vivo(c, ['lista_espera', 'turnos'], recargar);
    c.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.ficha)));
    c.querySelector('[data-nuevo]').addEventListener('click', () => {
      const form = X.modalForm('Agregar a la lista de espera', [
        { k: 'tratamientoId', label: 'Tratamiento', tipo: 'select', opciones: trats.map((t) => [t.id, t.nombre]) },
        { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: odos.map((o) => [o.id, o.nombre]) },
        { k: 'preferenciaDia', label: 'Días preferidos', max: 60 },
        { k: 'preferenciaHorario', label: 'Horario preferido', max: 60 },
        { k: 'prioridad', label: 'Prioridad', tipo: 'select', req: true, opciones: OPC(['alta', 'media', 'baja']) },
        { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
      ], { prioridad: 'media' }, async (d, fm) => {
        const pacienteId = Number(fm.querySelector('[data-pac-id]').value);
        if (!pacienteId) throw new Error('Elegí el paciente de la lista');
        await DOVA.post('/clinico/lista-espera', { ...d, pacienteId, tratamientoId: d.tratamientoId ? Number(d.tratamientoId) : undefined, odontologoId: d.odontologoId ? Number(d.odontologoId) : undefined });
        toast('Agregado a la lista de espera', 'ok'); recargar();
      }, { ancho: 'ancho' });
      form.insertAdjacentHTML('afterbegin', campoPacienteHtml());
      activarBuscadorPaciente(form);
    });
    c.querySelectorAll('[data-ofrecer]').forEach((b) => b.addEventListener('click', async () => {
      const [oid, pid] = b.dataset.ofrecer.split(':');
      const w = window.open('', '_blank'); // antes del pedido: si no, el navegador la bloquea
      try { const r = await DOVA.post(`/mensajes/ofertas/${oid}/ofrecer/${pid}`); if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url; recargar(); } catch (e) { if (w) w.close(); toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-cerrar-oferta]').forEach((b) => b.addEventListener('click', async () => {
      try { await DOVA.post(`/mensajes/ofertas/${b.dataset.cerrarOferta}/cancelar`); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    const cambiar = async (r, est) => { await DOVA.patch(`/clinico/lista-espera/${r.id}/estado`, { estado: est }); };
    c.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
      try { await cambiar(filas[Number(b.dataset.i)], b.dataset.est); toast('Actualizado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-asignar]').forEach((b) => b.addEventListener('click', () => {
      const r = filas[Number(b.dataset.asignar)];
      modalTurno({ fijo: { pacienteId: r.paciente_id, pacienteNombre: `${r.paciente_nombre || ''} ${r.paciente_apellido || ''}`.trim() }, alGuardar: async () => { try { await cambiar(r, 'asignado'); } catch (_e) { /* el turno ya quedó */ } recargar(); } });
    }));
  }

  return { agenda };
})();
window.DovaAgenda = DovaAgenda;

DovaPantallas.registrar('agenda', { dibujar: (contenedor, { navegar }) => DovaAgenda.agenda(contenedor, navegar) });
