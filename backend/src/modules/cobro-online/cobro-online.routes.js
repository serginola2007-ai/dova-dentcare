/* /api/cobro-online/...           panel de la clínica (permiso cobro_online.manage)
   /api/cobro-online/aviso/pagopar  aviso de la pasarela (sin sesión: se valida la firma y se reconsulta el pedido) */
const express = require('express');
const s = require('./cobro-online.service');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
const router = express.Router();

router.post('/aviso/pagopar', (req, res, next) => {
  try { require('../web/web.service').limitar(req.ip || 'x', 'cobro-online-aviso', 120, 1); } catch (e) { return next(e); }
  return s.procesarAviso(req.body).then(() => res.json((req.body && req.body.resultado) || [])).catch(next);
});

router.use(authMiddleware, resolverClinicaMiddleware, requirePermiso('cobro_online.manage'));
router.get('/estado', h((req) => s.estado(req.clinicaId)));
router.put('/estado', h((req) => s.activar(req.clinicaId, (req.body || {}).activo, req.usuario)));
router.get('/', h((req) => s.listar(req.clinicaId)));
router.post('/:id/reconsultar', h((req) => s.reconsultar(req.clinicaId, req.params.id, req.usuario)));

module.exports = router;
