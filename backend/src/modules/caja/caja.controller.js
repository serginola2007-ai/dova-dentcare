const service = require('./caja.service');
async function estado(req, res, next) { try { res.json(await service.obtenerEstadoActual(req.clinicaId)); } catch (e) { next(e); } }
async function abrir(req, res, next) { try { res.status(201).json(await service.abrir(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function movimiento(req, res, next) { try { res.status(201).json(await service.registrarMovimiento(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function cerrar(req, res, next) { try { res.json(await service.cerrar(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
async function historico(req, res, next) { try { res.json(await service.listarHistorico(req.clinicaId, req.query)); } catch (e) { next(e); } }
module.exports = { estado, abrir, movimiento, cerrar, historico };
