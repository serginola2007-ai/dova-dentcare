const express = require('express');
const s = require('./ortodoncia.service');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/panel', requirePermiso('ortodoncia.view', 'ortodoncia.manage'), h((req) => s.panel(req.clinicaId)));
router.get('/casos/:id/cuotas', requirePermiso('ortodoncia.view', 'ortodoncia.manage'), h((req) => s.cuotasDelCaso(req.clinicaId, req.params.id)));
router.post('/casos/:id/cuotas', requirePermiso('ortodoncia.manage'), h((req) => s.generarCuotas(req.clinicaId, req.params.id, req.body || {}, req.usuario)));

module.exports = router;
