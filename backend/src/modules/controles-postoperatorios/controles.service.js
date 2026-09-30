const repo = require('./controles.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

// Reglas configurables (NO IA): escalas fijas que el odontólogo evalúa clínicamente.
const NIVELES_DOLOR = ['ninguno', 'leve', 'moderado', 'severo'];
const NIVELES_INFLAMACION = ['ninguna', 'leve', 'moderada', 'severa'];
const NIVELES_SANGRADO = ['ninguno', 'leve', 'persistente'];
const NIVELES_CICATRIZACION = ['normal', 'lenta', 'con_complicacion'];

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const control = await repo.obtener(clinicaId, id);
  if (!control) throw new ApiError(404, 'Control postoperatorio no encontrado');
  return control;
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId || !datos.fechaControlProgramada) {
    throw new ApiError(400, 'pacienteId y fechaControlProgramada son requeridos');
  }
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  const control = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'controles_postoperatorios', entidadId: control.id, detalle: { pacienteId: datos.pacienteId },
  });
  return control;
}

async function registrarResultado(clinicaId, id, datos, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Control postoperatorio no encontrado');
  if (existente.estado === 'realizado') throw new ApiError(409, 'Este control ya fue registrado');
  for (const [campo, valor, lista] of [
    ['dolor', datos.dolor, NIVELES_DOLOR],
    ['inflamacion', datos.inflamacion, NIVELES_INFLAMACION],
    ['sangrado', datos.sangrado, NIVELES_SANGRADO],
    ['cicatrizacion', datos.cicatrizacion, NIVELES_CICATRIZACION],
  ]) {
    if (valor && !lista.includes(valor)) {
      throw new ApiError(400, `Valor inválido para ${campo}: ${valor}. Debe ser uno de: ${lista.join(', ')}`);
    }
  }
  const control = await repo.registrarResultado(clinicaId, id, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'registrar_resultado', modulo: 'controles_postoperatorios', entidadId: id,
    detalle: { dolor: datos.dolor, inflamacion: datos.inflamacion, sangrado: datos.sangrado, cicatrizacion: datos.cicatrizacion },
  });
  return control;
}

async function marcarInasistencia(clinicaId, id, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Control postoperatorio no encontrado');
  const control = await repo.marcarInasistencia(clinicaId, id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'marcar_inasistencia', modulo: 'controles_postoperatorios', entidadId: id,
  });
  return control;
}

module.exports = {
  listar, obtener, crear, registrarResultado, marcarInasistencia,
  NIVELES_DOLOR, NIVELES_INFLAMACION, NIVELES_SANGRADO, NIVELES_CICATRIZACION,
};
