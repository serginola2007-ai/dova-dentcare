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

const app = express();

// Render (y cualquier hosting con proxy) pone la IP real en X-Forwarded-For:
// sin esto todos los usuarios "tendrían" la IP del proxy y el freno de
// intentos de login por IP bloquearía a toda la clínica junta.
app.set('trust proxy', 1);
// Cabeceras de seguridad. La política de contenido permite lo que usan las
// pantallas de DOVA cuando las sirve este mismo servidor (scripts propios,
// estilos en línea y las fuentes de Google).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Sin forzar https: DOVA también puede usarse dentro de la red local
      // de la clínica (http://192.168…). En Render ya es https.
      upgradeInsecureRequests: null,
    },
  },
}));
// CORS: el propio sitio (pantallas servidas por este servidor) siempre puede
// usar la API; además, los orígenes de CORS_ORIGIN (ej. un frontend en
// Netlify). Sin CORS_ORIGIN se permite cualquiera (la API usa tokens, no
// cookies, así que otro sitio no puede actuar en nombre del usuario).
app.use(cors((req, cb) => {
  const origin = req.get('Origin');
  const propio = `${req.protocol}://${req.get('host')}`;
  const permitido = !origin || origin === propio || env.corsOrigin.includes('*') || env.corsOrigin.includes(origin);
  if (!permitido) return cb(new Error('Origen no permitido por CORS'));
  cb(null, { origin: !!origin, credentials: true });
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
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
  app.get('/', (req, res) => res.redirect(302, '/moderno/'));
  app.get(/^\/(moderno|minimalista|tecnico)$/, (req, res) => res.redirect(301, `${req.path}/`));
  app.use(express.static(carpetaFrontend, {
    index: 'index.html',
    setHeaders: (res, archivo) => {
      // El HTML se revalida siempre (así una actualización llega enseguida);
      // el resto se cachea poco para no servir versiones viejas.
      res.setHeader('Cache-Control', archivo.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
    },
  }));
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
