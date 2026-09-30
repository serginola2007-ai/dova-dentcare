const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./helpdesk.repository');
const auditoria = require('../../utils/auditoria');
const notificaciones = require('../notificaciones/notificaciones.service');
const { query } = require('../../config/db');

const CATEGORIAS_VALIDAS = ['error', 'mejora', 'otro'];
const ESTADOS_VALIDOS = ['nuevo', 'abierto', 'en_espera', 'resuelto'];
const RETENCION_DIAS_ADJUNTOS = 30; // política inicial mensual (configurable a futuro, ver migración)

async function listar(clinicaId, usuario, filtros) {
  // Sin permiso de ver todos, cada usuario solo ve sus propios tickets.
  const soloPropios = !usuario.permisos.includes('helpdesk.view_all');
  return repo.listar(clinicaId, { ...filtros, soloPropios, usuarioId: usuario.id });
}

async function obtener(clinicaId, id, usuario) {
  const ticket = await repo.obtenerPorId(clinicaId, id);
  if (!ticket) throw new ApiError(404, 'Ticket no encontrado');
  const puedeVerTodos = usuario.permisos.includes('helpdesk.view_all');
  if (!puedeVerTodos && ticket.creador_id !== usuario.id && ticket.asignado_id !== usuario.id) {
    throw new ApiError(403, 'No tenés acceso a este ticket');
  }
  ticket.mensajes = await repo.listarMensajes(id);
  return ticket;
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.titulo || !datos.descripcion) throw new ApiError(400, 'Título y descripción son obligatorios');
  const categoria = datos.categoria || 'otro';
  if (!CATEGORIAS_VALIDAS.includes(categoria)) throw new ApiError(400, `Categoría inválida: ${CATEGORIAS_VALIDAS.join(', ')}`);

  const ticket = await repo.crear(clinicaId, { ...datos, categoria }, usuario.id);

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear_ticket', modulo: 'helpdesk', entidadId: ticket.id, detalle: { titulo: ticket.titulo },
  });

  // Notificar a todos los usuarios con permiso de ver todos los tickets (equipo Helpdesk).
  const helpdeskRes = await query(
    `SELECT DISTINCT u.id FROM usuarios u
     JOIN rol_permisos rp ON rp.rol_id = u.rol_id
     JOIN permisos p ON p.id = rp.permiso_id
     WHERE u.clinica_id = $1 AND p.codigo = 'helpdesk.view_all' AND u.activo = true`,
    [clinicaId]
  );
  for (const row of helpdeskRes.rows) {
    await notificaciones.notificar(clinicaId, row.id, {
      tipo: 'ticket_nuevo', titulo: 'Nuevo ticket de soporte', mensaje: ticket.titulo,
      entidad: 'ticket', entidadId: ticket.id, ruta: `/helpdesk/${ticket.id}`,
    });
  }

  return ticket;
}

async function cambiarEstado(clinicaId, id, estado, resolucion, usuario) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new ApiError(400, `Estado inválido: ${ESTADOS_VALIDOS.join(', ')}`);
  const ticket = await repo.actualizarEstado(clinicaId, id, estado, resolucion);
  if (!ticket) throw new ApiError(404, 'Ticket no encontrado');

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado_ticket', modulo: 'helpdesk', entidadId: id, detalle: { estado },
  });

  if (estado === 'resuelto') {
    await notificaciones.notificar(clinicaId, ticket.creador_id, {
      tipo: 'ticket_resuelto', titulo: `Tu ticket #${id} fue marcado como resuelto`,
      mensaje: resolucion || '', entidad: 'ticket', entidadId: id, ruta: `/helpdesk/${id}`,
    });
  }
  return ticket;
}

async function asignar(clinicaId, id, asignadoId, usuario) {
  const ticket = await repo.asignar(clinicaId, id, asignadoId);
  if (!ticket) throw new ApiError(404, 'Ticket no encontrado');
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'asignar_ticket', modulo: 'helpdesk', entidadId: id, detalle: { asignadoId },
  });
  return ticket;
}

async function agregarMensaje(clinicaId, ticketId, contenido, usuario) {
  const ticket = await repo.obtenerPorId(clinicaId, ticketId);
  if (!ticket) throw new ApiError(404, 'Ticket no encontrado');
  const puedeVerTodos = usuario.permisos.includes('helpdesk.view_all');
  if (!puedeVerTodos && ticket.creador_id !== usuario.id && ticket.asignado_id !== usuario.id) {
    throw new ApiError(403, 'No tenés acceso a este ticket');
  }
  if (!contenido || !contenido.trim()) throw new ApiError(400, 'El mensaje no puede estar vacío');

  const mensaje = await repo.agregarMensaje(ticketId, usuario.id, usuario.nombre, contenido.trim());

  const destinatario = usuario.id === ticket.creador_id ? ticket.asignado_id : ticket.creador_id;
  if (destinatario) {
    await notificaciones.notificar(clinicaId, destinatario, {
      tipo: 'ticket_respuesta', titulo: `Nueva respuesta en tu ticket #${ticketId}`,
      mensaje: contenido.trim().slice(0, 140), entidad: 'ticket', entidadId: ticketId, ruta: `/helpdesk/${ticketId}`,
    });
  }
  return mensaje;
}

/* Adjuntos: nombre interno seguro (nunca el original), validación de tipo,
   metadata de retención mensual (RETENCION_DIAS_ADJUNTOS). El archivo físico
   se guarda en uploads/tickets/<uuid><ext> vía multer; acá solo se registra
   metadata y se valida. */
const MIME_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4',
];
const TAMANIO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15MB

async function agregarAdjunto(clinicaId, ticketId, mensajeId, usuario, archivoMulter) {
  const ticket = await repo.obtenerPorId(clinicaId, ticketId);
  if (!ticket) {
    await fs.unlink(archivoMulter.path).catch(() => {});
    throw new ApiError(404, 'Ticket no encontrado');
  }
  const puedeVerTodos = usuario.permisos.includes('helpdesk.view_all');
  if (!puedeVerTodos && ticket.creador_id !== usuario.id && ticket.asignado_id !== usuario.id) {
    await fs.unlink(archivoMulter.path).catch(() => {});
    throw new ApiError(403, 'No tenés acceso a este ticket');
  }
  if (!MIME_PERMITIDOS.includes(archivoMulter.mimetype)) {
    await fs.unlink(archivoMulter.path).catch(() => {});
    throw new ApiError(400, `Tipo de archivo no permitido: ${archivoMulter.mimetype}`);
  }
  if (archivoMulter.size > TAMANIO_MAXIMO_BYTES) {
    await fs.unlink(archivoMulter.path).catch(() => {});
    throw new ApiError(400, 'El archivo supera el tamaño máximo permitido (15MB)');
  }

  const adjunto = await repo.crearAdjunto(ticketId, mensajeId, usuario.id, {
    nombreOriginal: archivoMulter.originalname,
    nombreInterno: path.basename(archivoMulter.path),
    mimeType: archivoMulter.mimetype,
    tamanioBytes: archivoMulter.size,
    storagePath: archivoMulter.path,
  }, RETENCION_DIAS_ADJUNTOS);

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'adjuntar_archivo', modulo: 'helpdesk', entidadId: ticketId, detalle: { nombre: adjunto.nombre_original },
  });
  return adjunto;
}

async function obtenerAdjuntoParaDescarga(clinicaId, adjuntoId, usuario) {
  const adjunto = await repo.obtenerAdjunto(clinicaId, adjuntoId);
  if (!adjunto) throw new ApiError(404, 'Adjunto no encontrado');
  if (adjunto.estado !== 'active') throw new ApiError(410, 'Archivo eliminado por política de retención');
  const ticket = await repo.obtenerPorId(clinicaId, adjunto.ticket_id);
  const puedeVerTodos = usuario.permisos.includes('helpdesk.view_all');
  if (!puedeVerTodos && ticket.creador_id !== usuario.id && ticket.asignado_id !== usuario.id) {
    throw new ApiError(403, 'No tenés acceso a este archivo');
  }
  return adjunto;
}

async function metricas(clinicaId) { return repo.metricas(clinicaId); }

/* Job de limpieza por retención. Diseñado para ejecutarse vía cron real en
   producción (ver documentación de despliegue) — este entorno de desarrollo
   no tiene un proceso permanente, así que se deja como script invocable
   (`npm run helpdesk:limpieza`) más que como un cron ya activo. Es
   idempotente y tolerante a archivos ya inexistentes en disco. */
async function ejecutarLimpiezaRetencion() {
  const vencidos = await repo.listarAdjuntosVencidos();
  let eliminados = 0;
  for (const adjunto of vencidos) {
    try {
      await fs.unlink(adjunto.storage_path);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[helpdesk-retencion] error borrando archivo', adjunto.id, err.message);
      // Tolerante: si el archivo ya no existe, igual marcamos el registro.
    }
    await repo.marcarAdjuntoEliminado(adjunto.id, 'Eliminado automáticamente por política de retención (30 días)');
    eliminados++;
  }
  return { revisados: vencidos.length, eliminados };
}

module.exports = {
  listar, obtener, crear, cambiarEstado, asignar, agregarMensaje,
  agregarAdjunto, obtenerAdjuntoParaDescarga, metricas, ejecutarLimpiezaRetencion,
  RETENCION_DIAS_ADJUNTOS, MIME_PERMITIDOS,
};
