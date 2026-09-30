const { query } = require('../../config/db');

async function findUsuarioByUsername(clinicaId, username) {
  const res = await query(
    `SELECT u.id, u.clinica_id, u.rol_id, u.nombre, u.username, u.password_hash,
            u.activo, u.es_admin_protegido, u.odontologo_id, u.diseno_preferido, u.debe_cambiar_clave,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.clinica_id = $1 AND u.username = $2`,
    [clinicaId, username]
  );
  return res.rows[0] || null;
}

async function findUsuarioById(id) {
  const res = await query(
    `SELECT u.id, u.clinica_id, u.rol_id, u.nombre, u.username, u.activo,
            u.es_admin_protegido, u.odontologo_id, u.diseno_preferido,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/* Calcula los permisos EFECTIVOS de un usuario:
   permisos del rol + personalizados con allow=true - personalizados con allow=false. */
async function getPermisosEfectivos(usuarioId, rolId) {
  const res = await query(
    `SELECT p.codigo,
            COALESCE(pu.allow, true) AS allow
     FROM rol_permisos rp
     JOIN permisos p ON p.id = rp.permiso_id
     LEFT JOIN permisos_usuario pu ON pu.permiso_id = p.id AND pu.usuario_id = $1
     WHERE rp.rol_id = $2

     UNION

     SELECT p.codigo, pu.allow
     FROM permisos_usuario pu
     JOIN permisos p ON p.id = pu.permiso_id
     WHERE pu.usuario_id = $1
       AND pu.permiso_id NOT IN (SELECT permiso_id FROM rol_permisos WHERE rol_id = $2)`,
    [usuarioId, rolId]
  );
  return res.rows.filter((r) => r.allow).map((r) => r.codigo);
}

async function actualizarUltimoLogin(usuarioId) {
  await query('UPDATE usuarios SET ultimo_login = now() WHERE id = $1', [usuarioId]);
}

async function guardarRefreshToken(usuarioId, tokenHash, expiraEn) {
  await query(
    'INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1,$2,$3)',
    [usuarioId, tokenHash, expiraEn]
  );
}

async function findRefreshToken(tokenHash) {
  const res = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revocado = false AND expira_en > now()`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function revocarRefreshToken(tokenHash) {
  await query('UPDATE refresh_tokens SET revocado = true WHERE token_hash = $1', [tokenHash]);
}

/* ---- Freno a la fuerza bruta en el login ----
   Se cuentan los intentos fallidos de un usuario desde su último ingreso
   correcto (ventana de 15 min) y los fallidos de una misma IP. */
const VENTANA_MIN = 15;
async function registrarIntentoLogin(clave, ip, exitoso) {
  await query('INSERT INTO login_intentos (clave, ip, exitoso) VALUES ($1,$2,$3)', [clave, ip || null, exitoso]);
  // Limpieza liviana: lo de más de 30 días no sirve.
  if (Math.random() < 0.02) await query("DELETE FROM login_intentos WHERE creado_en < now() - interval '30 days'");
}
async function estadoIntentosLogin(clave, ip) {
  const r = await query(
    `SELECT
       (SELECT count(*)::int FROM login_intentos WHERE clave=$1 AND NOT exitoso AND creado_en > now() - ($3::int * interval '1 minute')
          AND creado_en > COALESCE((SELECT max(creado_en) FROM login_intentos WHERE clave=$1 AND exitoso), '-infinity')) AS fallidos_usuario,
       (SELECT max(creado_en) FROM login_intentos WHERE clave=$1 AND NOT exitoso AND creado_en > now() - ($3::int * interval '1 minute')) AS ultimo_fallido,
       (SELECT count(*)::int FROM login_intentos WHERE ip=$2 AND NOT exitoso AND creado_en > now() - ($3::int * interval '1 minute')) AS fallidos_ip`,
    [clave, ip || '', VENTANA_MIN]);
  return { ...r.rows[0], ventanaMin: VENTANA_MIN };
}

async function marcarClaveCambiada(usuarioId, hash) {
  await query('UPDATE usuarios SET password_hash=$2, debe_cambiar_clave=false WHERE id=$1', [usuarioId, hash]);
}
async function hashDeUsuario(usuarioId) {
  const r = await query('SELECT password_hash, username FROM usuarios WHERE id=$1', [usuarioId]);
  return r.rows[0] || null;
}

module.exports = {
  registrarIntentoLogin, estadoIntentosLogin, marcarClaveCambiada, hashDeUsuario,
  findUsuarioByUsername,
  findUsuarioById,
  getPermisosEfectivos,
  actualizarUltimoLogin,
  guardarRefreshToken,
  findRefreshToken,
  revocarRefreshToken,
};
