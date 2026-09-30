const repo = require('./derivaciones.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = ['pendiente', 'atendida', 'rechazada'];

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const derivacion = await repo.obtener(clinicaId, id);
  if (!derivacion) throw new ApiError(404, 'Derivación no encontrada');
  return derivacion;
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId || !datos.odontologoDestinoId || !datos.motivo) {
    throw new ApiError(400, 'pacienteId, odontologoDestinoId y motivo son requeridos');
  }
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  const derivacion = await repo.crear(clinicaId, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'derivaciones', entidadId: derivacion.id,
    detalle: { pacienteId: datos.pacienteId, odontologoDestinoId: datos.odontologoDestinoId },
  });
  return derivacion;
}

async function cambiarEstado(clinicaId, id, estado, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Derivación no encontrada');
  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  }
  const derivacion = await repo.cambiarEstado(clinicaId, id, estado);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado', modulo: 'derivaciones', entidadId: id, detalle: { estado },
  });
  return derivacion;
}

module.exports = { listar, obtener, crear, cambiarEstado, ESTADOS_VALIDOS };
