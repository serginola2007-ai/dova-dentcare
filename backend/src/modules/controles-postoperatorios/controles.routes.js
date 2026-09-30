const express = require('express');
const controller = require('./controles.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/', requirePermiso('controles_postoperatorios.manage', 'pacientes.clinical.view'), controller.listar);
router.get('/:id', requirePermiso('controles_postoperatorios.manage', 'pacientes.clinical.view'), controller.obtener);
router.post('/', requirePermiso('controles_postoperatorios.manage'), controller.crear);
router.post('/:id/resultado', requirePermiso('controles_postoperatorios.manage'), controller.registrarResultado);
router.post('/:id/inasistencia', requirePermiso('controles_postoperatorios.manage'), controller.marcarInasistencia);

module.exports = router;
