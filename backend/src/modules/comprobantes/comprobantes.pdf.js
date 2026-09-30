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

module.exports = { comprobantePago, comprobantePresupuesto, comprobanteConsentimiento, comprobantePlanTratamiento };
