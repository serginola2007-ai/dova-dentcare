const PDFDocument = require('pdfkit');
// Día calendario (AAAA-MM-DD) -> DD/MM/AAAA, sin pasar por husos horarios.
function fmtDia(f) {
  if (!f) return '-';
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(f).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' });
}


/* Generación de PDFs reales con pdfkit -- streaming directo a la response,
   sin archivos temporales. Todo el contenido viene de datos reales de la
   base (nunca placeholders "Lorem ipsum" ni montos inventados). Esto NO es
   facturación electrónica fiscal de Paraguay (eso requiere integración con
   un timbrado/SET real, explícitamente fuera de alcance de esta fase); es
   un comprobante interno imprimible/descargable. */

function encabezado(doc, clinica) {
  doc.fontSize(18).fillColor(clinica.color_primario || '#C1673F').text(clinica.nombre || 'DOVA', { align: 'left' });
  doc.fontSize(9).fillColor('#555555');
  const lineas = [clinica.direccion, clinica.telefono, clinica.email].filter(Boolean);
  lineas.forEach((l) => doc.text(l));
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke();
  doc.moveDown(1);
  doc.fillColor('#000000');
}

function pie(doc) {
  doc.fontSize(8).fillColor('#999999');
  doc.text(`Generado por DOVA el ${new Date().toLocaleString('es-PY')}`, 50, 780, { align: 'center', width: 495 });
}

function comprobantePago(res, { clinica, pago, paciente }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="comprobante-pago-${pago.id}.pdf"`);
  doc.pipe(res);

  encabezado(doc, clinica);
  doc.fontSize(14).text('Comprobante de Pago', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10);
  doc.text(`N° de comprobante: ${pago.id}`);
  doc.text(`Fecha: ${new Date(pago.fecha).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' })}`);
  doc.text(`Paciente: ${paciente.nombre} ${paciente.apellido}`);
  if (paciente.ci) doc.text(`C.I.: ${paciente.ci}`);
  doc.moveDown(1);

  doc.fontSize(11).text('Detalle', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Concepto: ${pago.concepto || 'Pago de servicios odontológicos'}`);
  doc.text(`Método de pago: ${pago.metodo}`);
  doc.text(`Estado: ${pago.estado}`);
  doc.moveDown(0.5);
  doc.fontSize(13).text(`Monto: Gs. ${Number(pago.monto).toLocaleString('es-PY')}`, { align: 'right' });

  pie(doc);
  doc.end();
}

function comprobantePresupuesto(res, { clinica, presupuesto, items, paciente }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="presupuesto-${presupuesto.id}.pdf"`);
  doc.pipe(res);

  encabezado(doc, clinica);
  doc.fontSize(14).text('Presupuesto Odontológico', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10);
  doc.text(`N°: ${presupuesto.id}`);
  doc.text(`Fecha: ${new Date(presupuesto.creado_en).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' })}`);
  doc.text(`Paciente: ${paciente.nombre} ${paciente.apellido}`);
  doc.text(`Estado: ${presupuesto.estado}`);
  doc.moveDown(1);

  doc.fontSize(11).text('Tratamientos', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9);
  const colX = [50, 280, 340, 400, 470];
  doc.text('Descripción', colX[0], doc.y, { continued: false });
  let y = doc.y;
  doc.text('Pieza', colX[1], y);
  doc.text('Cant.', colX[2], y);
  doc.text('Precio', colX[3], y);
  doc.text('Subtotal', colX[4], y);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke();
  doc.moveDown(0.3);

  let total = 0;
  items.forEach((it) => {
    const subtotal = Number(it.cantidad) * Number(it.precio_unitario);
    total += subtotal;
    const rowY = doc.y;
    doc.text(it.descripcion, colX[0], rowY, { width: 220 });
    doc.text(it.pieza || '-', colX[1], rowY);
    doc.text(String(it.cantidad), colX[2], rowY);
    doc.text(Number(it.precio_unitario).toLocaleString('es-PY'), colX[3], rowY);
    doc.text(subtotal.toLocaleString('es-PY'), colX[4], rowY);
    doc.moveDown(0.6);
  });

  if (presupuesto.descuento_porcentaje > 0) {
    const descuento = total * (Number(presupuesto.descuento_porcentaje) / 100);
    doc.moveDown(0.5);
    doc.text(`Subtotal: Gs. ${total.toLocaleString('es-PY')}`, { align: 'right' });
    doc.text(`Descuento (${presupuesto.descuento_porcentaje}%): -Gs. ${descuento.toLocaleString('es-PY')}`, { align: 'right' });
  }
  doc.moveDown(0.3);
  doc.fontSize(13).text(`Total: Gs. ${Number(presupuesto.total).toLocaleString('es-PY')}`, { align: 'right' });

  pie(doc);
  doc.end();
}

function comprobanteConsentimiento(res, { clinica, consentimiento, paciente }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consentimiento-${consentimiento.id}.pdf"`);
  doc.pipe(res);

  encabezado(doc, clinica);
  doc.fontSize(14).text('Consentimiento Informado', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10);
  doc.text(`Paciente: ${paciente.nombre} ${paciente.apellido}`);
  if (paciente.ci) doc.text(`C.I.: ${paciente.ci}`);
  doc.text(`Procedimiento: ${consentimiento.procedimiento}`);
  doc.text(`Fecha: ${fmtDia(consentimiento.fecha)}`);
  doc.text(`Estado: ${consentimiento.estado}`);
  doc.moveDown(1);

  doc.fontSize(11).text('Texto del consentimiento', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).text(consentimiento.texto, { align: 'justify' });
  doc.moveDown(2);

  if (consentimiento.estado === 'firmado') {
    doc.fontSize(10).text('Firmado electrónicamente por el paciente.', { italics: true });
  } else {
    doc.fontSize(10).fillColor('#B00020').text('PENDIENTE DE FIRMA');
    doc.fillColor('#000000');
  }

  pie(doc);
  doc.end();
}

function comprobantePlanTratamiento(res, { clinica, plan, sesiones, paciente }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="plan-tratamiento-${plan.id}.pdf"`);
  doc.pipe(res);

  encabezado(doc, clinica);
  doc.fontSize(14).text('Plan de Tratamiento', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10);
  doc.text(`Paciente: ${paciente.nombre} ${paciente.apellido}`);
  doc.text(`Estado: ${plan.estado}`);
  doc.text(`Sesiones: ${plan.sesiones_realizadas} de ${plan.sesiones_totales}`);
  doc.moveDown(1);

  doc.fontSize(11).text('Historial de sesiones', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9);
  sesiones.forEach((s) => {
    doc.text(`Sesión ${s.numero} — ${fmtDia(s.fecha)} — ${s.procedimiento || 'Sesión registrada'}${s.odontologo_nombre ? ' (' + s.odontologo_nombre + ')' : ''}`);
  });

  pie(doc);
  doc.end();
}

// Receta: datos reales de la receta, del paciente y del profesional.
function comprobanteReceta(res, { clinica, receta, paciente }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receta-${receta.id}.pdf"`);
  doc.pipe(res);
  encabezado(doc, clinica);
  doc.fontSize(16).fillColor('#000000').text('Receta', { align: 'center' });
  doc.moveDown(0.8);
  doc.fontSize(10);
  const edad = (() => {
    if (!paciente.fecha_nacimiento) return null;
    const n = new Date(`${String(paciente.fecha_nacimiento).slice(0, 10)}T12:00:00Z`); const h = new Date();
    let a = h.getUTCFullYear() - n.getUTCFullYear(); if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) a -= 1;
    return a >= 0 ? a : null;
  })();
  doc.text(`Paciente: ${paciente.nombre} ${paciente.apellido}${paciente.ci ? `   C.I.: ${paciente.ci}` : ''}${edad !== null ? `   Edad: ${edad} años` : ''}`);
  doc.text(`Fecha: ${fmtDia(receta.fecha)}   N.º ${receta.id}`);
  doc.moveDown(1);
  doc.fontSize(12).text('Rp/', { continued: false });
  doc.moveDown(0.4);
  (receta.items || []).forEach((it, i) => {
    doc.fontSize(11).fillColor('#000000').text(`${i + 1}. ${[it.medicamento, it.concentracion, it.presentacion].filter(Boolean).join(' ')}`);
    const uso = [it.dosis, it.frecuencia, it.duracion ? `durante ${it.duracion}` : null, it.via ? `vía ${it.via}` : null].filter(Boolean).join(' · ');
    doc.fontSize(10).fillColor('#333333');
    if (uso) doc.text(`   ${uso}`);
    if (it.indicaciones) doc.text(`   ${it.indicaciones}`);
    doc.moveDown(0.5);
  });
  if (receta.indicaciones) {
    doc.moveDown(0.5).fontSize(11).fillColor('#000000').text('Indicaciones');
    doc.fontSize(10).fillColor('#333333').text(receta.indicaciones);
  }
  // Firma del profesional
  const y = Math.max(doc.y + 60, 640);
  doc.moveTo(330, y).lineTo(545, y).strokeColor('#999999').stroke();
  doc.fontSize(10).fillColor('#000000').text(receta.odontologo_nombre || 'Profesional', 330, y + 6, { width: 215, align: 'center' });
  doc.fontSize(9).fillColor('#555555');
  if (receta.odontologo_matricula) doc.text(`Matrícula ${receta.odontologo_matricula}`, 330, doc.y, { width: 215, align: 'center' });
  if (receta.odontologo_especialidad) doc.text(receta.odontologo_especialidad, 330, doc.y, { width: 215, align: 'center' });
  if (receta.estado === 'anulada') {
    doc.save().rotate(-30, { origin: [300, 400] }).fontSize(72).fillColor('#C62828').opacity(0.25).text('ANULADA', 80, 360, { width: 450, align: 'center' }).restore();
    doc.opacity(1).fontSize(9).fillColor('#C62828').text(`Anulada: ${receta.anulada_motivo || ''}`, 50, 740, { width: 495 });
  }
  pie(doc);
  doc.end();
}

module.exports = { comprobantePago, comprobantePresupuesto, comprobanteConsentimiento, comprobantePlanTratamiento, comprobanteReceta };
