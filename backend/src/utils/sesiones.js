/* Sesiones del personal (auditoría de seguridad, oct 2026).
   - Política de contraseñas común a todo el personal.
   - Invalidación inmediata de TODAS las sesiones de un usuario (cambio o
     blanqueo de contraseña, baja, cambio de rol): se incrementa
     usuarios.token_version (los tokens de acceso viejos dejan de valer) y se
     revocan sus refresh tokens.
   - Lista de bloqueo de tokens de acceso (jti) al cerrar sesión. */
const { query } = require('../config/db');
const { ApiError } = require('../middlewares/error.middleware');

const COMUNES = new Set(['admin', 'administrador', 'password', 'contraseña', 'contrasena', 'dentcarerc', 'dova', '12345678', '123456789', '1234567890',
  'qwerty123', 'password1', 'admin123', 'admin1234', 'clave123', 'clave1234', 'abc12345', 'asuncion1', 'paraguay1', '11111111', '00000000']);

function validarClaveFuerte(clave, { username, nombre } = {}) {
  const c = String(clave || '');
  if (c.length < 8) throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres');
  if (c.length > 128) throw new ApiError(400, 'La contraseña es demasiado larga (máximo 128 caracteres)');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) throw new ApiError(400, 'La contraseña tiene que tener letras y números');
  const l = c.toLowerCase();
  if (COMUNES.has(l) || (username && l.includes(String(username).toLowerCase())) || (nombre && String(nombre).length >= 4 && l.includes(String(nombre).toLowerCase().split(' ')[0]))) {
    throw new ApiError(400, 'Esa contraseña es demasiado fácil de adivinar');
  }
  return c;
}

async function invalidarSesiones(usuarioId, motivo = 'invalidacion') {
  await query('UPDATE usuarios SET token_version = token_version + 1 WHERE id=$1', [Number(usuarioId)]);
  await query('UPDATE sesiones SET cerrada_en=now(), motivo=COALESCE(motivo, $2) WHERE usuario_id=$1 AND cerrada_en IS NULL', [Number(usuarioId), String(motivo).slice(0, 30)]);
  estados.clear();
  await query('UPDATE refresh_tokens SET revocado=true, revocado_en=COALESCE(revocado_en, now()), motivo=COALESCE(motivo, $2) WHERE usuario_id=$1 AND revocado=false', [Number(usuarioId), String(motivo).slice(0, 30)]);
  require('../middlewares/auth.middleware').olvidarUsuario(Number(usuarioId));
  require('./tiempoReal').cerrarUsuario(Number(usuarioId));
}

// ---- jti revocados (cierre de sesión) ----
const revocados = new Map(); // jti -> vence (ms)
async function revocarJti(jti, expSeg) {
  if (!jti) return;
  const vence = new Date((Number(expSeg) || Math.floor(Date.now() / 1000) + 900) * 1000);
  revocados.set(jti, vence.getTime());
  require('./tiempoReal').cerrarJti(jti);
  await query('INSERT INTO tokens_revocados (jti, expira_en) VALUES ($1,$2) ON CONFLICT (jti) DO NOTHING', [String(jti).slice(0, 64), vence]);
  if (Math.random() < 0.05) await query('DELETE FROM tokens_revocados WHERE expira_en < now()');
}
const consultados = new Map(); // jti -> { t, revocado }
async function jtiRevocado(jti) {
  if (!jti) return false;
  const v = revocados.get(jti);
  if (v) { if (v > Date.now()) return true; revocados.delete(jti); }
  const c = consultados.get(jti);
  if (c && Date.now() - c.t < 15000) return c.revocado;
  const r = (await query('SELECT 1 FROM tokens_revocados WHERE jti=$1 AND expira_en > now()', [String(jti)])).rowCount > 0;
  consultados.set(jti, { t: Date.now(), revocado: r });
  if (consultados.size > 20000) consultados.clear();
  return r;
}

/* ---- Sesiones (una por login) ----
   El token de acceso lleva el id de la sesión (sid). Cerrar o bloquear una
   sesión corta sus tokens de acceso al instante, no a los 15 minutos. */
const estados = new Map(); // sid -> { t, v }
const ESTADO_MS = 10000;
const recortar = (v, n) => (v === undefined || v === null ? null : String(v).slice(0, n));

async function registrarSesion({ id, usuarioId, clinicaId, inicio, ip, agente }) {
  await query(
    `INSERT INTO sesiones (id, usuario_id, clinica_id, inicio, ip, agente) VALUES ($1,$2,$3,COALESCE($4, now()),$5,$6)
     ON CONFLICT (id) DO UPDATE SET ultimo_uso=now(), ip=COALESCE(EXCLUDED.ip, sesiones.ip), agente=COALESCE(EXCLUDED.agente, sesiones.agente)`,
    [String(id), Number(usuarioId), Number(clinicaId), inicio || null, recortar(ip, 64), recortar(agente, 300)]);
  estados.delete(String(id));
  // Limpieza liviana: sesiones cerradas o sin uso hace más de 90 días.
  if (Math.random() < 0.01) await query("DELETE FROM sesiones WHERE COALESCE(cerrada_en, ultimo_uso) < now() - interval '90 days'");
}
async function estadoSesion(sid) {
  if (!sid) return null;
  const k = String(sid);
  const c = estados.get(k);
  if (c && Date.now() - c.t < ESTADO_MS) return c.v;
  const r = await query('SELECT usuario_id, bloqueada, cerrada_en FROM sesiones WHERE id=$1', [k]);
  const f = r.rows[0];
  const v = f ? { existe: true, usuarioId: f.usuario_id, bloqueada: f.bloqueada, cerrada: !!f.cerrada_en } : { existe: false };
  estados.set(k, { t: Date.now(), v });
  if (estados.size > 20000) estados.clear();
  return v;
}
async function cerrarSesion(sid, motivo = 'cerrada') {
  await query('UPDATE sesiones SET cerrada_en=COALESCE(cerrada_en, now()), motivo=COALESCE(motivo, $2) WHERE id=$1', [String(sid), String(motivo).slice(0, 30)]);
  await query('UPDATE refresh_tokens SET revocado=true, revocado_en=COALESCE(revocado_en, now()), motivo=COALESCE(motivo, $2) WHERE sesion_id=$1 AND revocado=false', [String(sid), String(motivo).slice(0, 30)]);
  estados.delete(String(sid));
}
async function bloquearSesion(sid, bloqueada) {
  await query(`UPDATE sesiones SET bloqueada=$2, bloqueada_en=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1 AND cerrada_en IS NULL`, [String(sid), !!bloqueada]);
  estados.delete(String(sid));
}

module.exports = { validarClaveFuerte, invalidarSesiones, revocarJti, jtiRevocado, registrarSesion, estadoSesion, cerrarSesion, bloquearSesion };
