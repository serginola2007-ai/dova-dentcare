/* Configuración de seguridad centralizada (todo por variables de entorno). */
const num = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
const prod = (process.env.NODE_ENV || 'development') === 'production';

module.exports = {
  prod,
  sesion: {
    // Duración del token de acceso (se guarda solo en memoria del navegador).
    accesoExpira: process.env.JWT_EXPIRES_IN || '15m',
    // Sin usar la sesión durante estos días, hay que volver a ingresar.
    inactividadDias: num(process.env.SESSION_IDLE_TIMEOUT_DAYS, 7, 1, 90),
    // Ninguna sesión dura más que esto desde el login, aunque se use todos los días.
    absolutoDias: num(process.env.SESSION_ABSOLUTE_MAX_DAYS, 30, 1, 365),
    // Margen para que dos pestañas que renuevan a la vez no se echen entre sí.
    graciaRotacionSeg: num(process.env.SESSION_ROTATION_GRACE_SECONDS, 60, 5, 300),
  },
  cookies: {
    personal: { nombre: 'dova_rt', ruta: '/api/auth' },
    portal: { nombre: 'dova_portal', ruta: '/api/web/cuenta' },
    // Secure se decide por pedido (https detrás del proxy de Render); con
    // COOKIES_SIEMPRE_SECURE=true se exige siempre.
    siempreSecure: process.env.COOKIES_SIEMPRE_SECURE === 'true',
    sameSite: 'strict',
  },
  // Cabecera anti-CSRF que exigen los endpoints que usan cookies.
  csrfCabecera: 'x-dova-csrf',
  limites: {
    // Dónde se cuentan los pedidos de los límites "compartidos" (login, renovación,
    // contraseña, portal): memoria (un solo servidor, el caso de Render) o postgres
    // (varias instancias, sin infraestructura extra). La interfaz del almacén
    // (middlewares/limite.middleware.js) admite agregar Redis sin tocar las rutas.
    almacen: ['memoria', 'postgres'].includes(process.env.RATE_LIMIT_STORE) ? process.env.RATE_LIMIT_STORE : 'memoria',
    almacenPedido: process.env.RATE_LIMIT_STORE || 'memoria',
    // [máximo, ventana en segundos]
    loginUsuario: [num(process.env.LOGIN_LIMITE_USUARIO_POR_MINUTO, 10, 1, 1000), 60],
    loginIp: [num(process.env.LOGIN_LIMITE_IP_POR_MINUTO, 60, 1, 10000), 60],
    refresh: [num(process.env.REFRESH_LIMITE_POR_MINUTO, 60, 1, 10000), 60],
    cambiarClave: [10, 600],
    portalLogin: [num(process.env.PORTAL_LOGIN_LIMITE_POR_MINUTO, 20, 1, 10000), 60],
    webPublica: [num(process.env.WEB_LIMITE_POR_MINUTO, 120, 1, 100000), 60],
    busqueda: [120, 60],
    exportar: [num(process.env.EXPORT_LIMITE_POR_MINUTO, 60, 1, 10000), 60],
    subida: [40, 60],
    api: [num(process.env.API_LIMITE_POR_MINUTO, 1500, 10, 1000000), 60],
  },
  sse: {
    maxPorUsuario: num(process.env.SSE_MAX_POR_USUARIO, 8, 1, 100),
    maxTotal: num(process.env.SSE_MAX_TOTAL, 2000, 10, 100000),
  },
  // Saltos de proxy confiables para tomar la IP real (Render = 1).
  trustProxy: num(process.env.TRUST_PROXY_SALTOS, 1, 0, 5),
};
