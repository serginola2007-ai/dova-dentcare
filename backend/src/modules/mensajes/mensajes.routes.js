/* Mensajes automáticos (turno liberado, controles, encuesta).
   /api/mensajes/...            panel de DOVA
   /api/web/publico/aviso/:token páginas del paciente (enlace privado del mensaje) */
const express = require('express');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const s = require('./mensajes.service');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

const interno = express.Router();
interno.use(authMiddleware, resolverClinicaMiddleware);
interno.get('/config', requirePermiso('clinica.config.manage', 'agenda.config'), h((req) => s.configuracion(req.clinicaId)));
interno.put('/config', requirePermiso('clinica.config.manage'), h((req) => s.guardarConfiguracion(req.clinicaId, req.body, req.usuario)));
interno.get('/ofertas', requirePermiso('lista_espera.manage', 'agenda.edit'), h((req) => s.listarOfertas(req.clinicaId)));
interno.post('/ofertas/:id/ofrecer/:pacienteId', requirePermiso('lista_espera.manage', 'agenda.edit'), h((req) => s.ofrecerManual(req.clinicaId, req.params.id, req.params.pacienteId, req.usuario)));
interno.post('/ofertas/:id/cancelar', requirePermiso('lista_espera.manage', 'agenda.edit'), h((req) => s.cancelarOferta(req.clinicaId, req.params.id, req.usuario)));
interno.post('/controles/:id/enlace', requirePermiso('recalls.manage', 'seguimiento.manage'), h((req) => s.controlManual(req.clinicaId, req.params.id, req.usuario)));

const publico = express.Router();
publico.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const limitar = (accion, max, min) => (req, res, next) => { try { require('../web/web.service').limitar(req.ip || 'x', accion, max, min); next(); } catch (e) { next(e); } };
publico.get('/:token', limitar('aviso', 60, 10), h((req) => s.infoEnlace(req.params.token)));
publico.post('/:token/tomar', limitar('aviso-tomar', 10, 30), async (req, res, next) => { try { res.status(201).json(await s.tomarOferta(req.params.token)); } catch (e) { next(e); } });
publico.post('/:token/reservar', limitar('aviso-reservar', 10, 30), async (req, res, next) => { try { res.status(201).json(await s.reservarControl(req.params.token, req.body || {})); } catch (e) { next(e); } });
publico.post('/:token/encuesta', limitar('aviso-encuesta', 10, 30), h((req) => s.responderEncuesta(req.params.token, req.body || {})));

module.exports = { interno, publico };
