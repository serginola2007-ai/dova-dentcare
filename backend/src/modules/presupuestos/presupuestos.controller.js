const service = require('./presupuestos.service');
async function listarPorPaciente(req, res, next) { try { res.json(await service.listarPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, req.params.id)); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function cambiarEstado(req, res, next) { try { res.json(await service.cambiarEstado(req.clinicaId, req.params.id, req.body.estado, req.usuario)); } catch (e) { next(e); } }
async function crearPlanes(req, res, next) {
  try { res.status(201).json(await service.crearPlanes(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}
module.exports = { crearPlanes, listarPorPaciente, obtener, crear, cambiarEstado };
