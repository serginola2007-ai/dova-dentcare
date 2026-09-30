const service = require('./historia.service');
async function listarPorPaciente(req, res, next) {
  try { res.json(await service.listarPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); }
}
async function listarPorPieza(req, res, next) {
  try { res.json(await service.listarPorPieza(req.clinicaId, req.params.pacienteId, req.params.pieza)); } catch (e) { next(e); }
}
async function crear(req, res, next) {
  try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function firmar(req, res, next) {
  try { res.json(await service.firmar(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}
async function crearEnmienda(req, res, next) {
  try { res.status(201).json(await service.crearEnmienda(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); }
}
async function timelinePaciente(req, res, next) {
  try { res.json(await service.timelinePaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); }
}
module.exports = { listarPorPaciente, listarPorPieza, crear, firmar, crearEnmienda, timelinePaciente };
