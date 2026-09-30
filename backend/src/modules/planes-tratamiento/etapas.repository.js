const { query } = require('../../config/db');

async function listarPorPlan(planId) {
  const res = await query(
    `SELECT e.*, o.nombre AS odontologo_nombre FROM etapas_tratamiento e
     LEFT JOIN odontologos o ON o.id = e.odontologo_id
     WHERE plan_id = $1 ORDER BY orden`,
    [planId]
  );
  return res.rows;
}

async function obtener(id) {
  const res = await query('SELECT * FROM etapas_tratamiento WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function crearEtapa(planId, d) {
  const res = await query(
    `INSERT INTO etapas_tratamiento (plan_id, nombre, orden) VALUES ($1,$2,$3) RETURNING *`,
    [planId, d.nombre, d.orden || 0]
  );
  return res.rows[0];
}

/* Crea varias etapas de una sola vez -- se usa al aplicar una plantilla de
   procedimiento (ej. Endodoncia: Diagnóstico, Apertura, Conductometría,
   Instrumentación, Irrigación, Obturación, Restauración). */
async function crearEtapasBatch(planId, nombres) {
  const etapas = [];
  for (let i = 0; i < nombres.length; i++) {
    const res = await query(
      `INSERT INTO etapas_tratamiento (plan_id, nombre, orden) VALUES ($1,$2,$3) RETURNING *`,
      [planId, nombres[i], i]
    );
    etapas.push(res.rows[0]);
  }
  return etapas;
}

async function completarEtapa(id, d) {
  const res = await query(
    `UPDATE etapas_tratamiento SET
       completada = true, fecha = COALESCE($2, CURRENT_DATE), odontologo_id = $3,
       observaciones = $4, materiales = $5, historia_clinica_id = $6, actualizado_en = now()
     WHERE id = $1 RETURNING *`,
    [id, d.fecha || null, d.odontologoId || null, d.observaciones || null, d.materiales || null, d.historiaClinicaId || null]
  );
  return res.rows[0] || null;
}

async function reabrirEtapa(id) {
  const res = await query(
    `UPDATE etapas_tratamiento SET completada = false, actualizado_en = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function contarProgreso(planId) {
  const res = await query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE completada) AS completadas
     FROM etapas_tratamiento WHERE plan_id = $1`,
    [planId]
  );
  return { total: Number(res.rows[0].total), completadas: Number(res.rows[0].completadas) };
}

module.exports = { listarPorPlan, obtener, crearEtapa, crearEtapasBatch, completarEtapa, reabrirEtapa, contarProgreso };
