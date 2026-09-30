const { query } = require('../../config/db');

// ---- Roles ----
async function listarRoles(clinicaId) {
  const res = await query(
    `SELECT * FROM roles WHERE clinica_id = $1 OR clinica_id IS NULL ORDER BY es_sistema DESC, nombre`,
    [clinicaId]
  );
  return res.rows;
}

async function obtenerRol(clinicaId, id) {
  const res = await query('SELECT * FROM roles WHERE id = $1 AND (clinica_id = $2 OR clinica_id IS NULL)', [id, clinicaId]);
  return res.rows[0] || null;
}

async function obtenerRolPorCodigo(clinicaId, codigo) {
  const res = await query('SELECT * FROM roles WHERE codigo = $1 AND (clinica_id = $2 OR clinica_id IS NULL)', [codigo, clinicaId]);
  return res.rows[0] || null;
}

async function permisosDeRol(rolId) {
  const res = await query(
    `SELECT p.codigo, p.modulo, p.descripcion FROM rol_permisos rp
     JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = $1 ORDER BY p.modulo, p.codigo`,
    [rolId]
  );
  return res.rows;
}

async function crearRol(clinicaId, { codigo, nombre }) {
  const res = await query(
    `INSERT INTO roles (clinica_id, codigo, nombre, es_sistema) VALUES ($1,$2,$3,false) RETURNING *`,
    [clinicaId, codigo, nombre]
  );
  return res.rows[0];
}

async function actualizarPermisosRol(rolId, codigosPermisos) {
  await query('DELETE FROM rol_permisos WHERE rol_id = $1', [rolId]);
  for (const codigo of codigosPermisos) {
    await query(
      `INSERT INTO rol_permisos (rol_id, permiso_id)
       SELECT $1, id FROM permisos WHERE codigo = $2
       ON CONFLICT DO NOTHING`,
      [rolId, codigo]
    );
  }
  return permisosDeRol(rolId);
}

// ---- Permisos (catálogo) ----
async function listarPermisos() {
  const res = await query('SELECT * FROM permisos ORDER BY modulo, codigo');
  return res.rows;
}

// ---- Usuarios ----
async function listar(clinicaId, { incluirInactivos = false, page = 1, pageSize = 20 } = {}) {
  const cond = incluirInactivos ? 'u.clinica_id = $1' : 'u.clinica_id = $1 AND u.activo = true';
  const offset = (page - 1) * pageSize;
  const res = await query(
    `SELECT u.id, u.nombre, u.username, u.email, u.activo, u.es_admin_protegido,
            u.odontologo_id, u.ultimo_login, u.creado_en, r.id AS rol_id, r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE ${cond} ORDER BY u.nombre LIMIT $2 OFFSET $3`,
    [clinicaId, pageSize, offset]
  );
  const total = await query(`SELECT COUNT(*) FROM usuarios u WHERE ${cond}`, [clinicaId]);
  return { items: res.rows, total: Number(total.rows[0].count), page, pageSize };
}

async function obtener(clinicaId, id) {
  const res = await query(
    `SELECT u.id, u.nombre, u.username, u.email, u.activo, u.es_admin_protegido,
            u.odontologo_id, u.ultimo_login, u.creado_en, r.id AS rol_id, r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.clinica_id = $1 AND u.id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function existeUsername(clinicaId, username, excluirId = null) {
  const res = await query(
    `SELECT id FROM usuarios WHERE clinica_id = $1 AND username = $2 AND ($3::int IS NULL OR id <> $3)`,
    [clinicaId, username, excluirId]
  );
  return res.rows.length > 0;
}

async function contarAdminsProtegidosActivos(clinicaId, excluirId = null) {
  const res = await query(
    `SELECT COUNT(*) FROM usuarios WHERE clinica_id = $1 AND es_admin_protegido = true AND activo = true AND ($2::int IS NULL OR id <> $2)`,
    [clinicaId, excluirId]
  );
  return Number(res.rows[0].count);
}

// Cuenta usuarios activos con rol "admin" (protegidos o no), excluyendo opcionalmente uno.
// Se usa para garantizar que la clínica nunca quede sin ningún administrador activo.
async function contarAdminsActivos(clinicaId, excluirId = null) {
  const res = await query(
    `SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.clinica_id = $1 AND r.codigo = 'admin' AND u.activo = true AND ($2::int IS NULL OR u.id <> $2)`,
    [clinicaId, excluirId]
  );
  return Number(res.rows[0].count);
}

async function crear(clinicaId, { nombre, username, email, passwordHash, rolId, odontologoId }) {
  const res = await query(
    `INSERT INTO usuarios (clinica_id, rol_id, nombre, username, email, password_hash, odontologo_id, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
    [clinicaId, rolId, nombre, username, email || null, passwordHash, odontologoId || null]
  );
  return obtener(clinicaId, res.rows[0].id);
}

async function actualizar(clinicaId, id, campos) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [col, val] of Object.entries(campos)) {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  }
  sets.push(`actualizado_en = now()`);
  vals.push(clinicaId, id);
  await query(
    `UPDATE usuarios SET ${sets.join(', ')} WHERE clinica_id = $${i++} AND id = $${i}`,
    vals
  );
  return obtener(clinicaId, id);
}

async function cambiarPassword(id, passwordHash) {
  await query('UPDATE usuarios SET password_hash = $1, actualizado_en = now() WHERE id = $2', [passwordHash, id]);
}

async function obtenerPasswordHash(id) {
  const res = await query('SELECT password_hash FROM usuarios WHERE id = $1', [id]);
  return res.rows[0]?.password_hash || null;
}

// ---- Preferencia de diseño (selector moderno/minimalista/tecnico) ----
async function obtenerDisenoPreferido(id) {
  const res = await query('SELECT diseno_preferido FROM usuarios WHERE id = $1', [id]);
  return res.rows[0]?.diseno_preferido || null;
}

async function actualizarDisenoPreferido(id, disenoPreferido) {
  const res = await query(
    `UPDATE usuarios SET diseno_preferido = $1, actualizado_en = now()
     WHERE id = $2 RETURNING id, diseno_preferido`,
    [disenoPreferido, id]
  );
  return res.rows[0] || null;
}

// ---- Permisos personalizados por usuario (overrides) ----
async function overridesDeUsuario(usuarioId) {
  const res = await query(
    `SELECT pu.permiso_id, p.codigo, p.modulo, p.descripcion, pu.allow
     FROM permisos_usuario pu JOIN permisos p ON p.id = pu.permiso_id
     WHERE pu.usuario_id = $1 ORDER BY p.modulo, p.codigo`,
    [usuarioId]
  );
  return res.rows;
}

async function setOverride(usuarioId, codigoPermiso, allow) {
  await query(
    `INSERT INTO permisos_usuario (usuario_id, permiso_id, allow)
     SELECT $1, id, $3 FROM permisos WHERE codigo = $2
     ON CONFLICT (usuario_id, permiso_id) DO UPDATE SET allow = $3`,
    [usuarioId, codigoPermiso, allow]
  );
  return overridesDeUsuario(usuarioId);
}

async function quitarOverride(usuarioId, codigoPermiso) {
  await query(
    `DELETE FROM permisos_usuario WHERE usuario_id = $1 AND permiso_id = (SELECT id FROM permisos WHERE codigo = $2)`,
    [usuarioId, codigoPermiso]
  );
  return overridesDeUsuario(usuarioId);
}

module.exports = {
  listarRoles, obtenerRol, obtenerRolPorCodigo, permisosDeRol, crearRol, actualizarPermisosRol,
  listarPermisos,
  listar, obtener, existeUsername, contarAdminsProtegidosActivos, contarAdminsActivos, crear, actualizar,
  cambiarPassword, obtenerPasswordHash,
  overridesDeUsuario, setOverride, quitarOverride,
  obtenerDisenoPreferido, actualizarDisenoPreferido,
};
