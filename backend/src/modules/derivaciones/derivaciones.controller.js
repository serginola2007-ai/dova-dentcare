const service = require('./derivaciones.service');

async function listar(req, res, next) {
  try {
    res.json(await service.listar(req.clinicaId, {
      pacienteId: req.query.pacienteId ? Number(req.query.pacienteId) : undefined,
      odontologoDestinoId: req.query.odontologoDestinoId ? Number(req.query.odontologoDestinoId) : undefined,
      estado: req.query.estado,
    }));
  } catch (e) { next(e); }
}
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); } }
async function crear(req, res, next) {
  try {
    const archivoNombre = req.file ? req.file.originalname : undefined;
    const archivoPath = req.file ? req.file.path : undefined;
    res.status(201).json(await service.crear(req.clinicaId, { ...req.body, archivoNombre, archivoPath }, req.usuario));
  } catch (e) { next(e); }
}
async function cambiarEstado(req, res, next) { try { res.json(await service.cambiarEstado(req.clinicaId, Number(req.params.id), req.body.estado, req.usuario)); } catch (e) { next(e); } }

module.exports = { listar, obtener, crear, cambiarEstado };
