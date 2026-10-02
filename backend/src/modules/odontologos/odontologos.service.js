const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./odontologos.repository');
const auditoria = require('../../utils/auditoria');

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const odontologo = await repo.obtenerPorId(clinicaId, id);
  if (!odontologo) throw new ApiError(404, 'Odontólogo no encontrado');
  return odontologo;
}

// Color de la agenda: formato #RRGGBB (o vacío = color automático).
function validarColor(datos) {
  if (datos.colorAgenda === undefined) return;
  if (datos.colorAgenda === '' || datos.colorAgenda === null) { datos.colorAgenda = null; return; }
  if (!/^#[0-9a-fA-F]{6}$/.test(String(datos.colorAgenda))) throw new ApiError(400, 'Elegí un color de la lista');
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.nombre || !datos.nombre.trim()) throw new ApiError(400, 'El nombre es obligatorio');
  validarColor(datos);
  const odontologo = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'odontologos', entidadId: odontologo.id, detalle: { nombre: odontologo.nombre },
  });
  return odontologo;
}

async function actualizar(clinicaId, id, datos, usuario) {
  if (datos.nombre !== undefined && !datos.nombre.trim()) throw new ApiError(400, 'El nombre es obligatorio');
  validarColor(datos);
  const odontologo = await repo.actualizar(clinicaId, id, datos);
  if (!odontologo) throw new ApiError(404, 'Odontólogo no encontrado');
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'editar', modulo: 'odontologos', entidadId: id, detalle: datos,
  });
  return odontologo;
}

async function desactivar(clinicaId, id, usuario) {
  return actualizar(clinicaId, id, { activo: false }, usuario);
}

module.exports = { listar, obtener, crear, actualizar, desactivar };
