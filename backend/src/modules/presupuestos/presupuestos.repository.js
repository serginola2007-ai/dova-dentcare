const { query } = require('../../config/db');

async function listarPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT p.*, pac.nombre AS paciente_nombre, pac.apellido AS paciente_apellido
     FROM presupuestos p JOIN pacientes pac ON pac.id = p.paciente_id
     WHERE p.clinica_id = $1 AND p.paciente_id = $2 ORDER BY p.fecha DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT p.*, pac.nombre AS paciente_nombre, pac.apellido AS paciente_apellido
     FROM presupuestos p JOIN pacientes pac ON pac.id = p.paciente_id
     WHERE p.clinica_id = $1 AND p.id = $2`,
    [clinicaId, id]
  );
  if (!res.rows[0]) return null;
  const itemsRes = await query('SELECT * FROM presupuesto_items WHERE presupuesto_id = $1', [id]);
  return { ...res.rows[0], items: itemsRes.rows };
}

function calcularTotal(items, descuento) {
  const subtotal = items.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precioUnitario), 0);
  const totalConDescuento = subtotal - (subtotal * (Number(descuento) || 0) / 100);
  return Math.max(0, Math.round(totalConDescuento * 100) / 100);
}

async function crear(clinicaId, d) {
  const total = calcularTotal(d.items || [], d.descuento);
  const res = await query(
    `INSERT INTO presupuestos (clinica_id, paciente_id, odontologo_id, fecha, vencimiento, descuento, total, observaciones)
     VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8) RETURNING id`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.fecha || null, d.vencimiento || null,
      d.descuento || 0, total, d.observaciones || null]
  );
  const presupuestoId = res.rows[0].id;
  for (const item of (d.items || [])) {
    await query(
      `INSERT INTO presupuesto_items (presupuesto_id, tratamiento_id, descripcion, pieza, cantidad, precio_unitario)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [presupuestoId, item.tratamientoId || null, item.descripcion, item.pieza || null, item.cantidad || 1, item.precioUnitario || 0]
    );
  }
  return obtenerPorId(clinicaId, presupuestoId);
}

async function actualizarEstado(clinicaId, id, estado) {
  const res = await query(
    `UPDATE presupuestos SET estado = $3, actualizado_en = now() WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    [clinicaId, id, estado]
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

module.exports = { listarPorPaciente, obtenerPorId, crear, actualizarEstado, calcularTotal };
