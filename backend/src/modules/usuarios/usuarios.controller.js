const service = require('./usuarios.service');

async function listarRoles(req, res, next) {
  try { res.json(await service.listarRoles(req.clinicaId)); } catch (e) { next(e); }
}

async function detalleRol(req, res, next) {
  try { res.json(await service.detalleRol(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); }
}

async function crearRol(req, res, next) {
  try { res.status(201).json(await service.crearRol(req.clinicaId, req.body)); } catch (e) { next(e); }
}

async function actualizarPermisosRol(req, res, next) {
  try {
    const permisos = await service.actualizarPermisosRol(req.clinicaId, Number(req.params.id), req.body.codigos, req.usuario);
    res.json(permisos);
  } catch (e) { next(e); }
}

async function listarPermisos(req, res, next) {
  try { res.json(await service.listarPermisos()); } catch (e) { next(e); }
}

async function listar(req, res, next) {
  try {
    const { incluirInactivos, page, pageSize } = req.query;
    res.json(await service.listar(req.clinicaId, {
      incluirInactivos: incluirInactivos === 'true',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try { res.json(await service.obtenerConPermisos(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try { res.json(await service.actualizar(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); }
}

async function cambiarPassword(req, res, next) {
  try {
    res.json(await service.cambiarPassword(req.clinicaId, Number(req.params.id), req.body.password, req.usuario));
  } catch (e) { next(e); }
}

async function setOverride(req, res, next) {
  try {
    const { codigoPermiso, allow } = req.body;
    res.json(await service.setOverride(req.clinicaId, Number(req.params.id), codigoPermiso, allow, req.usuario));
  } catch (e) { next(e); }
}

async function quitarOverride(req, res, next) {
  try {
    res.json(await service.quitarOverride(req.clinicaId, Number(req.params.id), req.params.codigoPermiso, req.usuario));
  } catch (e) { next(e); }
}

async function actualizarMiDisenoPreferido(req, res, next) {
  try {
    res.json(await service.actualizarMiDisenoPreferido(req.usuario.id, req.body.disenoPreferido));
  } catch (e) { next(e); }
}

async function cerrarSesiones(req, res, next) {
  try { res.json(await service.cerrarSesiones(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}

module.exports = {
  cerrarSesiones,
  listarRoles, detalleRol, crearRol, actualizarPermisosRol, listarPermisos,
  listar, obtener, crear, actualizar, cambiarPassword, setOverride, quitarOverride,
  actualizarMiDisenoPreferido,
};
