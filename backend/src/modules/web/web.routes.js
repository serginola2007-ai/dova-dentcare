/* Rutas de la página web.
   /api/web/publico/... : sin sesión (lo usa la página pública). Solo expone
   horarios libres y lo que la propia persona cargó.
   /api/web/...          : panel interno de DOVA (con sesión y permisos). */
const express = require('express');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const multer = require('multer');
const s = require('./web.service');
const portal = require('./portal.service');
const { ApiError } = require('../../middlewares/error.middleware');

// Archivos (comprobantes y QR): en memoria, máximo 5 MB, un solo archivo.
const subir = (campo) => (req, res, next) => multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single(campo)(req, res, (err) => {
  if (err) return next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El archivo no puede pesar más de 5 MB' : 'No se pudo leer el archivo'));
  next();
});

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

publico.get('/qr', async (req, res, next) => {
  try {
    const c = await s.clinicaPublica();
    const q = await s.obtenerQr(c.id);
    if (!q) return res.status(404).end();
    res.type(q.qr_mime).set('Cache-Control', 'no-cache').send(q.qr);
  } catch (e) { next(e); }
});

// ---------------- Portal del paciente (cuenta en la web) ----------------
const cuenta = express.Router();
cuenta.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
cuenta.post('/registro', h((req) => portal.registrarse(req.body || {}, ip(req))));
cuenta.post('/activar', h((req) => portal.activar(req.body || {}, ip(req))));
cuenta.post('/ingresar', h((req) => portal.ingresar(req.body || {}, ip(req))));
cuenta.use(portal.autenticar);
cuenta.get('/yo', h((req) => portal.yo(req.portal)));
cuenta.post('/clave', h((req) => portal.cambiarClave(req.portal, req.body || {})));
cuenta.get('/turnos', h((req) => portal.turnos(req.portal)));
cuenta.post('/turnos/:id/:accion', h((req) => portal.accionTurno(req.portal, req.params.id, req.params.accion)));
cuenta.post('/reservar', async (req, res, next) => { try { res.status(201).json(await portal.reservar(req.portal, req.body || {})); } catch (e) { next(e); } });
cuenta.get('/estado', h((req) => portal.cuenta(req.portal)));
cuenta.get('/recibos/:id', async (req, res, next) => { try { await portal.reciboPdf(req.portal, req.params.id, res); } catch (e) { next(e); } });
cuenta.get('/facturas/:id', async (req, res, next) => { try { await portal.facturaPdf(req.portal, req.params.id, res); } catch (e) { next(e); } });
cuenta.post('/pagos', subir('comprobante'), async (req, res, next) => { try { res.status(201).json(await portal.informarPago(req.portal, req.body || {}, req.file)); } catch (e) { next(e); } });

// ---------------- Panel interno ----------------
const interno = express.Router();
interno.use(authMiddleware, resolverClinicaMiddleware);
interno.get('/solicitudes', requirePermiso('web.ver', 'web.configurar'), h((req) => s.listarSolicitudes(req.clinicaId, req.query)));
interno.patch('/solicitudes/:id', requirePermiso('web.ver'), h((req) => s.resolverSolicitud(req.clinicaId, req.params.id, req.body || {}, req.usuario)));
interno.post('/solicitudes/:id/aplicar', requirePermiso('web.ver'), requirePermiso('pacientes.edit'), h((req) => s.aplicarAFicha(req.clinicaId, req.params.id, (req.body || {}).campos, req.usuario)));
interno.get('/config', requirePermiso('web.configurar', 'web.ver'), h((req) => s.obtenerConfig(req.clinicaId)));
interno.post('/config/qr', requirePermiso('web.configurar'), subir('qr'), h((req) => s.guardarQr(req.clinicaId, req.file, req.usuario)));
interno.post('/correo/prueba', requirePermiso('web.configurar'), h(async (req) => {
  const correo = require('../../utils/correo');
  const para = String((req.body || {}).email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw new ApiError(400, 'Escribí un email válido');
  if (!correo.configurado()) throw new ApiError(409, 'El envío de emails no está configurado en el servidor (faltan los datos SMTP).');
  try { await correo.enviar({ para, asunto: 'Prueba de email de la página web', texto: 'Si recibiste esto, el envío de emails funciona.', htmlCuerpo: correo.html('Funciona', ['<p>Si recibiste esto, el envío de emails de la página web funciona.</p>']) }); }
  catch (e) { throw new ApiError(502, `No se pudo enviar: ${e.message}`); }
  return { ok: true };
}));
// Pagos informados desde la web (comprobantes)
interno.get('/pagos', requirePermiso('web.ver'), h((req) => portal.listarPagos(req.clinicaId, req.query)));
interno.get('/pagos/:id/comprobante', requirePermiso('web.ver'), async (req, res, next) => {
  try { const c = await portal.comprobante(req.clinicaId, req.params.id); res.type(c.comprobante_mime).set('Cache-Control', 'private, no-store').set('Content-Disposition', 'inline').send(c.comprobante); } catch (e) { next(e); }
});
interno.post('/pagos/:id/aprobar', requirePermiso('web.ver'), requirePermiso('pagos.create'), h((req) => portal.aprobarPago(req.clinicaId, req.params.id, req.body || {}, req.usuario)));
interno.post('/pagos/:id/rechazar', requirePermiso('web.ver'), h((req) => portal.rechazarPago(req.clinicaId, req.params.id, req.body || {}, req.usuario)));
interno.get('/accesos', requirePermiso('web.ver'), h((req) => portal.listarAccesos(req.clinicaId, req.query)));
interno.post('/pacientes/:id/codigo', requirePermiso('web.ver'), h((req) => portal.generarCodigo(req.clinicaId, req.params.id, req.usuario)));
interno.post('/pacientes/:id/desactivar-cuenta', requirePermiso('web.ver'), h((req) => portal.desactivarCuenta(req.clinicaId, req.params.id, req.usuario)));
interno.post('/pacientes/:id/verificar', requirePermiso('pacientes.edit'), h((req) => portal.verificarPaciente(req.clinicaId, req.params.id, req.usuario)));
interno.put('/config', requirePermiso('web.configurar'), h((req) => s.guardarConfig(req.clinicaId, req.body || {}, req.usuario)));

module.exports = { publico, interno, cuenta };
