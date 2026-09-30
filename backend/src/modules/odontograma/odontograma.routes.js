const express = require('express');
const controller = require('./odontograma.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/paciente/:pacienteId', requirePermiso('odontograma.view'), controller.obtenerPorPaciente);
router.get('/paciente/:pacienteId/pieza/:pieza/historial', requirePermiso('odontograma.view'), controller.historialPieza);
router.get('/paciente/:pacienteId/pieza/:pieza/expediente', requirePermiso('odontograma.view'), controller.expedientePieza);
router.put('/paciente/:pacienteId', requirePermiso('odontograma.edit'), controller.actualizarPieza);
module.exports = router;
