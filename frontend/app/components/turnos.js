/* DOVA — piezas compartidas para turnos y pacientes.
   - Buscador de paciente para formularios: campoPacienteHtml(), activarBuscadorPaciente(), fijarPaciente().
   - Formulario de turno nuevo o editado: modalTurno({ turno, fijo, alGuardar, soloDisponibles }).
   - confirmar(): ventana de "¿Seguro?" con botón de confirmar.
   - Formatos y colores comunes: hora5(), colorOdo(), ESTADO_NIVEL, opcionesMetodos().
   Las usan la agenda, la ficha, los accesos rápidos y otras pantallas. */
const DovaTurnos = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy } = X;

  // Métodos de pago configurados en Facturación → Configuración (si no se pueden leer, los básicos).
  const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['qr', 'QR']];
  async function opcionesMetodos() {
    try { const lista = await DovaFacturacion.metodos(); return lista.filter((m) => m.activo !== false).map((m) => [m.codigo, m.nombre]); } catch (_e) { return METODOS; }
  }
  // "09:30:00" → "09:30"
  const hora5 = (hora) => String(hora || '').slice(0, 5);
  // Color de cada odontólogo en la agenda (el elegido en su ficha o uno fijo de la paleta).
  const PALETA = ['#2E7D32', '#1565C0', '#AD1457', '#EF6C00', '#6A1B9A', '#00838F', '#5D4037', '#C62828'];
  const colorOdo = (o) => (o && /^#[0-9a-f]{3,8}$/i.test(o.color_agenda || '') ? o.color_agenda : PALETA[((o && o.id) || 0) % PALETA.length]);
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
            || '<p class="dova-vacio">Sin resultados.</p>';
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
     fijo = { pacienteId, pacienteNombre, fecha, hora, odontologoId } para precargar. */
  /* soloDisponibles: acceso rápido "Nuevo turno". El odontólogo se elige solo entre
     los que están libres a esa fecha y hora (horario de atención, sin otro turno ni
     bloqueo, con algún sillón libre). Si no hay ninguno, no deja reservar. */
  async function modalTurno({ turno = null, fijo = {}, alGuardar, soloDisponibles = false } = {}) {
    const { odos, trats, sillones } = await catalogosTurno();
    if (soloDisponibles && !fijo.hora) {
      // Propone el próximo horario en punto o y media.
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
      const m = Math.ceil((Number(p.hour) * 60 + Number(p.minute) + 1) / 30) * 30;
      if (m < 24 * 60) fijo = { ...fijo, hora: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
    }
    const v = turno ? {
      odontologoId: turno.odontologo_id, fecha: String(turno.fecha).slice(0, 10), horaInicio: hora5(turno.hora_inicio),
      duracionMinutos: turno.duracion_minutos, tratamientoId: turno.tratamiento_id, sillonId: turno.sillon_id, motivo: turno.motivo, observaciones: turno.observaciones,
    } : { fecha: fijo.fecha || hoy(), horaInicio: fijo.hora || '', duracionMinutos: 30, odontologoId: fijo.odontologoId || (DOVA.usuarioActual() || {}).odontologoId || (odos.length === 1 ? odos[0].id : '') };
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
      if (soloDisponibles) {
        if (!datos.odontologoId) throw new Error('No hay odontólogos disponibles en ese horario');
        datos.soloDisponible = true;
      }
      try {
        await guardarTurno(turno && turno.id, datos);
      } catch (e) {
        if (soloDisponibles) setTimeout(revisarDisponibles, 0);
        if (e.silencioso) return; throw e;
      }
      toast(turno ? 'Turno reprogramado' : 'Turno reservado', 'ok');
      if (alGuardar) alGuardar();
    }, { editando: !!turno, textoBoton: turno ? 'Guardar cambios' : 'Reservar turno', ancho: 'ancho' });
    if (!turno) {
      form.insertAdjacentHTML('afterbegin', campoPacienteHtml());
      activarBuscadorPaciente(form);
      if (fijo.pacienteId) fijarPaciente(form, fijo.pacienteId, fijo.pacienteNombre);
    }
    let revisarDisponibles = () => {};
    if (soloDisponibles) revisarDisponibles = activarDisponibles(form, v.odontologoId);
    // Al elegir tratamiento, propone su duración.
    const selT = form.querySelector('[name="tratamientoId"]');
    if (selT) selT.addEventListener('change', () => {
      const t = trats.find((x) => String(x.id) === selT.value);
      if (t && t.duracion_minutos) form.querySelector('[name="duracionMinutos"]').value = t.duracion_minutos;
    });
    return form;
  }

  // Limita el selector de odontólogo a los libres en la fecha/hora/duración elegidas.
  function activarDisponibles(form, preferido) {
    form.classList.add('dova-turno-rapido');
    const sel = form.querySelector('[name="odontologoId"]');
    const btn = form.querySelector('button[type=submit]');
    const dur = form.querySelector('[name="duracionMinutos"]');
    const campo = (dur && dur.closest('.dova-ext-campo')) || sel.closest('.dova-ext-campo') || sel.parentElement;
    campo.insertAdjacentHTML('afterend', '<p class="dova-disp" data-disp aria-live="polite"></p>');
    const aviso = form.querySelector('[data-disp]');
    const val = (k) => (form.querySelector(`[name="${k}"]`) || {}).value || '';
    let pedido = 0; let t = null;
    const revisar = async () => {
      const fecha = val('fecha'); const hora = val('horaInicio').slice(0, 5); const dur = Number(val('duracionMinutos')) || 30;
      const n = ++pedido;
      btn.disabled = true;
      if (!fecha || !hora) { aviso.className = 'dova-disp'; aviso.dataset.estado = 'falta'; aviso.textContent = 'Elegí la fecha y la hora para ver qué odontólogos están libres.'; return; }
      aviso.className = 'dova-disp'; aviso.dataset.estado = 'buscando'; aviso.textContent = 'Buscando odontólogos libres…';
      let r;
      try { r = await DOVA.get(`/agenda/disponibles?fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(hora)}&duracion=${dur}`); } catch (e) {
        if (n !== pedido) return;
        aviso.className = 'dova-disp mal'; aviso.dataset.estado = 'error'; aviso.textContent = e.message || 'No se pudo consultar la disponibilidad.'; return;
      }
      if (n !== pedido) return;
      const antes = sel.value || String(preferido || '');
      sel.innerHTML = r.odontologos.length ? r.odontologos.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join('') : '<option value="">Ninguno disponible</option>';
      sel.disabled = !r.odontologos.length;
      if (r.odontologos.some((o) => String(o.id) === antes)) sel.value = antes;
      // Solo se nombran los que atienden a esa hora pero están ocupados o bloqueados (máximo 5).
      const ocupados = (r.ocupados || []).filter((o) => !/No atiende/.test(o.motivo || ''));
      const ocup = ocupados.slice(0, 5).map((o) => `${esc(o.nombre)}: ${esc(String(o.motivo || '').toLowerCase())}`).join(' · ') + (ocupados.length > 5 ? ` · y ${ocupados.length - 5} más` : '');
      if (!r.odontologos.length) {
        aviso.className = 'dova-disp mal'; aviso.dataset.estado = 'ninguno';
        aviso.innerHTML = `<strong>${esc(r.motivo || 'No hay odontólogos disponibles en ese horario.')}</strong> No se puede reservar: probá con otra hora o día.${ocup ? `<br><small>${ocup}</small>` : ''}`;
        btn.disabled = true;
      } else {
        aviso.className = 'dova-disp ok'; aviso.dataset.estado = 'libres';
        aviso.innerHTML = `${r.odontologos.length === 1 ? '1 odontólogo libre' : `${r.odontologos.length} odontólogos libres`} a esa hora.${ocup ? `<br><small>No disponibles — ${ocup}</small>` : ''}`;
        btn.disabled = false;
      }
    };
    ['fecha', 'horaInicio', 'duracionMinutos'].forEach((k) => {
      const i = form.querySelector(`[name="${k}"]`);
      if (i) ['change', 'input'].forEach((ev) => i.addEventListener(ev, () => { clearTimeout(t); aviso.dataset.estado = 'buscando'; btn.disabled = true; t = setTimeout(revisar, 350); }));
    });
    const selT = form.querySelector('[name="tratamientoId"]');
    if (selT) selT.addEventListener('change', () => { clearTimeout(t); t = setTimeout(revisar, 50); });
    revisar();
    return revisar;
  }

  const ESTADO_NIVEL = { reservado: 'info', confirmado: 'ok', atendido: 'ok', cancelado: 'critica', no_asistio: 'critica', reprogramado: 'atencion' };

  // Lo clínico que conviene saber antes de atender (alertas, último tratamiento, deuda…), en la agenda.
  function contextoClinicoHtml(ctx) {
    const alertas = [];
    if (ctx.alertas.alergias) alertas.push(`<div class="dova-alerta-clinica"><strong>Alergias:</strong> ${esc(ctx.alertas.alergias)}</div>`);
    if (ctx.alertas.medicamentos) alertas.push(`<div class="dova-alerta-clinica"><strong>Medicación:</strong> ${esc(ctx.alertas.medicamentos)}</div>`);
    if (ctx.alertas.antecedentesMedicos) alertas.push(`<div class="dova-alerta-clinica"><strong>Antecedentes:</strong> ${esc(ctx.alertas.antecedentesMedicos)}</div>`);

    return `
      <div class="dova-contexto-clinico">
        ${alertas.length ? `<div class="dova-alertas-clinicas">${alertas.join('')}</div>` : ''}
        <div class="dova-contexto-grid">
          <div>
            <strong>Última evolución</strong>
            <p class="dova-nota">${ctx.ultimaEvolucion ? `${fmtFecha(ctx.ultimaEvolucion.fecha)} — ${esc(ctx.ultimaEvolucion.procedimiento || ctx.ultimaEvolucion.diagnostico || 'Sin detalle')}` : 'Sin evoluciones registradas.'}</p>
          </div>
          <div>
            <strong>Tratamientos activos</strong>
            <p class="dova-nota">${ctx.tratamientosActivos.length ? ctx.tratamientosActivos.map((t) => esc(t.nombre)).join(', ') : 'Sin tratamientos activos.'}</p>
          </div>
          <div>
            <strong>Próxima acción</strong>
            <p class="dova-nota">${ctx.proximaAccion ? esc(ctx.proximaAccion) : 'No especificada.'}</p>
          </div>
          ${ctx.presupuestos !== null ? `
          <div>
            <strong>Presupuestos</strong>
            <p class="dova-nota">${ctx.presupuestos.length ? ctx.presupuestos.map((p) => `${fmtGs(p.total)} (${esc(p.estado)})`).join(', ') : 'Sin presupuestos.'}</p>
          </div>` : ''}
          ${ctx.saldoPendiente !== null ? `
          <div>
            <strong>Saldo pendiente</strong>
            <p class="dova-nota ${ctx.saldoPendiente > 0 ? 'dova-nota-alerta' : ''}">${fmtGs(ctx.saldoPendiente)}</p>
          </div>` : ''}
        </div>
      </div>`;
  }

  return { contextoClinicoHtml, campoPacienteHtml, activarBuscadorPaciente, fijarPaciente, catalogosTurno, guardarTurno, confirmar, modalTurno, ESTADO_NIVEL, opcionesMetodos, colorOdo, hora5 };
})();
window.DovaTurnos = DovaTurnos;
