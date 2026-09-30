const service = require('./controles.service');

async function listar(req, res, next) {
  try {
    res.json(await service.listar(req.clinicaId, {
      estado: req.query.estado,
      pacienteId: req.query.pacienteId ? Number(req.query.pacienteId) : undefined,
      odontologoId: req.query.odontologoId ? Number(req.query.odontologoId) : undefined,
      vencidosDesde: req.query.vencidosDesde,
    }));
  } catch (e) { next(e); }
}
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function registrarResultado(req, res, next) { try { res.json(await service.registrarResultado(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); } }
async function marcarInasistencia(req, res, next) { try { res.json(await service.marcarInasistencia(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); } }

module.exports = { listar, obtener, crear, registrarResultado, marcarInasistencia };
