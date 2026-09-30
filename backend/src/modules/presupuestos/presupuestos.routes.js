const express = require('express');
const controller = require('./presupuestos.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/paciente/:pacienteId', requirePermiso('presupuestos.view'), controller.listarPorPaciente);
router.get('/:id', requirePermiso('presupuestos.view'), controller.obtener);
router.post('/', requirePermiso('presupuestos.manage'), controller.crear);
router.patch('/:id/estado', requirePermiso('presupuestos.manage'), controller.cambiarEstado);
module.exports = router;
