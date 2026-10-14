/* Resumen del día al dueño: /api/resumen/... */
const express = require('express');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const s = require('./resumen.service');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/config', requirePermiso('clinica.config.manage'), h((req) => s.configuracion(req.clinicaId)));
router.put('/config', requirePermiso('clinica.config.manage'), h((req) => s.guardarConfiguracion(req.clinicaId, req.body, req.usuario)));
router.get('/vista', requirePermiso('clinica.config.manage', 'reportes.view'), h((req) => s.vistaPrevia(req.clinicaId, req.query.fecha)));
router.post('/enviar', requirePermiso('clinica.config.manage'), h((req) => s.enviarAhora(req.clinicaId, req.usuario)));

module.exports = router;
