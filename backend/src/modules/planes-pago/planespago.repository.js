const { sumarMeses, hoyIso } = require('../../utils/recurso');
const { query } = require('../../config/db');

async function listarPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT * FROM planes_pago WHERE clinica_id = $1 AND paciente_id = $2 ORDER BY creado_en DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function listarTodos(clinicaId) {
  const res = await query(
    `SELECT pp.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
     FROM planes_pago pp JOIN pacientes p ON p.id = pp.paciente_id
     WHERE pp.clinica_id = $1 ORDER BY pp.creado_en DESC`,
    [clinicaId]
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query('SELECT * FROM planes_pago WHERE clinica_id = $1 AND id = $2', [clinicaId, id]);
  if (!res.rows[0]) return null;
  const cuotasRes = await query('SELECT * FROM cuotas WHERE plan_pago_id = $1 ORDER BY numero', [id]);
  return { ...res.rows[0], cuotas: cuotasRes.rows };
}

async function crear(clinicaId, d) {
  const res = await query(
    `INSERT INTO planes_pago (clinica_id, paciente_id, presupuesto_id, total, entrega, cantidad_cuotas, fecha_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE)) RETURNING id`,
    [clinicaId, d.pacienteId, d.presupuestoId || null, d.total, d.entrega || 0, d.cantidadCuotas, d.fechaInicio || null]
  );
  const planId = res.rows[0].id;

  const saldo = Number(d.total) - Number(d.entrega || 0);
  const montoPorCuota = Math.round((saldo / d.cantidadCuotas) * 100) / 100;

  let acumulado = 0;
  for (let i = 1; i <= d.cantidadCuotas; i++) {
    // La última cuota absorbe el residuo de redondeo para que la suma cierre exacto.
    const esUltima = i === d.cantidadCuotas;
    const monto = esUltima ? Math.round((saldo - acumulado) * 100) / 100 : montoPorCuota;
    acumulado += monto;
    // Suma de meses en calendario puro (sin husos horarios): 31/01 + 1 mes = 28/02.
    const vencimiento = sumarMeses(d.fechaInicio ? String(d.fechaInicio).slice(0, 10) : hoyIso(), i);
    await query(
      'INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento) VALUES ($1,$2,$3,$4)',
      [planId, i, monto, vencimiento]
    );
  }
  return obtenerPorId(clinicaId, planId);
}

async function obtenerCuota(clinicaId, id) {
  const res = await query(
    `SELECT c.* FROM cuotas c
     JOIN planes_pago pp ON pp.id = c.plan_pago_id
     WHERE c.id = $2 AND pp.clinica_id = $1`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function marcarCuotaPagada(cuotaId) {
  const res = await query(
    `UPDATE cuotas SET estado = 'pagada', pagado_en = now() WHERE id = $1 AND estado <> 'pagada' RETURNING *`,
    [cuotaId]
  );
  return res.rows[0] || null;
}

async function actualizarEstadoPlanSiCorresponde(planId) {
  const pendientes = await query("SELECT COUNT(*) FROM cuotas WHERE plan_pago_id = $1 AND estado = 'pendiente'", [planId]);
  if (parseInt(pendientes.rows[0].count, 10) === 0) {
    await query("UPDATE planes_pago SET estado = 'finalizado' WHERE id = $1", [planId]);
  }
}

module.exports = {
  listarPorPaciente, listarTodos, obtenerPorId, crear, obtenerCuota,
  marcarCuotaPagada, actualizarEstadoPlanSiCorresponde,
};
