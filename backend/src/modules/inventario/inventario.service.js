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

async function crearInsumo(clinicaId, datos, usuario) {
  if (!datos.nombre) throw new ApiError(400, 'El nombre del insumo es obligatorio');
  if (Number(datos.stockActual) < 0 || Number(datos.stockMinimo) < 0) throw new ApiError(400, 'El stock no puede ser negativo');
  const insumo = await repo.crearInsumo(clinicaId, datos);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear', modulo: 'inventario', entidadId: insumo.id, detalle: { nombre: insumo.nombre } });
  return insumo;
}

const TIPOS_VALIDOS = ['entrada', 'salida', 'ajuste', 'perdida', 'vencimiento'];

async function registrarMovimiento(clinicaId, insumoId, datos, usuario) {
  if (!TIPOS_VALIDOS.includes(datos.tipo)) throw new ApiError(400, `Tipo inválido: ${TIPOS_VALIDOS.join(', ')}`);
  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad) || cantidad < 0) throw new ApiError(400, 'La cantidad no puede ser negativa');
  if (datos.tipo !== 'ajuste' && cantidad === 0) throw new ApiError(400, 'La cantidad debe ser mayor a cero');

  // Verificar stock y descontar bajo candado del insumo: dos salidas
  // simultáneas ya no pueden dejar el stock en negativo.
  const actualizado = await conCandado(`insumo:${insumoId}`, async () => {
    const insumo = await repo.obtenerInsumo(clinicaId, insumoId);
    if (!insumo) throw new ApiError(404, 'Insumo no encontrado');
    if ((datos.tipo === 'salida' || datos.tipo === 'perdida' || datos.tipo === 'vencimiento')
        && cantidad > Number(insumo.stock_actual)) {
      throw new ApiError(409, `Stock insuficiente. Disponible: ${insumo.stock_actual}, solicitado: ${cantidad}`);
    }
    return (await repo.registrarMovimiento(insumoId, datos.tipo, cantidad, datos.motivo, usuario.id)).insumo;
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: `inventario_${datos.tipo}`, modulo: 'inventario', entidadId: insumoId,
    detalle: { cantidad, stockResultante: actualizado.stock_actual },
  });
  return actualizado;
}

async function listarMovimientos(insumoId) { return repo.listarMovimientos(insumoId); }

/* Confirmar una compra actualiza automáticamente el inventario (pedido
   explícitamente en el prompt maestro: "Al confirmar una compra: actualizar
   automáticamente el inventario"). */
async function crearCompra(clinicaId, datos, usuario) {
  if (!Array.isArray(datos.items) || datos.items.length === 0) throw new ApiError(400, 'La compra debe tener al menos un ítem');
  const compraId = await repo.crearCompra(clinicaId, datos);
  for (const item of datos.items) {
    await repo.registrarMovimiento(item.insumoId, 'entrada', item.cantidad, `Compra #${compraId}`, usuario.id);
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
  if (!cantidad || cantidad <= 0) throw new ApiError(400, 'La cantidad debe ser mayor a cero');

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

module.exports = {
  listarProveedores, crearProveedor, listarInsumos, crearInsumo,
  registrarMovimiento, listarMovimientos, crearCompra,
  registrarConsumoProcedimiento, listarMaterialesDeEtapa, listarMaterialesDeSesion,
};
