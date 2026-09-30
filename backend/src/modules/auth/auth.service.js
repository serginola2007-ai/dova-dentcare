const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const { ApiError } = require('../../middlewares/error.middleware');
const authRepo = require('./auth.repository');
const clinicaRepo = require('../clinica/clinica.repository');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function construirTokens(usuario, permisos) {
  const basePayload = {
    sub: usuario.id,
    clinicaId: usuario.clinica_id,
    rolCodigo: usuario.rol_codigo,
    nombre: usuario.nombre,
    odontologoId: usuario.odontologo_id || null,
  };
  const accessToken = jwt.sign(
    { ...basePayload, permisos },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  const refreshTokenRaw = crypto.randomBytes(48).toString('hex');
  return { accessToken, refreshTokenRaw };
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
  if (est.fallidos_usuario >= MAX_FALLIDOS_USUARIO || est.fallidos_ip >= MAX_FALLIDOS_IP) {
    const desde = est.ultimo_fallido ? new Date(est.ultimo_fallido).getTime() : Date.now();
    const min = Math.max(1, Math.ceil((desde + est.ventanaMin * 60000 - Date.now()) / 60000));
    throw new ApiError(429, `Demasiados intentos fallidos. Por seguridad, esperá ${min} minuto${min === 1 ? '' : 's'} y volvé a intentar.`);
  }
  try {
    const r = await loginVerificado({ username, password, clinicaSlug });
    await authRepo.registrarIntentoLogin(clave, ip, true);
    return r;
  } catch (e) {
    if (e.status === 401) {
      await authRepo.registrarIntentoLogin(clave, ip, false);
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

  const usuario = await authRepo.findUsuarioByUsername(clinica.id, username.trim());
  if (!usuario || !usuario.activo) {
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }

  const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
  const { accessToken, refreshTokenRaw } = construirTokens(usuario, permisos);

  const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
  await authRepo.guardarRefreshToken(usuario.id, hashToken(refreshTokenRaw), expiraEn);
  await authRepo.actualizarUltimoLogin(usuario.id);

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
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

async function refresh(refreshTokenRaw) {
  if (!refreshTokenRaw) throw new ApiError(400, 'refreshToken requerido');
  const tokenHash = hashToken(refreshTokenRaw);
  const registro = await authRepo.findRefreshToken(tokenHash);
  if (!registro) throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');

  const usuario = await authRepo.findUsuarioById(registro.usuario_id);
  if (!usuario || !usuario.activo) throw new ApiError(401, 'Usuario inválido');

  const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
  const accessToken = jwt.sign(
    { sub: usuario.id, clinicaId: usuario.clinica_id, rolCodigo: usuario.rol_codigo, nombre: usuario.nombre, odontologoId: usuario.odontologo_id || null, permisos },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  return { accessToken };
}

async function logout(refreshTokenRaw) {
  if (!refreshTokenRaw) return;
  await authRepo.revocarRefreshToken(hashToken(refreshTokenRaw));
}

/* Cambio de la contraseña propia (y obligatorio en el primer ingreso con la
   contraseña inicial). */
async function cambiarClavePropia(usuarioId, { actual, nueva } = {}) {
  if (!actual || !nueva) throw new ApiError(400, 'Indicá la contraseña actual y la nueva');
  const u = await authRepo.hashDeUsuario(usuarioId);
  if (!u) throw new ApiError(404, 'Usuario no encontrado');
  if (!(await bcrypt.compare(actual, u.password_hash))) throw new ApiError(400, 'La contraseña actual no es correcta');
  const n = String(nueva);
  if (n.length < 8) throw new ApiError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  if (n === actual) throw new ApiError(400, 'La nueva contraseña tiene que ser distinta de la actual');
  if (n.toLowerCase() === String(u.username).toLowerCase() || ['admin', 'administrador', '12345678', 'password', 'contraseña', 'dentcarerc'].includes(n.toLowerCase())) {
    throw new ApiError(400, 'Esa contraseña es demasiado fácil de adivinar');
  }
  await authRepo.marcarClaveCambiada(usuarioId, await bcrypt.hash(n, 10));
  return { ok: true };
}

module.exports = { login, refresh, logout, cambiarClavePropia };
