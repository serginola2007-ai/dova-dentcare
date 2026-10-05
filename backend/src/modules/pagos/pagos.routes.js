const express = require('express');
const controller = require('./pagos.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/', requirePermiso('pagos.view'), controller.listar);
router.get('/paciente/:pacienteId', requirePermiso('pagos.view'), controller.listarPorPaciente);
router.get('/paciente/:pacienteId/resumen', requirePermiso('pagos.view'), controller.resumenPaciente);
router.post('/', requirePermiso('pagos.create'), controller.crear);
router.post('/:id/anular', requirePermiso('pagos.anular'), controller.anular);
module.exports = router;
