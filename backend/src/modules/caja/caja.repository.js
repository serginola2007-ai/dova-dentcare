const { query } = require('../../config/db');

async function obtenerAbierta(clinicaId) {
  const res = await query(
    `SELECT * FROM caja_aperturas WHERE clinica_id = $1 AND estado = 'abierta'`,
    [clinicaId]
  );
  return res.rows[0] || null;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query('SELECT * FROM caja_aperturas WHERE clinica_id = $1 AND id = $2', [clinicaId, id]);
  return res.rows[0] || null;
}

async function listarHistorico(clinicaId, { desde, hasta } = {}) {
  const cond = ['clinica_id = $1'];
  const params = [clinicaId];
  if (desde) { params.push(desde); cond.push(`fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`fecha <= $${params.length}`); }
  const res = await query(
    `SELECT * FROM caja_aperturas WHERE ${cond.join(' AND ')} ORDER BY fecha DESC, id DESC`, params
  );
  return res.rows;
}

async function abrir(clinicaId, montoInicial, responsableId) {
  const res = await query(
    `INSERT INTO caja_aperturas (clinica_id, monto_inicial, responsable_id) VALUES ($1,$2,$3) RETURNING *`,
    [clinicaId, montoInicial, responsableId]
  );
  return res.rows[0];
}

async function registrarMovimiento(cajaAperturaId, { tipo, concepto, monto, metodo, pagoId, usuarioId }) {
  const res = await query(
    `INSERT INTO caja_movimientos (caja_apertura_id, tipo, concepto, monto, metodo, pago_id, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [cajaAperturaId, tipo, concepto, monto, metodo || 'efectivo', pagoId || null, usuarioId]
  );
  return res.rows[0];
}

async function listarMovimientos(cajaAperturaId) {
  const res = await query(
    `SELECT m.*, u.nombre AS usuario_nombre, fa.id AS factura_id, fa.numero_completo AS factura_numero
       FROM caja_movimientos m
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN LATERAL (
         SELECT f.id, f.numero_completo FROM facturas f
          WHERE f.estado <> 'anulada' AND (f.caja_movimiento_id = m.id
             OR (m.pago_id IS NOT NULL AND EXISTS (SELECT 1 FROM factura_pagos fp WHERE fp.factura_id = f.id AND fp.pago_id = m.pago_id AND fp.activo)))
          ORDER BY f.id DESC LIMIT 1) fa ON true
     WHERE caja_apertura_id = $1 ORDER BY creado_en`,
    [cajaAperturaId]
  );
  return res.rows;
}

async function calcularTotales(cajaAperturaId) {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo='ingreso' AND metodo='efectivo' THEN monto ELSE 0 END),0) AS efectivo,
       COALESCE(SUM(CASE WHEN tipo='ingreso' AND metodo='transferencia' THEN monto ELSE 0 END),0) AS transferencias,
       COALESCE(SUM(CASE WHEN tipo='ingreso' AND metodo LIKE 'tarjeta%' THEN monto ELSE 0 END),0) AS tarjetas,
       COALESCE(SUM(CASE WHEN tipo='ingreso' AND metodo NOT IN ('efectivo','transferencia','qr') AND metodo NOT LIKE 'tarjeta%' THEN monto ELSE 0 END),0) AS otros,
       COALESCE(SUM(CASE WHEN tipo='ingreso' AND metodo='qr' THEN monto ELSE 0 END),0) AS qr,
       COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END),0) AS total_ingresos,
       COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END),0) AS total_egresos,
       COALESCE(SUM(CASE WHEN tipo='egreso' AND COALESCE(metodo,'efectivo')='efectivo' THEN monto ELSE 0 END),0) AS egresos_efectivo
     FROM caja_movimientos WHERE caja_apertura_id = $1`,
    [cajaAperturaId]
  );
  return res.rows[0];
}

async function cerrar(clinicaId, id, { montoEsperado, montoContado, diferencia, motivoDiferencia }) {
  const res = await query(
    `UPDATE caja_aperturas SET estado='cerrada', monto_esperado=$3, monto_contado=$4,
       diferencia=$5, motivo_diferencia=$6, cerrada_en=now()
     WHERE clinica_id=$1 AND id=$2 AND estado='abierta' RETURNING *`,
    [clinicaId, id, montoEsperado, montoContado, diferencia, motivoDiferencia || null]
  );
  return res.rows[0] || null;
}

module.exports = {
  obtenerAbierta, obtenerPorId, listarHistorico, abrir, registrarMovimiento,
  listarMovimientos, calcularTotales, cerrar,
};
