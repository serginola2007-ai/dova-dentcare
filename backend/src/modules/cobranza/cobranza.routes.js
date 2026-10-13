/* Avisos de cobro por WhatsApp.
   /api/cobranza/...            panel de DOVA (permiso cobranza.manage)
   /api/web/publico/pago/:token página "Mi pago" del paciente (enlace privado del aviso) */
const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const s = require('./cobranza.service');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

const interno = express.Router();
interno.use(authMiddleware, resolverClinicaMiddleware);
interno.get('/config', requirePermiso('cobranza.manage'), h((req) => s.configuracion(req.clinicaId)));
interno.put('/config', requirePermiso('clinica.config.manage'), h((req) => s.guardarConfiguracion(req.clinicaId, req.body, req.usuario)));
interno.get('/pendientes', requirePermiso('cobranza.manage'), h((req) => s.listar(req.clinicaId, { soloHoy: req.query.soloHoy === '1' })));
interno.post('/:tipo/:id/enviar', requirePermiso('cobranza.manage'), h((req) => s.enviarAhora(req.clinicaId, req.params.tipo, req.params.id, req.usuario)));
interno.post('/:tipo/:id/enlace', requirePermiso('cobranza.manage'), h((req) => s.enlaceManual(req.clinicaId, req.params.tipo, req.params.id, req.usuario)));

// ---- Público: enlace privado del aviso ----
const publico = express.Router();
publico.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const limitar = (accion, max, min) => (req, res, next) => { try { require('../web/web.service').limitar(req.ip || 'x', accion, max, min); next(); } catch (e) { next(e); } };
const subir = (req, res, next) => multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } }).single('comprobante')(req, res, (err) => {
  if (err) return next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El archivo no puede pesar más de 5 MB' : 'No se pudo leer el archivo'));
  return next();
});
publico.get('/:token', limitar('mi-pago', 60, 10), h((req) => s.miPago(req.params.token)));
publico.post('/:token/comprobante', limitar('mi-pago-enviar', 6, 30), subir, async (req, res, next) => {
  try { res.status(201).json(await s.informarPagoConEnlace(req.params.token, req.body || {}, req.file)); } catch (e) { next(e); }
});
publico.post('/:token/presupuesto/:id', limitar('mi-pago-responder', 10, 30), h((req) => s.responderPresupuesto(req.params.token, req.params.id, req.body || {})));

module.exports = { interno, publico };
