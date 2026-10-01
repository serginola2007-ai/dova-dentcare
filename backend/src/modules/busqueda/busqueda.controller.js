const service = require('./busqueda.service');

async function buscar(req, res, next) {
  try {
    res.json(await service.buscar(req.clinicaId, req.query.q, req.usuario.permisos, req.usuario));
  } catch (e) { next(e); }
}

module.exports = { buscar };
