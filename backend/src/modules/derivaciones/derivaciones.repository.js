const { query } = require('../../config/db');

// Nunca se devuelve el archivo ni la ruta interna del servidor.
const COLS = `d.id, d.clinica_id, d.paciente_id, d.odontologo_origen_id, d.odontologo_destino_id, d.especialidad, d.motivo, d.observaciones, d.estado,
  d.creado_por, d.creado_en, d.archivo_nombre, d.archivo_mime, d.archivo_tamano, (d.archivo IS NOT NULL OR d.archivo_path IS NOT NULL) AS tiene_archivo`;

async function listar(clinicaId, { pacienteId, odontologoDestinoId, estado } = {}) {
  const cond = ['d.clinica_id=$1'];
  const params = [clinicaId];
  if (pacienteId) { params.push(pacienteId); cond.push(`d.paciente_id=$${params.length}`); }
  if (odontologoDestinoId) { params.push(odontologoDestinoId); cond.push(`d.odontologo_destino_id=$${params.length}`); }
  if (estado) { params.push(estado); cond.push(`d.estado=$${params.length}`); }
  const res = await query(
    `SELECT ${COLS}, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
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
    `SELECT ${COLS}, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM derivaciones d JOIN pacientes p ON p.id = d.paciente_id
      WHERE d.clinica_id=$1 AND d.id=$2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, d, creadoPor) {
  const res = await query(
    `INSERT INTO derivaciones
       (clinica_id, paciente_id, odontologo_origen_id, odontologo_destino_id, especialidad, motivo, observaciones, archivo_nombre, archivo, archivo_mime, archivo_tamano, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${COLS.replace(/d\./g, '')}`,
    [clinicaId, d.pacienteId, d.odontologoOrigenId || null, d.odontologoDestinoId, d.especialidad || null, String(d.motivo).slice(0, 4000), d.observaciones || null, d.archivoNombre || null, d.archivoDatos || null, d.archivoMime || null, d.archivoTamano || null, creadoPor]
  );
  return res.rows[0];
}

async function cambiarEstado(clinicaId, id, estado) {
  const res = await query(
    `UPDATE derivaciones SET estado=$3 WHERE clinica_id=$1 AND id=$2 RETURNING ${COLS.replace(/d\./g, '')}`,
    [clinicaId, id, estado]
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtener, crear, cambiarEstado };
