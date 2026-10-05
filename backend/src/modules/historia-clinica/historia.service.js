const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./historia.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) {
  return repo.listarPorPaciente(clinicaId, pacienteId);
}

async function listarPorPieza(clinicaId, pacienteId, pieza) {
  return repo.listarPorPieza(clinicaId, pacienteId, pieza);
}

const { query } = require('../../config/db');

// Normaliza y valida lo que llega del formulario de consulta.
function limpiar(d) {
  const out = { ...d };
  for (const k of ['motivoConsulta', 'anamnesis', 'diagnostico', 'diagnosticoDiferencial', 'procedimiento', 'anestesia', 'materiales', 'evolucion',
    'indicaciones', 'observaciones', 'complicaciones', 'medicacion', 'proximaAccion']) {
    if (out[k] !== undefined && out[k] !== null) out[k] = String(out[k]).slice(0, 8000);
  }
  if (out.piezas !== undefined && out.piezas !== null) {
    const lista = (Array.isArray(out.piezas) ? out.piezas : String(out.piezas).split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
    const malas = lista.filter((x) => !/^[1-8][1-8]$/.test(x));
    if (malas.length) throw new ApiError(400, `Pieza inválida: ${malas.join(', ')}. Usá la numeración FDI (11 a 48, 51 a 85).`);
    out.piezas = lista.length ? [...new Set(lista)] : null;
  }
  return out;
}

// Turno/plan vinculados: deben ser del mismo paciente y clínica.
async function verificarVinculos(clinicaId, pacienteId, d) {
  if (d.turnoId) {
    const r = await query('SELECT 1 FROM turnos WHERE clinica_id=$1 AND paciente_id=$2 AND id=$3', [clinicaId, pacienteId, Number(d.turnoId)]);
    if (!r.rowCount) throw new ApiError(400, 'El turno no corresponde a este paciente');
  }
  if (d.planId) {
    const r = await query('SELECT 1 FROM planes_tratamiento WHERE clinica_id=$1 AND paciente_id=$2 AND id=$3', [clinicaId, pacienteId, Number(d.planId)]);
    if (!r.rowCount) throw new ApiError(400, 'El tratamiento no corresponde a este paciente');
  }
}

async function crear(clinicaId, datosIn, usuario) {
  const datos = limpiar(datosIn || {});
  if (!datos.pacienteId) throw new ApiError(400, 'El paciente es obligatorio');
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  await verificarVinculos(clinicaId, paciente.id, datos);
  if (!datos.odontologoId && usuario.odontologoId) datos.odontologoId = usuario.odontologoId;
  const entrada = await repo.crear(clinicaId, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'historia_clinica', entidadId: entrada.id,
    detalle: { pacienteId: datos.pacienteId, procedimiento: datos.procedimiento },
  });
  return entrada;
}

/* Firmar una evolución la vuelve inmutable (sección 41: evitar
   modificaciones silenciosas). A partir de acá, cualquier corrección pasa
   por crearEnmienda, nunca por un UPDATE directo. */
async function firmar(clinicaId, id, usuario) {
  const entrada = await repo.obtenerPorId(clinicaId, id);
  if (!entrada) throw new ApiError(404, 'Evolución clínica no encontrada');
  if (entrada.firmada) throw new ApiError(409, 'Esta evolución ya está firmada');
  const firmada = await repo.firmar(clinicaId, id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'firmar', modulo: 'historia_clinica', entidadId: id,
  });
  return firmada;
}

async function crearEnmienda(clinicaId, id, datos, usuario) {
  const original = await repo.obtenerPorId(clinicaId, id);
  if (!original) throw new ApiError(404, 'Evolución clínica no encontrada');
  if (!original.firmada) throw new ApiError(400, 'Solo se puede enmendar una evolución ya firmada; si no está firmada, editala directamente');
  if (!datos.motivoEnmienda) throw new ApiError(400, 'El motivo de la enmienda es obligatorio');
  const enmienda = await repo.crearEnmienda(clinicaId, original, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'enmendar', modulo: 'historia_clinica', entidadId: id,
    detalle: { nuevaEntradaId: enmienda.id, motivo: datos.motivoEnmienda },
  });
  return enmienda;
}

async function timelinePaciente(clinicaId, pacienteId) {
  return repo.timelinePaciente(clinicaId, pacienteId);
}

// Corrige una consulta TODAVÍA NO FIRMADA (borrador del modo consulta).
async function actualizarBorrador(clinicaId, id, datosIn, usuario) {
  const antes = await repo.obtenerPorId(clinicaId, id);
  if (!antes) throw new ApiError(404, 'Consulta no encontrada');
  if (antes.firmada) throw new ApiError(409, 'Esta consulta ya está finalizada y firmada: para corregirla usá "Enmendar" (queda registrado quién, cuándo y por qué).');
  const datos = limpiar(datosIn || {});
  await verificarVinculos(clinicaId, antes.paciente_id, datos);
  const despues = await repo.actualizarBorrador(clinicaId, id, datos);
  if (!despues) throw new ApiError(409, 'La consulta se firmó mientras tanto: ya no se puede editar');
  const cambios = Object.keys(repo.CAMPOS_BORRADOR).filter((k) => datos[k] !== undefined);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar_borrador', modulo: 'historia_clinica', entidadId: id, detalle: { pacienteId: antes.paciente_id, campos: cambios } });
  return despues;
}

// Todo lo que el modo consulta necesita ver del paciente, en un solo pedido.
async function contextoConsulta(clinicaId, pacienteId, { turnoId, sinTurno }, usuario) {
  const pid = Number(pacienteId);
  const p = (await query(`SELECT id, nombre, apellido, ci, sexo, fecha_nacimiento::text AS fecha_nacimiento, telefono, whatsapp, email, alergias, medicamentos,
                                 antecedentes_medicos, antecedentes_odontologicos, grupo_sanguineo, observaciones, activo
                            FROM pacientes WHERE clinica_id=$1 AND id=$2`, [clinicaId, pid])).rows[0];
  if (!p) throw new ApiError(404, 'Paciente no encontrado');
  let turno = null;
  // Sin turno indicado: si el paciente tiene un turno HOY sin terminar (del
  // odontólogo que abre la consulta, si es odontólogo), se usa ese.
  if (!turnoId && sinTurno !== '1') {
    const t = (await query(`SELECT id FROM turnos WHERE clinica_id=$1 AND paciente_id=$2 AND fecha=(now() AT TIME ZONE 'America/Asuncion')::date
                              AND estado IN ('reservado','confirmado') AND finalizado_en IS NULL AND ($3::int IS NULL OR odontologo_id=$3::int)
                            ORDER BY hora_inicio LIMIT 1`, [clinicaId, pid, usuario.odontologoId || null])).rows[0];
    if (t) turnoId = t.id;
  }
  if (turnoId) {
    turno = (await query(`SELECT t.id, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.duracion_minutos, t.motivo, t.estado, t.llegada_en, t.en_sillon_en, t.finalizado_en,
                                 t.tratamiento_id, tr.nombre AS tratamiento, o.nombre AS odontologo, s.nombre AS sillon
                            FROM turnos t LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN sillones s ON s.id=t.sillon_id
                           WHERE t.clinica_id=$1 AND t.paciente_id=$2 AND t.id=$3`, [clinicaId, pid, Number(turnoId)])).rows[0];
    if (!turno) throw new ApiError(404, 'El turno no corresponde a este paciente');
  }
  const [alergias, medicacion, ultima, proxima, borrador, planes, hoyCount] = await Promise.all([
    query('SELECT sustancia, tipo, reaccion, severidad FROM paciente_alergias WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY severidad DESC NULLS LAST, sustancia', [clinicaId, pid]).catch(() => ({ rows: [] })),
    query('SELECT medicamento, dosis, frecuencia, indicacion FROM paciente_medicacion WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY medicamento', [clinicaId, pid]).catch(() => ({ rows: [] })),
    query(`SELECT h.id, h.fecha::text AS fecha, h.motivo_consulta, h.diagnostico, h.procedimiento, h.piezas, h.indicaciones, h.proxima_accion, h.firmada, o.nombre AS odontologo
             FROM historia_clinica h LEFT JOIN odontologos o ON o.id=h.odontologo_id
            WHERE h.clinica_id=$1 AND h.paciente_id=$2 AND ($3::int IS NULL OR h.turno_id IS DISTINCT FROM $3::int)
            ORDER BY h.fecha DESC, h.id DESC LIMIT 1`, [clinicaId, pid, turno ? turno.id : null]),
    query(`SELECT t.id, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.motivo, o.nombre AS odontologo
             FROM turnos t LEFT JOIN odontologos o ON o.id=t.odontologo_id
            WHERE t.clinica_id=$1 AND t.paciente_id=$2 AND t.estado IN ('reservado','confirmado') AND ($3::int IS NULL OR t.id<>$3::int)
              AND (t.fecha > (now() AT TIME ZONE 'America/Asuncion')::date OR (t.fecha = (now() AT TIME ZONE 'America/Asuncion')::date AND t.hora_inicio >= (now() AT TIME ZONE 'America/Asuncion')::time))
            ORDER BY t.fecha, t.hora_inicio LIMIT 1`, [clinicaId, pid, turno ? turno.id : null]),
    // Borrador: el de este turno, o el último sin firmar de este paciente creado por este usuario hoy.
    query(`SELECT id FROM historia_clinica WHERE clinica_id=$1 AND paciente_id=$2 AND firmada=false
             AND (($3::int IS NOT NULL AND turno_id=$3::int) OR ($3::int IS NULL AND creado_por=$4 AND creado_en::date = now()::date))
           ORDER BY id DESC LIMIT 1`, [clinicaId, pid, turno ? turno.id : null, usuario.id]),
    query(`SELECT id, nombre, pieza, estado, sesiones_totales, sesiones_realizadas FROM planes_tratamiento
            WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('pendiente','en_proceso') ORDER BY estado DESC, id DESC LIMIT 10`, [clinicaId, pid]),
    query('SELECT count(*)::int n FROM historia_clinica WHERE clinica_id=$1 AND paciente_id=$2', [clinicaId, pid]),
  ]);
  // Consulta ya finalizada de este turno (para mostrarla en vez de abrir otra).
  const fin = turno ? (await query('SELECT id FROM historia_clinica WHERE clinica_id=$1 AND turno_id=$2 AND firmada ORDER BY id DESC LIMIT 1', [clinicaId, turno.id])).rows[0] : null;
  return {
    paciente: p, turno, alergias: alergias.rows, medicacion: medicacion.rows,
    ultimaConsulta: ultima.rows[0] || null, proximaCita: proxima.rows[0] || null,
    borrador: borrador.rows[0] ? await repo.obtenerPorId(clinicaId, borrador.rows[0].id) : null,
    planes: planes.rows, totalConsultas: hoyCount.rows[0].n,
    finalizada: fin ? await repo.obtenerPorId(clinicaId, fin.id) : null,
  };
}

module.exports = { listarPorPaciente, listarPorPieza, crear, firmar, crearEnmienda, timelinePaciente, actualizarBorrador, contextoConsulta };
