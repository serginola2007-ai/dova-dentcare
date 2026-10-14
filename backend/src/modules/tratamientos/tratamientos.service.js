const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./tratamientos.repository');
const auditoria = require('../../utils/auditoria');

async function listar(clinicaId, filtros) { return repo.listar(clinicaId, filtros); }
async function obtener(clinicaId, id) {
  const t = await repo.obtenerPorId(clinicaId, id);
  if (!t) throw new ApiError(404, 'Tratamiento no encontrado');
  return t;
}
async function validarRecall(clinicaId, datos) {
  if (datos.recallTipoId) {
    const { verificarReferencia } = require('../../utils/recurso');
    await verificarReferencia(clinicaId, 'recall_tipos', Number(datos.recallTipoId), 'recallTipoId');
  }
}
// Indicaciones después del tratamiento: texto libre (sin caracteres de control salvo saltos de línea), hasta 2000 letras.
function validarIndicaciones(datos) {
  if (datos.indicaciones === undefined || datos.indicaciones === null) return;
  if (typeof datos.indicaciones !== 'string') throw new ApiError(400, 'Las indicaciones tienen que ser un texto');
  const t = datos.indicaciones.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim(); // eslint-disable-line no-control-regex
  if (t.length > 2000) throw new ApiError(400, 'Las indicaciones pueden tener hasta 2000 letras');
  datos.indicaciones = t || null;
}

async function crear(clinicaId, datos, usuario) {
  await validarRecall(clinicaId, datos);
  validarIndicaciones(datos);
  if (!datos.nombre) throw new ApiError(400, 'El nombre es obligatorio');
  if (datos.precio !== undefined && Number(datos.precio) < 0) throw new ApiError(400, 'El precio no puede ser negativo');
  const t = await repo.crear(clinicaId, datos);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear', modulo: 'tratamientos', entidadId: t.id, detalle: { nombre: t.nombre } });
  return t;
}
async function actualizar(clinicaId, id, datos, usuario) {
  await validarRecall(clinicaId, datos);
  validarIndicaciones(datos);
  if (datos.precio !== undefined && Number(datos.precio) < 0) throw new ApiError(400, 'El precio no puede ser negativo');
  const t = await repo.actualizar(clinicaId, id, datos);
  if (!t) throw new ApiError(404, 'Tratamiento no encontrado');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar', modulo: 'tratamientos', entidadId: id, detalle: datos });
  return t;
}
module.exports = { listar, obtener, crear, actualizar };
