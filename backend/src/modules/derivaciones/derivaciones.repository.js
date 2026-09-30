const { query } = require('../../config/db');

async function listar(clinicaId, { pacienteId, odontologoDestinoId, estado } = {}) {
  const cond = ['d.clinica_id=$1'];
  const params = [clinicaId];
  if (pacienteId) { params.push(pacienteId); cond.push(`d.paciente_id=$${params.length}`); }
  if (odontologoDestinoId) { params.push(odontologoDestinoId); cond.push(`d.odontologo_destino_id=$${params.length}`); }
  if (estado) { params.push(estado); cond.push(`d.estado=$${params.length}`); }
  const res = await query(
    `SELECT d.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
            oo.nombre AS odontologo_origen_nombre, od.nombre AS odontologo_destino_nombre
       FROM derivaciones d
       JOIN pacientes p ON p.id = d.paciente_id
       LEFT JOIN odontologos oo ON oo.id = d.odontologo_origen_id
       JOIN odontologos od ON od.id = d.odontologo_destino_id
      WHERE ${cond.join(' AND ')}
      ORDER BY d.creado_en DESC`,
    params
  );
  return res.rows;
}

async function obtener(clinicaId, id) {
  const res = await query(
    `SELECT d.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM derivaciones d JOIN pacientes p ON p.id = d.paciente_id
      WHERE d.clinica_id=$1 AND d.id=$2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, d, creadoPor) {
  const res = await query(
    `INSERT INTO derivaciones
       (clinica_id, paciente_id, odontologo_origen_id, odontologo_destino_id, especialidad, motivo, observaciones, archivo_nombre, archivo_path, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [clinicaId, d.pacienteId, d.odontologoOrigenId || null, d.odontologoDestinoId, d.especialidad || null, d.motivo, d.observaciones || null, d.archivoNombre || null, d.archivoPath || null, creadoPor]
  );
  return res.rows[0];
}

async function cambiarEstado(clinicaId, id, estado) {
  const res = await query(
    `UPDATE derivaciones SET estado=$3 WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, estado]
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtener, crear, cambiarEstado };
