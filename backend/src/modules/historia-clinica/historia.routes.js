const express = require('express');
const controller = require('./historia.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/paciente/:pacienteId', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), controller.listarPorPaciente);
router.get('/paciente/:pacienteId/timeline', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), controller.timelinePaciente);
router.get('/paciente/:pacienteId/pieza/:pieza', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), controller.listarPorPieza);
router.get('/paciente/:pacienteId/contexto', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), controller.contextoConsulta);
router.post('/', requirePermiso('historia_clinica.edit', 'pacientes.clinical.edit'), controller.crear);
router.put('/:id', requirePermiso('historia_clinica.edit', 'pacientes.clinical.edit'), controller.actualizarBorrador);
router.post('/:id/firmar', requirePermiso('historia_clinica.edit', 'pacientes.clinical.edit'), controller.firmar);
router.post('/:id/enmienda', requirePermiso('historia_clinica.edit', 'pacientes.clinical.edit'), controller.crearEnmienda);
module.exports = router;
