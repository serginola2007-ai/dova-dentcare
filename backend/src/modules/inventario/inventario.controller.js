const service = require('./inventario.service');
async function listarProveedores(req, res, next) { try { res.json(await service.listarProveedores(req.clinicaId, req.query)); } catch (e) { next(e); } }
async function crearProveedor(req, res, next) { try { res.status(201).json(await service.crearProveedor(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function listarInsumos(req, res, next) { try { res.json(await service.listarInsumos(req.clinicaId, { soloStockBajo: req.query.soloStockBajo === 'true' })); } catch (e) { next(e); } }
async function crearInsumo(req, res, next) { try { res.status(201).json(await service.crearInsumo(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function registrarMovimiento(req, res, next) { try { res.status(201).json(await service.registrarMovimiento(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
async function listarMovimientos(req, res, next) { try { res.json(await service.listarMovimientos(req.clinicaId, req.params.id)); } catch (e) { next(e); } }
async function crearCompra(req, res, next) { try { res.status(201).json(await service.crearCompra(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function listarLotes(req, res, next) { try { res.json(await service.listarLotes(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); } }
async function porVencer(req, res, next) { try { res.json(await service.porVencer(req.clinicaId, req.query.dias)); } catch (e) { next(e); } }
async function actualizarInsumo(req, res, next) { try { res.json(await service.actualizarInsumo(req.clinicaId, Number(req.params.id), req.body || {}, req.usuario)); } catch (e) { next(e); } }
module.exports = {
  listarLotes, porVencer, actualizarInsumo, listarProveedores, crearProveedor, listarInsumos, crearInsumo, registrarMovimiento, listarMovimientos, crearCompra };
