const { query } = require('../../config/db');

const SELECT_TICKET = `
  t.id, t.clinica_id, t.titulo, t.descripcion, t.categoria, t.modulo_afectado,
  t.creador_id, t.asignado_id, t.estado, t.resolucion, t.creado_en, t.actualizado_en, t.resuelto_en,
  uc.nombre AS creador_nombre, ua.nombre AS asignado_nombre
`;

async function listar(clinicaId, { estado, categoria, asignadoId, creadorId, soloPropios, usuarioId }) {
  const cond = ['t.clinica_id = $1'];
  const params = [clinicaId];
  if (estado) { params.push(estado); cond.push(`t.estado = $${params.length}`); }
  if (categoria) { params.push(categoria); cond.push(`t.categoria = $${params.length}`); }
  if (asignadoId) { params.push(asignadoId); cond.push(`t.asignado_id = $${params.length}`); }
  if (creadorId) { params.push(creadorId); cond.push(`t.creador_id = $${params.length}`); }
  if (soloPropios) { params.push(usuarioId); cond.push(`t.creador_id = $${params.length}`); }

  const res = await query(
    `SELECT ${SELECT_TICKET} FROM tickets t
     JOIN usuarios uc ON uc.id = t.creador_id
     LEFT JOIN usuarios ua ON ua.id = t.asignado_id
     WHERE ${cond.join(' AND ')}
     ORDER BY t.creado_en DESC`,
    params
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT ${SELECT_TICKET} FROM tickets t
     JOIN usuarios uc ON uc.id = t.creador_id
     LEFT JOIN usuarios ua ON ua.id = t.asignado_id
     WHERE t.clinica_id = $1 AND t.id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, d, creadorId) {
  const res = await query(
    `INSERT INTO tickets (clinica_id, titulo, descripcion, categoria, modulo_afectado, creador_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [clinicaId, d.titulo, d.descripcion, d.categoria || 'otro', d.moduloAfectado || null, creadorId]
  );
  return obtenerPorId(clinicaId, res.rows[0].id);
}

async function actualizarEstado(clinicaId, id, estado, resolucion) {
  const camposExtra = estado === 'resuelto' ? ', resuelto_en = now(), resolucion = $4' : '';
  const params = [clinicaId, id, estado];
  if (estado === 'resuelto') params.push(resolucion || null);
  const res = await query(
    `UPDATE tickets SET estado = $3, actualizado_en = now() ${camposExtra} WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    params
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

async function asignar(clinicaId, id, asignadoId) {
  const res = await query(
    `UPDATE tickets SET asignado_id = $3, actualizado_en = now(),
       estado = CASE WHEN estado = 'nuevo' THEN 'abierto' ELSE estado END
     WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    [clinicaId, id, asignadoId]
  );
  if (!res.rows[0]) return null;
  return obtenerPorId(clinicaId, id);
}

async function agregarMensaje(ticketId, usuarioId, usuarioNombre, contenido) {
  const res = await query(
    `INSERT INTO ticket_mensajes (ticket_id, usuario_id, usuario_nombre, contenido)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [ticketId, usuarioId, usuarioNombre, contenido]
  );
  await query('UPDATE tickets SET actualizado_en = now() WHERE id = $1', [ticketId]);
  return res.rows[0];
}

async function listarMensajes(ticketId) {
  const res = await query(
    `SELECT m.*,
       COALESCE(json_agg(json_build_object(
         'id', a.id, 'nombreOriginal', a.nombre_original, 'mimeType', a.mime_type,
         'tamanioBytes', a.tamanio_bytes, 'estado', a.estado
       )) FILTER (WHERE a.id IS NOT NULL), '[]') AS adjuntos
     FROM ticket_mensajes m
     LEFT JOIN ticket_adjuntos a ON a.mensaje_id = m.id
     WHERE m.ticket_id = $1
     GROUP BY m.id ORDER BY m.creado_en`,
    [ticketId]
  );
  return res.rows;
}

async function crearAdjunto(ticketId, mensajeId, subidoPor, archivo, retencionDias) {
  const eliminacionProgramada = retencionDias
    ? new Date(Date.now() + retencionDias * 24 * 60 * 60 * 1000)
    : null;
  const res = await query(
    `INSERT INTO ticket_adjuntos (
       ticket_id, mensaje_id, subido_por, nombre_original, nombre_interno,
       mime_type, tamanio_bytes, storage_path, eliminacion_programada_en, archivo
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, ticket_id, mensaje_id, subido_por, nombre_original, mime_type, tamanio_bytes, subido_en, eliminacion_programada_en, estado`,
    [ticketId, mensajeId, subidoPor, archivo.nombreOriginal, archivo.nombreInterno,
      archivo.mimeType, archivo.tamanioBytes, archivo.storagePath || null, eliminacionProgramada, archivo.datos || null]
  );
  return res.rows[0];
}

async function obtenerAdjunto(clinicaId, adjuntoId) {
  const res = await query(
    `SELECT a.* FROM ticket_adjuntos a JOIN tickets t ON t.id = a.ticket_id
     WHERE t.clinica_id = $1 AND a.id = $2`,
    [clinicaId, adjuntoId]
  );
  return res.rows[0] || null;
}

async function listarAdjuntosVencidos() {
  const res = await query(
    `SELECT * FROM ticket_adjuntos
     WHERE estado = 'active' AND eliminacion_programada_en IS NOT NULL AND eliminacion_programada_en <= now()`
  );
  return res.rows;
}

async function marcarAdjuntoEliminado(id, motivo) {
  await query(
    `UPDATE ticket_adjuntos SET estado = 'deleted_by_retention', eliminado_en = now(), motivo_eliminacion = $2, archivo = NULL WHERE id = $1`,
    [id, motivo]
  );
}

// --- Métricas para el dashboard del Helpdesk ---
async function metricas(clinicaId) {
  const res = await query(
    `SELECT
       COUNT(*) FILTER (WHERE estado = 'nuevo') AS nuevos,
       COUNT(*) FILTER (WHERE estado = 'abierto') AS abiertos,
       COUNT(*) FILTER (WHERE estado = 'en_espera') AS en_espera,
       COUNT(*) FILTER (WHERE estado = 'resuelto') AS resueltos,
       COUNT(*) FILTER (WHERE asignado_id IS NULL AND estado <> 'resuelto') AS sin_asignar,
       COUNT(*) AS total
     FROM tickets WHERE clinica_id = $1`,
    [clinicaId]
  );
  return res.rows[0];
}

module.exports = {
  listar, obtenerPorId, crear, actualizarEstado, asignar, agregarMensaje, listarMensajes,
  crearAdjunto, obtenerAdjunto, listarAdjuntosVencidos, marcarAdjuntoEliminado, metricas,
};
