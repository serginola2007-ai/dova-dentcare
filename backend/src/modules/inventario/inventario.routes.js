const express = require('express');
const controller = require('./inventario.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

const kits = require('./kits.service');
const hk = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
router.get('/kits', requirePermiso('inventario.view'), hk((req) => kits.resumen(req.clinicaId)));
router.get('/kits/:tratamientoId', requirePermiso('inventario.view'), hk((req) => kits.obtener(req.clinicaId, req.params.tratamientoId)));
router.put('/kits/:tratamientoId', requirePermiso('inventario.manage'), hk((req) => kits.guardar(req.clinicaId, req.params.tratamientoId, req.body && req.body.items, req.usuario)));

router.get('/proveedores', requirePermiso('inventario.view'), controller.listarProveedores);
router.post('/proveedores', requirePermiso('proveedores.manage'), controller.crearProveedor);

router.get('/insumos', requirePermiso('inventario.view'), controller.listarInsumos);
router.post('/insumos', requirePermiso('inventario.manage'), controller.crearInsumo);
router.put('/insumos/:id', requirePermiso('inventario.manage'), controller.actualizarInsumo);
router.get('/insumos/:id/lotes', requirePermiso('inventario.view'), controller.listarLotes);
router.get('/vencimientos', requirePermiso('inventario.view'), controller.porVencer);
router.post('/insumos/:id/movimiento', requirePermiso('inventario.manage'), controller.registrarMovimiento);
router.get('/insumos/:id/movimientos', requirePermiso('inventario.view'), controller.listarMovimientos);

router.post('/compras', requirePermiso('proveedores.manage'), controller.crearCompra);

module.exports = router;
