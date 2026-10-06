const { conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./inventario.repository');
const auditoria = require('../../utils/auditoria');

async function listarProveedores(clinicaId, filtros) { return repo.listarProveedores(clinicaId, filtros); }

async function crearProveedor(clinicaId, datos, usuario) {
  if (!datos.nombre) throw new ApiError(400, 'El nombre del proveedor es obligatorio');
  const proveedor = await repo.crearProveedor(clinicaId, datos);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear', modulo: 'proveedores', entidadId: proveedor.id });
  return proveedor;
}

async function listarInsumos(clinicaId, filtros) { return repo.listarInsumos(clinicaId, filtros); }

// El proveedor tiene que ser de la misma clínica.
async function exigirProveedorPropio(clinicaId, proveedorId) {
  if (!proveedorId) return;
  const p = await repo.listarProveedores(clinicaId, {});
  if (!p.some((x) => x.id === Number(proveedorId))) throw new ApiError(400, 'Proveedor no encontrado');
}

async function crearInsumo(clinicaId, datos, usuario) {
  if (!datos.nombre) throw new ApiError(400, 'El nombre del insumo es obligatorio');
  if (Number(datos.stockActual) < 0 || Number(datos.stockMinimo) < 0) throw new ApiError(400, 'El stock no puede ser negativo');
  await exigirProveedorPropio(clinicaId, datos.proveedorId);
  let insumo = await repo.crearInsumo(clinicaId, { ...datos, stockActual: 0 });
  // El stock inicial entra como un lote (con su lote y vencimiento si se indicaron).
  if (Number(datos.stockActual) > 0) {
    insumo = await conCandado(`insumo:${insumo.id}`, async () => (await repo.registrarMovimiento(insumo.id, 'entrada', Number(datos.stockActual), 'Stock inicial', usuario.id, { lote: datos.lote, vencimiento: datos.fechaVencimiento })).insumo);
  }
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear', modulo: 'inventario', entidadId: insumo.id, detalle: { nombre: insumo.nombre } });
  return insumo;
}

const TIPOS_VALIDOS = ['entrada', 'salida', 'ajuste', 'perdida', 'vencimiento'];

async function registrarMovimiento(clinicaId, insumoId, datos, usuario) {
  if (!TIPOS_VALIDOS.includes(datos.tipo)) throw new ApiError(400, `Tipo inválido: ${TIPOS_VALIDOS.join(', ')}`);
  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > 1e9) throw new ApiError(400, 'La cantidad no puede ser negativa');
  if (datos.tipo !== 'ajuste' && cantidad === 0) throw new ApiError(400, 'La cantidad debe ser mayor a cero');
  if (['ajuste', 'perdida', 'vencimiento'].includes(datos.tipo) && String(datos.motivo || '').trim().length < 3) throw new ApiError(400, 'Escribí el motivo del ajuste o la baja');
  if (datos.vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(datos.vencimiento)) throw new ApiError(400, 'Vencimiento inválido');
  let antes = null;

  // Verificar stock y descontar bajo candado del insumo: dos salidas
  // simultáneas ya no pueden dejar el stock en negativo.
  const actualizado = await conCandado(`insumo:${insumoId}`, async () => {
    const insumo = await repo.obtenerInsumo(clinicaId, insumoId);
    if (!insumo) throw new ApiError(404, 'Insumo no encontrado');
    if ((datos.tipo === 'salida' || datos.tipo === 'perdida' || datos.tipo === 'vencimiento')
        && cantidad > Number(insumo.stock_actual)) {
      throw new ApiError(409, `Stock insuficiente. Disponible: ${insumo.stock_actual}, solicitado: ${cantidad}`);
    }
    antes = Number(insumo.stock_actual);
    let loteId = null;
    if (datos.loteId) {
      const l = (await repo.listarLotes(insumoId)).find((x) => x.id === Number(datos.loteId));
      if (!l) throw new ApiError(400, 'Ese lote no es de este insumo');
      if (datos.tipo !== 'entrada' && datos.tipo !== 'ajuste' && cantidad > Number(l.cantidad_actual)) throw new ApiError(409, `En ese lote quedan ${Number(l.cantidad_actual)}`);
      loteId = l.id;
    }
    return (await repo.registrarMovimiento(insumoId, datos.tipo, cantidad, datos.motivo, usuario.id, { lote: datos.lote, vencimiento: datos.vencimiento, loteId })).insumo;
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: `inventario_${datos.tipo}`, modulo: 'inventario', entidadId: insumoId,
    detalle: { cantidad, motivo: datos.motivo || null, lote: datos.lote || null, stockAntes: antes, stockResultante: Number(actualizado.stock_actual) },
  });
  return actualizado;
}

async function listarMovimientos(clinicaId, insumoId) {
  if (!(await repo.obtenerInsumo(clinicaId, Number(insumoId)))) throw new ApiError(404, 'Insumo no encontrado');
  return repo.listarMovimientos(Number(insumoId));
}

/* Confirmar una compra actualiza automáticamente el inventario (pedido
   explícitamente en el prompt maestro: "Al confirmar una compra: actualizar
   automáticamente el inventario"). */
async function crearCompra(clinicaId, datos, usuario) {
  if (!Array.isArray(datos.items) || datos.items.length === 0) throw new ApiError(400, 'La compra debe tener al menos un ítem');
  await exigirProveedorPropio(clinicaId, datos.proveedorId);
  for (const item of datos.items) {
    if (!(Number(item.cantidad) > 0) || !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) > 1e9) throw new ApiError(400, 'Cada ítem necesita una cantidad mayor a cero');
    if (!(await repo.obtenerInsumo(clinicaId, Number(item.insumoId)))) throw new ApiError(400, 'Hay un insumo que no es de esta clínica');
    if (item.vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(item.vencimiento)) throw new ApiError(400, 'Vencimiento inválido');
  }
  const compraId = await repo.crearCompra(clinicaId, datos);
  for (const item of datos.items) {
    await conCandado(`insumo:${Number(item.insumoId)}`, () => repo.registrarMovimiento(Number(item.insumoId), 'entrada', Number(item.cantidad), `Compra #${compraId}`, usuario.id, { lote: item.lote, vencimiento: item.vencimiento }));
  }
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear_compra', modulo: 'inventario', entidadId: compraId, detalle: { items: datos.items.length },
  });
  return { compraId };
}

/* Fase 5 — Integración inventario ↔ procedimientos (sección 34 del prompt
   maestro): registra el consumo de un insumo durante una etapa o sesión de
   tratamiento y descuenta el stock automáticamente en la misma operación,
   para que el dentista no tenga que entrar a inventario a mano solo para
   anotar un procedimiento. origen debe ser 'etapa' o 'sesion'. */
async function registrarConsumoProcedimiento(clinicaId, origen, origenId, datos, usuario) {
  if (!['etapa', 'sesion'].includes(origen)) throw new ApiError(400, 'Origen inválido');
  if (!datos.insumoId) throw new ApiError(400, 'El insumo es obligatorio');
  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1e9) throw new ApiError(400, 'La cantidad debe ser mayor a cero');

  const { actualizado, consumo } = await conCandado(`insumo:${datos.insumoId}`, async () => {
    const insumo = await repo.obtenerInsumo(clinicaId, datos.insumoId);
    if (!insumo) throw new ApiError(404, 'Insumo no encontrado');
    if (cantidad > Number(insumo.stock_actual)) {
      throw new ApiError(409, `Stock insuficiente de "${insumo.nombre}". Disponible: ${insumo.stock_actual}, solicitado: ${cantidad}`);
    }

    const motivoLabel = origen === 'etapa' ? `Etapa de tratamiento #${origenId}` : `Sesión de tratamiento #${origenId}`;
    const { insumo: actualizado, movimientoId } = await repo.registrarMovimiento(
      datos.insumoId, 'salida', cantidad, motivoLabel, usuario.id
    );

    const consumo = origen === 'etapa'
      ? await repo.registrarConsumoEtapa(origenId, datos.insumoId, cantidad, movimientoId, usuario.id)
      : await repo.registrarConsumoSesion(origenId, datos.insumoId, cantidad, movimientoId, usuario.id);
    return { actualizado, consumo };
  });

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'consumo_material_procedimiento', modulo: 'inventario', entidadId: datos.insumoId,
    detalle: { origen, origenId, cantidad, stockResultante: actualizado.stock_actual },
  });

  return { consumo, stockResultante: actualizado.stock_actual };
}

async function listarMaterialesDeEtapa(etapaId) { return repo.listarMaterialesDeEtapa(etapaId); }
async function listarMaterialesDeSesion(sesionId) { return repo.listarMaterialesDeSesion(sesionId); }

async function listarLotes(clinicaId, insumoId) {
  if (!(await repo.obtenerInsumo(clinicaId, insumoId))) throw new ApiError(404, 'Insumo no encontrado');
  return repo.listarLotes(insumoId);
}
async function porVencer(clinicaId, dias) { return repo.porVencer(clinicaId, Math.min(365, Math.max(0, Number(dias) || 60))); }
async function actualizarInsumo(clinicaId, id, datos, usuario) {
  const antes = await repo.obtenerInsumo(clinicaId, id);
  if (!antes) throw new ApiError(404, 'Insumo no encontrado');
  if (datos.nombre !== undefined && !String(datos.nombre).trim()) throw new ApiError(400, 'El nombre no puede quedar vacío');
  if (Number(datos.stockMinimo) < 0) throw new ApiError(400, 'El mínimo no puede ser negativo');
  await exigirProveedorPropio(clinicaId, datos.proveedorId);
  const despues = await repo.actualizarInsumo(clinicaId, id, datos);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar_insumo', modulo: 'inventario', entidadId: id,
    detalle: { antes: { nombre: antes.nombre, stock_minimo: antes.stock_minimo, precio_compra: antes.precio_compra, activo: antes.activo }, despues: { nombre: despues.nombre, stock_minimo: despues.stock_minimo, precio_compra: despues.precio_compra, activo: despues.activo } } });
  return despues;
}

module.exports = {
  listarLotes, porVencer, actualizarInsumo,
  listarProveedores, crearProveedor, listarInsumos, crearInsumo,
  registrarMovimiento, listarMovimientos, crearCompra,
  registrarConsumoProcedimiento, listarMaterialesDeEtapa, listarMaterialesDeSesion,
};
