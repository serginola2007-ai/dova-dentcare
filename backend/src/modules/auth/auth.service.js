const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const { ApiError } = require('../../middlewares/error.middleware');
const authRepo = require('./auth.repository');
const clinicaRepo = require('../clinica/clinica.repository');
const auditoria = require('../../utils/auditoria');
const sesiones = require('../../utils/sesiones');
// Para que el tiempo de respuesta no revele si un usuario existe.
const HASH_FALSO = bcrypt.hashSync('usuario-inexistente-dova', 10);
const segCfg = require('../../config/seguridad');
const DIA_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Token de acceso: identifica la sesión (jti) y la versión de credenciales
// del usuario (tv). Si la versión cambia (nueva contraseña, baja, cambio de
// rol), todos los tokens anteriores dejan de valer al instante.
function firmarAcceso(usuario, permisos) {
  return jwt.sign({
    sub: usuario.id,
    clinicaId: usuario.clinica_id,
    rolCodigo: usuario.rol_codigo,
    nombre: usuario.nombre,
    odontologoId: usuario.odontologo_id || null,
    tv: Number(usuario.token_version) || 0,
    permisos,
  }, env.jwtSecret, { expiresIn: segCfg.sesion.accesoExpira, algorithm: 'HS256', jwtid: crypto.randomBytes(12).toString('hex') });
}
function construirTokens(usuario, permisos) {
  return { accessToken: firmarAcceso(usuario, permisos), refreshTokenRaw: crypto.randomBytes(48).toString('hex') };
}
/* Una sesión = un login. El refresh token vence por inactividad
   (SESSION_IDLE_TIMEOUT_DAYS sin usarse) y nunca después del máximo absoluto
   desde el login (SESSION_ABSOLUTE_MAX_DAYS), aunque se renueve a diario. */
async function emitirSesion(usuario, { sesionId, sesionInicio } = {}) {
  const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
  const { accessToken, refreshTokenRaw } = construirTokens(usuario, permisos);
  const inicio = sesionInicio ? new Date(sesionInicio) : new Date();
  const vence = new Date(Math.min(Date.now() + segCfg.sesion.inactividadDias * DIA_MS, inicio.getTime() + segCfg.sesion.absolutoDias * DIA_MS));
  await authRepo.guardarRefreshToken(usuario.id, hashToken(refreshTokenRaw), vence, sesionId || crypto.randomBytes(12).toString('hex'), inicio);
  return { accessToken, refreshToken: refreshTokenRaw, permisos, refreshVence: vence };
}

/* clinicaSlug es opcional: por ahora DOVA tiene una sola clínica real
   (DentCareRC) y el frontend no manda ese dato, así que se usa como
   default. Cuando exista selección de clínica en el login (multi-tenant
   real), el frontend empezará a mandarlo y este default deja de usarse. */
const MAX_FALLIDOS_USUARIO = 5;
const MAX_FALLIDOS_IP = 30;

async function login({ username, password, clinicaSlug = 'dentcarerc', ip }) {
  if (!username || !password) {
    throw new ApiError(400, 'Usuario y contraseña son obligatorios');
  }
  // Freno a la fuerza bruta: 5 intentos fallidos seguidos de un usuario (o
  // 30 desde una misma IP) bloquean el ingreso 15 minutos.
  const clave = String(username).trim().toLowerCase().slice(0, 200);
  const est = await authRepo.estadoIntentosLogin(clave, ip);
  const clinicaLog = async () => { try { return (await clinicaRepo.findBySlug(clinicaSlug)) || {}; } catch (_e) { return {}; } };
  if (est.fallidos_usuario >= MAX_FALLIDOS_USUARIO || est.fallidos_ip >= MAX_FALLIDOS_IP) {
    const c = await clinicaLog();
    if (c.id) await auditoria.registrar({ clinicaId: c.id, accion: 'login_bloqueado', modulo: 'seguridad', resultado: 'denegado', ip, detalle: { usuario: clave } });
    const desde = est.ultimo_fallido ? new Date(est.ultimo_fallido).getTime() : Date.now();
    const min = Math.max(1, Math.ceil((desde + est.ventanaMin * 60000 - Date.now()) / 60000));
    throw new ApiError(429, `Demasiados intentos fallidos. Por seguridad, esperá ${min} minuto${min === 1 ? '' : 's'} y volvé a intentar.`);
  }
  try {
    const r = await loginVerificado({ username, password, clinicaSlug });
    await authRepo.registrarIntentoLogin(clave, ip, true);
    await auditoria.registrar({ clinicaId: r.clinica.id, usuarioId: r.usuario.id, usuarioNombre: r.usuario.nombre, accion: 'login', modulo: 'seguridad', ip });
    return r;
  } catch (e) {
    if (e.status === 401) {
      await authRepo.registrarIntentoLogin(clave, ip, false);
      const c = await clinicaLog();
      if (c.id) await auditoria.registrar({ clinicaId: c.id, accion: 'login_fallido', modulo: 'seguridad', resultado: 'fallido', ip, detalle: { usuario: clave } });
      const restantes = MAX_FALLIDOS_USUARIO - (est.fallidos_usuario + 1);
      if (restantes > 0 && restantes <= 2) e.message += `. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'} antes de un bloqueo de 15 minutos.`;
    }
    throw e;
  }
}

async function loginVerificado({ username, password, clinicaSlug }) {

  const clinica = await clinicaRepo.findBySlug(clinicaSlug);
  if (!clinica) {
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }

  const usuario = await authRepo.findUsuarioByUsername(clinica.id, String(username).trim().slice(0, 100));
  if (!usuario || !usuario.activo) {
    await bcrypt.compare(String(password), HASH_FALSO);
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }

  const passwordOk = await bcrypt.compare(String(password).slice(0, 200), usuario.password_hash);
  if (!passwordOk) {
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }

  const { accessToken, refreshToken: refreshTokenRaw, permisos, refreshVence } = await emitirSesion(usuario);
  await authRepo.actualizarUltimoLogin(usuario.id);

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    refreshVence,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.rol_codigo,
      rolNombre: usuario.rol_nombre,
      odontologoId: usuario.odontologo_id,
      permisos,
      disenoPreferido: usuario.diseno_preferido || null,
      debeCambiarClave: !!usuario.debe_cambiar_clave,
    },
    clinica: {
      id: clinica.id,
      nombre: clinica.nombre,
      slug: clinica.slug,
      logoUrl: clinica.logo_url,
      faviconUrl: clinica.favicon_url,
      colorPrimario: clinica.color_primario,
      colorSecundario: clinica.color_secundario,
    },
  };
}

/* Refresh con ROTACIÓN: cada uso entrega un refresh token nuevo y revoca el
   anterior. Si un token ya rotado se vuelve a usar pasado el margen de 60 s
   (pensado para dos pestañas que renuevan a la vez), se asume robo: se
   cierran todas las sesiones del usuario y queda en la auditoría. */
async function refresh(refreshTokenRaw, { deCuerpo = false } = {}) {
  if (!refreshTokenRaw || typeof refreshTokenRaw !== 'string' || refreshTokenRaw.length > 200) throw new ApiError(400, 'refreshToken requerido');
  const tokenHash = hashToken(refreshTokenRaw);
  const registro = await authRepo.findRefreshTokenCualquiera(tokenHash);
  if (!registro) throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');
  // En el cuerpo del pedido solo se aceptan tokens de versiones anteriores
  // (sin sesion_id), para migrarlos a cookie. Los nuevos viven solo en la cookie.
  if (deCuerpo && registro.sesion_id) throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');
  const usuario = await authRepo.findUsuarioById(registro.usuario_id);
  if (!usuario || !usuario.activo) throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');
  // Tope absoluto desde el login, aunque la sesión se haya usado todos los días.
  if (new Date(registro.sesion_inicio).getTime() + segCfg.sesion.absolutoDias * DIA_MS < Date.now()) {
    await authRepo.revocarRefreshToken(tokenHash, 'vencida');
    throw new ApiError(401, 'La sesión venció. Iniciá sesión nuevamente.');
  }
  if (registro.revocado) {
    if (registro.motivo === 'rotado' && registro.en_gracia) {
      // Otra pestaña acaba de renovar: se entrega solo un acceso nuevo.
      const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
      return { accessToken: firmarAcceso(usuario, permisos), permisos, odontologoId: usuario.odontologo_id || null };
    }
    if (registro.motivo === 'rotado') {
      await sesiones.invalidarSesiones(usuario.id, 'reutilizacion');
      await auditoria.registrar({ clinicaId: usuario.clinica_id, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'refresh_reutilizado', modulo: 'seguridad', resultado: 'denegado', detalle: { tokenId: registro.id } });
    }
    throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');
  }
  await authRepo.revocarRefreshToken(tokenHash, 'rotado');
  const s2 = await emitirSesion(usuario, { sesionId: registro.sesion_id, sesionInicio: registro.sesion_inicio });
  // Permisos actuales: la pantalla los actualiza sin tener que volver a iniciar sesión.
  return { accessToken: s2.accessToken, refreshToken: s2.refreshToken, refreshVence: s2.refreshVence, permisos: s2.permisos, odontologoId: usuario.odontologo_id || null };
}

async function logout(refreshTokenRaw, authorization) {
  // El token de acceso de esta sesión también deja de valer enseguida.
  const [esq, tok] = String(authorization || '').split(' ');
  if (esq === 'Bearer' && tok) {
    try { const pl = jwt.verify(tok, env.jwtSecret, { algorithms: ['HS256'] }); await sesiones.revocarJti(pl.jti, pl.exp); } catch (_e) { /* vencido o inválido: nada que revocar */ }
  }
  if (!refreshTokenRaw || typeof refreshTokenRaw !== 'string') return;
  const reg = await authRepo.findRefreshToken(hashToken(refreshTokenRaw));
  await authRepo.revocarRefreshToken(hashToken(refreshTokenRaw), 'logout');
  if (reg) {
    const u = await authRepo.findUsuarioById(reg.usuario_id);
    if (u) await auditoria.registrar({ clinicaId: u.clinica_id, usuarioId: u.id, usuarioNombre: u.nombre, accion: 'logout', modulo: 'seguridad' });
  }
}

/* Cambio de la contraseña propia (y obligatorio en el primer ingreso con la
   contraseña inicial). */
async function cambiarClavePropia(usuarioId, { actual, nueva } = {}) {
  if (!actual || !nueva) throw new ApiError(400, 'Indicá la contraseña actual y la nueva');
  const u = await authRepo.hashDeUsuario(usuarioId);
  if (!u) throw new ApiError(404, 'Usuario no encontrado');
  if (!(await bcrypt.compare(actual, u.password_hash))) throw new ApiError(400, 'La contraseña actual no es correcta');
  const n = String(nueva);
  if (n === actual) throw new ApiError(400, 'La nueva contraseña tiene que ser distinta de la actual');
  sesiones.validarClaveFuerte(n, { username: u.username });
  await authRepo.marcarClaveCambiada(usuarioId, await bcrypt.hash(n, 10));
  // Las demás sesiones abiertas (otros dispositivos) se cierran; esta sigue con tokens nuevos.
  await sesiones.invalidarSesiones(usuarioId, 'cambio_clave');
  const yo = await authRepo.findUsuarioById(usuarioId);
  if (yo) await auditoria.registrar({ clinicaId: yo.clinica_id, usuarioId, usuarioNombre: yo.nombre, accion: 'cambiar_clave_propia', modulo: 'seguridad' });
  const s2 = await emitirSesion(yo);
  return { ok: true, accessToken: s2.accessToken, refreshToken: s2.refreshToken, refreshVence: s2.refreshVence };
}

// "Cerrar sesión en todos los dispositivos" (la propia persona).
async function logoutTodas(usuario) {
  await sesiones.invalidarSesiones(usuario.id, 'logout_todas');
  await auditoria.registrar({ clinicaId: usuario.clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'logout_todas', modulo: 'seguridad' });
}

module.exports = { login, refresh, logout, logoutTodas, cambiarClavePropia };
