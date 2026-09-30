const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./presupuestos.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado'];

async function listarPorPaciente(clinicaId, pacienteId) { return repo.listarPorPaciente(clinicaId, pacienteId); }

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

async function cambiarEstado(clinicaId, id, estado, usuario) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new ApiError(400, `Estado inválido: ${ESTADOS_VALIDOS.join(', ')}`);
  const presupuesto = await repo.actualizarEstado(clinicaId, id, estado);
  if (!presupuesto) throw new ApiError(404, 'Presupuesto no encontrado');
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado', modulo: 'presupuestos', entidadId: id, detalle: { estado },
  });
  return presupuesto;
}

module.exports = { listarPorPaciente, obtener, crear, cambiarEstado, ESTADOS_VALIDOS };
