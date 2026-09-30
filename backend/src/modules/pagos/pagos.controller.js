const service = require('./pagos.service');
async function listarPorPaciente(req, res, next) { try { res.json(await service.listarPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function listar(req, res, next) { try { res.json(await service.listar(req.clinicaId, req.query)); } catch (e) { next(e); } }
async function resumenPaciente(req, res, next) { try { res.json(await service.resumenPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function anular(req, res, next) { try { res.json(await service.anular(req.clinicaId, req.params.id, req.usuario)); } catch (e) { next(e); } }
module.exports = { listarPorPaciente, listar, resumenPaciente, crear, anular };
