const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./odontograma.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = [
  'sano', 'caries', 'restauracion', 'corona', 'endodoncia', 'extraccion_indicada',
  'ausente', 'implante', 'protesis', 'fractura', 'sellante', 'tratamiento_realizado', 'otro',
];
const SUPERFICIES_VALIDAS = ['general', 'mesial', 'distal', 'vestibular', 'lingual_palatina', 'oclusal_incisal'];

async function obtenerPorPaciente(clinicaId, pacienteId) {
  return repo.obtenerPorPaciente(clinicaId, pacienteId);
}

async function obtenerHistorialPieza(clinicaId, pacienteId, pieza) {
  return repo.obtenerHistorialPieza(clinicaId, pacienteId, pieza);
}

/* Expediente histórico completo de una pieza (sección 10): estado actual +
   diagnósticos/evoluciones + tratamientos/planes + fotos + estudios, todo
   junto y ordenado. */
async function expedientePieza(clinicaId, pacienteId, pieza) {
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
  if (!datos.pieza) throw new ApiError(400, 'La pieza es obligatoria');
  const { PIEZAS_VALIDAS } = require('../../utils/recurso');
  if (!PIEZAS_VALIDAS.has(String(datos.pieza))) throw new ApiError(400, `Pieza ${datos.pieza} inválida: usá la numeración FDI (11-48 permanentes, 51-85 temporales)`);
  if (!ESTADOS_VALIDOS.includes(datos.estado)) {
    throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  }
  if (datos.superficie && !SUPERFICIES_VALIDAS.includes(datos.superficie)) {
    throw new ApiError(400, `Superficie inválida. Debe ser una de: ${SUPERFICIES_VALIDAS.join(', ')}`);
  }
  const pieza = await repo.actualizarPieza(clinicaId, pacienteId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'modificar_odontograma', modulo: 'odontograma', entidadId: pacienteId,
    detalle: { pieza: datos.pieza, superficie: datos.superficie || 'general', estado: datos.estado },
  });
  return pieza;
}

module.exports = { obtenerPorPaciente, obtenerHistorialPieza, expedientePieza, actualizarPieza, ESTADOS_VALIDOS, SUPERFICIES_VALIDAS };
