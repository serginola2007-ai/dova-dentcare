const express = require('express');
const controller = require('./inventario.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/proveedores', requirePermiso('inventario.view'), controller.listarProveedores);
router.post('/proveedores', requirePermiso('proveedores.manage'), controller.crearProveedor);

router.get('/insumos', requirePermiso('inventario.view'), controller.listarInsumos);
router.post('/insumos', requirePermiso('inventario.manage'), controller.crearInsumo);
router.post('/insumos/:id/movimiento', requirePermiso('inventario.manage'), controller.registrarMovimiento);
router.get('/insumos/:id/movimientos', requirePermiso('inventario.view'), controller.listarMovimientos);

router.post('/compras', requirePermiso('proveedores.manage'), controller.crearCompra);

module.exports = router;
