const { query } = require('../../config/db');

async function crear(clinicaId, usuarioId, { tipo, titulo, mensaje, entidad, entidadId, ruta }) {
  await query(
    `INSERT INTO notificaciones (clinica_id, usuario_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [clinicaId, usuarioId, tipo, titulo, mensaje || null, entidad || null, entidadId ? String(entidadId) : null, ruta || null]
  );
}

async function listarPorUsuario(clinicaId, usuarioId, { soloNoLeidas = false, limit = 30 } = {}) {
  const cond = soloNoLeidas
    ? 'clinica_id=$1 AND usuario_id=$2 AND leido=false'
    : 'clinica_id=$1 AND usuario_id=$2';
  const res = await query(
    `SELECT * FROM notificaciones WHERE ${cond} ORDER BY creado_en DESC LIMIT $3`,
    [clinicaId, usuarioId, limit]
  );
  return res.rows;
}

async function contarNoLeidas(clinicaId, usuarioId) {
  const res = await query(
    'SELECT COUNT(*) FROM notificaciones WHERE clinica_id=$1 AND usuario_id=$2 AND leido=false',
    [clinicaId, usuarioId]
  );
  return parseInt(res.rows[0].count, 10);
}

async function marcarLeida(clinicaId, usuarioId, id) {
  const res = await query(
    'UPDATE notificaciones SET leido=true WHERE clinica_id=$1 AND usuario_id=$2 AND id=$3 RETURNING id',
    [clinicaId, usuarioId, id]
  );
  return res.rows[0] || null;
}

async function marcarTodasLeidas(clinicaId, usuarioId) {
  await query('UPDATE notificaciones SET leido=true WHERE clinica_id=$1 AND usuario_id=$2 AND leido=false', [clinicaId, usuarioId]);
}

module.exports = { crear, listarPorUsuario, contarNoLeidas, marcarLeida, marcarTodasLeidas };
