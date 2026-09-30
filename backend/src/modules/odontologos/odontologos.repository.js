const { query } = require('../../config/db');

const COLUMNAS = 'id, clinica_id, nombre, matricula, especialidad, telefono, email, color_agenda, activo, creado_en';

async function listar(clinicaId, { incluirInactivos = false } = {}) {
  const condiciones = ['clinica_id = $1'];
  if (!incluirInactivos) condiciones.push('activo = true');
  const res = await query(
    `SELECT ${COLUMNAS} FROM odontologos WHERE ${condiciones.join(' AND ')} ORDER BY nombre`,
    [clinicaId]
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(`SELECT ${COLUMNAS} FROM odontologos WHERE clinica_id = $1 AND id = $2`, [clinicaId, id]);
  return res.rows[0] || null;
}

async function crear(clinicaId, datos) {
  const res = await query(
    `INSERT INTO odontologos (clinica_id, nombre, matricula, especialidad, telefono, email, color_agenda)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNAS}`,
    [clinicaId, datos.nombre, datos.matricula || null, datos.especialidad || null,
      datos.telefono || null, datos.email || null, datos.colorAgenda || null]
  );
  return res.rows[0];
}

async function actualizar(clinicaId, id, datos) {
  const mapa = {
    nombre: 'nombre', matricula: 'matricula', especialidad: 'especialidad',
    telefono: 'telefono', email: 'email', colorAgenda: 'color_agenda', activo: 'activo',
  };
  const sets = [];
  const params = [clinicaId, id];
  for (const [key, col] of Object.entries(mapa)) {
    if (datos[key] !== undefined) { params.push(datos[key]); sets.push(`${col} = $${params.length}`); }
  }
  if (sets.length === 0) return obtenerPorId(clinicaId, id);
  const res = await query(
    `UPDATE odontologos SET ${sets.join(', ')} WHERE clinica_id = $1 AND id = $2 RETURNING ${COLUMNAS}`,
    params
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtenerPorId, crear, actualizar };
