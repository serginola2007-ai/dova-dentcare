const service = require('./plantillas.service');
async function listar(req, res, next) { try { res.json(await service.listar(req.clinicaId, { incluirInactivas: req.query.incluirInactivas === 'true' })); } catch (e) { next(e); } }
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function actualizar(req, res, next) { try { res.json(await service.actualizar(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); } }
async function eliminar(req, res, next) { try { res.json(await service.eliminar(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); } }
module.exports = { listar, obtener, crear, actualizar, eliminar };
