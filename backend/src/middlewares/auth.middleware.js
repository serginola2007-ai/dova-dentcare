const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('./error.middleware');

/* Además de validar el token, se verifica contra la base que el usuario
   siga ACTIVO y se toman sus permisos ACTUALES. Antes, un usuario dado de
   baja seguía operando hasta 15 min con su token, y un cambio de permisos
   recién se aplicaba en el próximo login. Para no consultar la base en cada
   pedido, el resultado se guarda 15 segundos. */
const CACHE_MS = 15000;
const cache = new Map();

async function estadoUsuario(id, rolIdDesconocido) {
  const ahora = Date.now();
  const c = cache.get(id);
  if (c && ahora - c.t < CACHE_MS) return c.v;
  const authRepo = require('../modules/auth/auth.repository');
  const u = await authRepo.findUsuarioById(id);
  const v = u && u.activo ? { activo: true, permisos: await authRepo.getPermisosEfectivos(u.id, u.rol_id) } : { activo: false };
  cache.set(id, { t: ahora, v });
  if (cache.size > 5000) cache.clear();
  void rolIdDesconocido;
  return v;
}

// Para que un cambio de usuario (baja, permisos) se note al instante en este servidor.
function olvidarUsuario(id) { if (id === undefined) cache.clear(); else cache.delete(Number(id)); }

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Token de autenticación faltante'));
  }
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return next(new ApiError(401, 'Token inválido o expirado'));
  }
  try {
    const est = await estadoUsuario(Number(payload.sub));
    if (!est.activo) return next(new ApiError(401, 'Tu usuario fue desactivado. Consultá con el administrador.'));
    req.usuario = {
      id: payload.sub,
      clinicaId: payload.clinicaId,
      rolCodigo: payload.rolCodigo,
      nombre: payload.nombre,
      odontologoId: payload.odontologoId || null,
      permisos: est.permisos,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authMiddleware, olvidarUsuario };
