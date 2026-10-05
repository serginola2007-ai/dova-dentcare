const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./presupuestos.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado'];

const { query } = require('../../config/db');

// Vigencia: un presupuesto en borrador o enviado cuya fecha de vencimiento ya
// pasó queda "vencido" (se puede volver a enviar). Queda en la auditoría.
async function vencerAutomaticos(clinicaId, pacienteId) {
  const r = await query(`UPDATE presupuestos SET estado='vencido', actualizado_en=now()
                          WHERE clinica_id=$1 AND ($2::int IS NULL OR paciente_id=$2::int) AND estado IN ('borrador','enviado')
                            AND vencimiento IS NOT NULL AND vencimiento < (now() AT TIME ZONE 'America/Asuncion')::date RETURNING id`, [clinicaId, pacienteId || null]);
  for (const x of r.rows) await auditoria.registrar({ clinicaId, usuarioNombre: 'Sistema', accion: 'vencimiento_automatico', modulo: 'presupuestos', entidadId: x.id });
}

async function listarPorPaciente(clinicaId, pacienteId) {
  await vencerAutomaticos(clinicaId, Number(pacienteId));
  return repo.listarPorPaciente(clinicaId, pacienteId);
}

async function obtener(clinicaId, id) {
  const p = await repo.obtenerPorId(clinicaId, id);
  if (!p) throw new ApiError(404, 'Presupuesto no encontrado');
  return p;
}

function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'El presupuesto debe tener al menos un ítem');
  for (const it of items) {
    if (!it.descripcion) throw new ApiError(400, 'Cada ítem necesita una descripción');
    if (Number(it.cantidad) <= 0) throw new ApiError(400, 'La cantidad debe ser mayor a cero');
    if (Number(it.precioUnitario) < 0) throw new ApiError(400, 'El precio no puede ser negativo');
  }
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId) throw new ApiError(400, 'El paciente es obligatorio');
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  validarItems(datos.items);
  if (datos.descuento !== undefined && (Number(datos.descuento) < 0 || Number(datos.descuento) > 100)) {
    throw new ApiError(400, 'El descuento debe estar entre 0 y 100');
  }
  const presupuesto = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'presupuestos', entidadId: presupuesto.id, detalle: { total: presupuesto.total },
  });
  return presupuesto;
}

// Cambios de estado permitidos (un presupuesto aceptado o rechazado no vuelve
// a borrador: si cambia lo acordado, se hace uno nuevo).
const TRANSICIONES = {
  borrador: ['enviado', 'aceptado', 'cancelado'],
  enviado: ['aceptado', 'rechazado', 'vencido', 'cancelado'],
  vencido: ['enviado', 'cancelado'],
  rechazado: [],
  aceptado: ['cancelado'],
  cancelado: [],
};
const NOMBRE_ESTADO = { borrador: 'borrador', enviado: 'enviado', aceptado: 'aceptado', rechazado: 'rechazado', vencido: 'vencido', cancelado: 'cancelado' };

async function cambiarEstado(clinicaId, id, estado, usuario) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new ApiError(400, `Estado inválido: ${ESTADOS_VALIDOS.join(', ')}`);
  const antes = await repo.obtenerPorId(clinicaId, id);
  if (!antes) throw new ApiError(404, 'Presupuesto no encontrado');
  if (antes.estado !== estado && !(TRANSICIONES[antes.estado] || []).includes(estado)) {
    throw new ApiError(409, `Un presupuesto ${NOMBRE_ESTADO[antes.estado]} no puede pasar a ${NOMBRE_ESTADO[estado]}${(TRANSICIONES[antes.estado] || []).length ? ` (puede pasar a: ${TRANSICIONES[antes.estado].join(', ')})` : ''}.`);
  }
  if (estado === 'cancelado' && antes.estado === 'aceptado') {
    const pagado = await query("SELECT COALESCE(SUM(monto),0)::numeric s FROM pagos WHERE clinica_id=$1 AND presupuesto_id=$2 AND estado='pagado'", [clinicaId, id]);
    if (Number(pagado.rows[0].s) > 0) throw new ApiError(409, 'Este presupuesto ya tiene cobros: anulá los cobros antes de cancelarlo.');
  }
  const presupuesto = await repo.actualizarEstado(clinicaId, id, estado);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado', modulo: 'presupuestos', entidadId: id, detalle: { antes: antes.estado, despues: estado },
  });
  return presupuesto;
}

// Presupuesto aceptado → plan de tratamiento: un plan por cada ítem (sin
// duplicar los que ya se crearon), con su precio, pieza y tratamiento.
async function crearPlanes(clinicaId, id, usuario) {
  const pr = await repo.obtenerPorId(clinicaId, id);
  if (!pr) throw new ApiError(404, 'Presupuesto no encontrado');
  if (pr.estado !== 'aceptado') throw new ApiError(409, 'Solo un presupuesto aceptado se convierte en plan de tratamiento');
  const items = pr.items || [];
  if (!items.length) throw new ApiError(400, 'El presupuesto no tiene ítems');
  const creados = [];
  const { conCandado } = require('../../config/db');
  await conCandado(`presupuesto:planes:${clinicaId}:${id}`, async () => {
    for (const it of items) {
      const ya = await query('SELECT id FROM planes_tratamiento WHERE clinica_id=$1 AND presupuesto_item_id=$2', [clinicaId, it.id]);
      if (ya.rowCount) continue;
      const trat = it.tratamiento_id ? (await query('SELECT nombre FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, it.tratamiento_id])).rows[0] : null;
      const precio = Number(it.precio_unitario) * Number(it.cantidad || 1) * (1 - Number(pr.descuento || 0) / 100);
      const r = await query(`INSERT INTO planes_tratamiento (clinica_id, paciente_id, odontologo_id, tratamiento_id, nombre, pieza, precio, sesiones_totales, presupuesto_id, presupuesto_item_id, estado, observaciones)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendiente',$11) RETURNING id, nombre, pieza`,
      [clinicaId, pr.paciente_id, pr.odontologo_id || null, it.tratamiento_id || null, String(it.descripcion || (trat && trat.nombre) || 'Tratamiento').slice(0, 200),
        it.pieza || null, Math.round(precio * 100) / 100, Math.max(1, Math.round(Number(it.cantidad) || 1)), pr.id, it.id, `Del presupuesto #${pr.id}`]);
      creados.push(r.rows[0]);
    }
  });
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear_planes_desde_presupuesto', modulo: 'presupuestos', entidadId: id, detalle: { planes: creados.map((x) => x.id) } });
  return { creados, yaExistian: items.length - creados.length };
}

module.exports = { listarPorPaciente, obtener, crear, cambiarEstado, crearPlanes, vencerAutomaticos, ESTADOS_VALIDOS };
