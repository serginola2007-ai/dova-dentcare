const { query } = require('../../config/db');

async function listarPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT pg.*, u.nombre AS usuario_nombre,
            f.id AS factura_id, f.numero_completo AS factura_numero
       FROM pagos pg
       LEFT JOIN usuarios u ON u.id = pg.usuario_id
       LEFT JOIN factura_pagos fp ON fp.pago_id = pg.id AND fp.activo
       LEFT JOIN facturas f ON f.id = fp.factura_id
     WHERE pg.clinica_id = $1 AND pg.paciente_id = $2 ORDER BY pg.fecha DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function listar(clinicaId, { desde, hasta } = {}) {
  const cond = ['pg.clinica_id = $1'];
  const params = [clinicaId];
  if (desde) { params.push(desde); cond.push(`pg.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`pg.fecha <= $${params.length}`); }
  const res = await query(
    `SELECT pg.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
     FROM pagos pg JOIN pacientes p ON p.id = pg.paciente_id
     WHERE ${cond.join(' AND ')} ORDER BY pg.fecha DESC`,
    params
  );
  return res.rows;
}

async function crear(clinicaId, d, usuarioId) {
  const res = await query(
    `INSERT INTO pagos (clinica_id, paciente_id, cuota_id, concepto, monto, metodo, usuario_id, presupuesto_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [clinicaId, d.pacienteId, d.cuotaId || null, d.concepto || null, d.monto, d.metodo || 'efectivo', usuarioId, d.presupuestoId || null]
  );
  return res.rows[0];
}

async function anular(clinicaId, id, motivo, usuarioId) {
  const res = await query(
    `UPDATE pagos SET estado = 'anulado', anulado_motivo = $3, anulado_por = $4, anulado_en = now()
      WHERE clinica_id = $1 AND id = $2 AND estado = 'pagado' RETURNING *`,
    [clinicaId, id, motivo || null, usuarioId || null]
  );
  return res.rows[0] || null;
}

/* Resumen financiero del paciente (estado de cuenta), pedido explícitamente
   en los prompts maestros: total presupuestado, pagado, pendiente. */
async function resumenPaciente(clinicaId, pacienteId) {
  const presupuestado = await query(
    `SELECT COALESCE(SUM(total),0) AS total FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='aceptado'`,
    [clinicaId, pacienteId]
  );
  const pagado = await query(
    `SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='pagado'`,
    [clinicaId, pacienteId]
  );
  const proximaCuota = await query(
    `SELECT c.* FROM cuotas c JOIN planes_pago pp ON pp.id = c.plan_pago_id
     WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND c.estado='pendiente'
     ORDER BY c.vencimiento ASC LIMIT 1`,
    [clinicaId, pacienteId]
  );
  // Ajustes de cuenta corriente (descuentos, bonificaciones, incobrables
  // restan deuda; recargos suman). Ver finanzas-ext/cuentas.service.js.
  const ajustes = await query(
    `SELECT COALESCE(SUM(CASE WHEN tipo='recargo' THEN monto ELSE 0 END),0) AS debitos,
            COALESCE(SUM(CASE WHEN tipo<>'recargo' THEN monto ELSE 0 END),0) AS creditos
       FROM ajustes_cuenta WHERE clinica_id=$1 AND paciente_id=$2 AND NOT anulado`,
    [clinicaId, pacienteId]
  );
  const totalPresupuestado = Number(presupuestado.rows[0].total);
  const totalPagado = Number(pagado.rows[0].total);
  const totalAjustes = Math.round((Number(ajustes.rows[0].creditos) - Number(ajustes.rows[0].debitos)) * 100) / 100;
  const saldo = Math.round((totalPresupuestado - totalPagado - totalAjustes) * 100) / 100;
  return {
    totalPresupuestado,
    totalPagado,
    totalAjustes,
    saldoPendiente: Math.max(0, saldo),
    saldoAFavor: Math.max(0, -saldo),
    proximoVencimiento: proximaCuota.rows[0] || null,
  };
}

module.exports = { listarPorPaciente, listar, crear, anular, resumenPaciente };
