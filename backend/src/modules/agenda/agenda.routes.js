const express = require('express');
const controller = require('./agenda.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/', requirePermiso('agenda.view'), controller.listar);
router.get('/:id', requirePermiso('agenda.view'), controller.obtener);
router.get('/:id/contexto-clinico', requirePermiso('agenda.view'), controller.contextoClinico);
router.post('/', requirePermiso('agenda.create'), controller.crear);
router.put('/:id', requirePermiso('agenda.edit'), controller.actualizar);
router.patch('/:id/estado', requirePermiso('agenda.edit'), controller.cambiarEstado);

module.exports = router;
