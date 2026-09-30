const { query } = require('../../config/db');

async function listar(clinicaId, { estado, pacienteId, odontologoId, vencidosDesde } = {}) {
  const cond = ['c.clinica_id=$1'];
  const params = [clinicaId];
  if (estado) { params.push(estado); cond.push(`c.estado=$${params.length}`); }
  if (pacienteId) { params.push(pacienteId); cond.push(`c.paciente_id=$${params.length}`); }
  if (odontologoId) { params.push(odontologoId); cond.push(`c.odontologo_id=$${params.length}`); }
  if (vencidosDesde) { params.push(vencidosDesde); cond.push(`c.fecha_control_programada <= $${params.length} AND c.estado='pendiente'`); }
  const res = await query(
    `SELECT c.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono
       FROM controles_postoperatorios c
       JOIN pacientes p ON p.id = c.paciente_id
      WHERE ${cond.join(' AND ')}
      ORDER BY c.fecha_control_programada ASC`,
    params
  );
  return res.rows;
}

async function obtener(clinicaId, id) {
  const res = await query(
    `SELECT c.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM controles_postoperatorios c JOIN pacientes p ON p.id = c.paciente_id
      WHERE c.clinica_id=$1 AND c.id=$2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, d) {
  const res = await query(
    `INSERT INTO controles_postoperatorios
       (clinica_id, paciente_id, historia_clinica_id, fecha_procedimiento, fecha_control_programada, odontologo_id, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [clinicaId, d.pacienteId, d.historiaClinicaId || null, d.fechaProcedimiento || null, d.fechaControlProgramada, d.odontologoId || null, d.observaciones || null]
  );
  return res.rows[0];
}

async function registrarResultado(clinicaId, id, d) {
  const res = await query(
    `UPDATE controles_postoperatorios
        SET fecha_control_realizado = COALESCE($3, CURRENT_DATE),
            dolor=$4, inflamacion=$5, sangrado=$6, cicatrizacion=$7,
            observaciones = COALESCE($8, observaciones),
            estado='realizado'
      WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, d.fechaControlRealizado || null, d.dolor || null, d.inflamacion || null, d.sangrado || null, d.cicatrizacion || null, d.observaciones || null]
  );
  return res.rows[0] || null;
}

async function marcarInasistencia(clinicaId, id) {
  const res = await query(
    `UPDATE controles_postoperatorios SET estado='inasistencia' WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtener, crear, registrarResultado, marcarInasistencia };
