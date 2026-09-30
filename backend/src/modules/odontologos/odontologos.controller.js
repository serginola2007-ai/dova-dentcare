const service = require('./odontologos.service');

async function listar(req, res, next) {
  try {
    const { incluirInactivos } = req.query;
    res.json(await service.listar(req.clinicaId, { incluirInactivos: incluirInactivos === 'true' }));
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try { res.json(await service.obtener(req.clinicaId, req.params.id)); }
  catch (err) { next(err); }
}

async function crear(req, res, next) {
  try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); }
  catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try { res.json(await service.actualizar(req.clinicaId, req.params.id, req.body, req.usuario)); }
  catch (err) { next(err); }
}

async function desactivar(req, res, next) {
  try { res.json(await service.desactivar(req.clinicaId, req.params.id, req.usuario)); }
  catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, desactivar };
