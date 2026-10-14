const service = require('./agenda.service');

async function listar(req, res, next) {
  try {
    const { desde, hasta, odontologoId, estado } = req.query;
    res.json(await service.listar(req.clinicaId, { desde, hasta, odontologoId, estado, pacienteId: req.query.pacienteId }));
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

async function cambiarEstado(req, res, next) {
  try { res.json(await service.cambiarEstado(req.clinicaId, req.params.id, req.body.estado, req.usuario)); }
  catch (err) { next(err); }
}

async function contextoClinico(req, res, next) {
  try { res.json(await service.contextoClinico(req.clinicaId, req.params.id, req.usuario.permisos)); }
  catch (err) { next(err); }
}

async function disponibles(req, res, next) {
  try { res.json(await require('./agenda.disponibles').disponibles(req.clinicaId, req.query)); }
  catch (err) { next(err); }
}

module.exports = { disponibles, listar, obtener, crear, actualizar, cambiarEstado, contextoClinico };
