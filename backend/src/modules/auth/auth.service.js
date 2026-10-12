const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const { ApiError } = require('../../middlewares/error.middleware');
const authRepo = require('./auth.repository');
const clinicaRepo = require('../clinica/clinica.repository');
const auditoria = require('../../utils/auditoria');
const sesiones = require('../../utils/sesiones');
const { alertarAdmins } = require('../../utils/alertas');
const { query } = require('../../config/db');
// Para que el tiempo de respuesta no revele si un usuario existe.
const HASH_FALSO = bcrypt.hashSync('usuario-inexistente-dova', 10);
const segCfg = require('../../config/seguridad');
const DIA_MS = 24 * 60 * 60 * 1000;

// Usuario y contraseña tienen que ser texto, sin caracteres de control, de largo razonable.
function textoCredencial(v, max) {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Token de acceso: identifica la sesión (sid), el token (jti) y la versión de
// credenciales del usuario (tv). Si la versión cambia (nueva contraseña, baja,
// cambio de rol) o la sesión se cierra o se bloquea, deja de valer al instante.
function firmarAcceso(usuario, permisos, sid) {
  return jwt.sign({
    sub: usuario.id,
    clinicaId: usuario.clinica_id,
    rolCodigo: usuario.rol_codigo,
    nombre: usuario.nombre,
    odontologoId: usuario.odontologo_id || null,
    tv: Number(usuario.token_version) || 0,
    sid: sid || undefined,
    permisos,
  }, env.jwtSecret, { expiresIn: segCfg.sesion.accesoExpira, algorithm: 'HS256', jwtid: crypto.randomBytes(12).toString('hex') });
}
/* Una sesión = un login. El refresh token vence por inactividad
   (SESSION_IDLE_TIMEOUT_DAYS sin usarse) y nunca después del máximo absoluto
   desde el login (SESSION_ABSOLUTE_MAX_DAYS), aunque se renueve a diario. */
async function emitirSesion(usuario, { sesionId, sesionInicio, ip, agente } = {}) {
  const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
  const sid = sesionId || crypto.randomBytes(12).toString('hex');
  const inicio = sesionInicio ? new Date(sesionInicio) : new Date();
  await sesiones.registrarSesion({ id: sid, usuarioId: usuario.id, clinicaId: usuario.clinica_id, inicio, ip, agente });
  const accessToken = firmarAcceso(usuario, permisos, sid);
  const refreshTokenRaw = crypto.randomBytes(48).toString('hex');
  const vence = new Date(Math.min(Date.now() + segCfg.sesion.inactividadDias * DIA_MS, inicio.getTime() + segCfg.sesion.absolutoDias * DIA_MS));
  await authRepo.guardarRefreshToken(usuario.id, hashToken(refreshTokenRaw), vence, sid, inicio);
  return { accessToken, refreshToken: refreshTokenRaw, permisos, refreshVence: vence, sid };
}

/* clinicaSlug es opcional: por ahora DOVA tiene una sola clínica real
   (DentCareRC) y el frontend no manda ese dato, así que se usa como
   default. */
const MAX_FALLIDOS_USUARIO = 5;
const MAX_FALLIDOS_IP = 30;

async function login({ username, password, clinicaSlug = 'dentcarerc', ip, agente }) {
  // Solo texto plano: nada de listas, objetos ni caracteres de control
  // (["admin"] se convertía en "admin"; un \0 hacía fallar a la base).
  if (!textoCredencial(username, 100) || !textoCredencial(password, 200)) {
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
    const { usuario, clinica } = await verificarCredenciales({ username, password, clinicaSlug });
    await authRepo.registrarIntentoLogin(clave, ip, true);
    const r = await completarLogin(usuario, clinica, { ip, agente });
    await auditoria.registrar({ clinicaId: clinica.id, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'login', modulo: 'seguridad', ip });
    return r;
  } catch (e) {
    if (e.status === 401) {
      await authRepo.registrarIntentoLogin(clave, ip, false);
      const c = await clinicaLog();
      if (c.id) await auditoria.registrar({ clinicaId: c.id, accion: 'login_fallido', modulo: 'seguridad', resultado: 'fallido', ip, detalle: { usuario: clave } });
      const restantes = MAX_FALLIDOS_USUARIO - (est.fallidos_usuario + 1);
      if (restantes > 0 && restantes <= 2) e.message += `. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'} antes de un bloqueo de 15 minutos.`;
      if (restantes === 0 && c.id) {
        await alertarAdmins(c.id, { clave: `bloqueo|${clave}`, titulo: `Ingreso bloqueado: «${clave.slice(0, 40)}»`, mensaje: `${MAX_FALLIDOS_USUARIO} contraseñas incorrectas seguidas para ese usuario (IP ${ip || 'desconocida'}). El ingreso quedó bloqueado 15 minutos. Si no fue alguien de la clínica, revisá la contraseña de esa cuenta.` });
      }
    }
    throw e;
  }
}

async function verificarCredenciales({ username, password, clinicaSlug }) {
  const clinica = await clinicaRepo.findBySlug(clinicaSlug);
  if (!clinica) throw new ApiError(401, 'Usuario o contraseña incorrectos');
  const usuario = await authRepo.findUsuarioByUsername(clinica.id, String(username).trim().slice(0, 100));
  if (!usuario || !usuario.activo) {
    await bcrypt.compare(String(password), HASH_FALSO);
    throw new ApiError(401, 'Usuario o contraseña incorrectos');
  }
  const passwordOk = await bcrypt.compare(String(password).slice(0, 200), usuario.password_hash);
  if (!passwordOk) throw new ApiError(401, 'Usuario o contraseña incorrectos');
  return { usuario, clinica };
}

async function completarLogin(usuario, clinica, ctx) {
  const s = await emitirSesion(usuario, ctx);
  await authRepo.actualizarUltimoLogin(usuario.id);
  return {
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    refreshVence: s.refreshVence,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.rol_codigo,
      rolNombre: usuario.rol_nombre,
      odontologoId: usuario.odontologo_id,
      permisos: s.permisos,
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
async function refresh(refreshTokenRaw, { deCuerpo = false, ip, agente } = {}) {
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
  const sid = registro.sesion_id || null;
  if (sid) {
    const es = await sesiones.estadoSesion(sid);
    if (es && es.existe && es.cerrada) throw new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.');
    if (es && es.existe && es.bloqueada && !registro.revocado) throw errorBloqueada(usuario);
  }
  if (registro.revocado) {
    if (registro.motivo === 'rotado' && registro.en_gracia) {
      if (sid) { const es = await sesiones.estadoSesion(sid); if (es && es.bloqueada) throw errorBloqueada(usuario); }
      // Otra pestaña acaba de renovar: se entrega solo un acceso nuevo.
      const permisos = await authRepo.getPermisosEfectivos(usuario.id, usuario.rol_id);
      return { accessToken: firmarAcceso(usuario, permisos, sid), permisos, odontologoId: usuario.odontologo_id || null };
    }
    if (registro.motivo === 'rotado') {
      await sesiones.invalidarSesiones(usuario.id, 'reutilizacion');
      await auditoria.registrar({ clinicaId: usuario.clinica_id, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'refresh_reutilizado', modulo: 'seguridad', resultado: 'denegado', ip, detalle: { tokenId: registro.id } });
      await alertarAdmins(usuario.clinica_id, { clave: `reuso|${usuario.id}`, alUsuario: usuario.id, titulo: `Sesión cerrada por seguridad: ${usuario.nombre}`, mensaje: `Se usó dos veces la misma credencial de sesión de «${usuario.username}» (posible copia robada, IP ${ip || 'desconocida'}). Se cerraron todas sus sesiones; tiene que volver a ingresar.` });
    }
    throw new ApiError(401, 'Sesión expirada, iniciá sesión nuevamente');
  }
  await authRepo.revocarRefreshToken(tokenHash, 'rotado');
  const s2 = await emitirSesion(usuario, { sesionId: sid, sesionInicio: registro.sesion_inicio, ip, agente });
  // Permisos actuales: la pantalla los actualiza sin tener que volver a iniciar sesión.
  return { accessToken: s2.accessToken, refreshToken: s2.refreshToken, refreshVence: s2.refreshVence, permisos: s2.permisos, odontologoId: usuario.odontologo_id || null };
}

function errorBloqueada(usuario) {
  return new ApiError(423, 'La pantalla está bloqueada. Ingresá tu contraseña para seguir.', { codigo: 'SESION_BLOQUEADA', nombre: usuario.nombre, username: usuario.username });
}

async function logout(refreshTokenRaw, authorization) {
  // El token de acceso de esta sesión también deja de valer enseguida.
  const [esq, tok] = String(authorization || '').split(' ');
  if (esq === 'Bearer' && tok) {
    try { const pl = jwt.verify(tok, env.jwtSecret, { algorithms: ['HS256'] }); await sesiones.revocarJti(pl.jti, pl.exp); if (pl.sid) await sesiones.cerrarSesion(pl.sid, 'logout'); } catch (_e) { /* vencido o inválido: nada que revocar */ }
  }
  if (!refreshTokenRaw || typeof refreshTokenRaw !== 'string') return;
  const reg = await authRepo.findRefreshToken(hashToken(refreshTokenRaw));
  await authRepo.revocarRefreshToken(hashToken(refreshTokenRaw), 'logout');
  if (reg) {
    if (reg.sesion_id) await sesiones.cerrarSesion(reg.sesion_id, 'logout');
    const u = await authRepo.findUsuarioById(reg.usuario_id);
    if (u) await auditoria.registrar({ clinicaId: u.clinica_id, usuarioId: u.id, usuarioNombre: u.nombre, accion: 'logout', modulo: 'seguridad' });
  }
}

/* Cambio de la contraseña propia (y obligatorio en el primer ingreso con la
   contraseña inicial). */
async function cambiarClavePropia(usuarioId, { actual, nueva } = {}, ctx = {}) {
  if (!textoCredencial(actual, 200) || !textoCredencial(nueva, 200)) throw new ApiError(400, 'Indicá la contraseña actual y la nueva');
  const u = await authRepo.hashDeUsuario(usuarioId);
  if (!u) throw new ApiError(404, 'Usuario no encontrado');
  if (!(await bcrypt.compare(String(actual).slice(0, 200), u.password_hash))) throw new ApiError(400, 'La contraseña actual no es correcta');
  const n = String(nueva);
  if (n === actual) throw new ApiError(400, 'La nueva contraseña tiene que ser distinta de la actual');
  sesiones.validarClaveFuerte(n, { username: u.username });
  await authRepo.marcarClaveCambiada(usuarioId, await bcrypt.hash(n, 10));
  // Las demás sesiones abiertas (otros dispositivos) se cierran; esta sigue con tokens nuevos.
  await sesiones.invalidarSesiones(usuarioId, 'cambio_clave');
  const yo = await authRepo.findUsuarioById(usuarioId);
  if (yo) await auditoria.registrar({ clinicaId: yo.clinica_id, usuarioId, usuarioNombre: yo.nombre, accion: 'cambiar_clave_propia', modulo: 'seguridad' });
  const s2 = await emitirSesion(yo, ctx);
  return { ok: true, accessToken: s2.accessToken, refreshToken: s2.refreshToken, refreshVence: s2.refreshVence };
}

// "Cerrar sesión en todos los dispositivos" (la propia persona).
async function logoutTodas(usuario) {
  await sesiones.invalidarSesiones(usuario.id, 'logout_todas');
  await auditoria.registrar({ clinicaId: usuario.clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'logout_todas', modulo: 'seguridad' });
}

/* ---------------- Sesiones abiertas ---------------- */
async function listarSesiones(usuario, sidActual) {
  const r = await query(
    `SELECT s.id, s.inicio, s.ultimo_uso, s.ip, s.agente, s.bloqueada
     FROM sesiones s
     WHERE s.usuario_id=$1 AND s.cerrada_en IS NULL
       AND EXISTS (SELECT 1 FROM refresh_tokens t WHERE t.sesion_id=s.id AND (t.revocado=false OR t.revocado_en > now() - interval '2 minutes') AND t.expira_en > now())
     ORDER BY s.ultimo_uso DESC LIMIT 50`, [usuario.id]);
  return r.rows.map((s) => ({ id: s.id, inicio: s.inicio, ultimoUso: s.ultimo_uso, ip: s.ip, dispositivo: describirAgente(s.agente), bloqueada: s.bloqueada, actual: s.id === sidActual }));
}
async function cerrarSesionPropia(usuario, sid) {
  const r = await query('SELECT id FROM sesiones WHERE id=$1 AND usuario_id=$2 AND cerrada_en IS NULL', [String(sid || '').slice(0, 40), usuario.id]);
  if (!r.rowCount) throw new ApiError(404, 'Esa sesión ya no está abierta.');
  await sesiones.cerrarSesion(r.rows[0].id, 'cerrada_usuario');
  await auditoria.registrar({ clinicaId: usuario.clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'cerrar_sesion_dispositivo', modulo: 'seguridad', detalle: { sesion: r.rows[0].id.slice(0, 6) } });
  return { ok: true };
}
function describirAgente(ua) {
  const a = String(ua || '');
  if (!a) return 'Dispositivo desconocido';
  const nav = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera' : /Firefox\//.test(a) ? 'Firefox' : /Chrome\//.test(a) ? 'Chrome' : /Safari\//.test(a) ? 'Safari' : 'Navegador';
  const so = /Android/.test(a) ? 'Android' : /iPhone|iPad/.test(a) ? 'iPhone/iPad' : /Windows/.test(a) ? 'Windows' : /Mac OS X/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : '';
  return so ? `${nav} en ${so}` : nav;
}

/* ---------------- Bloqueo de pantalla ---------------- */
async function bloquear(usuario, sid) {
  if (!sid) return { ok: true };
  await sesiones.bloquearSesion(sid, true);
  return { ok: true };
}

// Desbloqueo con la contraseña. Los fallos cuentan para el bloqueo del
// usuario: al quinto se cierra la sesión.
async function desbloquear(refreshTokenRaw, { clave, ip, agente } = {}) {
  if (!refreshTokenRaw) throw new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.');
  const registro = await authRepo.findRefreshToken(hashToken(String(refreshTokenRaw)));
  if (!registro || !registro.sesion_id) throw new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.');
  const es = await sesiones.estadoSesion(registro.sesion_id);
  if (!es || !es.existe || es.cerrada) throw new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.');
  const usuario = await authRepo.findUsuarioById(registro.usuario_id);
  if (!usuario || !usuario.activo) throw new ApiError(401, 'Tu sesión se cerró. Volvé a iniciar sesión.');
  const claveLogin = String(usuario.username).toLowerCase();
  const est = await authRepo.estadoIntentosLogin(claveLogin, ip);
  if (est.fallidos_usuario >= MAX_FALLIDOS_USUARIO) {
    await sesiones.cerrarSesion(registro.sesion_id, 'desbloqueo_fallido');
    throw new ApiError(401, 'Demasiados intentos. Se cerró la sesión por seguridad.');
  }
  const u = await authRepo.hashDeUsuario(usuario.id);
  if (!textoCredencial(clave, 200) || !(await bcrypt.compare(clave, u.password_hash))) {
    await authRepo.registrarIntentoLogin(claveLogin, ip, false);
    await auditoria.registrar({ clinicaId: usuario.clinica_id, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'desbloqueo_fallido', modulo: 'seguridad', resultado: 'fallido', ip });
    const restantes = MAX_FALLIDOS_USUARIO - (est.fallidos_usuario + 1);
    if (restantes <= 0) {
      await sesiones.cerrarSesion(registro.sesion_id, 'desbloqueo_fallido');
      await alertarAdmins(usuario.clinica_id, { clave: `desb|${usuario.id}`, alUsuario: usuario.id, titulo: `Pantalla bloqueada: contraseña fallida (${usuario.nombre})`, mensaje: `Alguien intentó ${MAX_FALLIDOS_USUARIO} veces desbloquear la sesión de «${usuario.username}» con una contraseña incorrecta. La sesión se cerró.` });
      throw new ApiError(401, 'Demasiados intentos. Se cerró la sesión por seguridad.');
    }
    throw new ApiError(400, `Contraseña incorrecta. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'}.`);
  }
  await authRepo.registrarIntentoLogin(claveLogin, ip, true);
  await sesiones.bloquearSesion(registro.sesion_id, false);
  await authRepo.revocarRefreshToken(hashToken(String(refreshTokenRaw)), 'rotado');
  const s2 = await emitirSesion(usuario, { sesionId: registro.sesion_id, sesionInicio: registro.sesion_inicio, ip, agente });
  return { accessToken: s2.accessToken, refreshToken: s2.refreshToken, refreshVence: s2.refreshVence, permisos: s2.permisos, odontologoId: usuario.odontologo_id || null };
}

async function politica(clinicaId) {
  const r = await query('SELECT bloqueo_inactividad_min FROM clinicas WHERE id=$1', [clinicaId]);
  const c = r.rows[0] || {};
  return { bloqueoMin: Number(c.bloqueo_inactividad_min ?? 15) };
}

module.exports = {
  login, refresh, logout, logoutTodas, cambiarClavePropia,
  listarSesiones, cerrarSesionPropia, bloquear, desbloquear, politica,
};
