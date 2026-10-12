const express = require('express');
const crypto = require('crypto');
const s = require('./recordatorios.service');
const whatsapp = require('../../utils/whatsapp');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req, res)); } catch (e) { next(e); } };

// ---- Pantalla (con sesión) ----
const interno = express.Router();
interno.use(authMiddleware, resolverClinicaMiddleware);
interno.get('/config', requirePermiso('agenda.view'), h((req) => s.configuracion(req.clinicaId)));
interno.put('/config', requirePermiso('agenda.config', 'clinica.config.manage'), h((req) => s.guardarConfiguracion(req.clinicaId, req.body || {}, req.usuario)));
interno.get('/turnos', requirePermiso('agenda.view'), h((req) => s.listar(req.clinicaId, req.query.fecha)));
interno.post('/turnos/:id/enviar', requirePermiso('agenda.edit', 'whatsapp.send'), h((req) => s.enviarAhora(req.clinicaId, req.params.id, req.usuario)));
interno.post('/turnos/:id/enlace', requirePermiso('agenda.edit', 'whatsapp.send'), h((req) => s.enlaceManual(req.clinicaId, req.params.id, req.usuario)));

// ---- Disparo programado (cron externo; el servidor gratuito de Render se duerme) ----
// POST /api/recordatorios/cron con la cabecera X-DOVA-CRON = CRON_SECRET.
const cron = express.Router();
cron.post('/', h(async (req) => {
  const secreto = process.env.CRON_SECRET || '';
  const dado = String(req.headers['x-dova-cron'] || '');
  const ok = secreto.length >= 16 && dado.length === secreto.length && crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(secreto));
  if (!ok) throw new ApiError(404, 'Recurso no encontrado');
  return s.ejecutarAutomaticos();
}));

// ---- Webhook de WhatsApp (Meta) ----
const webhook = express.Router();
// Verificación al configurarlo en Meta.
webhook.get('/', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && whatsapp.tokenVerificacionValido(req.query['hub.verify_token'])) {
    return res.type('text/plain').send(String(req.query['hub.challenge'] || '').slice(0, 200));
  }
  return res.status(403).json({ error: { message: 'Verificación inválida' } });
});
// Avisos firmados: entregado/leído y respuestas de los pacientes.
webhook.post('/', async (req, res, next) => {
  try {
    if (!whatsapp.firmaValida(req.cuerpoCrudo, req.headers['x-hub-signature-256'])) return res.status(401).json({ error: { message: 'Firma inválida' } });
    const r = await s.procesarWebhook(req.body);
    return res.json({ ok: true, ...r });
  } catch (e) { return next(e); }
});

module.exports = { interno, cron, webhook };
