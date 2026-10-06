const { ApiError } = require('../../middlewares/error.middleware');
const { monto: validarMonto, entero } = require('../../utils/montos');
const repo = require('./planespago.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) { return repo.listarPorPaciente(clinicaId, pacienteId); }
async function listarTodos(clinicaId) { return repo.listarTodos(clinicaId); }

async function obtener(clinicaId, id) {
  const plan = await repo.obtenerPorId(clinicaId, id);
  if (!plan) throw new ApiError(404, 'Plan de pago no encontrado');
  return plan;
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId || !datos.total || !datos.cantidadCuotas) {
    throw new ApiError(400, 'Paciente, total y cantidad de cuotas son obligatorios');
  }
  datos.total = validarMonto(datos.total, { campo: 'El total' });
  datos.entrega = validarMonto(datos.entrega === undefined || datos.entrega === '' || datos.entrega === null ? 0 : datos.entrega, { campo: 'La entrega', cero: true });
  if (datos.entrega > datos.total) throw new ApiError(400, 'La entrega no puede superar el total');
  datos.cantidadCuotas = entero(datos.cantidadCuotas, { campo: 'La cantidad de cuotas', min: 1, max: 60 });
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  const plan = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'planes_pago', entidadId: plan.id, detalle: { total: datos.total, cuotas: datos.cantidadCuotas },
  });
  return plan;
}

module.exports = { listarPorPaciente, listarTodos, obtener, crear };
