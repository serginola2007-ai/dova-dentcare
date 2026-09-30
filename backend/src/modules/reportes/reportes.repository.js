const { query } = require('../../config/db');

/* Todas las consultas acá son agregaciones (SUM/COUNT/GROUP BY) hechas en
   una sola query por indicador -- nunca traer filas crudas al Node para
   sumarlas ahí (evita N+1 y evita transferir datos de más). Los rangos de
   fecha siempre filtran por columnas indexadas (fecha, creado_en). */

async function ingresosPorPeriodo(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS cantidad
     FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND fecha BETWEEN $2 AND $3`,
    [clinicaId, desde, hasta]
  );
  return { total: Number(res.rows[0].total), cantidad: Number(res.rows[0].cantidad) };
}

async function ingresosPorDia(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT fecha::date AS fecha, COALESCE(SUM(monto),0) AS total
     FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND fecha BETWEEN $2 AND $3
     GROUP BY fecha::date ORDER BY fecha::date`,
    [clinicaId, desde, hasta]
  );
  return res.rows.map((r) => ({ fecha: r.fecha, total: Number(r.total) }));
}

async function ingresosPorMetodo(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT metodo, COALESCE(SUM(monto),0) AS total, COUNT(*) AS cantidad
     FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND fecha BETWEEN $2 AND $3
     GROUP BY metodo ORDER BY total DESC`,
    [clinicaId, desde, hasta]
  );
  return res.rows.map((r) => ({ metodo: r.metodo, total: Number(r.total), cantidad: Number(r.cantidad) }));
}

async function turnosPorEstado(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT estado, COUNT(*) AS cantidad FROM turnos
     WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 GROUP BY estado`,
    [clinicaId, desde, hasta]
  );
  return res.rows.map((r) => ({ estado: r.estado, cantidad: Number(r.cantidad) }));
}

async function tasaInasistencia(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT
       COUNT(*) FILTER (WHERE estado = 'no_asistio') AS ausentes,
       COUNT(*) AS total
     FROM turnos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3`,
    [clinicaId, desde, hasta]
  );
  const ausentes = Number(res.rows[0].ausentes);
  const total = Number(res.rows[0].total);
  return { ausentes, total, tasa: total > 0 ? Math.round((ausentes / total) * 1000) / 10 : 0 };
}

async function topTratamientos(clinicaId, { desde, hasta, limite = 10 }) {
  const res = await query(
    `SELECT t.nombre, COUNT(*) AS cantidad, COALESCE(SUM(pi.cantidad * pi.precio_unitario), 0) AS total
     FROM presupuesto_items pi
     JOIN presupuestos p ON p.id = pi.presupuesto_id
     JOIN tratamientos t ON t.id = pi.tratamiento_id
     WHERE p.clinica_id=$1 AND p.creado_en::date BETWEEN $2 AND $3
     GROUP BY t.nombre ORDER BY cantidad DESC LIMIT $4`,
    [clinicaId, desde, hasta, limite]
  );
  return res.rows.map((r) => ({ nombre: r.nombre, cantidad: Number(r.cantidad), total: Number(r.total) }));
}

async function productividadOdontologos(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT o.nombre, COUNT(t.id) AS turnos_atendidos
     FROM turnos t JOIN odontologos o ON o.id = t.odontologo_id
     WHERE t.clinica_id=$1 AND t.estado IN ('atendido','confirmado') AND t.fecha BETWEEN $2 AND $3
     GROUP BY o.nombre ORDER BY turnos_atendidos DESC`,
    [clinicaId, desde, hasta]
  );
  return res.rows.map((r) => ({ nombre: r.nombre, turnosAtendidos: Number(r.turnos_atendidos) }));
}

async function pacientesNuevos(clinicaId, { desde, hasta }) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM pacientes WHERE clinica_id=$1 AND creado_en::date BETWEEN $2 AND $3`,
    [clinicaId, desde, hasta]
  );
  return Number(res.rows[0].cantidad);
}

/* Fase 5 — Integración: consumo de insumos por período, a partir de los
   movimientos de salida ya registrados desde etapas/sesiones de tratamiento
   (y del resto de salidas de inventario). Costo estimado con el precio de
   compra cargado en el insumo; si no hay precio cargado, queda en 0 en vez
   de inventar un valor. */
async function consumoInsumosPorPeriodo(clinicaId, { desde, hasta, limite = 10 }) {
  const res = await query(
    `SELECT i.nombre, i.categoria,
            SUM(m.cantidad) AS cantidad_consumida,
            COALESCE(SUM(m.cantidad * i.precio_compra), 0) AS costo_estimado
     FROM movimientos_inventario m
     JOIN insumos i ON i.id = m.insumo_id
     WHERE i.clinica_id=$1 AND m.tipo IN ('salida','perdida','vencimiento')
       AND m.creado_en::date BETWEEN $2 AND $3
     GROUP BY i.id, i.nombre, i.categoria
     ORDER BY cantidad_consumida DESC LIMIT $4`,
    [clinicaId, desde, hasta, limite]
  );
  return res.rows.map((r) => ({
    nombre: r.nombre, categoria: r.categoria,
    cantidadConsumida: Number(r.cantidad_consumida), costoEstimado: Number(r.costo_estimado),
  }));
}

// ---- Alertas para el dashboard (deben ser reales, nunca simuladas) ----
async function alertaStockBajo(clinicaId) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM insumos WHERE clinica_id=$1 AND activo=true AND stock_actual <= stock_minimo`,
    [clinicaId]
  );
  return Number(res.rows[0].cantidad);
}

async function alertaCuotasVencidas(clinicaId) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM cuotas c JOIN planes_pago pp ON pp.id = c.plan_pago_id
     WHERE pp.clinica_id=$1 AND c.estado='pendiente' AND c.vencimiento < CURRENT_DATE`,
    [clinicaId]
  );
  return Number(res.rows[0].cantidad);
}

async function alertaTurnosHoy(clinicaId) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM turnos WHERE clinica_id=$1 AND fecha = CURRENT_DATE AND estado NOT IN ('cancelado')`,
    [clinicaId]
  );
  return Number(res.rows[0].cantidad);
}

async function alertaListaEsperaPendiente(clinicaId) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM lista_espera WHERE clinica_id=$1 AND estado='esperando'`,
    [clinicaId]
  );
  return Number(res.rows[0].cantidad);
}

async function alertaInsumosPorVencer(clinicaId, diasAdelante = 30) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM insumos
     WHERE clinica_id=$1 AND activo=true AND fecha_vencimiento IS NOT NULL
       AND fecha_vencimiento BETWEEN CURRENT_DATE AND (CURRENT_DATE + $2::int)`,
    [clinicaId, diasAdelante]
  );
  return Number(res.rows[0].cantidad);
}

async function alertaCajaAbierta(clinicaId) {
  const res = await query(
    `SELECT id, abierta_en, fecha FROM caja_aperturas WHERE clinica_id=$1 AND estado='abierta' LIMIT 1`,
    [clinicaId]
  );
  return res.rows[0] || null;
}

async function alertaTicketsHelpdeskAbiertos(clinicaId) {
  const res = await query(
    `SELECT COUNT(*) AS cantidad FROM tickets WHERE clinica_id=$1 AND estado IN ('nuevo','abierto','en_espera')`,
    [clinicaId]
  );
  return Number(res.rows[0].cantidad);
}

module.exports = {
  ingresosPorPeriodo, ingresosPorDia, ingresosPorMetodo,
  turnosPorEstado, tasaInasistencia, topTratamientos, productividadOdontologos, pacientesNuevos,
  consumoInsumosPorPeriodo,
  alertaStockBajo, alertaCuotasVencidas, alertaTurnosHoy, alertaListaEsperaPendiente,
  alertaInsumosPorVencer, alertaCajaAbierta, alertaTicketsHelpdeskAbiertos,
};
