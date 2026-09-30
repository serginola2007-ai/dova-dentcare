const { query } = require('../../config/db');

const SELECT_TURNO = `
  t.id, t.clinica_id, t.paciente_id, t.odontologo_id, t.fecha, t.hora_inicio,
  t.duracion_minutos, t.motivo, t.tratamiento_id, t.sala, t.estado, t.observaciones,
  t.creado_en, t.actualizado_en,
  t.sillon_id, t.confirmacion, t.confirmado_en, t.llegada_en, t.en_sillon_en, t.finalizado_en, t.primera_vez,
  (SELECT s.nombre FROM sillones s WHERE s.id = t.sillon_id) AS sillon_nombre,
  p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono,
  p.whatsapp AS paciente_whatsapp,
  o.nombre AS odontologo_nombre,
  tr.nombre AS tratamiento_nombre
`;

async function listar(clinicaId, { desde, hasta, odontologoId, estado, pacienteId }) {
  const condiciones = ['t.clinica_id = $1'];
  const params = [clinicaId];

  if (desde) { params.push(desde); condiciones.push(`t.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); condiciones.push(`t.fecha <= $${params.length}`); }
  if (odontologoId) { params.push(odontologoId); condiciones.push(`t.odontologo_id = $${params.length}`); }
  if (estado) { params.push(estado); condiciones.push(`t.estado = $${params.length}`); }
  if (pacienteId) { params.push(Number(pacienteId)); condiciones.push(`t.paciente_id = $${params.length}`); }

  const res = await query(
    `SELECT ${SELECT_TURNO}
     FROM turnos t
     JOIN pacientes p ON p.id = t.paciente_id
     JOIN odontologos o ON o.id = t.odontologo_id
     LEFT JOIN tratamientos tr ON tr.id = t.tratamiento_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY t.fecha, t.hora_inicio`,
    params
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT ${SELECT_TURNO}
     FROM turnos t
     JOIN pacientes p ON p.id = t.paciente_id
     JOIN odontologos o ON o.id = t.odontologo_id
     LEFT JOIN tratamientos tr ON tr.id = t.tratamiento_id
     WHERE t.clinica_id = $1 AND t.id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

/* Detecta solapamiento de horario para un odontólogo en una fecha dada.
   Dos turnos se solapan si sus rangos [inicio, inicio+duracion) se cruzan.
   excluirTurnoId se usa al editar un turno existente para no chocar contra sí mismo. */
async function existeSolapamiento(clinicaId, { odontologoId, fecha, horaInicio, duracionMinutos, excluirTurnoId }) {
  const params = [clinicaId, odontologoId, fecha, horaInicio, duracionMinutos];
  let excluirSql = '';
  if (excluirTurnoId) {
    params.push(excluirTurnoId);
    excluirSql = `AND id <> $${params.length}`;
  }
  const res = await query(
    `SELECT id FROM turnos
     WHERE clinica_id = $1 AND odontologo_id = $2 AND fecha = $3
       AND estado NOT IN ('cancelado', 'no_asistio')
       ${excluirSql}
       AND hora_inicio < ($4::time + ($5 || ' minutes')::interval)
       AND ($4::time) < (hora_inicio + (duracion_minutos || ' minutes')::interval)
     LIMIT 1`,
    params
  );
  return res.rows.length > 0;
}

async function crear(clinicaId, datos, creadoPor) {
  const res = await query(
    `INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio,
       duracion_minutos, motivo, tratamiento_id, sala, observaciones, creado_por, sillon_id, primera_vez)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       COALESCE($13, NOT EXISTS (SELECT 1 FROM turnos x WHERE x.paciente_id = $2 AND x.estado = 'atendido')))
     RETURNING id`,
    [clinicaId, datos.pacienteId, datos.odontologoId, datos.fecha, datos.horaInicio,
      datos.duracionMinutos || 30, datos.motivo || null, datos.tratamientoId || null,
      datos.sala || null, datos.observaciones || null, creadoPor, datos.sillonId || null,
      typeof datos.primeraVez === 'boolean' ? datos.primeraVez : null]
  );
  return obtenerPorId(clinicaId, res.rows[0].id);
}

async function actualizar(clinicaId, id, datos) {
  const mapa = {
    pacienteId: 'paciente_id', odontologoId: 'odontologo_id', fecha: 'fecha',
    horaInicio: 'hora_inicio', duracionMinutos: 'duracion_minutos', motivo: 'motivo',
    tratamientoId: 'tratamiento_id', sala: 'sala', estado: 'estado', observaciones: 'observaciones',
    sillonId: 'sillon_id',
  };
  const sets = [];
  const params = [clinicaId, id];
  for (const [key, col] of Object.entries(mapa)) {
    if (datos[key] !== undefined) { params.push(datos[key]); sets.push(`${col} = $${params.length}`); }
  }
  if (sets.length === 0) return obtenerPorId(clinicaId, id);
  const res = await query(
    `UPDATE turnos SET ${sets.join(', ')}, actualizado_en = now()
     WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    params
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

async function registrarHistorial(turnoId, usuarioId, cambio) {
  await query(
    'INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,$2,$3)',
    [turnoId, usuarioId, JSON.stringify(cambio)]
  );
}

async function obtenerHistorial(turnoId) {
  const res = await query(
    `SELECT th.*, u.nombre AS usuario_nombre FROM turno_historial th
     LEFT JOIN usuarios u ON u.id = th.usuario_id
     WHERE turno_id = $1 ORDER BY creado_en DESC`,
    [turnoId]
  );
  return res.rows;
}

module.exports = {
  listar, obtenerPorId, existeSolapamiento, crear, actualizar,
  registrarHistorial, obtenerHistorial,
};
