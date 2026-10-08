const authService = require('./auth.service');
const cookies = require('../../utils/cookies');
const seg = require('../../config/seguridad');

/* El refresh token viaja SOLO en una cookie HttpOnly (SameSite=Strict, ruta
   /api/auth, Secure en https): el JavaScript de la página no lo puede leer.
   El token de acceso va en la respuesta y la pantalla lo guarda en memoria. */
const COOKIE = seg.cookies.personal;
function ponerCookie(req, res, r) {
  if (!r || !r.refreshToken) return;
  // Cookie de sesión del navegador (se borra al cerrarlo). El servidor igual
  // controla la inactividad y el máximo absoluto de la sesión.
  cookies.poner(req, res, COOKIE, r.refreshToken, null);
}
const sinSecretos = (r) => { const { refreshToken, refreshVence, ...resto } = r; void refreshToken; void refreshVence; return resto; };

// Token de renovación: cookie (con control anti-CSRF). Se acepta una única vez
// en el cuerpo para migrar las sesiones guardadas por versiones anteriores.
function tokenRenovacion(req) {
  const deCookie = cookies.leer(req, COOKIE.nombre);
  if (deCookie) { cookies.exigirAntiCsrf(req); return { token: deCookie, deCuerpo: false }; }
  return { token: req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null, deCuerpo: true };
}

async function login(req, res, next) {
  try {
    const { username, password, clinicaSlug } = req.body || {};
    const resultado = await authService.login({ username, password, clinicaSlug, ip: req.ip });
    ponerCookie(req, res, resultado);
    res.json(sinSecretos(resultado));
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const t = tokenRenovacion(req);
    const resultado = await authService.refresh(t.token, { deCuerpo: t.deCuerpo });
    ponerCookie(req, res, resultado);
    res.json(sinSecretos(resultado));
  } catch (err) {
    if (err.status === 401) cookies.borrar(req, res, COOKIE);
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    let token = null;
    try { token = tokenRenovacion(req).token; } catch (_e) { token = null; }
    await authService.logout(token, req.headers.authorization);
    cookies.borrar(req, res, COOKIE);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function logoutTodas(req, res, next) {
  try {
    await authService.logoutTodas(req.usuario);
    cookies.borrar(req, res, COOKIE);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function cambiarClave(req, res, next) {
  try {
    const r = await authService.cambiarClavePropia(req.usuario.id, req.body || {});
    ponerCookie(req, res, r);
    res.json(sinSecretos(r));
  } catch (err) { next(err); }
}

module.exports = { login, refresh, logout, logoutTodas, cambiarClave };
