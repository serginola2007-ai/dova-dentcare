const express = require('express');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const svc = require('./push.service');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
router.get('/', wrap(async (req, res) => res.json(await svc.estado(req.clinicaId, req.usuario.id, req.query.endpoint))));
router.post('/suscripcion', wrap(async (req, res) => {
  await svc.guardar(req.clinicaId, req.usuario.id, req.body && req.body.suscripcion, req.get('user-agent'));
  res.status(201).json({ ok: true });
}));
router.post('/baja', wrap(async (req, res) => { await svc.quitar(req.clinicaId, req.usuario.id, req.body && req.body.endpoint); res.json({ ok: true }); }));
router.post('/prueba', wrap(async (req, res) => {
  const r = await svc.enviar(req.clinicaId, req.usuario.id, { titulo: 'Los avisos funcionan', tipo: 'prueba' });
  res.json(r);
}));
module.exports = router;
