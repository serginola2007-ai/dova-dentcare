const express = require('express');
const controller = require('./planespago.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/', requirePermiso('planes_pago.manage', 'pagos.view'), controller.listarTodos);
router.get('/paciente/:pacienteId', requirePermiso('planes_pago.manage', 'pagos.view'), controller.listarPorPaciente);
router.get('/:id', requirePermiso('planes_pago.manage', 'pagos.view'), controller.obtener);
router.post('/', requirePermiso('planes_pago.manage'), controller.crear);
module.exports = router;
