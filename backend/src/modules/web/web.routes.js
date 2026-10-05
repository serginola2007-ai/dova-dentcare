/* Rutas de la página web.
   /api/web/publico/... : sin sesión (lo usa la página pública). Solo expone
   horarios libres y lo que la propia persona cargó.
   /api/web/...          : panel interno de DOVA (con sesión y permisos). */
const express = require('express');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const s = require('./web.service');

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req, res)); } catch (e) { next(e); } };
const ip = (req) => req.ip || 'x';

// ---------------- Público ----------------
const publico = express.Router();
publico.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
publico.get('/info', h(() => s.infoPublica()));
publico.get('/disponibilidad', h((req) => s.disponibilidad({ tratamientoId: req.query.tratamientoId, odontologoId: req.query.odontologoId, fecha: req.query.fecha })));
publico.post('/reservar', async (req, res, next) => { try { res.status(201).json(await s.reservar(req.body || {}, ip(req))); } catch (e) { next(e); } });
publico.get('/turno/:token', h((req) => s.turnoPublico(req.params.token)));
publico.post('/turno/:token/:accion', h((req) => s.accionTurno(req.params.token, req.params.accion, ip(req))));
publico.post('/registro', async (req, res, next) => { try { res.status(201).json(await s.registrar(req.body || {}, ip(req))); } catch (e) { next(e); } });
publico.post('/consulta', async (req, res, next) => { try { res.status(201).json(await s.consultar(req.body || {}, ip(req))); } catch (e) { next(e); } });
// Logo de la clínica para la página (el mismo de los comprobantes).
publico.get('/logo', async (req, res, next) => {
  try {
    const c = await s.clinicaPublica();
    const fac = require('../facturacion/facturacion.service');
    const l = await fac.obtenerLogo(c.id);
    if (!l) return res.status(404).end();
    res.type(l.logo_mime).set('Cache-Control', 'public, max-age=600').send(l.logo);
  } catch (e) { next(e); }
});

// ---------------- Panel interno ----------------
const interno = express.Router();
interno.use(authMiddleware, resolverClinicaMiddleware);
interno.get('/solicitudes', requirePermiso('web.ver', 'web.configurar'), h((req) => s.listarSolicitudes(req.clinicaId, req.query)));
interno.patch('/solicitudes/:id', requirePermiso('web.ver'), h((req) => s.resolverSolicitud(req.clinicaId, req.params.id, req.body || {}, req.usuario)));
interno.post('/solicitudes/:id/aplicar', requirePermiso('web.ver'), requirePermiso('pacientes.edit'), h((req) => s.aplicarAFicha(req.clinicaId, req.params.id, (req.body || {}).campos, req.usuario)));
interno.get('/config', requirePermiso('web.configurar', 'web.ver'), h((req) => s.obtenerConfig(req.clinicaId)));
interno.put('/config', requirePermiso('web.configurar'), h((req) => s.guardarConfig(req.clinicaId, req.body || {}, req.usuario)));

module.exports = { publico, interno };
