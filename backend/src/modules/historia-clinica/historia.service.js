const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./historia.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) {
  return repo.listarPorPaciente(clinicaId, pacienteId);
}

async function listarPorPieza(clinicaId, pacienteId, pieza) {
  return repo.listarPorPieza(clinicaId, pacienteId, pieza);
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId) throw new ApiError(400, 'El paciente es obligatorio');
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  const entrada = await repo.crear(clinicaId, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'historia_clinica', entidadId: entrada.id,
    detalle: { pacienteId: datos.pacienteId, procedimiento: datos.procedimiento },
  });
  return entrada;
}

/* Firmar una evolución la vuelve inmutable (sección 41: evitar
   modificaciones silenciosas). A partir de acá, cualquier corrección pasa
   por crearEnmienda, nunca por un UPDATE directo. */
async function firmar(clinicaId, id, usuario) {
  const entrada = await repo.obtenerPorId(clinicaId, id);
  if (!entrada) throw new ApiError(404, 'Evolución clínica no encontrada');
  if (entrada.firmada) throw new ApiError(409, 'Esta evolución ya está firmada');
  const firmada = await repo.firmar(clinicaId, id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'firmar', modulo: 'historia_clinica', entidadId: id,
  });
  return firmada;
}

async function crearEnmienda(clinicaId, id, datos, usuario) {
  const original = await repo.obtenerPorId(clinicaId, id);
  if (!original) throw new ApiError(404, 'Evolución clínica no encontrada');
  if (!original.firmada) throw new ApiError(400, 'Solo se puede enmendar una evolución ya firmada; si no está firmada, editala directamente');
  if (!datos.motivoEnmienda) throw new ApiError(400, 'El motivo de la enmienda es obligatorio');
  const enmienda = await repo.crearEnmienda(clinicaId, original, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'enmendar', modulo: 'historia_clinica', entidadId: id,
    detalle: { nuevaEntradaId: enmienda.id, motivo: datos.motivoEnmienda },
  });
  return enmienda;
}

async function timelinePaciente(clinicaId, pacienteId) {
  return repo.timelinePaciente(clinicaId, pacienteId);
}

module.exports = { listarPorPaciente, listarPorPieza, crear, firmar, crearEnmienda, timelinePaciente };
