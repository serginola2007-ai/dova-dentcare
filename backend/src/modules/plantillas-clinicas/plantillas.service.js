const repo = require('./plantillas.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');

async function listar(clinicaId, opts) {
  return repo.listar(clinicaId, opts);
}

async function obtener(clinicaId, id) {
  const plantilla = await repo.obtener(clinicaId, id);
  if (!plantilla) throw new ApiError(404, 'Plantilla no encontrada');
  return plantilla;
}

function validarCampos(campos) {
  if (!Array.isArray(campos)) throw new ApiError(400, 'campos debe ser una lista');
  const tiposValidos = ['text', 'textarea', 'select', 'number', 'checkbox', 'date'];
  for (const c of campos) {
    if (!c.campo || !c.label || !c.tipo) throw new ApiError(400, 'Cada campo requiere: campo, label, tipo');
    if (!tiposValidos.includes(c.tipo)) throw new ApiError(400, `Tipo de campo inválido: ${c.tipo}. Debe ser uno de: ${tiposValidos.join(', ')}`);
  }
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.nombre) throw new ApiError(400, 'El nombre de la plantilla es obligatorio');
  validarCampos(datos.campos || []);
  const plantilla = await repo.crear(clinicaId, datos, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'plantillas_clinicas', entidadId: plantilla.id, detalle: { nombre: plantilla.nombre },
  });
  return plantilla;
}

async function actualizar(clinicaId, id, datos, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Plantilla no encontrada');
  if (datos.campos) validarCampos(datos.campos);
  const plantilla = await repo.actualizar(clinicaId, id, { ...existente, ...datos });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'editar', modulo: 'plantillas_clinicas', entidadId: id,
  });
  return plantilla;
}

async function eliminar(clinicaId, id, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Plantilla no encontrada');
  const plantilla = await repo.eliminar(clinicaId, id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'desactivar', modulo: 'plantillas_clinicas', entidadId: id,
  });
  return plantilla;
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
