const express = require('express');
const controller = require('./plantillas.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/', requirePermiso('plantillas_clinicas.view', 'plantillas_clinicas.manage'), controller.listar);
router.get('/:id', requirePermiso('plantillas_clinicas.view', 'plantillas_clinicas.manage'), controller.obtener);
router.post('/', requirePermiso('plantillas_clinicas.manage'), controller.crear);
router.put('/:id', requirePermiso('plantillas_clinicas.manage'), controller.actualizar);
router.delete('/:id', requirePermiso('plantillas_clinicas.manage'), controller.eliminar);

module.exports = router;
