// Odontólogos disponibles para un turno nuevo (fecha, hora y duración).
// Lo usa el acceso rápido "Nuevo turno": solo se puede reservar con un
// profesional que trabaja a esa hora (su horario o, si no tiene, el de la
// clínica), que no tiene otro turno ni un bloqueo, y con algún sillón libre.
// Al crear con `soloDisponible: true`, el servidor vuelve a verificarlo.
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { str } = require('../../utils/texto');

const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
const OCUPAN = "estado NOT IN ('cancelado','no_asistio','reprogramado')";

function validar({ fecha, hora, duracion }) {
  const f = str(fecha).slice(0, 10); const h = str(hora).slice(0, 5); const d = Number(duracion || 30);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) throw new ApiError(400, 'Fecha inválida');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) throw new ApiError(400, 'Hora inválida (formato HH:MM)');
  if (!Number.isInteger(d) || d < 5 || d > 480) throw new ApiError(400, 'La duración debe ser de 5 a 480 minutos');
  return { fecha: f, hora: h, duracion: d };
}

async function disponibles(clinicaId, params) {
  const { fecha, hora, duracion } = validar(params);
  const web = require('../web/web.service');
  const ini = aMin(hora); const fin = ini + duracion;
  if (web.minutosHasta(fecha, hora) < 0) return { fecha, hora, duracion, odontologos: [], motivo: 'Ese horario ya pasó.' };
  const [cfg, odos, turnos, bloqueos, sillones] = await Promise.all([
    web.obtenerConfig(clinicaId),
    query('SELECT id, nombre, horarios FROM odontologos WHERE clinica_id=$1 AND activo ORDER BY nombre', [clinicaId]),
    query(`SELECT odontologo_id, sillon_id FROM turnos WHERE clinica_id=$1 AND fecha=$2 AND ${OCUPAN}
            AND hora_inicio < ($3::time + ($4::int * interval '1 minute')) AND (hora_inicio + (duracion_minutos * interval '1 minute')) > $3::time`,
    [clinicaId, fecha, hora, duracion]),
    query(`SELECT odontologo_id, sillon_id FROM agenda_bloqueos WHERE clinica_id=$1 AND $2::date BETWEEN fecha AND COALESCE(fecha_hasta, fecha)
            AND (hora_desde IS NULL OR ($3::time < hora_hasta AND ($3::time + ($4::int * interval '1 minute')) > hora_desde))`,
    [clinicaId, fecha, hora, duracion]),
    query('SELECT id FROM sillones WHERE clinica_id=$1 AND activo', [clinicaId]),
  ]);
  if (!odos.rowCount) return { fecha, hora, duracion, odontologos: [], motivo: 'No hay odontólogos activos cargados.' };
  // Sillones: si hay cargados, tiene que quedar alguno libre (ni ocupado ni bloqueado).
  const totalSillones = sillones.rowCount;
  const enUso = turnos.rows.length; // cada turno que se superpone ocupa un sillón
  const sillonesBloq = new Set(bloqueos.rows.filter((b) => b.sillon_id !== null && b.odontologo_id === null).map((b) => b.sillon_id)).size;
  if (totalSillones && enUso + sillonesBloq >= totalSillones) return { fecha, hora, duracion, odontologos: [], motivo: 'No queda ningún sillón libre en ese horario.' };
  const ocupados = new Set(turnos.rows.map((t) => t.odontologo_id));
  const bloqueoGeneral = bloqueos.rows.some((b) => b.odontologo_id === null && b.sillon_id === null);
  const bloqueados = new Set(bloqueos.rows.filter((b) => b.odontologo_id !== null && b.sillon_id === null).map((b) => b.odontologo_id));
  const dia = String(diaSemana(fecha));
  const lista = [];
  for (const o of odos.rows) {
    const horario = o.horarios && typeof o.horarios === 'object' ? o.horarios : (cfg.horarios || {});
    const franjas = Array.isArray(horario[dia]) ? horario[dia] : [];
    const trabaja = franjas.some(([a, b]) => ini >= aMin(a) && fin <= aMin(b));
    let motivo = null;
    if (!trabaja) motivo = 'No atiende en ese horario';
    else if (bloqueoGeneral || bloqueados.has(o.id)) motivo = 'Tiene la agenda bloqueada';
    else if (ocupados.has(o.id)) motivo = 'Ya tiene un turno';
    lista.push({ id: o.id, nombre: o.nombre, disponible: !motivo, motivo });
  }
  const libres = lista.filter((o) => o.disponible);
  return {
    fecha, hora, duracion,
    odontologos: libres.map(({ id, nombre }) => ({ id, nombre })),
    ocupados: lista.filter((o) => !o.disponible).map(({ id, nombre, motivo }) => ({ id, nombre, motivo })),
    motivo: libres.length ? null : (bloqueoGeneral ? 'La agenda está bloqueada en ese horario.' : 'No hay odontólogos disponibles en ese horario.'),
  };
}

// Para crear con `soloDisponible`: el odontólogo elegido tiene que estar libre.
async function exigirDisponible(clinicaId, { fecha, horaInicio, duracionMinutos, odontologoId }) {
  const r = await disponibles(clinicaId, { fecha, hora: str(horaInicio).slice(0, 5), duracion: duracionMinutos || 30 });
  if (!r.odontologos.some((o) => o.id === Number(odontologoId))) {
    const oc = (r.ocupados || []).find((o) => o.id === Number(odontologoId));
    throw new ApiError(409, oc ? `${oc.nombre}: ${oc.motivo.toLowerCase()}.` : (r.motivo || 'Ese odontólogo no está disponible en ese horario.'));
  }
}

module.exports = { disponibles, exigirDisponible };
