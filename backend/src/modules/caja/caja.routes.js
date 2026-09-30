const express = require('express');
const controller = require('./caja.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/estado', requirePermiso('caja.view'), controller.estado);
router.get('/historico', requirePermiso('caja.view'), controller.historico);
router.post('/abrir', requirePermiso('caja.manage'), controller.abrir);
router.post('/movimiento', requirePermiso('caja.manage'), controller.movimiento);
router.post('/:id/cerrar', requirePermiso('caja.manage'), controller.cerrar);
module.exports = router;
