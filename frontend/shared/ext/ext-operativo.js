/* DOVA — operación diaria desde la pantalla.
   La simulación de un año mostró que el backend ya hacía todo, pero la
   interfaz no permitía: dar/reprogramar/cancelar turnos, cobrar, manejar la
   caja, presupuestar, financiar en cuotas, mover stock, cargar el catálogo,
   firmar consentimientos ni usar la lista de espera. Este archivo agrega
   esas pantallas, compartidas por los 3 diseños. Todo pasa por la API y
   respeta los permisos (lo que el usuario no puede hacer, no se muestra). */
const DovaOperativo = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy, sumarDias, etiqueta, badge, cargando } = X;
  const OPC = (l) => l.map((v) => [v, etiqueta(v)]);
  const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['qr', 'QR']];
  const num = (v) => Number(v || 0);
  const hora5 = (h) => String(h || '').slice(0, 5);

  // ------------------------------------------------------------------
  // Buscador de pacientes para formularios (escribís y elegís de la lista).
  // ------------------------------------------------------------------
  function campoPacienteHtml(nombre = 'pacienteId') {
    return `<div class="dova-ext-campo dova-ext-campo-completo dova-op-buscapac">
      <label>Paciente *</label>
      <input type="search" data-buscar-pac placeholder="Escribí nombre, apellido o cédula…" autocomplete="off" />
      <input type="hidden" name="${nombre}" data-pac-id />
      <div class="dova-op-resultados" data-pac-res></div>
      <p class="dova-ext-ayuda" data-pac-elegido></p>
    </div>`;
  }
  function activarBuscadorPaciente(scope, alElegir) {
    const inp = scope.querySelector('[data-buscar-pac]');
    if (!inp) return;
    const res = scope.querySelector('[data-pac-res]');
    const hid = scope.querySelector('[data-pac-id]');
    const eleg = scope.querySelector('[data-pac-elegido]');
    let t = null;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      hid.value = ''; eleg.textContent = '';
      const q = inp.value.trim();
      if (q.length < 2) { res.innerHTML = ''; return; }
      t = setTimeout(async () => {
        try {
          const r = await DOVA.get(`/pacientes?q=${encodeURIComponent(q)}&pageSize=8`);
          const lista = r.data || r.items || r;
          res.innerHTML = lista.map((p) => `<button type="button" class="dova-op-res-item" data-id="${p.id}" data-nombre="${esc(`${p.nombre} ${p.apellido}`)}">${esc(p.nombre)} ${esc(p.apellido)} <span class="dova-nota">${p.ci ? 'CI ' + esc(p.ci) : ''} ${p.telefono ? '· ' + esc(p.telefono) : ''}</span></button>`).join('')
            || '<p class="dova-nota">Sin resultados.</p>';
          res.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
            hid.value = b.dataset.id; inp.value = b.dataset.nombre; res.innerHTML = '';
            eleg.textContent = '✓ Paciente seleccionado';
            if (alElegir) alElegir(Number(b.dataset.id));
          }));
        } catch (e) { res.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      }, 250);
    });
  }
  function fijarPaciente(scope, id, nombre) {
    const inp = scope.querySelector('[data-buscar-pac]');
    if (!inp) return;
    scope.querySelector('[data-pac-id]').value = id;
    inp.value = nombre || `Paciente #${id}`;
    inp.readOnly = true;
    scope.querySelector('[data-pac-elegido]').textContent = '';
  }

  async function catalogosTurno() {
    const [odos, trats, sillones] = await Promise.all([
      X.catalogo('odontologos', '/odontologos').catch(() => []),
      puede('tratamientos.view', 'agenda.create') ? X.catalogo('tratamientos', '/tratamientos').catch(() => []) : [],
      X.catalogo('sillones', '/operaciones/sillones').catch(() => []),
    ]);
    return { odos: odos.filter((o) => o.activo !== false), trats, sillones: sillones.filter((s) => s.activo !== false) };
  }

  // Guarda un turno (nuevo o reprogramado). Si cae en un bloqueo de agenda,
  // pregunta si se reserva igual (urgencias) y reintenta con forzar.
  async function guardarTurno(id, datos) {
    try {
      return id ? await DOVA.put(`/agenda/${id}`, datos) : await DOVA.post('/agenda', datos);
    } catch (e) {
      if (e.status === 409 && e.details && e.details.puedeForzar) {
        const ok = await confirmar('Horario bloqueado', `${esc(e.message)}`, 'Reservar igual');
        if (ok) return id ? DOVA.put(`/agenda/${id}`, { ...datos, forzar: true }) : DOVA.post('/agenda', { ...datos, forzar: true });
        const cancelado = new Error('No se guardó el turno.'); cancelado.silencioso = true; throw cancelado;
      }
      throw e;
    }
  }

  function confirmar(titulo, htmlTexto, textoOk = 'Confirmar') {
    return new Promise((resolve) => {
      X.modal(titulo, `<p>${htmlTexto}</p><div class="dova-modal-actions"><button class="dova-btn-secundario" data-no>Cancelar</button><button class="dova-btn-primary" data-si>${esc(textoOk)}</button></div>`);
      document.querySelector('[data-si]').addEventListener('click', () => { X.cerrarModal(); resolve(true); });
      document.querySelector('[data-no]').addEventListener('click', () => { X.cerrarModal(); resolve(false); });
    });
  }

  /* Formulario de turno. turno = existente (reprogramar) o null (nuevo).
     fijo = { pacienteId, pacienteNombre, fecha } para precargar. */
  async function modalTurno({ turno = null, fijo = {}, alGuardar } = {}) {
    const { odos, trats, sillones } = await catalogosTurno();
    const v = turno ? {
      odontologoId: turno.odontologo_id, fecha: String(turno.fecha).slice(0, 10), horaInicio: hora5(turno.hora_inicio),
      duracionMinutos: turno.duracion_minutos, tratamientoId: turno.tratamiento_id, sillonId: turno.sillon_id, motivo: turno.motivo, observaciones: turno.observaciones,
    } : { fecha: fijo.fecha || hoy(), duracionMinutos: 30, odontologoId: (DOVA.usuarioActual() || {}).odontologoId || (odos.length === 1 ? odos[0].id : '') };
    const campos = [
      { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', req: true, opciones: odos.map((o) => [o.id, o.nombre]) },
      { k: 'fecha', label: 'Fecha', tipo: 'fecha', req: true },
      { k: 'horaInicio', label: 'Hora', tipo: 'hora', req: true },
      { k: 'duracionMinutos', label: 'Duración (min)', tipo: 'numero', req: true, min: 5, max: 480, paso: 5 },
      { k: 'tratamientoId', label: 'Tratamiento', tipo: 'select', opciones: trats.filter((t) => t.activo !== false).map((t) => [t.id, t.nombre]) },
      { k: 'sillonId', label: 'Sillón / box', tipo: 'select', opciones: sillones.map((s) => [s.id, s.nombre]) },
      { k: 'motivo', label: 'Motivo', ancho: 'completo', max: 200 },
      { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
    ];
    const form = X.modalForm(turno ? `Reprogramar turno — ${turno.paciente_nombre || ''} ${turno.paciente_apellido || ''}` : 'Nuevo turno', campos, v, async (d, f) => {
      const pacienteId = turno ? turno.paciente_id : Number(f.querySelector('[data-pac-id]').value);
      if (!pacienteId) throw new Error('Elegí el paciente de la lista');
      const datos = { ...d, pacienteId, odontologoId: Number(d.odontologoId), duracionMinutos: Number(d.duracionMinutos) };
      ['tratamientoId', 'sillonId'].forEach((k) => { datos[k] = d[k] ? Number(d[k]) : (turno ? null : undefined); });
      try {
        await guardarTurno(turno && turno.id, datos);
      } catch (e) { if (e.silencioso) return; throw e; }
      toast(turno ? 'Turno reprogramado' : 'Turno reservado', 'ok');
      if (alGuardar) alGuardar();
    }, { editando: !!turno, textoBoton: turno ? 'Guardar cambios' : 'Reservar turno', ancho: 'ancho' });
    if (!turno) {
      form.insertAdjacentHTML('afterbegin', campoPacienteHtml());
      activarBuscadorPaciente(form);
      if (fijo.pacienteId) fijarPaciente(form, fijo.pacienteId, fijo.pacienteNombre);
    }
    // Al elegir tratamiento, propone su duración.
    const selT = form.querySelector('[name="tratamientoId"]');
    if (selT) selT.addEventListener('change', () => {
      const t = trats.find((x) => String(x.id) === selT.value);
      if (t && t.duracion_minutos) form.querySelector('[name="duracionMinutos"]').value = t.duracion_minutos;
    });
    return form;
  }

  const ESTADO_NIVEL = { reservado: 'info', confirmado: 'ok', atendido: 'ok', cancelado: 'critica', no_asistio: 'critica', reprogramado: 'atencion' };

  // =================================================================
  // AGENDA
  // =================================================================
  async function agenda(root, navegar) {
    root.innerHTML = `<h2 class="dova-view-title">Agenda</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'dia', texto: 'Turnos', visible: true, render: (c) => agendaDia(c, navegar, { fecha: hoy() }) },
      { id: 'espera', texto: 'Lista de espera', visible: puede('lista_espera.manage'), render: (c) => listaEspera(c, navegar) },
    ]);
  }

  async function agendaDia(c, navegar, estado) {
    const { odos } = await catalogosTurno();
    const f = estado.fecha;
    const q = new URLSearchParams({ desde: f, hasta: estado.dias ? sumarDias(f, estado.dias - 1) : f });
    if (estado.odontologoId) q.set('odontologoId', estado.odontologoId);
    const turnos = await DOVA.get(`/agenda?${q}`);
    const activos = turnos.filter((t) => !['cancelado', 'reprogramado'].includes(t.estado));
    const puedeEditar = puede('agenda.edit');
    const diaTxt = new Date(`${f}T12:00:00Z`).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const dia = diaTxt.charAt(0).toUpperCase() + diaTxt.slice(1);
    c.innerHTML = `
      <div class="dova-toolbar dova-op-toolbar">
        <div class="dova-op-nav">
          <button class="dova-btn-secundario" data-dia="-1" title="Día anterior">◀</button>
          <button class="dova-btn-secundario" data-hoy>Hoy</button>
          <button class="dova-btn-secundario" data-dia="1" title="Día siguiente">▶</button>
          <input type="date" value="${f}" data-fecha aria-label="Fecha" />
          <select data-rango aria-label="Rango"><option value="">Solo ese día</option><option value="7" ${estado.dias === 7 ? 'selected' : ''}>7 días</option></select>
          <select data-odo aria-label="Odontólogo"><option value="">Todos los odontólogos</option>${odos.map((o) => `<option value="${o.id}" ${String(o.id) === String(estado.odontologoId || '') ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>
        </div>
        ${puede('agenda.create') ? '<button class="dova-btn-primary" data-nuevo-turno>+ Nuevo turno</button>' : ''}
      </div>
      <p class="dova-subtitulo">${esc(dia)}${estado.dias ? ` y 6 días más` : ''} · ${activos.length} turno${activos.length === 1 ? '' : 's'}</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla">
        <thead><tr><th></th>${estado.dias ? '<th>Fecha</th>' : ''}<th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Tratamiento / motivo</th><th>Sillón</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${turnos.map((t, i) => `
          <tr class="${['cancelado', 'no_asistio', 'reprogramado'].includes(t.estado) ? 'dova-op-fila-apagada' : ''}">
            <td><button class="dova-btn-link" data-expandir="${i}" title="Contexto clínico">▸</button></td>
            ${estado.dias ? `<td>${fmtFecha(t.fecha)}</td>` : ''}
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
              ${DOVA.tienePermiso('historia_clinica.edit') && !['cancelado', 'no_asistio'].includes(t.estado) ? `<button class="dova-btn-link" data-consulta="${t.paciente_id}">Consulta</button>` : ''}
            </td>
          </tr>
          <tr data-ctx="${i}" style="display:none"><td colspan="${estado.dias ? 9 : 8}"></td></tr>`).join('') || `<tr><td colspan="${estado.dias ? 9 : 8}">Sin turnos ${estado.dias ? 'en esos días' : 'ese día'}.</td></tr>`}
        </tbody></table></div>`;
    const recargar = (cambios = {}) => agendaDia(c, navegar, { ...estado, ...cambios });
    c.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => recargar({ fecha: sumarDias(f, Number(b.dataset.dia) * (estado.dias || 1)) })));
    c.querySelector('[data-hoy]').addEventListener('click', () => recargar({ fecha: hoy() }));
    c.querySelector('[data-fecha]').addEventListener('change', (e) => e.target.value && recargar({ fecha: e.target.value }));
    c.querySelector('[data-rango]').addEventListener('change', (e) => recargar({ dias: e.target.value ? Number(e.target.value) : 0 }));
    c.querySelector('[data-odo]').addEventListener('change', (e) => recargar({ odontologoId: e.target.value }));
    const bn = c.querySelector('[data-nuevo-turno]');
    if (bn) bn.addEventListener('click', () => modalTurno({ fijo: { fecha: f }, alGuardar: () => recargar() }));
    c.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.ficha)));
    c.querySelectorAll('[data-consulta]').forEach((b) => b.addEventListener('click', () => navegar('consulta', b.dataset.consulta)));
    c.querySelectorAll('[data-reprogramar]').forEach((b) => b.addEventListener('click', () => modalTurno({ turno: turnos[Number(b.dataset.reprogramar)], alGuardar: () => recargar() })));
    c.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
      const t = turnos[Number(b.dataset.i)];
      const nuevo = b.dataset.estado;
      if (['cancelado', 'no_asistio'].includes(nuevo)) {
        const ok = await confirmar(nuevo === 'cancelado' ? '¿Cancelar el turno?' : '¿Marcar que no asistió?', `${esc(t.paciente_nombre)} ${esc(t.paciente_apellido || '')} — ${fmtFecha(t.fecha)} ${hora5(t.hora_inicio)}`, nuevo === 'cancelado' ? 'Cancelar turno' : 'No asistió');
        if (!ok) return;
      }
      try { await DOVA.patch(`/agenda/${t.id}/estado`, { estado: nuevo }); toast('Turno actualizado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-expandir]').forEach((b) => b.addEventListener('click', async () => {
      const i = b.dataset.expandir;
      const fila = c.querySelector(`[data-ctx="${i}"]`);
      if (fila.style.display !== 'none') { fila.style.display = 'none'; b.textContent = '▸'; return; }
      fila.style.display = ''; b.textContent = '▾';
      const celda = fila.querySelector('td');
      celda.innerHTML = cargando;
      try { celda.innerHTML = Vistas.renderContextoClinicoTurno(await DOVA.get(`/agenda/${turnos[i].id}/contexto-clinico`)); } catch (e) { celda.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
    }));
  }

  async function listaEspera(c, navegar) {
    const { odos, trats } = await catalogosTurno();
    const filas = await DOVA.get('/clinico/lista-espera');
    const PRIO = { alta: 'critica', media: 'atencion', baja: 'info' };
    c.innerHTML = `
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
    const cambiar = async (r, est) => { await DOVA.patch(`/clinico/lista-espera/${r.id}/estado`, { estado: est }); };
    c.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
      try { await cambiar(filas[Number(b.dataset.i)], b.dataset.est); toast('Actualizado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-asignar]').forEach((b) => b.addEventListener('click', () => {
      const r = filas[Number(b.dataset.asignar)];
      modalTurno({ fijo: { pacienteId: r.paciente_id, pacienteNombre: `${r.paciente_nombre || ''} ${r.paciente_apellido || ''}`.trim() }, alGuardar: async () => { try { await cambiar(r, 'asignado'); } catch (_e) { /* el turno ya quedó */ } recargar(); } });
    }));
  }

  // =================================================================
  // CAJA
  // =================================================================
  async function caja(root) {
    root.innerHTML = `<h2 class="dova-view-title">Caja</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'hoy', texto: 'Caja del día', visible: true, render: cajaActual },
      { id: 'hist', texto: 'Cierres anteriores', visible: true, render: cajaHistorico },
    ]);
  }

  async function cajaActual(c) {
    const e = await DOVA.get('/caja/estado');
    const maneja = puede('caja.manage');
    if (!e.abierta) {
      c.innerHTML = `
        <div class="dova-ext-caja">
          <h4>La caja está cerrada</h4>
          ${e.pagosSinCaja && e.pagosSinCaja.length ? `<p class="dova-nota dova-nota-alerta">Hoy se cobraron ${e.pagosSinCaja.length} pago(s) por ${fmtGs(e.totalSinCaja)} con la caja cerrada. Al abrirla se suman automáticamente.</p>
            <ul class="dova-lista-simple">${e.pagosSinCaja.map((p) => `<li>${esc(p.paciente)} — ${fmtGs(p.monto)} (${esc(etiqueta(p.metodo))})</li>`).join('')}</ul>` : '<p class="dova-nota">Abrí la caja al empezar el día, con el efectivo que hay en el cajón.</p>'}
          ${maneja ? `<form class="dova-ext-filtros" data-abrir><div><label>Efectivo inicial en el cajón (Gs.)</label><input type="number" name="montoInicial" min="0" step="1000" value="0" required/></div><button class="dova-btn-primary">Abrir caja</button></form>` : ''}
        </div>`;
      const fa = c.querySelector('[data-abrir]');
      if (fa) fa.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const r = await DOVA.post('/caja/abrir', { montoInicial: Number(fa.montoInicial.value || 0) });
          toast(r.pagosIncorporados ? `Caja abierta (se sumaron ${r.pagosIncorporados} cobro(s) previos)` : 'Caja abierta', 'ok');
          cajaActual(c);
        } catch (ex) { toast(ex.message, 'error'); }
      });
      return;
    }
    const t = e.totales;
    c.innerHTML = `
      <p class="dova-nota">Abierta el ${fmtFecha(e.caja.fecha)}${e.caja.fecha && String(e.caja.fecha).slice(0, 10) < hoy() ? ` ${badge('de otro día: cerrala', 'critica')}` : ''}.</p>
      <div class="dova-ext-kpis">
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(e.efectivoEsperado)}</div><div class="dova-ext-kpi-label">Efectivo que debe haber en el cajón</div><div class="dova-ext-kpi-sub">Inicial ${fmtGs(e.caja.monto_inicial)} + cobros en efectivo ${fmtGs(t.efectivo)} − egresos ${fmtGs(t.egresos_efectivo)}</div></div>
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(e.otrosMedios)}</div><div class="dova-ext-kpi-label">Otros medios (no van al cajón)</div><div class="dova-ext-kpi-sub">Tarjeta ${fmtGs(t.tarjetas)} · Transferencia ${fmtGs(t.transferencias)} · QR ${fmtGs(t.qr)}</div></div>
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.total_ingresos)}</div><div class="dova-ext-kpi-label">Total cobrado hoy</div></div>
      </div>
      ${maneja ? `<div class="dova-toolbar"><span></span><div>
        <button class="dova-btn-secundario" data-mov="ingreso">+ Ingreso</button>
        <button class="dova-btn-secundario" data-mov="egreso">− Egreso</button>
        <button class="dova-btn-primary" data-cerrar-caja>Cerrar caja</button></div></div>` : ''}
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Método</th><th>Monto</th><th>Usuario</th></tr></thead><tbody>
      ${e.movimientos.map((m) => `<tr><td>${new Date(m.creado_en).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td><td>${m.tipo === 'egreso' ? badge('Egreso', 'critica') : badge('Ingreso', 'ok')}</td><td>${esc(m.concepto || '-')}</td><td>${esc(etiqueta(m.metodo || 'efectivo'))}</td><td>${m.tipo === 'egreso' ? '−' : ''}${fmtGs(m.monto)}</td><td>${esc(m.usuario_nombre || '-')}</td></tr>`).join('') || '<tr><td colspan="6">Sin movimientos todavía.</td></tr>'}
      </tbody></table></div>`;
    c.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => {
      const tipo = b.dataset.mov;
      X.modalForm(tipo === 'egreso' ? 'Egreso de caja' : 'Ingreso de caja', [
        { k: 'concepto', label: 'Concepto', req: true, ancho: 'completo', max: 200 },
        { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1 },
        { k: 'metodo', label: 'Medio', tipo: 'select', req: true, opciones: METODOS },
      ], { metodo: 'efectivo' }, async (d) => {
        await DOVA.post('/caja/movimiento', { ...d, tipo });
        toast('Movimiento registrado', 'ok'); cajaActual(c);
      });
    }));
    const bc = c.querySelector('[data-cerrar-caja]');
    if (bc) bc.addEventListener('click', () => {
      const form = X.modalForm('Cerrar caja', [
        { k: 'montoContado', label: 'Efectivo contado en el cajón (Gs.)', tipo: 'numero', req: true, min: 0 },
        { k: 'motivoDiferencia', label: 'Motivo de la diferencia (si la hay)', tipo: 'textarea' },
      ], {}, async (d) => {
        const r = await DOVA.post(`/caja/${e.caja.id}/cerrar`, d);
        toast(Number(r.diferencia) === 0 ? 'Caja cerrada sin diferencias' : `Caja cerrada con diferencia de ${fmtGs(r.diferencia)}`, Number(r.diferencia) === 0 ? 'ok' : 'info');
        cajaActual(c);
      }, { textoBoton: 'Cerrar caja', extraHtml: `<p class="dova-nota">Debería haber <strong>${fmtGs(e.efectivoEsperado)}</strong> en efectivo. Tarjeta, transferencia y QR (${fmtGs(e.otrosMedios)}) no se cuentan acá.</p><p data-dif class="dova-nota"></p>` });
      const inp = form.querySelector('[name="montoContado"]');
      inp.addEventListener('input', () => {
        const dif = Number(inp.value || 0) - e.efectivoEsperado;
        form.querySelector('[data-dif]').innerHTML = inp.value === '' ? '' : dif === 0 ? badge('Cuadra exacto', 'ok') : `${badge(dif > 0 ? 'Sobra' : 'Falta', 'critica')} ${fmtGs(Math.abs(dif))} — indicá el motivo`;
      });
    });
  }

  async function cajaHistorico(c) {
    const filas = await DOVA.get(`/caja/historico?desde=${sumarDias(hoy(), -90)}`);
    c.innerHTML = `<p class="dova-nota">Últimos 90 días. Una diferencia distinta de cero requiere motivo al cerrar.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Inicial</th><th>Efectivo esperado</th><th>Contado</th><th>Diferencia</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${fmtFecha(f.fecha)}</td><td>${fmtGs(f.monto_inicial)}</td><td>${f.monto_esperado !== null ? fmtGs(f.monto_esperado) : '-'}</td><td>${f.monto_contado !== null ? fmtGs(f.monto_contado) : '-'}</td>
        <td>${f.diferencia === null ? '-' : num(f.diferencia) === 0 ? badge('0', 'ok') : badge(fmtGs(f.diferencia), 'critica')}</td><td>${esc(f.motivo_diferencia || '')}</td><td>${esc(etiqueta(f.estado))}</td></tr>`).join('') || '<tr><td colspan="7">Sin cierres.</td></tr>'}
      </tbody></table></div>`;
  }

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
    const campos = [
      { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1 },
      { k: 'metodo', label: 'Medio de pago', tipo: 'select', req: true, opciones: METODOS },
      ...(cuota ? [] : [{ k: 'cuotaId', label: 'Aplicar a una cuota', tipo: 'select', opciones: cuotas.map((q) => [q.id, `Plan #${q.plan} — cuota ${q.numero} · ${fmtGs(q.monto)} · vence ${fmtFecha(q.vencimiento)}`]), ayuda: cuotas.length ? 'Opcional. Si elegís una cuota, el monto se completa solo.' : 'El paciente no tiene cuotas pendientes.' }]),
      { k: 'concepto', label: 'Concepto', ancho: 'completo', max: 200 },
    ];
    const form = X.modalForm(cuota ? `Cobrar cuota ${cuota.numero}` : 'Registrar cobro', campos, cuota ? { monto: num(cuota.monto), metodo: 'efectivo', concepto: `Cuota ${cuota.numero}` } : { metodo: 'efectivo' }, async (d) => {
      const datos = { ...d, pacienteId: pid, monto: Number(d.monto) };
      if (cuota) datos.cuotaId = cuota.id; else if (d.cuotaId) datos.cuotaId = Number(d.cuotaId); else delete datos.cuotaId;
      const r = await DOVA.post('/pagos', datos);
      toast(r.cajaReflejada ? 'Cobro registrado en la caja' : 'Cobro registrado. La caja está cerrada: se va a sumar cuando se abra hoy.', r.cajaReflejada ? 'ok' : 'info');
      if (alGuardar) alGuardar(r);
    }, { textoBoton: 'Registrar cobro' });
    const selC = form.querySelector('[name="cuotaId"]');
    if (selC) selC.addEventListener('change', () => { const q = cuotas.find((x) => String(x.id) === selC.value); if (q) form.querySelector('[name="monto"]').value = num(q.monto); });
  }

  async function cobros(c, pid) {
    const pagos = await DOVA.get(`/pagos/paciente/${pid}`);
    const puedeCobrar = puede('pagos.create');
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Cobros</h3>${puedeCobrar ? '<button class="dova-btn-primary" data-cobrar>+ Registrar cobro</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Monto</th><th>Estado</th><th>Cobró</th><th></th></tr></thead><tbody>
      ${pagos.map((p, i) => `<tr class="${p.estado === 'anulado' ? 'dova-op-fila-apagada' : ''}"><td>${fmtFecha(p.fecha)}</td><td>${esc(p.concepto || '-')}</td><td>${esc(etiqueta(p.metodo))}</td><td>${fmtGs(p.monto)}</td>
        <td>${p.estado === 'anulado' ? badge('Anulado', 'critica') : badge('Pagado', 'ok')}</td><td>${esc(p.usuario_nombre || '-')}</td>
        <td class="dova-ext-acciones"><button class="dova-btn-link" data-recibo="${p.id}">Recibo PDF</button>${puedeCobrar && p.estado !== 'anulado' ? `<button class="dova-btn-link dova-ext-peligro" data-anular="${i}">Anular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Sin cobros.</td></tr>'}
      </tbody></table></div>`;
    const b = c.querySelector('[data-cobrar]');
    if (b) b.addEventListener('click', () => modalCobro(pid, { alGuardar: () => cobros(c, pid) }));
    c.querySelectorAll('[data-recibo]').forEach((x) => x.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/pago/${x.dataset.recibo}`, `recibo-${x.dataset.recibo}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-anular]').forEach((x) => x.addEventListener('click', async () => {
      const p = pagos[Number(x.dataset.anular)];
      if (!(await confirmar('¿Anular este cobro?', `${fmtGs(p.monto)} del ${fmtFecha(p.fecha)}. Queda registrado en la auditoría.`, 'Anular cobro'))) return;
      try { await DOVA.post(`/pagos/${p.id}/anular`, {}); toast('Cobro anulado', 'ok'); cobros(c, pid); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  const PRES_NIVEL = { borrador: 'info', enviado: 'atencion', aceptado: 'ok', rechazado: 'critica', vencido: 'critica', cancelado: 'critica' };
  const PRES_SIGUIENTE = { borrador: ['enviado', 'aceptado', 'cancelado'], enviado: ['aceptado', 'rechazado', 'vencido'], vencido: ['enviado'], rechazado: [], aceptado: ['cancelado'], cancelado: [] };
  const PRES_TEXTO = { enviado: 'Marcar enviado', aceptado: 'Aceptado', rechazado: 'Rechazado', vencido: 'Vencido', cancelado: 'Cancelar' };

  async function presupuestos(c, pid) {
    const [lista, planesPago] = await Promise.all([DOVA.get(`/presupuestos/paciente/${pid}`), puede('planes_pago.manage', 'pagos.view') ? DOVA.get(`/planes-pago/paciente/${pid}`).catch(() => []) : []]);
    const maneja = puede('presupuestos.manage');
    const conPlan = new Set(planesPago.filter((p) => p.estado !== 'cancelado').map((p) => p.presupuesto_id));
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Presupuestos</h3>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo presupuesto</button>' : ''}</div>
      <p class="dova-nota">También podés generar un presupuesto desde un plan de tratamiento (pestaña Resumen → Ver etapas).</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Total</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>
      ${lista.map((p, i) => `<tr><td>${fmtFecha(p.fecha)}</td><td>${fmtGs(p.total)}${num(p.descuento) ? ` <span class="dova-nota">(−${num(p.descuento)}%)</span>` : ''}</td><td>${badge(etiqueta(p.estado), PRES_NIVEL[p.estado])}</td><td class="dova-nota">${esc(p.observaciones || '')}</td>
        <td class="dova-ext-acciones"><button class="dova-btn-link" data-pdf="${p.id}">PDF</button>
          ${maneja ? (PRES_SIGUIENTE[p.estado] || []).map((s) => `<button class="dova-btn-link ${['rechazado', 'cancelado', 'vencido'].includes(s) ? 'dova-ext-peligro' : ''}" data-est="${s}" data-i="${i}">${PRES_TEXTO[s]}</button>`).join('') : ''}
          ${p.estado === 'aceptado' && puede('planes_pago.manage') && !conPlan.has(p.id) ? `<button class="dova-btn-link" data-financiar="${i}">Financiar en cuotas</button>` : ''}
          ${p.estado === 'aceptado' && conPlan.has(p.id) ? badge('con plan de pago', 'info') : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin presupuestos.</td></tr>'}
      </tbody></table></div>`;
    const recargar = () => presupuestos(c, pid);
    c.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/presupuesto/${b.dataset.pdf}`, `presupuesto-${b.dataset.pdf}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
      const p = lista[Number(b.dataset.i)];
      try { await DOVA.patch(`/presupuestos/${p.id}/estado`, { estado: b.dataset.est }); toast('Presupuesto actualizado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-financiar]').forEach((b) => b.addEventListener('click', () => modalPlanPago(pid, lista[Number(b.dataset.financiar)], recargar)));
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => modalPresupuesto(pid, recargar));
  }

  async function modalPresupuesto(pid, alGuardar) {
    const trats = await X.catalogo('tratamientos', '/tratamientos').catch(() => []);
    const odos = await X.opcionesOdontologos();
    X.modal('Nuevo presupuesto', `
      <form data-pres>
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
    const fila = () => {
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
    form.querySelector('[data-agregar]').addEventListener('click', fila);
    fila();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      const items = leerItems().filter((i) => i.descripcion || i.tratamientoId);
      try {
        if (!items.length) throw new Error('Agregá al menos un ítem');
        await DOVA.post('/presupuestos', {
          pacienteId: pid, items, descuento: Number(form.descuento.value || 0), vencimiento: form.vencimiento.value || undefined,
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
      </div>`).join('') : '<p class="dova-nota">Sin planes de pago. Se crean desde un presupuesto aceptado (subpestaña Presupuestos → "Financiar en cuotas").</p>';
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
    const bn = c.querySelector('[data-nuevo-turno]');
    if (bn) bn.addEventListener('click', () => modalTurno({ fijo: { pacienteId: pid, pacienteNombre: nombre ? nombre.textContent.trim() : '' }, alGuardar: recargar }));
    c.querySelectorAll('[data-repro]').forEach((b) => b.addEventListener('click', () => modalTurno({ turno: turnos.find((t) => String(t.id) === b.dataset.repro), alGuardar: recargar })));
    c.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('¿Cancelar el turno?', 'El horario queda libre para otro paciente.', 'Cancelar turno'))) return;
      try { await DOVA.patch(`/agenda/${b.dataset.cancelar}/estado`, { estado: 'cancelado' }); toast('Turno cancelado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  // ---- Consentimientos con firma en pantalla ----
  function lienzoFirma(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1b1b1b';
    let dibujando = false; let trazado = false;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * (canvas.width / r.width), (p.clientY - r.top) * (canvas.height / r.height)]; };
    const ini = (e) => { dibujando = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
    const mov = (e) => { if (!dibujando) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); trazado = true; e.preventDefault(); };
    const fin = () => { dibujando = false; };
    canvas.addEventListener('mousedown', ini); canvas.addEventListener('mousemove', mov); window.addEventListener('mouseup', fin);
    canvas.addEventListener('touchstart', ini, { passive: false }); canvas.addEventListener('touchmove', mov, { passive: false }); canvas.addEventListener('touchend', fin);
    return {
      limpiar: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); trazado = false; },
      vacio: () => !trazado,
      datos: () => canvas.toDataURL('image/png'),
    };
  }

  async function consentimientos(c, pid) {
    const lista = await DOVA.get(`/clinico/consentimientos/paciente/${pid}`);
    const maneja = puede('consentimientos.manage');
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Consentimientos informados</h3>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo consentimiento</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Procedimiento</th><th>Odontólogo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((k, i) => `<tr><td>${fmtFecha(k.fecha || k.creado_en)}</td><td>${esc(k.procedimiento)}</td><td>${esc(k.odontologo_nombre || '-')}</td>
        <td>${k.estado === 'firmado' ? badge('Firmado', 'ok') : k.estado === 'anulado' ? badge('Anulado', 'critica') : badge('Pendiente de firma', 'atencion')}</td>
        <td class="dova-ext-acciones">${maneja && k.estado === 'pendiente' ? `<button class="dova-btn-link" data-firmar="${i}">Firmar</button><button class="dova-btn-link dova-ext-peligro" data-anular="${k.id}">Anular</button>` : ''}<button class="dova-btn-link" data-pdf="${k.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="5">Sin consentimientos.</td></tr>'}
      </tbody></table></div>`;
    const recargar = () => consentimientos(c, pid);
    c.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/consentimiento/${b.dataset.pdf}`, `consentimiento-${b.dataset.pdf}.pdf`).catch((e) => toast(e.message, 'error'))));
    c.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
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
    c.querySelectorAll('[data-firmar]').forEach((b) => b.addEventListener('click', () => {
      const k = lista[Number(b.dataset.firmar)];
      X.modal(`Firma — ${k.procedimiento}`, `
        <div class="dova-op-consent-texto">${esc(k.texto || '')}</div>
        <p><strong>Firma del paciente o responsable</strong></p>
        <canvas class="dova-op-firma" width="600" height="180" data-firma-p></canvas>
        <button type="button" class="dova-btn-link" data-limpiar-p>Borrar firma</button>
        <p><strong>Firma del profesional</strong> <span class="dova-nota">(opcional)</span></p>
        <canvas class="dova-op-firma" width="600" height="140" data-firma-o></canvas>
        <button type="button" class="dova-btn-link" data-limpiar-o>Borrar firma</button>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary" data-guardar-firma>Guardar firma</button></div>`, { ancho: 'ancho' });
      const fp = lienzoFirma(document.querySelector('[data-firma-p]'));
      const fo = lienzoFirma(document.querySelector('[data-firma-o]'));
      document.querySelector('[data-limpiar-p]').addEventListener('click', fp.limpiar);
      document.querySelector('[data-limpiar-o]').addEventListener('click', fo.limpiar);
      document.querySelector('[data-guardar-firma]').addEventListener('click', async () => {
        const err = document.querySelector('.dova-modal-box [data-error]');
        if (fp.vacio()) { err.textContent = 'Falta la firma del paciente.'; err.style.display = 'block'; return; }
        try {
          await DOVA.post(`/clinico/consentimientos/${k.id}/firmar`, { firmaPaciente: fp.datos(), firmaOdontologo: fo.vacio() ? undefined : fo.datos() });
          X.cerrarModal(); toast('Consentimiento firmado', 'ok'); recargar();
        } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
      });
    }));
  }

  // Agrega a la ficha: subpestañas de cobros/presupuestos/planes en "Cuenta",
  // turnos en "Agenda" y consentimientos en "Documentación".
  function extenderFicha(pacienteId, navegar) {
    const pid = Number(pacienteId);
    const reemplazarPanel = (id, visible, render) => {
      const panel = document.querySelector(`.dova-tab-panel[data-panel="${id}"]`);
      const tab = document.querySelector(`#ficha-tabs [data-tab="${id}"]`);
      if (!panel || !tab || !visible) return;
      let cargado = false;
      const cargar = () => { if (cargado) return; cargado = true; panel.innerHTML = cargando; Promise.resolve(render(panel)).catch((e) => { panel.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; cargado = false; }); };
      tab.addEventListener('click', cargar);
    };
    reemplazarPanel('agenda', puede('agenda.view'), (p) => turnosPaciente(p, pid, navegar));
    reemplazarPanel('documentacion', puede('consentimientos.manage', 'pacientes.clinical.view'), (p) => {
      p.innerHTML = '<div data-consent></div><p class="dova-nota" style="margin-top:16px">Fotos, estudios y recetas están en la línea de tiempo (pestaña Historial clínico) y se cargan desde el Modo Consulta.</p>';
      return consentimientos(p.querySelector('[data-consent]'), pid);
    });
    // Panel "Administrativo" (presupuestos) → versión con acciones.
    reemplazarPanel('administrativo', puede('presupuestos.view', 'pagos.view'), (p) => {
      X.subPestanas(p, [
        { id: 'cobros', texto: 'Cobros', visible: puede('pagos.view', 'pagos.create'), render: (c) => cobros(c, pid) },
        { id: 'pres', texto: 'Presupuestos', visible: puede('presupuestos.view'), render: (c) => presupuestos(c, pid) },
        { id: 'planes', texto: 'Planes de pago', visible: puede('planes_pago.manage', 'pagos.view'), render: (c) => planesDePago(c, pid) },
      ]);
    });
  }

  // =================================================================
  // INVENTARIO
  // =================================================================
  async function inventario(root) {
    root.innerHTML = `<h2 class="dova-view-title">Inventario</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'insumos', texto: 'Insumos', visible: true, render: insumos },
      { id: 'compras', texto: 'Registrar compra', visible: puede('proveedores.manage'), render: compra },
      { id: 'prov', texto: 'Proveedores', visible: true, render: proveedores },
    ]);
  }

  async function insumos(c, filtro = '') {
    const [lista, provs] = await Promise.all([DOVA.get('/inventario/insumos'), DOVA.get('/inventario/proveedores').catch(() => [])]);
    const maneja = puede('inventario.manage');
    const h = hoy();
    const f = filtro.toLowerCase();
    const vis = lista.filter((i) => !f || `${i.nombre} ${i.categoria || ''}`.toLowerCase().includes(f));
    c.innerHTML = `
      <div class="dova-toolbar"><input type="search" data-filtro placeholder="Buscar insumo…" value="${esc(filtro)}" style="max-width:280px"/>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo insumo</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Vence</th><th>Proveedor</th><th></th></tr></thead><tbody>
      ${vis.map((i) => {
        const bajo = num(i.stock_actual) <= num(i.stock_minimo);
        const vencido = i.fecha_vencimiento && String(i.fecha_vencimiento).slice(0, 10) < h;
        return `<tr class="${bajo ? 'dova-fila-alerta' : ''}"><td>${esc(i.nombre)}${i.lote ? ` <span class="dova-nota">lote ${esc(i.lote)}</span>` : ''}</td><td>${esc(i.categoria || '-')}</td>
          <td><strong>${num(i.stock_actual)}</strong> ${bajo ? badge('bajo', 'critica') : ''}</td><td>${num(i.stock_minimo)}</td>
          <td>${i.fecha_vencimiento ? `${fmtFecha(i.fecha_vencimiento)} ${vencido ? badge('vencido', 'critica') : ''}` : '-'}</td><td>${esc(i.proveedor_nombre || '-')}</td>
          <td class="dova-ext-acciones">${maneja ? `<button class="dova-btn-link" data-mov="${i.id}">Movimiento</button>` : ''}<button class="dova-btn-link" data-hist="${i.id}">Historial</button></td></tr>`;
      }).join('') || '<tr><td colspan="7">Sin insumos.</td></tr>'}
      </tbody></table></div>`;
    const fi = c.querySelector('[data-filtro]');
    let t = null;
    fi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => insumos(c, fi.value).then(() => { const n = c.querySelector('[data-filtro]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 300); });
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => X.modalForm('Nuevo insumo', [
      { k: 'nombre', label: 'Nombre', req: true, max: 150 },
      { k: 'categoria', label: 'Categoría', max: 80 },
      { k: 'stockActual', label: 'Stock inicial', tipo: 'numero', min: 0 },
      { k: 'stockMinimo', label: 'Stock mínimo (alerta)', tipo: 'numero', min: 0 },
      { k: 'proveedorId', label: 'Proveedor', tipo: 'select', opciones: provs.map((p) => [p.id, p.nombre]) },
      { k: 'precioCompra', label: 'Precio de compra (Gs.)', tipo: 'numero', min: 0 },
      { k: 'lote', label: 'Lote', max: 60 },
      { k: 'fechaVencimiento', label: 'Vencimiento', tipo: 'fecha' },
    ], { stockActual: 0, stockMinimo: 0 }, async (d) => {
      if (d.proveedorId) d.proveedorId = Number(d.proveedorId);
      await DOVA.post('/inventario/insumos', d); toast('Insumo creado', 'ok'); insumos(c, filtro);
    }));
    c.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => {
      const i = lista.find((x) => String(x.id) === b.dataset.mov);
      X.modalForm(`Movimiento — ${i.nombre}`, [
        { k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: [['entrada', 'Entrada (llegó mercadería)'], ['salida', 'Salida (uso)'], ['perdida', 'Pérdida / rotura'], ['vencimiento', 'Baja por vencimiento'], ['ajuste', 'Ajuste (fijar el stock contado)']] },
        { k: 'cantidad', label: 'Cantidad', tipo: 'numero', req: true, min: 0 },
        { k: 'motivo', label: 'Motivo', ancho: 'completo', max: 200 },
      ], { tipo: 'salida' }, async (d) => {
        const r = await DOVA.post(`/inventario/insumos/${i.id}/movimiento`, d);
        toast(`Stock actualizado: ${num(r.stock_actual)}`, 'ok'); insumos(c, filtro);
      }, { extraHtml: `<p class="dova-nota">Stock actual: <strong>${num(i.stock_actual)}</strong>. En "Ajuste" la cantidad es el stock que contaste.</p>` });
    }));
    c.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', async () => {
      const i = lista.find((x) => String(x.id) === b.dataset.hist);
      const movs = await DOVA.get(`/inventario/insumos/${i.id}/movimientos`).catch(() => []);
      X.modal(`Historial — ${i.nombre}`, `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>
        ${movs.map((m) => `<tr><td>${X.fmtFechaHora(m.fecha || m.creado_en)}</td><td>${esc(etiqueta(m.tipo))}</td><td>${num(m.cantidad)}</td><td>${esc(m.motivo || '')}</td><td>${esc(m.usuario_nombre || '-')}</td></tr>`).join('') || '<tr><td colspan="5">Sin movimientos.</td></tr>'}
        </tbody></table></div><div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    }));
  }

  async function compra(c) {
    const [lista, provs] = await Promise.all([DOVA.get('/inventario/insumos'), DOVA.get('/inventario/proveedores').catch(() => [])]);
    c.innerHTML = `
      <form data-compra class="dova-ext-caja">
        <h4>Nueva compra</h4>
        <p class="dova-nota">Al guardar, el stock de cada insumo se suma automáticamente.</p>
        <div class="dova-ext-form-grid">
          <div class="dova-ext-campo"><label>Proveedor *</label><select name="proveedorId" required><option value="">—</option>${provs.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>
          <div class="dova-ext-campo"><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"/></div>
        </div>
        <table class="dova-tabla dova-op-items"><thead><tr><th>Insumo</th><th>Cantidad</th><th>Precio unit.</th><th></th></tr></thead><tbody data-items></tbody></table>
        <button type="button" class="dova-btn-secundario" data-agregar>+ Agregar insumo</button>
        <p class="dova-op-total">Total: <strong data-total>Gs. 0</strong></p>
        <p class="dova-error-text" data-error style="display:none"></p>
        <button class="dova-btn-primary">Guardar compra</button>
      </form>`;
    const form = c.querySelector('[data-compra]');
    const tbody = form.querySelector('[data-items]');
    const total = () => { let s = 0; tbody.querySelectorAll('tr').forEach((tr) => { s += Number(tr.querySelector('[data-cant]').value || 0) * Number(tr.querySelector('input[data-precio]').value || 0); }); form.querySelector('[data-total]').textContent = fmtGs(s); };
    const fila = () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-ins required><option value="">—</option>${lista.map((i) => `<option value="${i.id}" data-p="${num(i.precio_compra)}">${esc(i.nombre)}</option>`).join('')}</select></td>
        <td><input data-cant type="number" min="1" value="1" style="width:80px" required/></td><td><input data-precio type="number" min="0" step="100" value="0" style="width:120px"/></td>
        <td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar>✕</button></td>`;
      tbody.appendChild(tr);
      const sel = tr.querySelector('[data-ins]');
      sel.addEventListener('change', () => { tr.querySelector('input[data-precio]').value = sel.selectedOptions[0].dataset.p || 0; total(); });
      tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', total));
      tr.querySelector('[data-quitar]').addEventListener('click', () => { tr.remove(); total(); });
    };
    form.querySelector('[data-agregar]').addEventListener('click', fila);
    fila();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      const items = [...tbody.querySelectorAll('tr')].map((tr) => ({ insumoId: Number(tr.querySelector('[data-ins]').value), cantidad: Number(tr.querySelector('[data-cant]').value), precioUnitario: Number(tr.querySelector('input[data-precio]').value || 0) })).filter((i) => i.insumoId);
      try {
        if (!items.length) throw new Error('Agregá al menos un insumo');
        await DOVA.post('/inventario/compras', { proveedorId: Number(form.proveedorId.value), fecha: form.fecha.value || undefined, items, total: items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0) });
        toast('Compra registrada y stock actualizado', 'ok'); compra(c);
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }

  async function proveedores(c) {
    const lista = await DOVA.get('/inventario/proveedores');
    const maneja = puede('proveedores.manage');
    c.innerHTML = `
      <div class="dova-toolbar"><span></span>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo proveedor</button>' : ''}</div>
      <table class="dova-tabla"><thead><tr><th>Proveedor</th><th>Teléfono</th><th>Email</th><th>Productos</th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td>${esc(p.nombre)}${p.empresa ? ` <span class="dova-nota">${esc(p.empresa)}</span>` : ''}</td><td>${esc(p.telefono || p.whatsapp || '-')}</td><td>${esc(p.email || '-')}</td><td>${esc(p.productos || '-')}</td></tr>`).join('') || '<tr><td colspan="4">Sin proveedores.</td></tr>'}
      </tbody></table>`;
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => X.modalForm('Nuevo proveedor', [
      { k: 'nombre', label: 'Nombre', req: true, max: 150 }, { k: 'empresa', label: 'Empresa', max: 150 },
      { k: 'telefono', label: 'Teléfono', max: 40 }, { k: 'whatsapp', label: 'WhatsApp', max: 40 }, { k: 'email', label: 'Email', max: 150 },
      { k: 'productos', label: 'Qué provee', ancho: 'completo' }, { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
    ], {}, async (d) => { await DOVA.post('/inventario/proveedores', d); toast('Proveedor creado', 'ok'); proveedores(c); }));
  }

  // =================================================================
  // CATÁLOGO: tratamientos y odontólogos
  // =================================================================
  async function catalogo(root) {
    root.innerHTML = `<h2 class="dova-view-title">Catálogo</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'trat', texto: 'Tratamientos y precios', visible: puede('tratamientos.manage'), render: tratamientos },
      { id: 'odo', texto: 'Odontólogos', visible: puede('usuarios.manage'), render: odontologos },
    ]);
  }

  async function tratamientos(c) {
    const tipos = await DOVA.get('/recalls/tipos').catch(() => []);
    await X.tablaCrud({
      root: c, endpoint: '/tratamientos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true, nuevoTexto: '+ Nuevo tratamiento', tituloModal: 'Tratamiento',
      descripcion: 'Lo que se elige al dar turnos y armar presupuestos. El control periódico hace que DOVA agende solo el recall cuando se termina el tratamiento.',
      claseFila: (r) => (r.activo === false ? 'dova-op-fila-apagada' : ''),
      columnas: [
        { t: 'Tratamiento', v: (r) => esc(r.nombre) }, { t: 'Categoría', v: (r) => esc(r.categoria || '-') }, { t: 'Precio', v: (r) => fmtGs(r.precio) },
        { t: 'Duración', v: (r) => (r.duracion_minutos ? `${r.duracion_minutos} min` : '-') },
        { t: 'Control periódico', v: (r) => esc((tipos.find((x) => x.id === r.recall_tipo_id) || {}).nombre || '-') },
        { t: 'Estado', v: (r) => (r.activo === false ? badge('Inactivo', 'critica') : badge('Activo', 'ok')) },
      ],
      campos: [
        { k: 'nombre', label: 'Nombre', req: true, max: 150 }, { k: 'categoria', label: 'Categoría', max: 80 },
        { k: 'precio', label: 'Precio (Gs.)', tipo: 'numero', req: true, min: 0 }, { k: 'duracionMinutos', label: 'Duración (min)', tipo: 'numero', min: 5, max: 480 },
        { k: 'recallTipoId', label: 'Control periódico al terminar', tipo: 'select', opciones: tipos.map((x) => [x.id, `${x.nombre} (cada ${x.intervalo_meses} meses)`]) },
        { k: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true },
      ],
      valoresEditar: (r) => ({ nombre: r.nombre, categoria: r.categoria, precio: num(r.precio), duracionMinutos: r.duracion_minutos, recallTipoId: r.recall_tipo_id, descripcion: r.descripcion, activo: r.activo !== false }),
      preparar: (d) => { if (d.recallTipoId !== undefined) d.recallTipoId = d.recallTipoId ? Number(d.recallTipoId) : null; },
      alGuardar: () => { X.olvidarCatalogo('tratamientos'); tratamientos(c); },
    });
  }

  async function odontologos(c) {
    await X.tablaCrud({
      root: c, endpoint: '/odontologos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true, nuevoTexto: '+ Nuevo odontólogo', tituloModal: 'Odontólogo',
      descripcion: 'Para que un odontólogo entre a DOVA con su usuario, crealo acá y después vinculalo en Usuarios.',
      claseFila: (r) => (r.activo === false ? 'dova-op-fila-apagada' : ''),
      columnas: [
        { t: 'Nombre', v: (r) => esc(r.nombre) }, { t: 'Especialidad', v: (r) => esc(r.especialidad || '-') }, { t: 'Matrícula', v: (r) => esc(r.matricula || '-') },
        { t: 'Contacto', v: (r) => esc([r.telefono, r.email].filter(Boolean).join(' · ') || '-') },
        { t: 'Estado', v: (r) => (r.activo === false ? badge('Inactivo', 'critica') : badge('Activo', 'ok')) },
      ],
      campos: [
        { k: 'nombre', label: 'Nombre completo', req: true, max: 150 }, { k: 'especialidad', label: 'Especialidad', max: 100 }, { k: 'matricula', label: 'Matrícula', max: 50 },
        { k: 'telefono', label: 'Teléfono', max: 40 }, { k: 'email', label: 'Email', max: 150 }, { k: 'colorAgenda', label: 'Color en la agenda (ej. #2E7D32)', max: 20 },
        { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true },
      ],
      valoresEditar: (r) => ({ nombre: r.nombre, especialidad: r.especialidad, matricula: r.matricula, telefono: r.telefono, email: r.email, colorAgenda: r.color_agenda, activo: r.activo !== false }),
      alGuardar: () => { X.olvidarCatalogo('odontologos'); odontologos(c); },
    });
  }

  return { agenda, caja, inventario, catalogo, extenderFicha, modalTurno, modalCobro };
})();
window.DovaOperativo = DovaOperativo;
