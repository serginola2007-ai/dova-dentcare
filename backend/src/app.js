const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const clinicaRoutes = require('./modules/clinica/clinica.routes');
const pacientesRoutes = require('./modules/pacientes/pacientes.routes');
const odontologosRoutes = require('./modules/odontologos/odontologos.routes');
const agendaRoutes = require('./modules/agenda/agenda.routes');
const tratamientosRoutes = require('./modules/tratamientos/tratamientos.routes');
const planesTratamientoRoutes = require('./modules/planes-tratamiento/planes.routes');
const historiaClinicaRoutes = require('./modules/historia-clinica/historia.routes');
const odontogramaRoutes = require('./modules/odontograma/odontograma.routes');
const presupuestosRoutes = require('./modules/presupuestos/presupuestos.routes');
const cajaRoutes = require('./modules/caja/caja.routes');
const planesPagoRoutes = require('./modules/planes-pago/planespago.routes');
const pagosRoutes = require('./modules/pagos/pagos.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');
const helpdeskRoutes = require('./modules/helpdesk/helpdesk.routes');
const notificacionesRoutes = require('./modules/notificaciones/notificaciones.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const extrasRoutes = require('./modules/clinico-extras/extras.routes');
const reportesRoutes = require('./modules/reportes/reportes.routes');
const comprobantesRoutes = require('./modules/comprobantes/comprobantes.routes');
const plantillasRoutes = require('./modules/plantillas-clinicas/plantillas.routes');
const controlesRoutes = require('./modules/controles-postoperatorios/controles.routes');
const derivacionesRoutes = require('./modules/derivaciones/derivaciones.routes');
const pendientesRoutes = require('./modules/pendientes/pendientes.routes');
const busquedaRoutes = require('./modules/busqueda/busqueda.routes');
// Seguimiento integral (migración 0020)
const saludRoutes = require('./modules/salud/salud.routes');
const recallsRoutes = require('./modules/recalls/recalls.routes');
const periodonciaRoutes = require('./modules/periodoncia/periodoncia.routes');
const especialidadesRoutes = require('./modules/especialidades/especialidades.routes');
const seguimientoRoutes = require('./modules/seguimiento/seguimiento.routes');
const operacionesRoutes = require('./modules/operaciones/operaciones.routes');
const finanzasExtRoutes = require('./modules/finanzas-ext/finanzas.routes');
const kpisRoutes = require('./modules/kpis/kpis.routes');
const facturacionRoutes = require('./modules/facturacion/facturacion.routes');
const webRoutes = require('./modules/web/web.routes');

const app = express();

// Render (y cualquier hosting con proxy) pone la IP real en X-Forwarded-For:
// sin esto todos los usuarios "tendrían" la IP del proxy y el freno de
// intentos de login por IP bloquearía a toda la clínica junta.
app.set('trust proxy', require('./config/seguridad').trustProxy);
// IP del pedido disponible para la auditoría (utils/contexto.js).
app.use(require('./utils/contexto').middleware);
// Cabeceras de seguridad. La política de contenido permite lo que usan las
// pantallas de DOVA cuando las sirve este mismo servidor (scripts propios,
// estilos en línea y las fuentes de Google).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Sin 'unsafe-inline': un texto malicioso guardado en la base nunca se
      // puede ejecutar como script (todos los scripts son archivos propios).
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      // Imprimir/ver PDF: el comprobante se carga como blob en un iframe oculto
      // o en una pestaña; el visor de PDF del navegador necesita estos permisos.
      frameSrc: ["'self'", 'blob:', 'https://www.google.com'], // + mapa de Google en la página web
      frameAncestors: ["'self'"],
      objectSrc: ["'self'", 'blob:'],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Sin forzar https: DOVA también puede usarse dentro de la red local
      // de la clínica (http://192.168…). En Render ya es https.
      upgradeInsecureRequests: null,
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // HSTS solo tiene efecto sobre https (Render); en la red local por http se ignora.
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
}));
// Funciones del navegador que DOVA no usa: deshabilitadas.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()');
  next();
});
// CORS: el propio sitio (pantallas servidas por este servidor) siempre puede
// usar la API; además, solo los orígenes listados en CORS_ORIGIN (ej. un
// frontend en Netlify). Sin CORS_ORIGIN, en producción NO se acepta ningún
// otro origen. DOVA no usa cookies, así que nunca se habilitan credenciales.
app.use(cors((req, cb) => {
  const origin = req.get('Origin');
  const propio = `${req.protocol}://${req.get('host')}`;
  const permitido = !origin || origin === propio || env.corsOrigin.includes('*') || env.corsOrigin.includes(origin);
  if (!permitido) return cb(new Error('Origen no permitido por CORS'));
  cb(null, { origin: origin && origin !== propio ? origin : false, credentials: false, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600 });
}));
// Los eventos en tiempo real (/api/eventos) no se comprimen: se tienen que enviar al instante.
app.use(compression({ filter: (req, res) => (req.path === '/api/eventos' ? false : compression.filter(req, res)) }));
app.use(express.json({ limit: '2mb' }));
if (env.nodeEnv !== 'test') {
  // Registro de pedidos SIN datos sensibles: nunca la consulta (?q=nombre del
  // paciente, filtros) ni los tokens de los enlaces de turnos.
  morgan.token('url-segura', (req) => {
    const [ruta, qs] = String(req.originalUrl || req.url || '').split('?');
    const limpia = ruta.replace(/(\/turno\/)[^/]+/g, '$1[token]').replace(/[A-Za-z0-9_-]{32,}/g, '[token]');
    return qs ? `${limpia}?[${qs.split('&').map((p) => p.split('=')[0]).filter(Boolean).slice(0, 10).join(',')}]` : limpia;
  });
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : ':remote-addr - [:date[clf]] ":method :url-segura HTTP/:http-version" :status :res[content-length] :response-time ms ":user-agent"'));
}

// Límites de pedidos (fuerza bruta, enumeración y abuso automatizado).
{
  const { limitar, porUsuario } = require('./middlewares/limite.middleware');
  const L = require('./config/seguridad').limites;
  const lim = (nombre, [max, ventanaSeg], extra = {}) => limitar({ nombre, max, ventanaSeg, ...extra });
  // Por usuario+IP (fuerza bruta sobre una cuenta) y por IP (relleno de credenciales);
  // una clínica entera detrás de la misma IP queda holgada.
  app.use('/api/auth/login', lim('login-usuario', L.loginUsuario, { compartido: true, clave: (req) => `${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 60)}` }));
  app.use('/api/auth/login', lim('login-ip', L.loginIp, { compartido: true }));
  app.use('/api/auth/refresh', lim('refresh', L.refresh, { compartido: true }));
  app.use('/api/auth/cambiar-clave', lim('clave', L.cambiarClave, { compartido: true }));
  app.use('/api/web/cuenta/ingresar', lim('portal-login', L.portalLogin, { compartido: true }));
  app.use('/api/web/publico', lim('web-publica', L.webPublica));
  app.use('/api/busqueda', lim('busqueda', L.busqueda, { clave: porUsuario }));
  // Exportaciones y subidas: costosas y sensibles.
  const limiteExport = lim('export', L.exportar, { clave: porUsuario });
  const limiteSubida = lim('subida', L.subida, { clave: porUsuario });
  app.use((req, res, next) => {
    const exportar = req.method === 'GET' && (/[?&]formato=(pdf|xlsx|csv)/.test(req.originalUrl) || req.originalUrl.startsWith('/api/comprobantes/'));
    const subir = req.method === 'POST' && /multipart\/form-data/.test(req.headers['content-type'] || '');
    if (exportar) return limiteExport(req, res, next);
    if (subir) return limiteSubida(req, res, next);
    return next();
  });
  // Tope general de la API por IP (una clínica entera detrás de una IP queda muy por debajo).
  app.use('/api', lim('api', L.api));
}

app.get('/api/health', (req, res) => res.json({ ok: true, producto: 'DOVA', version: '0.1.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/clinica', clinicaRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/odontologos', odontologosRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/tratamientos', tratamientosRoutes);
app.use('/api/planes-tratamiento', planesTratamientoRoutes);
app.use('/api/historia-clinica', historiaClinicaRoutes);
app.use('/api/odontograma', odontogramaRoutes);
app.use('/api/presupuestos', presupuestosRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/planes-pago', planesPagoRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/helpdesk', helpdeskRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
{
  const tiempoReal = require('./utils/tiempoReal');
  const { authMiddleware } = require('./middlewares/auth.middleware');
  const { resolverClinicaMiddleware } = require('./middlewares/clinica.middleware');
  app.get('/api/eventos', authMiddleware, resolverClinicaMiddleware, tiempoReal.suscribir);
}
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/clinico', extrasRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/comprobantes', comprobantesRoutes);
app.use('/api/plantillas-clinicas', plantillasRoutes);
app.use('/api/controles-postoperatorios', controlesRoutes);
app.use('/api/derivaciones', derivacionesRoutes);
app.use('/api/pendientes', pendientesRoutes);
app.use('/api/busqueda', busquedaRoutes);
app.use('/api/salud', saludRoutes);
app.use('/api/recalls', recallsRoutes);
app.use('/api/periodoncia', periodonciaRoutes);
app.use('/api/especialidades', especialidadesRoutes);
app.use('/api/seguimiento', seguimientoRoutes);
app.use('/api/operaciones', operacionesRoutes);
app.use('/api/finanzas', finanzasExtRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api/facturacion', facturacionRoutes);
// Página web pública (sin sesión) y su panel en DOVA.
app.use('/api/web/publico', webRoutes.publico);
app.use('/api/web/cuenta', webRoutes.cuenta);
app.use('/api/web', webRoutes.interno);

/* Pantallas de DOVA servidas por este mismo servidor (un solo servicio en
   Render, una sola dirección, sin CORS). Si la carpeta frontend/ no está
   (por ejemplo si el frontend se publica aparte en Netlify), se omite. */
const path = require('path');
const fs = require('fs');
const carpetaFrontend = process.env.FRONTEND_DIR || path.join(__dirname, '..', '..', 'frontend');
if (fs.existsSync(path.join(carpetaFrontend, 'moderno', 'index.html'))) {
  // Mismo origen: la API está en /api del propio servidor.
  app.get('/shared/config.js', (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send('window.DOVA_API_BASE = "/api";\n');
  });
  // Página web de la clínica: /web/ (con WEB_EN_INICIO=true también es la página de inicio).
  app.get('/', (req, res) => res.redirect(302, process.env.WEB_EN_INICIO === 'true' ? '/web/' : '/moderno/'));
  app.get(/^\/web$/, (req, res) => res.redirect(301, '/web/'));
  app.get(/^\/(moderno|minimalista|tecnico)$/, (req, res) => res.redirect(301, `${req.path}/`));
  app.use(express.static(carpetaFrontend, {
    index: 'index.html',
    setHeaders: (res, archivo) => {
      // El HTML se revalida siempre (así una actualización llega enseguida);
      // el resto se cachea poco para no servir versiones viejas.
      // El service worker y el manifiesto de la app se revalidan siempre.
      const siempreFresco = archivo.endsWith('.html') || archivo.endsWith('sw.js') || archivo.endsWith('.webmanifest');
      res.setHeader('Cache-Control', siempreFresco ? 'no-cache' : 'public, max-age=300');
      if (archivo.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    },
  }));
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
