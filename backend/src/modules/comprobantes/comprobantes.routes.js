const express = require('express');
const controller = require('./comprobantes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/pago/:id', requirePermiso('pagos.view'), controller.pago);
router.get('/presupuesto/:id', requirePermiso('presupuestos.view'), controller.presupuesto);
router.get('/consentimiento/:id', requirePermiso('consentimientos.manage', 'pacientes.clinical.view'), controller.consentimiento);
router.get('/plan-tratamiento/:id', requirePermiso('planes_tratamiento.view'), controller.planTratamiento);

module.exports = router;
