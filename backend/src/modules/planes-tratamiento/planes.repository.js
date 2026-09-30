const { query } = require('../../config/db');

const SELECT_PLAN = `
  pt.id, pt.clinica_id, pt.paciente_id, pt.odontologo_id, pt.tratamiento_id, pt.nombre,
  pt.diagnostico, pt.pieza, pt.superficie, pt.prioridad, pt.precio, pt.descuento,
  pt.sesiones_totales, pt.sesiones_realizadas, pt.fecha_inicio, pt.fecha_estimada_fin,
  pt.estado, pt.observaciones, pt.creado_en, pt.actualizado_en, pt.presupuesto_id,
  o.nombre AS odontologo_nombre
`;

async function listarPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT ${SELECT_PLAN} FROM planes_tratamiento pt
     LEFT JOIN odontologos o ON o.id = pt.odontologo_id
     WHERE pt.clinica_id = $1 AND pt.paciente_id = $2
     ORDER BY pt.creado_en DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT ${SELECT_PLAN} FROM planes_tratamiento pt
     LEFT JOIN odontologos o ON o.id = pt.odontologo_id
     WHERE pt.clinica_id = $1 AND pt.id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, d) {
  const res = await query(
    `INSERT INTO planes_tratamiento (
       clinica_id, paciente_id, odontologo_id, tratamiento_id, nombre, diagnostico,
       pieza, superficie, prioridad, precio, descuento, sesiones_totales,
       fecha_inicio, fecha_estimada_fin, observaciones
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.tratamientoId || null, d.nombre,
      d.diagnostico || null, d.pieza || null, d.superficie || null, d.prioridad || 'media',
      d.precio || 0, d.descuento || 0, d.sesionesTotales || 1, d.fechaInicio || null,
      d.fechaEstimadaFin || null, d.observaciones || null]
  );
  return obtenerPorId(clinicaId, res.rows[0].id);
}

async function actualizar(clinicaId, id, d) {
  const mapa = {
    odontologoId: 'odontologo_id', tratamientoId: 'tratamiento_id', nombre: 'nombre',
    diagnostico: 'diagnostico', pieza: 'pieza', superficie: 'superficie', prioridad: 'prioridad',
    precio: 'precio', descuento: 'descuento', sesionesTotales: 'sesiones_totales',
    fechaInicio: 'fecha_inicio', fechaEstimadaFin: 'fecha_estimada_fin', estado: 'estado',
    observaciones: 'observaciones',
  };
  const sets = []; const params = [clinicaId, id];
  for (const [k, c] of Object.entries(mapa)) if (d[k] !== undefined) { params.push(d[k]); sets.push(`${c}=$${params.length}`); }
  if (!sets.length) return obtenerPorId(clinicaId, id);
  const res = await query(
    `UPDATE planes_tratamiento SET ${sets.join(', ')}, actualizado_en = now()
     WHERE clinica_id=$1 AND id=$2 RETURNING id`, params
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

async function incrementarSesionesRealizadas(id) {
  await query(
    `UPDATE planes_tratamiento SET
       sesiones_realizadas = sesiones_realizadas + 1,
       actualizado_en = now(),
       estado = CASE WHEN sesiones_realizadas + 1 >= sesiones_totales THEN 'finalizado' ELSE 'en_proceso' END
     WHERE id = $1`,
    [id]
  );
}

// --- Sesiones ---
async function listarSesiones(planId) {
  const res = await query(
    `SELECT s.*, o.nombre AS odontologo_nombre FROM sesiones_tratamiento s
     LEFT JOIN odontologos o ON o.id = s.odontologo_id
     WHERE plan_id = $1 ORDER BY numero`,
    [planId]
  );
  return res.rows;
}

async function contarSesiones(planId) {
  const res = await query('SELECT COUNT(*) FROM sesiones_tratamiento WHERE plan_id = $1', [planId]);
  return parseInt(res.rows[0].count, 10);
}

async function crearSesion(planId, numero, d) {
  const res = await query(
    `INSERT INTO sesiones_tratamiento (plan_id, numero, fecha, odontologo_id, procedimiento, pieza, observaciones, evolucion, proxima_sesion, estado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [planId, numero, d.fecha, d.odontologoId || null, d.procedimiento || null, d.pieza || null,
      d.observaciones || null, d.evolucion || null, d.proximaSesion || null, d.estado || 'realizada']
  );
  return res.rows[0];
}

// Fase 5 — Integración tratamientos ↔ presupuesto: vincula un plan con el
// presupuesto que lo origina (o que se generó a partir de él).
async function vincularPresupuesto(clinicaId, id, presupuestoId) {
  const res = await query(
    `UPDATE planes_tratamiento SET presupuesto_id = $3, actualizado_en = now()
     WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    [clinicaId, id, presupuestoId]
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

module.exports = {
  listarPorPaciente, obtenerPorId, crear, actualizar, incrementarSesionesRealizadas,
  listarSesiones, contarSesiones, crearSesion, vincularPresupuesto,
};
