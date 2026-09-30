const repo = require('./extras.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const { query } = require('../../config/db');
const pacientesRepo = require('../pacientes/pacientes.repository');

async function verificarPaciente(clinicaId, pacienteId) {
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  return paciente;
}

// ---- Fotos clínicas ----
async function listarFotos(clinicaId, pacienteId) {
  return repo.listarFotos(clinicaId, pacienteId);
}

async function crearFoto(clinicaId, datos, actor) {
  if (!datos.pacienteId || !datos.categoria || !datos.storagePath) {
    throw new ApiError(400, 'pacienteId, categoria y el archivo son requeridos');
  }
  await verificarPaciente(clinicaId, datos.pacienteId);
  const foto = await repo.crearFoto(clinicaId, { ...datos, subidoPor: actor.id });
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_foto_clinica', modulo: 'pacientes', entidadId: foto.id, detalle: { pacienteId: datos.pacienteId },
  });
  return foto;
}

async function eliminarFoto(clinicaId, id, actor) {
  const fs = require('fs');
  const foto = await repo.obtenerFoto(clinicaId, id);
  if (!foto) throw new ApiError(404, 'Foto no encontrada');
  await repo.eliminarFoto(clinicaId, id);
  try { fs.unlinkSync(foto.storage_path); } catch (_e) { /* archivo ya no existe, no es crítico */ }
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'eliminar_foto_clinica', modulo: 'pacientes', entidadId: id,
  });
  return { ok: true };
}

// ---- Estudios ----
async function listarEstudios(clinicaId, pacienteId) {
  return repo.listarEstudios(clinicaId, pacienteId);
}

async function crearEstudio(clinicaId, datos, actor) {
  if (!datos.pacienteId || !datos.tipo) throw new ApiError(400, 'pacienteId y tipo son requeridos');
  await verificarPaciente(clinicaId, datos.pacienteId);
  const estudio = await repo.crearEstudio(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_estudio', modulo: 'pacientes', entidadId: estudio.id, detalle: { pacienteId: datos.pacienteId, tipo: datos.tipo },
  });
  return estudio;
}

async function eliminarEstudio(clinicaId, id, actor) {
  const fs = require('fs');
  const estudio = await repo.obtenerEstudio(clinicaId, id);
  if (!estudio) throw new ApiError(404, 'Estudio no encontrado');
  await repo.eliminarEstudio(clinicaId, id);
  if (estudio.storage_path) { try { fs.unlinkSync(estudio.storage_path); } catch (_e) { /* no crítico */ } }
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'eliminar_estudio', modulo: 'pacientes', entidadId: id,
  });
  return { ok: true };
}

// ---- Consentimientos ----
const PLANTILLAS_CONSENTIMIENTO = {
  extraccion: 'Autorizo la extracción de la pieza dental indicada, habiendo sido informado/a de los riesgos, beneficios y alternativas del procedimiento.',
  endodoncia: 'Autorizo el tratamiento de endodoncia (tratamiento de conducto) en la pieza indicada, habiendo comprendido el procedimiento, sus riesgos y posibles complicaciones.',
  implante: 'Autorizo la colocación de implante(s) dental(es), habiendo sido informado/a sobre el procedimiento quirúrgico, tiempos de cicatrización, riesgos y cuidados posteriores.',
  ortodoncia: 'Autorizo el inicio de tratamiento de ortodoncia, comprendiendo su duración estimada, cuidados necesarios y posibles molestias durante el proceso.',
  blanqueamiento: 'Autorizo el procedimiento de blanqueamiento dental, habiendo sido informado/a sobre sensibilidad esperada y cuidados posteriores.',
  general: 'Autorizo el procedimiento odontológico indicado, habiendo sido informado/a de manera clara sobre su naturaleza, riesgos, beneficios y alternativas disponibles.',
};

async function listarConsentimientos(clinicaId, pacienteId) {
  return repo.listarConsentimientos(clinicaId, pacienteId);
}

async function plantillasConsentimiento() {
  return Object.entries(PLANTILLAS_CONSENTIMIENTO).map(([codigo, texto]) => ({ codigo, texto }));
}

async function crearConsentimiento(clinicaId, datos, actor) {
  if (!datos.pacienteId || !datos.procedimiento) throw new ApiError(400, 'pacienteId y procedimiento son requeridos');
  await verificarPaciente(clinicaId, datos.pacienteId);
  const texto = datos.texto || PLANTILLAS_CONSENTIMIENTO[datos.plantilla] || PLANTILLAS_CONSENTIMIENTO.general;
  const consentimiento = await repo.crearConsentimiento(clinicaId, { ...datos, texto });
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_consentimiento', modulo: 'pacientes', entidadId: consentimiento.id, detalle: { pacienteId: datos.pacienteId },
  });
  return consentimiento;
}

/* Firma digital: por ahora se guarda como imagen base64 de un canvas de firma
   dibujado en el frontend (preparación explícita para firma digital real,
   tal como pide el prompt maestro — no es una firma criptográfica todavía). */
async function firmarConsentimiento(clinicaId, id, datos, actor) {
  const existente = await repo.obtenerConsentimiento(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Consentimiento no encontrado');
  if (existente.estado === 'firmado') throw new ApiError(409, 'Este consentimiento ya fue firmado');
  if (!datos.firmaPaciente) throw new ApiError(400, 'Se requiere la firma del paciente');
  const consentimiento = await repo.firmarConsentimiento(clinicaId, id, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'firmar_consentimiento', modulo: 'pacientes', entidadId: id,
  });
  return consentimiento;
}

async function anularConsentimiento(clinicaId, id, actor) {
  const existente = await repo.obtenerConsentimiento(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Consentimiento no encontrado');
  const consentimiento = await repo.cambiarEstadoConsentimiento(clinicaId, id, 'anulado');
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'anular_consentimiento', modulo: 'pacientes', entidadId: id,
  });
  return consentimiento;
}

// ---- Recetas ----
async function listarRecetas(clinicaId, pacienteId) {
  return repo.listarRecetas(clinicaId, pacienteId);
}

async function obtenerReceta(clinicaId, id) {
  const receta = await repo.obtenerReceta(clinicaId, id);
  if (!receta) throw new ApiError(404, 'Receta no encontrada');
  return receta;
}

async function crearReceta(clinicaId, datos, actor) {
  if (!datos.pacienteId || !(datos.items || []).length) {
    throw new ApiError(400, 'pacienteId y al menos un medicamento son requeridos');
  }
  await verificarPaciente(clinicaId, datos.pacienteId);
  for (const it of datos.items) {
    if (!it.medicamento) throw new ApiError(400, 'Cada item de la receta requiere un medicamento');
  }
  const receta = await repo.crearReceta(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_receta', modulo: 'pacientes', entidadId: receta.id, detalle: { pacienteId: datos.pacienteId, items: datos.items.length },
  });
  return receta;
}

// ---- Lista de espera ----
async function listarListaEspera(clinicaId, filtros) {
  return repo.listarListaEspera(clinicaId, filtros);
}

async function crearListaEspera(clinicaId, datos, actor) {
  if (!datos.pacienteId) throw new ApiError(400, 'pacienteId es requerido');
  await verificarPaciente(clinicaId, datos.pacienteId);
  const item = await repo.crearListaEspera(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_lista_espera', modulo: 'agenda', entidadId: item.id,
  });
  return item;
}

async function actualizarEstadoListaEspera(clinicaId, id, estado, actor) {
  const ESTADOS_VALIDOS = ['esperando', 'contactado', 'asignado', 'cancelado'];
  if (!ESTADOS_VALIDOS.includes(estado)) throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  const existente = await repo.obtenerListaEsperaItem(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Registro de lista de espera no encontrado');
  const item = await repo.actualizarEstadoListaEspera(clinicaId, id, estado);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_estado_lista_espera', modulo: 'agenda', entidadId: id, detalle: { estado },
  });
  return item;
}

// ---- Laboratorio ----
const ESTADOS_LABORATORIO = ['solicitado', 'enviado', 'en_proceso', 'recibido', 'controlado', 'instalado', 'rehacer', 'entregado', 'cancelado'];

async function listarLaboratorio(clinicaId, filtros) {
  return repo.listarLaboratorio(clinicaId, filtros);
}

async function crearLaboratorio(clinicaId, datos, actor) {
  if (!datos.pacienteId) throw new ApiError(400, 'pacienteId es requerido');
  await verificarPaciente(clinicaId, datos.pacienteId);
  const item = await repo.crearLaboratorio(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_orden_laboratorio', modulo: 'clinica_ops', entidadId: item.id,
  });
  return item;
}

async function actualizarLaboratorio(clinicaId, id, datos, actor) {
  const existente = await repo.obtenerLaboratorioItem(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Orden de laboratorio no encontrada');
  const campos = {};
  if (datos.estado !== undefined) {
    if (!ESTADOS_LABORATORIO.includes(datos.estado)) {
      throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_LABORATORIO.join(', ')}`);
    }
    campos.estado = datos.estado;
    if (datos.estado === 'recibido' && !existente.fecha_recepcion) campos.fecha_recepcion = new Date().toISOString().slice(0, 10);
  }
  if (datos.fechaEstimada !== undefined) campos.fecha_estimada = datos.fechaEstimada;
  if (datos.costo !== undefined) campos.costo = datos.costo;
  if (datos.observaciones !== undefined) campos.observaciones = datos.observaciones;
  if (Object.keys(campos).length === 0) return existente;
  const item = await repo.actualizarLaboratorio(clinicaId, id, campos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_orden_laboratorio', modulo: 'clinica_ops', entidadId: id, detalle: campos,
  });
  return item;
}

// ---- WhatsApp: SOLO prepara el mensaje y la URL wa.me. NUNCA envía nada
// automáticamente — no hay integración con la API de WhatsApp Business.
// El usuario hace clic y su propio WhatsApp (web o app) abre con el texto
// precargado; el envío real lo hace la persona, no el sistema. ----
const PLANTILLAS_WHATSAPP = {
  recordatorio_turno: (d) => `Hola ${d.pacienteNombre}! Te recordamos tu turno en ${d.clinicaNombre} el ${d.fecha} a las ${d.hora}. Ante cualquier duda o si necesitás reprogramar, respondé este mensaje. ¡Te esperamos!`,
  confirmacion_turno: (d) => `Hola ${d.pacienteNombre}, confirmamos tu turno en ${d.clinicaNombre} para el ${d.fecha} a las ${d.hora}. ¡Nos vemos pronto!`,
  seguimiento_post_tratamiento: (d) => `Hola ${d.pacienteNombre}! Queríamos saber cómo te sentís después de tu último tratamiento en ${d.clinicaNombre}. Si tenés alguna molestia o consulta, no dudes en escribirnos.`,
  presupuesto_pendiente: (d) => `Hola ${d.pacienteNombre}, te recordamos que tenés un presupuesto pendiente de aprobación en ${d.clinicaNombre}. Cualquier consulta, estamos a disposición.`,
  cuota_vencida: (d) => `Hola ${d.pacienteNombre}, te recordamos que tenés una cuota pendiente de pago en ${d.clinicaNombre}. Cualquier consulta sobre tu plan de pagos, escribinos.`,
  lista_espera_disponible: (d) => `Hola ${d.pacienteNombre}! Se liberó un turno que puede interesarte en ${d.clinicaNombre}. ¿Te gustaría que te lo reservemos?`,
};

async function listarPlantillasWhatsapp() {
  return Object.keys(PLANTILLAS_WHATSAPP);
}

async function prepararMensajeWhatsapp(clinicaId, datos, actor) {
  const { pacienteId, plantilla, telefono, ...extra } = datos;
  if (!telefono) throw new ApiError(400, 'telefono es requerido para preparar el mensaje');
  if (!PLANTILLAS_WHATSAPP[plantilla]) throw new ApiError(400, 'Plantilla de mensaje no reconocida');

  let pacienteNombre = extra.pacienteNombre;
  if (pacienteId && !pacienteNombre) {
    const r = await query('SELECT nombre FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]);
    pacienteNombre = r.rows[0]?.nombre || 'paciente';
  }
  const clinicaRow = await query('SELECT nombre FROM clinicas WHERE id=$1', [clinicaId]);
  const clinicaNombre = clinicaRow.rows[0]?.nombre || 'la clínica';

  const texto = PLANTILLAS_WHATSAPP[plantilla]({ pacienteNombre, clinicaNombre, ...extra });
  const telefonoLimpio = String(telefono).replace(/[^\d+]/g, '');
  const urlWhatsapp = `https://wa.me/${telefonoLimpio.replace('+', '')}?text=${encodeURIComponent(texto)}`;

  await repo.registrarWhatsapp(clinicaId, { pacienteId, tipoMensaje: plantilla, usuarioId: actor.id });
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'preparar_mensaje_whatsapp', modulo: 'comunicacion', entidadId: pacienteId, detalle: { plantilla },
  });

  // IMPORTANTE: esto NO envía el mensaje. Solo devuelve el texto sugerido y
  // la URL de wa.me para que el usuario la abra y lo envíe él mismo.
  return { texto, urlWhatsapp, enviadoAutomaticamente: false };
}

async function listarHistorialWhatsapp(clinicaId, filtros) {
  return repo.listarWhatsapp(clinicaId, filtros);
}

module.exports = {
  listarFotos, crearFoto, eliminarFoto,
  listarEstudios, crearEstudio, eliminarEstudio,
  listarConsentimientos, plantillasConsentimiento, crearConsentimiento, firmarConsentimiento, anularConsentimiento,
  listarRecetas, obtenerReceta, crearReceta,
  listarListaEspera, crearListaEspera, actualizarEstadoListaEspera,
  listarLaboratorio, crearLaboratorio, actualizarLaboratorio,
  listarPlantillasWhatsapp, prepararMensajeWhatsapp, listarHistorialWhatsapp,
};
