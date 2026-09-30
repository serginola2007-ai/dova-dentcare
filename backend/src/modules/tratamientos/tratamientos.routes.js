const express = require('express');
const controller = require('./tratamientos.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/', requirePermiso('tratamientos.view'), controller.listar);
router.get('/:id', requirePermiso('tratamientos.view'), controller.obtener);
router.post('/', requirePermiso('tratamientos.manage'), controller.crear);
router.put('/:id', requirePermiso('tratamientos.manage'), controller.actualizar);
module.exports = router;
