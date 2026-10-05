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

/* Movimiento de stock por lotes (FEFO: sale primero lo que vence antes).
   - entrada: suma al lote indicado (lote + vencimiento) o al "sin lote".
   - salida / pérdida / vencimiento: descuenta del lote indicado o, si no se
     indica, de los lotes que vencen primero.
   - ajuste: fija el stock contado; la diferencia se suma al "sin lote" o se
     descuenta por FEFO.
   Debe llamarse dentro del candado del insumo. */
async function registrarMovimiento(insumoId, tipo, cantidad, motivo, usuarioId, { lote, vencimiento, loteId } = {}) {
  const ins = (await query('SELECT stock_actual FROM insumos WHERE id=$1', [insumoId])).rows[0];
  const actual = Number(ins ? ins.stock_actual : 0);
  // Lotes existentes que todavía no reflejan el stock (insumos creados antes de usar lotes).
  const sumaLotes = Number((await query('SELECT COALESCE(SUM(cantidad_actual),0) s FROM insumo_lotes WHERE insumo_id=$1', [insumoId])).rows[0].s);
  if (sumaLotes < actual) {
    await query('INSERT INTO insumo_lotes (insumo_id, cantidad_inicial, cantidad_actual) VALUES ($1,$2,$2)', [insumoId, actual - sumaLotes]);
  }
  let resto = tipo === 'ajuste' ? cantidad - actual : (tipo === 'entrada' ? cantidad : -cantidad);
  let loteUsado = null;
  if (resto > 0) {
    let l = null;
    if (loteId) l = (await query('SELECT id FROM insumo_lotes WHERE id=$1 AND insumo_id=$2', [loteId, insumoId])).rows[0];
    if (!l) l = (await query('SELECT id FROM insumo_lotes WHERE insumo_id=$1 AND lote IS NOT DISTINCT FROM $2 AND vencimiento IS NOT DISTINCT FROM $3::date ORDER BY id LIMIT 1', [insumoId, lote || null, vencimiento || null])).rows[0];
    if (!l) l = (await query('INSERT INTO insumo_lotes (insumo_id, lote, vencimiento, cantidad_inicial, cantidad_actual) VALUES ($1,$2,$3,0,0) RETURNING id', [insumoId, lote || null, vencimiento || null])).rows[0];
    await query('UPDATE insumo_lotes SET cantidad_actual = cantidad_actual + $2, cantidad_inicial = cantidad_inicial + $2 WHERE id=$1', [l.id, resto]);
    loteUsado = l.id;
  } else if (resto < 0) {
    let falta = -resto;
    const lotes = loteId
      ? (await query('SELECT id, cantidad_actual FROM insumo_lotes WHERE id=$1 AND insumo_id=$2 AND cantidad_actual > 0', [loteId, insumoId])).rows
      : (await query('SELECT id, cantidad_actual FROM insumo_lotes WHERE insumo_id=$1 AND cantidad_actual > 0 ORDER BY vencimiento ASC NULLS LAST, id', [insumoId])).rows;
    for (const l of lotes) {
      if (falta <= 0) break;
      const usar = Math.min(falta, Number(l.cantidad_actual));
      await query('UPDATE insumo_lotes SET cantidad_actual = cantidad_actual - $2 WHERE id=$1', [l.id, usar]);
      if (!loteUsado) loteUsado = l.id;
      falta -= usar;
    }
  }
  const mov = await query(
    'INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, motivo, usuario_id, lote_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [insumoId, tipo, cantidad, motivo || null, usuarioId, loteUsado]
  );
  // Stock = suma de lotes; lote/vencimiento visibles = el que vence primero.
  await query(`UPDATE insumos i SET
      stock_actual = (SELECT COALESCE(SUM(cantidad_actual),0) FROM insumo_lotes WHERE insumo_id=i.id),
      lote = (SELECT lote FROM insumo_lotes WHERE insumo_id=i.id AND cantidad_actual > 0 ORDER BY vencimiento ASC NULLS LAST, id LIMIT 1),
      fecha_vencimiento = (SELECT vencimiento FROM insumo_lotes WHERE insumo_id=i.id AND cantidad_actual > 0 ORDER BY vencimiento ASC NULLS LAST, id LIMIT 1)
    WHERE i.id=$1`, [insumoId]);
  const res = await query('SELECT * FROM insumos WHERE id = $1', [insumoId]);
  return { insumo: res.rows[0], movimientoId: mov.rows[0].id };
}

async function listarLotes(insumoId) {
  return (await query('SELECT * FROM insumo_lotes WHERE insumo_id=$1 ORDER BY (cantidad_actual > 0) DESC, vencimiento ASC NULLS LAST, id', [insumoId])).rows;
}

// Lotes con stock que vencen dentro de N días (o ya vencidos).
async function porVencer(clinicaId, dias) {
  return (await query(`SELECT l.id AS lote_id, l.lote, l.vencimiento::text AS vencimiento, l.cantidad_actual, i.id AS insumo_id, i.nombre, i.categoria,
                              (l.vencimiento < (now() AT TIME ZONE 'America/Asuncion')::date) AS vencido
                         FROM insumo_lotes l JOIN insumos i ON i.id = l.insumo_id
                        WHERE i.clinica_id=$1 AND i.activo AND l.cantidad_actual > 0 AND l.vencimiento IS NOT NULL
                          AND l.vencimiento <= (now() AT TIME ZONE 'America/Asuncion')::date + $2::int
                        ORDER BY l.vencimiento, i.nombre`, [clinicaId, dias])).rows;
}

async function actualizarInsumo(clinicaId, id, d) {
  const r = await query(`UPDATE insumos SET nombre=COALESCE($3,nombre), categoria=$4, stock_minimo=COALESCE($5,stock_minimo), proveedor_id=$6,
                           precio_compra=$7, activo=COALESCE($8,activo) WHERE clinica_id=$1 AND id=$2 RETURNING *`,
  [clinicaId, id, d.nombre || null, d.categoria || null, d.stockMinimo !== undefined && d.stockMinimo !== '' ? Number(d.stockMinimo) : null,
    d.proveedorId || null, d.precioCompra !== undefined && d.precioCompra !== '' ? Number(d.precioCompra) : null, typeof d.activo === 'boolean' ? d.activo : null]);
  return r.rows[0] || null;
}

async function listarMovimientos(insumoId) {
  const res = await query(
    `SELECT m.*, u.nombre AS usuario_nombre, l.lote AS lote_nombre, l.vencimiento AS lote_vencimiento FROM movimientos_inventario m
     LEFT JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN insumo_lotes l ON l.id = m.lote_id WHERE m.insumo_id = $1 ORDER BY m.creado_en DESC`,
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
  listarLotes, porVencer, actualizarInsumo,
  listarProveedores, crearProveedor, listarInsumos, obtenerInsumo, crearInsumo,
  registrarMovimiento, listarMovimientos, crearCompra,
  registrarConsumoEtapa, registrarConsumoSesion, listarMaterialesDeEtapa, listarMaterialesDeSesion,
};
