const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./agenda.repository');
const auditoria = require('../../utils/auditoria');
const pacientesRepo = require('../pacientes/pacientes.repository');
const historiaRepo = require('../historia-clinica/historia.repository');
const planesRepo = require('../planes-tratamiento/planes.repository');
const presupuestosRepo = require('../presupuestos/presupuestos.repository');
const pagosRepo = require('../pagos/pagos.repository');
const odontologosRepo = require('../odontologos/odontologos.repository');

const { conCandado } = require('../../config/db');

// Claves de candado de agenda: por odontólogo y por sillón en el día.
function clavesAgenda(clinicaId, { odontologoId, sillonId, fecha }) {
  const dia = String(fecha).slice(0, 10);
  return [
    odontologoId && `agenda:odo:${clinicaId}:${odontologoId}:${dia}`,
    sillonId && `agenda:sillon:${clinicaId}:${sillonId}:${dia}`,
  ];
}

// Datos de horario razonables: fecha real, hora HH:MM y duración de 5 min a 8 h.
function validarHorario(d, creando) {
  if (d.fecha !== undefined || creando) {
    const f = String(d.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f + 'T12:00:00Z'))) throw new ApiError(400, 'Fecha del turno inválida');
  }
  if (d.horaInicio !== undefined || creando) {
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(d.horaInicio || ''))) throw new ApiError(400, 'Hora del turno inválida (formato HH:MM)');
  }
  if (d.duracionMinutos !== undefined && d.duracionMinutos !== null && d.duracionMinutos !== '') {
    const m = Number(d.duracionMinutos);
    if (!Number.isInteger(m) || m < 5 || m > 480) throw new ApiError(400, 'La duración del turno debe ser de 5 a 480 minutos');
  }
}

const ESTADOS_VALIDOS = ['reservado', 'confirmado', 'atendido', 'cancelado', 'reprogramado', 'no_asistio'];

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const turno = await repo.obtenerPorId(clinicaId, id);
  if (!turno) throw new ApiError(404, 'Turno no encontrado');
  turno.historial = await repo.obtenerHistorial(id);
  return turno;
}

// Bloqueos de agenda (feriados, vacaciones, almuerzo…): un turno que cae en
// un bloqueo se rechaza, salvo que se pida explícitamente (forzar: true),
// p. ej. para atender una urgencia en un horario bloqueado.
async function verificarBloqueo(clinicaId, d) {
  // Sillón: debe ser de esta clínica y no puede estar ocupado por otro turno.
  if (d.sillonId) {
    const { verificarReferencia } = require('../../utils/recurso');
    const { query } = require('../../config/db');
    await verificarReferencia(clinicaId, 'sillones', Number(d.sillonId), 'sillonId');
    const ocupado = await query(
      `SELECT 1 FROM turnos WHERE clinica_id=$1 AND sillon_id=$2 AND fecha=$3 AND estado NOT IN ('cancelado','reprogramado','no_asistio')
         AND ($6::int IS NULL OR id <> $6)
         AND hora_inicio < ($4::time + ($5::int * interval '1 minute')) AND (hora_inicio + (duracion_minutos * interval '1 minute')) > $4::time`,
      [clinicaId, Number(d.sillonId), d.fecha, d.horaInicio, d.duracionMinutos || 30, d.excluirTurnoId || null]
    );
    if (ocupado.rowCount) throw new ApiError(409, 'Ese sillón ya está ocupado en ese horario.');
  }
  if (d.forzar === true || d.forzar === 'true') return;
  const { bloqueoQueAfecta } = require('../operaciones/operaciones.routes');
  const b = await bloqueoQueAfecta(clinicaId, d);
  if (b) {
    throw new ApiError(409, `Ese horario está bloqueado (${b.tipo}${b.motivo ? ': ' + b.motivo : ''}${b.odontologo_nombre ? ' — ' + b.odontologo_nombre : ''}). Si igual querés reservarlo, confirmá forzando el turno.`, { bloqueo: b, puedeForzar: true });
  }
}

async function crear(clinicaId, datos, usuario) {
  validarHorario(datos, true);
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  const odontologo = await odontologosRepo.obtenerPorId(clinicaId, datos.odontologoId);
  if (!odontologo) throw new ApiError(404, 'Odontólogo no encontrado en esta clínica');
  // Verificar y guardar bajo candado: dos recepcionistas reservando el mismo
  // horario al mismo tiempo ya no pueden crear dos turnos.
  const turno = await conCandado(clavesAgenda(clinicaId, datos), async () => {
    const solapa = await repo.existeSolapamiento(clinicaId, {
      odontologoId: datos.odontologoId, fecha: datos.fecha,
      horaInicio: datos.horaInicio, duracionMinutos: datos.duracionMinutos || 30,
    });
    if (solapa) {
      throw new ApiError(409, 'El odontólogo ya tiene un turno en ese horario. Elegí otro horario o revisá la agenda.');
    }
    await verificarBloqueo(clinicaId, { ...datos, duracionMinutos: datos.duracionMinutos || 30 });
    return repo.crear(clinicaId, datos, usuario.id);
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'agenda', entidadId: turno.id,
    detalle: { paciente: `${turno.paciente_nombre} ${turno.paciente_apellido}`, fecha: turno.fecha, hora: turno.hora_inicio },
  });
  return turno;
}

async function actualizar(clinicaId, id, datos, usuario) {
  const actual = await repo.obtenerPorId(clinicaId, id);
  if (!actual) throw new ApiError(404, 'Turno no encontrado');

  if (datos.pacienteId !== undefined) {
    const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
    if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  }
  if (datos.odontologoId !== undefined) {
    const odontologo = await odontologosRepo.obtenerPorId(clinicaId, datos.odontologoId);
    if (!odontologo) throw new ApiError(404, 'Odontólogo no encontrado en esta clínica');
  }

  validarHorario(datos, false);
  if (datos.estado && !ESTADOS_VALIDOS.includes(datos.estado)) {
    throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  }

  // Si cambia fecha/hora/odontólogo, revalidar solapamiento (evita doble reserva al reprogramar).
  const cambiaHorario = datos.fecha !== undefined || datos.horaInicio !== undefined
    || datos.duracionMinutos !== undefined || datos.odontologoId !== undefined || datos.sillonId !== undefined;
  const guardar = async () => {
    if (cambiaHorario) {
      const solapa = await repo.existeSolapamiento(clinicaId, {
        odontologoId: datos.odontologoId ?? actual.odontologo_id,
        fecha: datos.fecha ?? actual.fecha,
        horaInicio: datos.horaInicio ?? actual.hora_inicio,
        duracionMinutos: datos.duracionMinutos ?? actual.duracion_minutos,
        excluirTurnoId: id,
      });
      if (solapa) {
        throw new ApiError(409, 'El odontólogo ya tiene un turno en ese horario.');
      }
      await verificarBloqueo(clinicaId, {
        forzar: datos.forzar, excluirTurnoId: id, sillonId: datos.sillonId ?? actual.sillon_id,
        odontologoId: datos.odontologoId ?? actual.odontologo_id,
        fecha: String(datos.fecha ?? actual.fecha).slice(0, 10),
        horaInicio: datos.horaInicio ?? actual.hora_inicio,
        duracionMinutos: datos.duracionMinutos ?? actual.duracion_minutos,
      });
    }
    return repo.actualizar(clinicaId, id, datos);
  };
  const turno = cambiaHorario
    ? await conCandado(clavesAgenda(clinicaId, {
      odontologoId: datos.odontologoId ?? actual.odontologo_id,
      sillonId: datos.sillonId ?? actual.sillon_id,
      fecha: datos.fecha ?? actual.fecha,
    }), guardar)
    : await guardar();

  // Guardar historial de cambios relevantes (reprogramación, cambio de estado)
  const cambiosRelevantes = {};
  const COLUMNA = { fecha: 'fecha', horaInicio: 'hora_inicio', estado: 'estado', odontologoId: 'odontologo_id' };
  for (const campo of ['fecha', 'horaInicio', 'estado', 'odontologoId']) {
    if (datos[campo] !== undefined && String(actual[COLUMNA[campo]]) !== String(datos[campo])) {
      cambiosRelevantes[campo] = { de: actual[COLUMNA[campo]], a: datos[campo] };
    }
  }

  // Flujo del paciente + seguimiento automático al cambiar el estado.
  if (datos.estado && datos.estado !== actual.estado) {
    const { query } = require('../../config/db');
    if (datos.estado === 'confirmado') {
      await query("UPDATE turnos SET confirmacion='confirmado', confirmado_en=COALESCE(confirmado_en, now()) WHERE id=$1 AND clinica_id=$2", [id, clinicaId]);
    }
    if (datos.estado === 'atendido') {
      await query('UPDATE turnos SET finalizado_en=COALESCE(finalizado_en, now()) WHERE id=$1 AND clinica_id=$2', [id, clinicaId]);
      // Recall: si el tratamiento del turno tiene un control periódico
      // asociado, se programa solo el próximo (nunca bloquea el cambio).
      try {
        const recalls = require('../recalls/recalls.service');
        await recalls.registrarAtencion(clinicaId, {
          pacienteId: actual.paciente_id, tratamientoId: actual.tratamiento_id,
          fecha: String(actual.fecha).slice(0, 10), odontologoId: actual.odontologo_id,
        }, usuario);
      } catch (e) { console.error('[recalls] no se pudo programar el recall automático:', e.message); }
    }
  }
  if (Object.keys(cambiosRelevantes).length > 0) {
    await repo.registrarHistorial(id, usuario.id, cambiosRelevantes);
  }

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'editar', modulo: 'agenda', entidadId: id, detalle: datos,
  });
  return turno;
}

async function cambiarEstado(clinicaId, id, estado, usuario) {
  return actualizar(clinicaId, id, { estado }, usuario);
}

/* Contexto clínico del turno (sección 24 del prompt): al abrir una cita en
   la agenda, el odontólogo ve de un vistazo paciente/motivo/última
   consulta/tratamiento/piezas/alertas/próxima acción/presupuesto y saldo
   (si tiene permiso) y última evolución — sin salir de la agenda. Reusa
   los repos existentes de cada módulo, nada nuevo se duplica. */
async function contextoClinico(clinicaId, id, permisos) {
  const turno = await repo.obtenerPorId(clinicaId, id);
  if (!turno) throw new ApiError(404, 'Turno no encontrado');

  const puedeClinico = permisos.includes('pacientes.clinical.view') || permisos.includes('historia_clinica.view');
  const puedePresupuestos = permisos.includes('presupuestos.view');
  const puedePagos = permisos.includes('pagos.view');

  const [paciente, planes, evoluciones, presupuestos, resumenPagos] = await Promise.all([
    pacientesRepo.obtenerPorId(clinicaId, turno.paciente_id),
    planesRepo.listarPorPaciente(clinicaId, turno.paciente_id).catch(() => []),
    puedeClinico ? historiaRepo.listarPorPaciente(clinicaId, turno.paciente_id).catch(() => []) : [],
    puedePresupuestos ? presupuestosRepo.listarPorPaciente(clinicaId, turno.paciente_id).catch(() => []) : [],
    puedePagos ? pagosRepo.resumenPaciente(clinicaId, turno.paciente_id).catch(() => null) : null,
  ]);

  const tratamientosActivos = (planes || []).filter((p) => ['pendiente', 'aprobado', 'en_proceso'].includes(p.estado));
  const ultimaEvolucion = (evoluciones && evoluciones.length) ? evoluciones[0] : null;
  const piezasInvolucradas = ultimaEvolucion ? (ultimaEvolucion.piezas || []) : [];

  return {
    turno,
    paciente,
    alertas: {
      alergias: paciente ? paciente.alergias : null,
      medicamentos: paciente ? paciente.medicamentos : null,
      antecedentesMedicos: paciente ? paciente.antecedentes_medicos : null,
    },
    tratamientosActivos,
    ultimaEvolucion,
    piezasInvolucradas,
    proximaAccion: ultimaEvolucion ? ultimaEvolucion.proxima_accion : null,
    presupuestos: puedePresupuestos ? presupuestos : null,
    saldoPendiente: puedePagos && resumenPagos ? resumenPagos.saldoPendiente : null,
  };
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, contextoClinico, ESTADOS_VALIDOS };
