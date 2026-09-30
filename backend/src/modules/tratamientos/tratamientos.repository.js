const { query } = require('../../config/db');
const COLS = 'id, clinica_id, nombre, categoria, descripcion, precio, duracion_minutos, activo, creado_en, recall_tipo_id';

async function listar(clinicaId, { incluirInactivos = false } = {}) {
  const cond = incluirInactivos ? 'clinica_id = $1' : 'clinica_id = $1 AND activo = true';
  const res = await query(`SELECT ${COLS} FROM tratamientos WHERE ${cond} ORDER BY nombre`, [clinicaId]);
  return res.rows;
}
async function obtenerPorId(clinicaId, id) {
  const res = await query(`SELECT ${COLS} FROM tratamientos WHERE clinica_id=$1 AND id=$2`, [clinicaId, id]);
  return res.rows[0] || null;
}
async function crear(clinicaId, d) {
  const res = await query(
    `INSERT INTO tratamientos (clinica_id, nombre, categoria, descripcion, precio, duracion_minutos, recall_tipo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [clinicaId, d.nombre, d.categoria || null, d.descripcion || null, d.precio || 0, d.duracionMinutos || null, d.recallTipoId || null]
  );
  return res.rows[0];
}
async function actualizar(clinicaId, id, d) {
  const mapa = { nombre: 'nombre', categoria: 'categoria', descripcion: 'descripcion', precio: 'precio', duracionMinutos: 'duracion_minutos', activo: 'activo', recallTipoId: 'recall_tipo_id' };
  const sets = []; const params = [clinicaId, id];
  for (const [k, c] of Object.entries(mapa)) if (d[k] !== undefined) { params.push(k === 'recallTipoId' ? (d[k] || null) : d[k]); sets.push(`${c}=$${params.length}`); }
  if (!sets.length) return obtenerPorId(clinicaId, id);
  const res = await query(`UPDATE tratamientos SET ${sets.join(', ')} WHERE clinica_id=$1 AND id=$2 RETURNING ${COLS}`, params);
  return res.rows[0] || null;
}
module.exports = { listar, obtenerPorId, crear, actualizar };
