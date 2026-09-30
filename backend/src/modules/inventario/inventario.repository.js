const { query } = require('../../config/db');

async function listarProveedores(clinicaId, { incluirInactivos = false } = {}) {
  const cond = incluirInactivos ? 'clinica_id=$1' : 'clinica_id=$1 AND activo=true';
  const res = await query(`SELECT * FROM proveedores WHERE ${cond} ORDER BY nombre`, [clinicaId]);
  return res.rows;
}

async function crearProveedor(clinicaId, d) {
  const res = await query(
    `INSERT INTO proveedores (clinica_id, nombre, empresa, telefono, whatsapp, email, direccion, productos, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [clinicaId, d.nombre, d.empresa || null, d.telefono || null, d.whatsapp || null, d.email || null,
      d.direccion || null, d.productos || null, d.observaciones || null]
  );
  return res.rows[0];
}

async function listarInsumos(clinicaId, { soloStockBajo = false } = {}) {
  const cond = soloStockBajo
    ? 'i.clinica_id=$1 AND i.activo=true AND i.stock_actual <= i.stock_minimo'
    : 'i.clinica_id=$1 AND i.activo=true';
  const res = await query(
    `SELECT i.*, p.nombre AS proveedor_nombre FROM insumos i
     LEFT JOIN proveedores p ON p.id = i.proveedor_id
     WHERE ${cond} ORDER BY i.nombre`,
    [clinicaId]
  );
  return res.rows;
}

async function obtenerInsumo(clinicaId, id) {
  const res = await query('SELECT * FROM insumos WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  return res.rows[0] || null;
}

async function crearInsumo(clinicaId, d) {
  const res = await query(
    `INSERT INTO insumos (clinica_id, nombre, categoria, stock_actual, stock_minimo, proveedor_id, precio_compra, lote, fecha_vencimiento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [clinicaId, d.nombre, d.categoria || null, d.stockActual || 0, d.stockMinimo || 0,
      d.proveedorId || null, d.precioCompra || null, d.lote || null, d.fechaVencimiento || null]
  );
  return res.rows[0];
}

async function registrarMovimiento(insumoId, tipo, cantidad, motivo, usuarioId) {
  const delta = ({ entrada: 1, salida: -1, perdida: -1, vencimiento: -1, ajuste: 0 })[tipo];
  const mov = await query(
    'INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, usuario_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [insumoId, tipo, cantidad, motivo || null, usuarioId]
  );
  if (tipo === 'ajuste') {
    await query('UPDATE insumos SET stock_actual = $2 WHERE id = $1', [insumoId, cantidad]);
  } else {
    await query('UPDATE insumos SET stock_actual = stock_actual + ($2::numeric * $3::numeric) WHERE id = $1', [insumoId, delta, cantidad]);
  }
  const res = await query('SELECT * FROM insumos WHERE id = $1', [insumoId]);
  return { insumo: res.rows[0], movimientoId: mov.rows[0].id };
}

async function listarMovimientos(insumoId) {
  const res = await query(
    `SELECT m.*, u.nombre AS usuario_nombre FROM movimientos_inventario m
     LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE insumo_id = $1 ORDER BY creado_en DESC`,
    [insumoId]
  );
  return res.rows;
}

async function crearCompra(clinicaId, d) {
  const total = (d.items || []).reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precioUnitario), 0);
  const res = await query(
    `INSERT INTO compras (clinica_id, proveedor_id, fecha, total) VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4) RETURNING id`,
    [clinicaId, d.proveedorId || null, d.fecha || null, total]
  );
  const compraId = res.rows[0].id;
  for (const item of (d.items || [])) {
    await query('INSERT INTO compra_items (compra_id, insumo_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
      [compraId, item.insumoId, item.cantidad, item.precioUnitario]);
  }
  return compraId;
}

/* Fase 5 — Integración inventario ↔ procedimientos: registra el consumo de
   un insumo en una etapa o sesión de tratamiento, y descuenta el stock
   automáticamente reutilizando registrarMovimiento (tipo 'salida'), para
   que el odontólogo no tenga que ir a gestionar inventario a mano. */
async function registrarConsumoEtapa(etapaId, insumoId, cantidad, movimientoId, usuarioId) {
  const res = await query(
    `INSERT INTO etapa_materiales (etapa_id, insumo_id, cantidad, movimiento_id, usuario_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [etapaId, insumoId, cantidad, movimientoId, usuarioId]
  );
  return res.rows[0];
}

async function registrarConsumoSesion(sesionId, insumoId, cantidad, movimientoId, usuarioId) {
  const res = await query(
    `INSERT INTO sesion_materiales (sesion_id, insumo_id, cantidad, movimiento_id, usuario_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [sesionId, insumoId, cantidad, movimientoId, usuarioId]
  );
  return res.rows[0];
}

async function listarMaterialesDeEtapa(etapaId) {
  const res = await query(
    `SELECT em.*, i.nombre AS insumo_nombre, i.categoria AS insumo_categoria, u.nombre AS usuario_nombre
     FROM etapa_materiales em
     JOIN insumos i ON i.id = em.insumo_id
     LEFT JOIN usuarios u ON u.id = em.usuario_id
     WHERE em.etapa_id = $1 ORDER BY em.creado_en`,
    [etapaId]
  );
  return res.rows;
}

async function listarMaterialesDeSesion(sesionId) {
  const res = await query(
    `SELECT sm.*, i.nombre AS insumo_nombre, i.categoria AS insumo_categoria, u.nombre AS usuario_nombre
     FROM sesion_materiales sm
     JOIN insumos i ON i.id = sm.insumo_id
     LEFT JOIN usuarios u ON u.id = sm.usuario_id
     WHERE sm.sesion_id = $1 ORDER BY sm.creado_en`,
    [sesionId]
  );
  return res.rows;
}

module.exports = {
  listarProveedores, crearProveedor, listarInsumos, obtenerInsumo, crearInsumo,
  registrarMovimiento, listarMovimientos, crearCompra,
  registrarConsumoEtapa, registrarConsumoSesion, listarMaterialesDeEtapa, listarMaterialesDeSesion,
};
