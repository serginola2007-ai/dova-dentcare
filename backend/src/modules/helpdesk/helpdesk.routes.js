const express = require('express');
const controller = require('./helpdesk.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { upload } = require('./helpdesk.upload');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/metricas', requirePermiso('helpdesk.view_all'), controller.metricas);
router.get('/', requirePermiso('helpdesk.view'), controller.listar);
router.get('/:id', requirePermiso('helpdesk.view'), controller.obtener);
router.post('/', requirePermiso('helpdesk.create'), controller.crear);
router.patch('/:id/estado', requirePermiso('helpdesk.resolve', 'helpdesk.reply'), controller.cambiarEstado);
router.patch('/:id/asignar', requirePermiso('helpdesk.assign'), controller.asignar);
router.post('/:id/mensajes', requirePermiso('helpdesk.reply', 'helpdesk.create'), controller.agregarMensaje);
router.post('/:id/adjuntos', requirePermiso('helpdesk.reply', 'helpdesk.create'), upload.single('archivo'), controller.agregarAdjunto);
router.get('/adjuntos/:adjuntoId/descargar', requirePermiso('helpdesk.view'), controller.descargarAdjunto);

// Endpoint administrativo para disparar la limpieza manualmente (además del script/cron).
router.post('/admin/limpieza-retencion', requirePermiso('usuarios.manage'), controller.ejecutarLimpieza);

module.exports = router;
