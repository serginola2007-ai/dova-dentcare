/* Límites de pedidos (fuerza bruta, enumeración y abuso automatizado).
   Cada límite cuenta pedidos por IP, por usuario o por los dos, dentro de una ventana de tiempo.
   Los números salen de config/seguridad.js (se ajustan por variables de entorno). */
function aplicarLimites(app) {
  const { limitar, porUsuario } = require('../middlewares/limite.middleware');
  const L = require('../config/seguridad').limites;
  const lim = (nombre, [max, ventanaSeg], extra = {}) => limitar({ nombre, max, ventanaSeg, ...extra });
  // Por usuario+IP (fuerza bruta sobre una cuenta) y por IP (relleno de credenciales);
  // una clínica entera detrás de la misma IP queda holgada.
  const limiteLoginUsuario = lim('login-usuario', L.loginUsuario, { compartido: true, clave: (req) => `${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 60)}` });
  app.use('/api/auth/login', limiteLoginUsuario);
  app.use('/api/auth/login', lim('login-ip', L.loginIp, { compartido: true }));
  app.use('/api/auth/refresh', lim('refresh', L.refresh, { compartido: true }));
  app.use('/api/auth/cambiar-clave', lim('clave', L.cambiarClave, { compartido: true }));
  // Desbloqueo de pantalla: pide la contraseña.
  // Por IP + sesión: varias personas de la clínica comparten la IP; los
  // intentos de contraseña igual cuentan para el bloqueo de cada usuario.
  app.use('/api/auth/desbloquear', lim('desbloqueo', [20, 600], { compartido: true, clave: (req) => `${req.ip}|${String((req.headers.cookie || '').match(/dova_rt=([^;]{0,16})/)?.[1] || '')}` }));
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

module.exports = { aplicarLimites };
