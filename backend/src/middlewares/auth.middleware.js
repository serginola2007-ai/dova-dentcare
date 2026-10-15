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
  const cl = u && u.activo ? await authRepo.getClinicaDeUsuario(u.id) : null;
  // Servicio de la clínica suspendido (por ejemplo, mensualidad sin pagar): nadie entra, los datos se conservan.
  if (cl && cl.activa === false && !cl.proveedor) {
    const v = { activo: false, suspendida: true, motivo: cl.suspendida_motivo || null };
    cache.set(id, { t: ahora, v });
    return v;
  }
  const v = u && u.activo
    ? { activo: true, permisos: await authRepo.getPermisosEfectivos(u.id, u.rol_id), tokenVersion: Number(u.token_version) || 0, debeCambiarClave: !!u.debe_cambiar_clave, clinicaId: u.clinica_id, odontologoId: u.odontologo_id || null }
    : { activo: false };
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
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch (_err) {
    return next(new ApiError(401, 'Token inválido o expirado'));
  }
  try {
    const est = await estadoUsuario(Number(payload.sub));
    if (est.suspendida) return next(new ApiError(403, 'El servicio de tu clínica está suspendido. Comunicate con el proveedor de DOVA.', { codigo: 'CLINICA_SUSPENDIDA' }));
    if (!est.activo) return next(new ApiError(401, 'Tu usuario fue desactivado. Consultá con el administrador.'));
    // Contraseña cambiada, rol cambiado o sesiones cerradas: los tokens anteriores ya no valen.
    if ((Number(payload.tv) || 0) !== est.tokenVersion || Number(payload.clinicaId) !== Number(est.clinicaId)) return next(new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.'));
    const sesiones = require('../utils/sesiones');
    if (await sesiones.jtiRevocado(payload.jti)) return next(new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.'));
    // Sesión cerrada desde otro dispositivo o pantalla bloqueada: el token deja de valer al instante.
    if (payload.sid) {
      const es = await sesiones.estadoSesion(payload.sid);
      if (!es || !es.existe || es.cerrada || Number(es.usuarioId) !== Number(payload.sub)) return next(new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.'));
      if (es.bloqueada) return next(new ApiError(423, 'La pantalla está bloqueada. Ingresá tu contraseña para seguir.', { codigo: 'SESION_BLOQUEADA' }));
    }
    const ruta = (req.originalUrl || '').split('?')[0];
    // Con la contraseña inicial pendiente de cambio, la API no se puede usar
    // (antes solo lo exigía la pantalla y la API respondía igual).
    if (est.debeCambiarClave && !(req.method === 'POST' && ruta === '/api/auth/cambiar-clave')) {
      return next(new ApiError(403, 'Tenés que cambiar la contraseña inicial antes de seguir.', { codigo: 'DEBE_CAMBIAR_CLAVE' }));
    }
    req.usuario = {
      id: payload.sub,
      clinicaId: payload.clinicaId,
      rolCodigo: payload.rolCodigo,
      nombre: payload.nombre,
      // Vínculo con el odontólogo: siempre el de la base (cambiarlo en Usuarios rige al instante).
      odontologoId: est.odontologoId || null,
      permisos: est.permisos,
    };
    req.tokenExp = payload.exp;
    req.tokenJti = payload.jti || null;
    req.sesionId = payload.sid || null;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authMiddleware, olvidarUsuario };
