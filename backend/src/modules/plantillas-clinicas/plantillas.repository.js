const { query } = require('../../config/db');

async function listar(clinicaId, { incluirInactivas = false } = {}) {
  const cond = incluirInactivas ? 'clinica_id=$1' : 'clinica_id=$1 AND activa=true';
  const res = await query(`SELECT * FROM plantillas_clinicas WHERE ${cond} ORDER BY categoria, nombre`, [clinicaId]);
  return res.rows;
}

async function obtener(clinicaId, id) {
  const res = await query('SELECT * FROM plantillas_clinicas WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  return res.rows[0] || null;
}

async function crear(clinicaId, d, usuarioId) {
  const res = await query(
    `INSERT INTO plantillas_clinicas (clinica_id, nombre, categoria, campos, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [clinicaId, d.nombre, d.categoria || null, JSON.stringify(d.campos || []), usuarioId]
  );
  return res.rows[0];
}

async function actualizar(clinicaId, id, d) {
  const res = await query(
    `UPDATE plantillas_clinicas SET nombre=$3, categoria=$4, campos=$5, activa=$6
     WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, d.nombre, d.categoria || null, JSON.stringify(d.campos || []), d.activa !== undefined ? d.activa : true]
  );
  return res.rows[0] || null;
}

async function eliminar(clinicaId, id) {
  // Baja lógica: nunca borrar plantillas que puedan ya haber sido usadas en evoluciones pasadas.
  const res = await query(
    `UPDATE plantillas_clinicas SET activa=false WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
