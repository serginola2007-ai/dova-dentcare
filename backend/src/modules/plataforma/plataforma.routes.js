const express = require('express');
const s = require('./plataforma.service');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, requirePermiso('plataforma.manage'));
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

router.get('/catalogo', h(() => s.catalogo()));
router.get('/clinicas', h(() => s.listar()));
router.post('/clinicas', h((r) => s.crear(r.body || {}, r.usuario)));
router.put('/clinicas/:id', h((r) => s.editar(r.params.id, r.body || {}, r.usuario)));
router.post('/clinicas/:id/suspender', h((r) => s.suspender(r.params.id, (r.body || {}).motivo, r.usuario)));
router.post('/clinicas/:id/reactivar', h((r) => s.reactivar(r.params.id, r.usuario)));
router.get('/clinicas/:id/pagos', h((r) => s.pagos(r.params.id)));
router.post('/clinicas/:id/pagos', h((r) => s.registrarPago(r.params.id, r.body || {}, r.usuario)));
router.delete('/clinicas/:id/pagos/:pagoId', h((r) => s.borrarPago(r.params.id, r.params.pagoId, r.usuario)));

module.exports = router;
