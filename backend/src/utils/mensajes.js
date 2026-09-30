/* Mensajes para pacientes (WhatsApp) y normalización de teléfonos de Paraguay.
   DOVA no envía mensajes solo (no hay API de WhatsApp contratada): arma el
   texto y el enlace wa.me para que la recepción lo envíe con un click, y
   deja registrado el contacto en "comunicaciones". */

// 0981 123 456 -> 595981123456 ; +595 981... -> 595981... ; 981123456 -> 595981123456
function normalizarTelefonoPy(tel) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('595')) return d.length >= 11 ? d : null;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length >= 8 && d.length <= 10) return '595' + d;
  return d.length > 10 ? d : null;
}

function enlaceWhatsapp(tel, texto) {
  const n = normalizarTelefonoPy(tel);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

function fmtDia(f) {
  const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const PLANTILLAS = {
  recall: ({ nombre, clinica, tipo, fecha }) =>
    `Hola ${nombre}, te saludamos de ${clinica}. Te recordamos que te corresponde tu ${tipo.toLowerCase()}${fecha ? ` (desde el ${fmtDia(fecha)})` : ''}. ¿Querés que te reservemos un turno? Respondé a este mensaje y coordinamos el día y horario.`,
  recordatorio_turno: ({ nombre, clinica, fecha, hora, odontologo }) =>
    `Hola ${nombre}, te recordamos tu turno en ${clinica} el ${fmtDia(fecha)} a las ${String(hora || '').slice(0, 5)}${odontologo ? ` con ${odontologo}` : ''}. Por favor confirmá respondiendo SÍ, o avisanos si necesitás reprogramar.`,
  cumpleanos: ({ nombre, clinica }) =>
    `¡Feliz cumpleaños, ${nombre}! Todo el equipo de ${clinica} te desea un excelente día. 🎉`,
  reactivacion: ({ nombre, clinica, meses }) =>
    `Hola ${nombre}, te extrañamos en ${clinica}. Hace ${meses} meses de tu última visita: un control a tiempo evita tratamientos más largos. ¿Te reservamos un turno?`,
  tratamiento_pendiente: ({ nombre, clinica, tratamiento }) =>
    `Hola ${nombre}, te escribimos de ${clinica}. Tenés pendiente ${tratamiento}. ¿Querés que coordinemos el turno para continuarlo?`,
  control: ({ nombre, clinica, titulo, fecha }) =>
    `Hola ${nombre}, te escribimos de ${clinica}. Te corresponde tu ${String(titulo).toLowerCase()} el ${fmtDia(fecha)}. ¿Coordinamos el turno?`,
  encuesta: ({ nombre, clinica }) =>
    `Hola ${nombre}, gracias por atenderte en ${clinica}. Del 0 al 10, ¿qué tan probable es que nos recomiendes a un familiar o amigo? Tu opinión nos ayuda a mejorar.`,
  cobranza: ({ nombre, clinica, monto }) =>
    `Hola ${nombre}, te escribimos de ${clinica}. Registramos un saldo pendiente de Gs. ${Number(monto || 0).toLocaleString('es-PY')}. Cualquier consulta sobre formas de pago, estamos a disposición.`,
  laboratorio_listo: ({ nombre, clinica, trabajo }) =>
    `Hola ${nombre}, te avisamos de ${clinica} que tu trabajo (${trabajo}) ya está listo. ¿Coordinamos el turno para colocarlo?`,
  postoperatorio: ({ nombre, clinica }) =>
    `Hola ${nombre}, ¿cómo te sentís después del procedimiento de hoy? Recordá seguir las indicaciones. Ante dolor intenso, sangrado que no para o fiebre, comunicate con ${clinica}.`,
};

module.exports = { normalizarTelefonoPy, enlaceWhatsapp, PLANTILLAS, fmtDia };
