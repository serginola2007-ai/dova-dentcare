const express = require('express');
const controller = require('./reportes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.use('/', require('./centro').router);
router.get('/dashboard/alertas', requirePermiso('reportes.view'), controller.alertasDashboard);
router.get('/financiero', requirePermiso('reportes.view'), controller.financiero);
router.get('/agenda', requirePermiso('reportes.view'), controller.agenda);
router.get('/tratamientos', requirePermiso('reportes.view'), controller.tratamientos);
router.get('/pacientes', requirePermiso('reportes.view'), controller.pacientes);
router.get('/inventario', requirePermiso('reportes.view'), controller.inventario);

module.exports = router;
