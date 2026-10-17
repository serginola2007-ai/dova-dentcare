/* Cabeceras de seguridad, CORS, compresión, lectura del cuerpo JSON y registro de pedidos.
   Se aplica a TODO el servidor antes de las rutas. */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const env = require('../config/env');

function aplicarSeguridad(app) {
  // Render (y cualquier hosting con proxy) pone la IP real en X-Forwarded-For:
  // sin esto todos los usuarios "tendrían" la IP del proxy y el freno de
  // intentos de login por IP bloquearía a toda la clínica junta.
  app.set('trust proxy', require('../config/seguridad').trustProxy);
  // IP del pedido disponible para la auditoría (utils/contexto.js).
  app.use(require('../utils/contexto').middleware);
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
  // El webhook de WhatsApp necesita el cuerpo exacto para verificar la firma de Meta.
  app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { if ((req.originalUrl || '').startsWith('/api/whatsapp/webhook')) req.cuerpoCrudo = buf; } }));
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
}

module.exports = { aplicarSeguridad };
