const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./odontograma.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = [
  'sano', 'caries', 'restauracion', 'corona', 'endodoncia', 'extraccion_indicada',
  'ausente', 'implante', 'protesis', 'fractura', 'sellante', 'tratamiento_realizado', 'otro',
];
// 'raiz' guarda la endodoncia aparte, así una pieza puede tener corona y conducto a la vez.
const SUPERFICIES_VALIDAS = ['general', 'mesial', 'distal', 'vestibular', 'lingual_palatina', 'oclusal_incisal', 'raiz'];
// Lo que se puede marcar en una cara del diente.
const ESTADOS_DE_CARA = ['sano', 'caries', 'restauracion', 'sellante', 'fractura'];
const CARAS = ['mesial', 'distal', 'vestibular', 'lingual_palatina', 'oclusal_incisal'];
const DENTICIONES = ['permanente', 'temporal', 'mixta'];

async function exigirPaciente(clinicaId, pacienteId) {
  const id = Number(pacienteId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Paciente inválido');
  const paciente = await repo.pacienteDeClinica(clinicaId, id);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado');
  return paciente;
}

// Edad en años cumplidos a hoy (null si no hay fecha de nacimiento).
function edad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const n = new Date(fechaNacimiento); const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}
// Sin elección guardada: menor de 6 años temporal, de 6 a 12 mixta, si no permanente.
function denticionAutomatica(fechaNacimiento) {
  const a = edad(fechaNacimiento);
  if (a === null) return 'permanente';
  if (a < 6) return 'temporal';
  if (a <= 12) return 'mixta';
  return 'permanente';
}

/* Estado actual + dentición a mostrar. */
async function obtenerPorPaciente(clinicaId, pacienteId) {
  await exigirPaciente(clinicaId, pacienteId);
  return repo.obtenerPorPaciente(clinicaId, pacienteId);
}

async function datosOdontograma(clinicaId, pacienteId) {
  const paciente = await exigirPaciente(clinicaId, pacienteId);
  const piezas = await repo.obtenerPorPaciente(clinicaId, pacienteId);
  return {
    piezas,
    denticion: paciente.odontograma_denticion || denticionAutomatica(paciente.fecha_nacimiento),
    denticionElegida: paciente.odontograma_denticion || null,
    denticionAutomatica: denticionAutomatica(paciente.fecha_nacimiento),
  };
}

// Todos los cambios, para ver el odontograma de una fecha anterior y comparar.
async function historialPaciente(clinicaId, pacienteId) {
  await exigirPaciente(clinicaId, pacienteId);
  return repo.historialPaciente(clinicaId, pacienteId);
}

async function guardarDenticion(clinicaId, pacienteId, denticion, usuario) {
  await exigirPaciente(clinicaId, pacienteId);
  if (denticion !== null && !DENTICIONES.includes(denticion)) throw new ApiError(400, `Dentición inválida. Debe ser una de: ${DENTICIONES.join(', ')} (o vacía para automática)`);
  await repo.guardarDenticion(clinicaId, pacienteId, denticion);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'odontograma_denticion', modulo: 'odontograma', entidadId: pacienteId, detalle: { denticion: denticion || 'automatica' },
  });
  return datosOdontograma(clinicaId, pacienteId);
}

async function obtenerHistorialPieza(clinicaId, pacienteId, pieza) {
  await exigirPaciente(clinicaId, pacienteId);
  return repo.obtenerHistorialPieza(clinicaId, pacienteId, pieza);
}

/* Expediente histórico completo de una pieza (sección 10): estado actual +
   diagnósticos/evoluciones + tratamientos/planes + fotos + estudios, todo
   junto y ordenado. */
async function expedientePieza(clinicaId, pacienteId, pieza) {
  await exigirPaciente(clinicaId, pacienteId);
  const [estadoActual, cambiosEstado, evoluciones, planes, fotos, estudios] = await Promise.all([
    repo.estadoActualPieza(clinicaId, pacienteId, pieza),
    repo.obtenerHistorialPieza(clinicaId, pacienteId, pieza),
    repo.evolucionesPorPieza(clinicaId, pacienteId, pieza),
    repo.planesPorPieza(clinicaId, pacienteId, pieza),
    repo.fotosPorPieza(clinicaId, pacienteId, pieza),
    repo.estudiosPorPieza(clinicaId, pacienteId, pieza),
  ]);
  return {
    pieza,
    estadoActual,
    cambiosEstado,
    evoluciones,
    tratamientosPlanificados: planes.filter((p) => ['pendiente', 'presupuestado', 'aprobado'].includes(p.estado)),
    tratamientosEnCurso: planes.filter((p) => p.estado === 'en_proceso'),
    tratamientosTerminados: planes.filter((p) => p.estado === 'finalizado'),
    fotos,
    estudios,
  };
}

async function actualizarPieza(clinicaId, pacienteId, datos, usuario) {
  if (!datos || typeof datos !== 'object') throw new ApiError(400, 'Datos inválidos');
  await exigirPaciente(clinicaId, pacienteId);
  if (!datos.pieza) throw new ApiError(400, 'La pieza es obligatoria');
  const { PIEZAS_VALIDAS } = require('../../utils/recurso');
  if (!PIEZAS_VALIDAS.has(String(datos.pieza))) throw new ApiError(400, `Pieza ${datos.pieza} inválida: usá la numeración FDI (11-48 permanentes, 51-85 temporales)`);
  if (!ESTADOS_VALIDOS.includes(datos.estado)) {
    throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  }
  if (datos.superficie && !SUPERFICIES_VALIDAS.includes(datos.superficie)) {
    throw new ApiError(400, `Superficie inválida. Debe ser una de: ${SUPERFICIES_VALIDAS.join(', ')}`);
  }
  if (CARAS.includes(datos.superficie) && !ESTADOS_DE_CARA.includes(datos.estado)) {
    throw new ApiError(400, `En una cara del diente solo se marca: ${ESTADOS_DE_CARA.join(', ')}`);
  }
  if (datos.superficie === 'raiz' && !['sano', 'endodoncia'].includes(datos.estado)) {
    throw new ApiError(400, 'En la raíz solo se marca endodoncia (o sano para quitarla)');
  }
  if (datos.observacion !== undefined && datos.observacion !== null && (typeof datos.observacion !== 'string' || datos.observacion.length > 500)) {
    throw new ApiError(400, 'La observación tiene que ser un texto de hasta 500 caracteres');
  }
  if (datos.odontologoId !== undefined && datos.odontologoId !== null) {
    const idOdo = Number(datos.odontologoId);
    if (!Number.isInteger(idOdo) || !(await repo.odontologoDeClinica(clinicaId, idOdo))) throw new ApiError(400, 'Odontólogo inválido');
  }
  const pieza = await repo.actualizarPieza(clinicaId, pacienteId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'modificar_odontograma', modulo: 'odontograma', entidadId: pacienteId,
    detalle: { pieza: datos.pieza, superficie: datos.superficie || 'general', estado: datos.estado },
  });
  return pieza;
}

module.exports = {
  obtenerPorPaciente, datosOdontograma, historialPaciente, guardarDenticion, obtenerHistorialPieza, expedientePieza, actualizarPieza,
  denticionAutomatica, ESTADOS_VALIDOS, SUPERFICIES_VALIDAS, ESTADOS_DE_CARA,
};
