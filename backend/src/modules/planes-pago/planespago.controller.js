const service = require('./planespago.service');
async function listarPorPaciente(req, res, next) { try { res.json(await service.listarPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function listarTodos(req, res, next) { try { res.json(await service.listarTodos(req.clinicaId)); } catch (e) { next(e); } }
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, req.params.id)); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
module.exports = { listarPorPaciente, listarTodos, obtener, crear };
