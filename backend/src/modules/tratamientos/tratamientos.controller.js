const service = require('./tratamientos.service');
async function listar(req, res, next) { try { res.json(await service.listar(req.clinicaId, { incluirInactivos: req.query.incluirInactivos === 'true' })); } catch (e) { next(e); } }
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, req.params.id)); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function actualizar(req, res, next) { try { res.json(await service.actualizar(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
module.exports = { listar, obtener, crear, actualizar };
