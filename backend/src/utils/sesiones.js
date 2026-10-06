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
  await query('UPDATE refresh_tokens SET revocado=true, revocado_en=COALESCE(revocado_en, now()), motivo=COALESCE(motivo, $2) WHERE usuario_id=$1 AND revocado=false', [Number(usuarioId), String(motivo).slice(0, 30)]);
  require('../middlewares/auth.middleware').olvidarUsuario(Number(usuarioId));
}

// ---- jti revocados (cierre de sesión) ----
const revocados = new Map(); // jti -> vence (ms)
async function revocarJti(jti, expSeg) {
  if (!jti) return;
  const vence = new Date((Number(expSeg) || Math.floor(Date.now() / 1000) + 900) * 1000);
  revocados.set(jti, vence.getTime());
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

module.exports = { validarClaveFuerte, invalidarSesiones, revocarJti, jtiRevocado };
