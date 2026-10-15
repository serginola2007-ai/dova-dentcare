/* Kits de insumos por tratamiento. Al registrar una sesión realizada de un plan cuyo tratamiento
   tiene kit, el stock se descuenta solo (cada insumo con su movimiento y auditoría, igual que una
   carga a mano). Si falta stock de algún insumo, la sesión se registra igual y se avisa qué no se
   pudo descontar. Nunca descuenta dos veces la misma sesión. */
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const inventario = require('./inventario.service');
const alertas = require('../../utils/alertas');

const MAX_ITEMS = 40;

async function exigirTratamiento(clinicaId, tratamientoId) {
  const id = Number(tratamientoId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Tratamiento inválido');
  const t = (await query('SELECT id, nombre FROM tratamientos WHERE id=$1 AND clinica_id=$2', [id, clinicaId])).rows[0];
  if (!t) throw new ApiError(404, 'Tratamiento no encontrado');
  return t;
}

async function itemsDe(clinicaId, tratamientoId) {
  return (await query(
    `SELECT k.insumo_id AS "insumoId", i.nombre AS insumo, k.cantidad::float AS cantidad, i.stock_actual::float AS "stockActual", i.stock_minimo::float AS "stockMinimo", i.activo
       FROM tratamiento_kits k JOIN insumos i ON i.id=k.insumo_id
      WHERE k.clinica_id=$1 AND k.tratamiento_id=$2 ORDER BY i.nombre`, [clinicaId, tratamientoId])).rows;
}

/** Todos los tratamientos con la cantidad de insumos de su kit. */
async function resumen(clinicaId) {
  return (await query(
    `SELECT t.id, t.nombre, t.categoria, t.activo, count(k.id)::int AS insumos
       FROM tratamientos t LEFT JOIN tratamiento_kits k ON k.tratamiento_id=t.id AND k.clinica_id=t.clinica_id
      WHERE t.clinica_id=$1 GROUP BY t.id ORDER BY t.activo DESC, t.nombre`, [clinicaId])).rows;
}

async function obtener(clinicaId, tratamientoId) {
  const t = await exigirTratamiento(clinicaId, tratamientoId);
  return { tratamientoId: t.id, tratamiento: t.nombre, items: await itemsDe(clinicaId, t.id) };
}

/** Reemplaza el kit completo. items: [{ insumoId, cantidad }] (vacío = sin kit). */
async function guardar(clinicaId, tratamientoId, items, usuario) {
  const t = await exigirTratamiento(clinicaId, tratamientoId);
  if (!Array.isArray(items)) throw new ApiError(400, 'Mandá la lista de insumos del kit');
  if (items.length > MAX_ITEMS) throw new ApiError(400, `Un kit puede tener hasta ${MAX_ITEMS} insumos`);
  const limpios = items.map((x) => ({ insumoId: Number(x && x.insumoId), cantidad: Number(x && x.cantidad) }));
  for (const x of limpios) {
    if (!Number.isInteger(x.insumoId) || x.insumoId <= 0) throw new ApiError(400, 'Insumo inválido');
    if (!Number.isFinite(x.cantidad) || x.cantidad <= 0 || x.cantidad > 1e6) throw new ApiError(400, 'La cantidad de cada insumo debe ser mayor a cero');
  }
  if (new Set(limpios.map((x) => x.insumoId)).size !== limpios.length) throw new ApiError(400, 'Hay un insumo repetido en el kit');
  if (limpios.length) {
    const propios = (await query('SELECT id FROM insumos WHERE clinica_id=$1 AND id = ANY($2::int[])', [clinicaId, limpios.map((x) => x.insumoId)])).rows;
    if (propios.length !== limpios.length) throw new ApiError(400, 'Insumo no encontrado');
  }
  await query('DELETE FROM tratamiento_kits WHERE clinica_id=$1 AND tratamiento_id=$2', [clinicaId, t.id]);
  for (const x of limpios) {
    await query('INSERT INTO tratamiento_kits (clinica_id, tratamiento_id, insumo_id, cantidad) VALUES ($1,$2,$3,$4)', [clinicaId, t.id, x.insumoId, x.cantidad]);
  }
  await require('../../utils/auditoria').registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'guardar_kit', modulo: 'inventario', entidadId: t.id, detalle: { items: limpios } });
  return obtener(clinicaId, t.id);
}

/** Descuenta el kit para una sesión. Devuelve { aplicado, descontados, faltantes }. Nunca lanza. */
async function aplicarASesion(clinicaId, sesionId, tratamientoId, usuario) {
  const res = { aplicado: false, descontados: [], faltantes: [] };
  try {
    if (!tratamientoId) return res;
    const items = (await itemsDe(clinicaId, tratamientoId)).filter((x) => x.activo);
    if (!items.length) return res;
    // Se "reserva" la sesión antes de descontar: dos pedidos a la vez no descuentan dos veces.
    const tomada = await query('UPDATE sesiones_tratamiento SET kit_aplicado=true WHERE id=$1 AND NOT kit_aplicado RETURNING id', [sesionId]);
    if (!tomada.rowCount) return res;
    res.aplicado = true;
    for (const x of items) {
      try {
        const r = await inventario.registrarConsumoProcedimiento(clinicaId, 'sesion', sesionId, { insumoId: x.insumoId, cantidad: x.cantidad }, usuario);
        res.descontados.push({ insumoId: x.insumoId, insumo: x.insumo, cantidad: x.cantidad, stockResultante: Number(r.stockResultante) });
        if (Number(r.stockResultante) <= x.stockMinimo) {
          await alertas.alertarAdmins(clinicaId, { clave: `stock-bajo-${x.insumoId}`, titulo: `Queda poco: ${x.insumo}`, mensaje: `Quedan ${Number(r.stockResultante)} (mínimo ${x.stockMinimo}). Se usó en una sesión de tratamiento.`, tipo: 'inventario' });
        }
      } catch (e) {
        res.faltantes.push({ insumoId: x.insumoId, insumo: x.insumo, cantidad: x.cantidad, motivo: e.status === 409 ? 'stock insuficiente' : 'no se pudo descontar' });
      }
    }
    if (res.faltantes.length) {
      await alertas.alertarAdmins(clinicaId, { clave: `kit-faltante-${tratamientoId}`, titulo: 'Faltó stock para un kit', mensaje: `No se pudo descontar: ${res.faltantes.map((f) => f.insumo).join(', ')}. Revisá el inventario.`, tipo: 'inventario' });
    }
  } catch (e) { console.error('[kits] no se pudo aplicar', e.message); }
  return res;
}

module.exports = { resumen, obtener, guardar, aplicarASesion };
