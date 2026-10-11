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

const ctx = (req) => ({ ip: req.ip, agente: String(req.headers['user-agent'] || '').slice(0, 300) });

async function login(req, res, next) {
  try {
    const { username, password, clinicaSlug } = req.body || {};
    const resultado = await authService.login({ username, password, clinicaSlug, ...ctx(req) });
    ponerCookie(req, res, resultado);
    res.json(sinSecretos(resultado));
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const t = tokenRenovacion(req);
    const resultado = await authService.refresh(t.token, { deCuerpo: t.deCuerpo, ...ctx(req) });
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
    const r = await authService.cambiarClavePropia(req.usuario.id, req.body || {}, ctx(req));
    ponerCookie(req, res, r);
    res.json(sinSecretos(r));
  } catch (err) { next(err); }
}

const h = (fn) => async (req, res, next) => { try { res.json(await fn(req, res)); } catch (err) { next(err); } };

// Sesiones abiertas de la propia cuenta.
const sesiones = h((req) => authService.listarSesiones(req.usuario, req.sesionId));
const cerrarSesion = h(async (req, res) => {
  const r = await authService.cerrarSesionPropia(req.usuario, req.params.id);
  if (req.params.id === req.sesionId) cookies.borrar(req, res, COOKIE);
  return { ...r, actual: req.params.id === req.sesionId };
});
// Bloqueo de pantalla por inactividad.
const politica = h((req) => authService.politica(req.usuario.clinicaId));
const bloquear = h((req) => authService.bloquear(req.usuario, req.sesionId));
async function desbloquear(req, res, next) {
  try {
    const deCookie = cookies.leer(req, COOKIE.nombre);
    cookies.exigirAntiCsrf(req);
    const r = await authService.desbloquear(deCookie, { clave: (req.body || {}).clave, ...ctx(req) });
    ponerCookie(req, res, r);
    res.json(sinSecretos(r));
  } catch (err) {
    if (err.status === 401) cookies.borrar(req, res, COOKIE);
    next(err);
  }
}

module.exports = { login, refresh, logout, logoutTodas, cambiarClave, sesiones, cerrarSesion, politica, bloquear, desbloquear };
