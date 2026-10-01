/* PDF real (pdfkit) de una factura / comprobante interno de DOVA.
   Todo sale de la base: datos de la clínica (configuración de facturación),
   del cliente tal como se emitió, ítems, totales calculados en el servidor,
   cobros y estado. Deja claro que es un COMPROBANTE INTERNO: DOVA todavía no
   está integrado con un sistema fiscal, así que no se presenta como factura
   fiscal válida. */
const PDFDocument = require('pdfkit');

const COLOR = '#2B2420';
const ACENTO = '#C1673F';
const GRIS = '#6B6055';
const LINEA = '#E4DACA';
const gs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
const num = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY');
function fmtDia(f) {
  if (!f) return '-';
  const m = String(f instanceof Date ? f.toISOString() : f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f);
}
const fmtFechaHora = (f) => (f ? new Date(f).toLocaleString('es-PY', { timeZone: 'America/Asuncion', dateStyle: 'short', timeStyle: 'short' }) : '-');

// ---- Número en letras (guaraníes, sin decimales) ----
const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function menorMil(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100); const r = n % 100;
  let t = '';
  if (r < 30) t = U[r];
  else { const d = Math.floor(r / 10); const u = r % 10; t = D[d] + (u ? ` y ${U[u]}` : ''); }
  return [C[c], t].filter(Boolean).join(' ');
}
function enLetras(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1e6); const miles = Math.floor((n % 1e6) / 1000); const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${menorMil(millones)} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${menorMil(miles)} mil`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(' ');
}

const ESTADOS = { pagada: 'PAGADA', pendiente: 'PENDIENTE DE COBRO', anulada: 'ANULADA', emitida: 'EMITIDA' };

function generar(res, { factura: f, config: cfg, logo, metodos, disposicion = 'inline' }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Comprobante ${f.numero_completo}`, Author: cfg.nombre_comercial || 'DOVA', Creator: 'DOVA' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposicion}; filename="comprobante-${f.numero_completo}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
  const W = doc.page.width; const M = 40; const ancho = W - M * 2;
  const nombreMetodo = (c) => (metodos.find((m) => m.codigo === c) || {}).nombre || c || '-';

  // ---------------- Encabezado ----------------
  let x = M; const y0 = M;
  if (logo && logo.logo) {
    try { doc.image(logo.logo, M, y0, { fit: [80, 60] }); x = M + 92; } catch (_e) { /* imagen ilegible: se omite */ }
  }
  doc.fillColor(COLOR).font('Helvetica-Bold').fontSize(15).text(cfg.nombre_comercial || 'Consultorio', x, y0, { width: 300 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
  [cfg.razon_social, cfg.ruc ? `RUC: ${cfg.ruc}` : null, cfg.direccion, [cfg.telefono, cfg.email].filter(Boolean).join(' · ')].filter(Boolean)
    .forEach((l) => doc.text(l, x, doc.y, { width: 300 }));
  const altoIzq = doc.y;

  // Recuadro del comprobante
  const bx = W - M - 190; const bw = 190;
  doc.roundedRect(bx, y0, bw, 92, 6).lineWidth(1).strokeColor(ACENTO).stroke();
  doc.fillColor(ACENTO).font('Helvetica-Bold').fontSize(11).text('COMPROBANTE INTERNO', bx, y0 + 8, { width: bw, align: 'center' });
  doc.fillColor(GRIS).font('Helvetica').fontSize(7).text('Documento no fiscal emitido por DOVA', bx, doc.y + 1, { width: bw, align: 'center' });
  doc.fillColor(COLOR).font('Helvetica-Bold').fontSize(13).text(`N.º ${f.numero_completo}`, bx, y0 + 38, { width: bw, align: 'center' });
  doc.font('Helvetica').fontSize(9).text(`Fecha: ${fmtDia(f.fecha)}`, bx, y0 + 58, { width: bw, align: 'center' });
  doc.text(`Condición: ${f.condicion === 'credito' ? 'Crédito' : 'Contado'}`, bx, y0 + 71, { width: bw, align: 'center' });

  let y = Math.max(altoIzq, y0 + 92) + 14;

  // ---------------- Cliente ----------------
  doc.roundedRect(M, y, ancho, 66, 6).fillColor('#F7F3EC').fill();
  doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(7.5).text('CLIENTE', M + 10, y + 8);
  doc.fillColor(COLOR).font('Helvetica-Bold').fontSize(11).text(f.cliente_nombre, M + 10, y + 19, { width: ancho / 2 });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR);
  const izq = [f.cliente_documento ? `C.I.: ${f.cliente_documento}` : null, f.cliente_ruc ? `RUC: ${f.cliente_ruc}` : null].filter(Boolean).join('    ');
  if (izq) doc.text(izq, M + 10, y + 35, { width: ancho / 2 });
  if (f.cliente_direccion) doc.text(f.cliente_direccion, M + 10, y + 48, { width: ancho / 2 - 10, height: 12, ellipsis: true });
  const der = [f.cliente_telefono ? `Tel.: ${f.cliente_telefono}` : null, f.cliente_email, f.odontologo_nombre ? `Odontólogo/a: ${f.odontologo_nombre}` : null, f.presupuesto_id ? `Presupuesto N.º ${f.presupuesto_id}` : null].filter(Boolean);
  der.forEach((l, i) => doc.text(l, M + ancho / 2 + 10, y + 19 + i * 12, { width: ancho / 2 - 20 }));
  y += 80;

  // ---------------- Detalle ----------------
  const cols = [
    { t: 'Cant.', w: 38, a: 'right' }, { t: 'Descripción', w: 203, a: 'left' }, { t: 'Precio unit.', w: 72, a: 'right' },
    { t: 'Desc.', w: 56, a: 'right' }, { t: 'IVA', w: 44, a: 'center' }, { t: 'Subtotal', w: ancho - 38 - 203 - 72 - 56 - 44, a: 'right' },
  ];
  const cabecera = () => {
    doc.rect(M, y, ancho, 18).fillColor(COLOR).fill();
    let cx = M;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c) => { doc.text(c.t, cx + 4, y + 5, { width: c.w - 8, align: c.a }); cx += c.w; });
    y += 20;
  };
  cabecera();
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR);
  f.items.forEach((it, i) => {
    const desc = `${it.descripcion}${it.pieza ? ` (pieza ${it.pieza})` : ''}`;
    const alto = Math.max(doc.heightOfString(desc, { width: cols[1].w - 8 }), 10) + 8;
    if (y + alto > doc.page.height - 200) { doc.addPage(); y = M; cabecera(); doc.font('Helvetica').fontSize(8.5).fillColor(COLOR); }
    if (i % 2) doc.rect(M, y - 2, ancho, alto).fillColor('#FBF8F3').fill();
    doc.fillColor(COLOR);
    const vals = [Number(it.cantidad) % 1 ? Number(it.cantidad).toLocaleString('es-PY') : num(it.cantidad), desc, num(it.precio_unitario), Number(it.descuento) ? num(it.descuento) : '-', it.tasa_iva ? `${it.tasa_iva}%` : 'Exenta', num(it.subtotal)];
    let cx = M;
    cols.forEach((c, j) => { doc.text(vals[j], cx + 4, y + 2, { width: c.w - 8, align: c.a }); cx += c.w; });
    y += alto;
    doc.moveTo(M, y - 2).lineTo(M + ancho, y - 2).lineWidth(0.5).strokeColor(LINEA).stroke();
  });

  // ---------------- Totales ----------------
  if (y > doc.page.height - 230) { doc.addPage(); y = M; }
  y += 8;
  const yTotales = y;
  const tx = M + ancho - 230; const tw = 230;
  const fila = (etq, val, fuerte) => {
    doc.font(fuerte ? 'Helvetica-Bold' : 'Helvetica').fontSize(fuerte ? 11 : 8.5).fillColor(fuerte ? COLOR : GRIS)
      .text(etq, tx, y, { width: 130 }).text(val, tx + 130, y, { width: tw - 130, align: 'right' });
    y += fuerte ? 18 : 12;
  };
  fila('Subtotal', gs(f.subtotal));
  if (Number(f.descuento_total)) fila('Descuentos', `- ${gs(f.descuento_total)}`);
  if (Number(f.exento)) fila('Exentas', gs(f.exento));
  if (Number(f.gravado_5)) fila('Gravadas 5%', gs(f.gravado_5));
  if (Number(f.gravado_10)) fila('Gravadas 10%', gs(f.gravado_10));
  if (Number(f.iva_5)) fila('IVA 5% (incluido)', gs(f.iva_5));
  if (Number(f.iva_10)) fila('IVA 10% (incluido)', gs(f.iva_10));
  fila('Total IVA', gs(Number(f.iva_5) + Number(f.iva_10)));
  doc.moveTo(tx, y).lineTo(tx + tw, y).lineWidth(1).strokeColor(ACENTO).stroke(); y += 6;
  fila('TOTAL', gs(f.total), true);

  // Lado izquierdo (a la par de los totales): en letras, pago y estado
  const yFinTotales = y;
  const lx = M; const lw = ancho - tw - 20;
  const yy = yTotales;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('SON GUARANÍES', lx, yy, { width: lw });
  const letras = enLetras(f.total);
  doc.font('Helvetica').fontSize(9).fillColor(COLOR).text(letras.charAt(0).toUpperCase() + letras.slice(1) + '.', lx, doc.y + 1, { width: lw });
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('FORMA DE PAGO', lx, doc.y, { width: lw });
  const metodosUsados = [...new Set([f.metodo_pago, ...(f.pagos || []).filter((p) => p.activo && p.estado === 'pagado').map((p) => p.metodo)].filter(Boolean))].map(nombreMetodo);
  doc.font('Helvetica').fontSize(9).fillColor(COLOR).text(metodosUsados.join(', ') || (f.condicion === 'credito' ? 'A crédito' : '-'), lx, doc.y + 1, { width: lw });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(`Cobrado: ${gs(f.cobrado)}${Number(f.acreditado) ? `   ·   Notas de crédito: ${gs(f.acreditado)}` : ''}   ·   Saldo: ${gs(f.saldo)}`, lx, doc.y, { width: lw });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(f.estado === 'anulada' ? '#B8443A' : f.estado === 'pagada' ? '#5F7259' : ACENTO).text(`Estado: ${ESTADOS[f.estado] || f.estado}`, lx, doc.y + 3, { width: lw });

  y = Math.max(yFinTotales, doc.y) + 14;
  if (f.observaciones) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('OBSERVACIONES', M, y);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR).text(f.observaciones, M, doc.y + 1, { width: ancho });
    y = doc.y + 10;
  }
  if (f.estado === 'anulada') {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#B8443A').text(`ANULADA el ${fmtFechaHora(f.anulada_en)}${f.anulada_por_nombre ? ` por ${f.anulada_por_nombre}` : ''}. Motivo: ${f.motivo_anulacion || '-'}`, M, y, { width: ancho });
    y = doc.y + 10;
  }
  if ((f.notas_credito || []).length) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('NOTAS DE CRÉDITO INTERNAS', M, y);
    f.notas_credito.forEach((n) => doc.font('Helvetica').fontSize(8.5).fillColor(COLOR).text(`${n.numero_completo} - ${fmtDia(n.fecha)} - ${gs(n.monto)} - ${n.motivo}${n.estado === 'anulada' ? ' (anulada)' : ''}`, M, doc.y + 1, { width: ancho }));
  }

  // ---------------- Marca de agua y pie en todas las páginas ----------------
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const margenInf = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // el pie va dentro del margen: sin esto pdfkit agrega páginas en blanco
    if (f.estado === 'anulada') {
      doc.save().rotate(-30, { origin: [W / 2, doc.page.height / 2] }).font('Helvetica-Bold').fontSize(90).fillColor('#B8443A').fillOpacity(0.12)
        .text('ANULADA', 0, doc.page.height / 2 - 50, { width: W, align: 'center' }).restore();
      doc.fillOpacity(1);
    }
    const py = doc.page.height - 70;
    doc.moveTo(M, py).lineTo(W - M, py).lineWidth(0.5).strokeColor(LINEA).stroke();
    if (cfg.pie_texto) doc.font('Helvetica').fontSize(8).fillColor(COLOR).text(cfg.pie_texto, M, py + 6, { width: ancho, align: 'center', height: 22, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor(GRIS)
      .text('Comprobante interno generado por DOVA. No reemplaza a la factura fiscal (timbrada o electrónica) exigida por la SET.', M, py + 30, { width: ancho, align: 'center' })
      .text(`Emitido por ${f.creado_por_nombre || '-'} el ${fmtFechaHora(f.creado_en)}  ·  Página ${i - rango.start + 1} de ${rango.count}`, M, py + 40, { width: ancho, align: 'center' });
    doc.page.margins.bottom = margenInf;
  }
  doc.end();
}

// Reporte de facturación (exportación a PDF).
function reporte(res, { config: cfg, rep, titulo }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-facturacion.pdf"');
  doc.pipe(res);
  const M = 40; const ancho = doc.page.width - M * 2;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR).text(cfg.nombre_comercial || 'DOVA');
  doc.font('Helvetica').fontSize(11).fillColor(ACENTO).text(titulo);
  doc.fontSize(8.5).fillColor(GRIS).text(`Período: ${rep.desde ? fmtDia(rep.desde) : 'inicio'} a ${rep.hasta ? fmtDia(rep.hasta) : 'hoy'}  ·  Generado el ${fmtFechaHora(new Date())}`);
  doc.moveDown(0.8);
  const t = rep.totales;
  [['Facturas emitidas', String(t.emitidas)], ['Total facturado', gs(t.facturado)], ['Total cobrado', gs(t.cobrado)], ['Notas de crédito', gs(t.acreditado)], ['Total pendiente', gs(t.pendiente)], ['Facturas anuladas', `${t.anuladas} (${gs(t.totalAnulado)})`]]
    .forEach(([a, b]) => { doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(a, M, doc.y, { continued: true, width: 200 }).font('Helvetica-Bold').fillColor(COLOR).text(`   ${b}`); });
  doc.moveDown(0.8);
  const cols = [{ t: 'Detalle', w: ancho - 4 * 85 }, { t: 'Facturas', w: 85 }, { t: 'Facturado', w: 85 }, { t: 'Cobrado', w: 85 }, { t: 'Pendiente', w: 85 }];
  let y = doc.y;
  const cab = () => { doc.rect(M, y, ancho, 18).fillColor(COLOR).fill(); let cx = M; doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8); cols.forEach((c, i) => { doc.text(c.t, cx + 4, y + 5, { width: c.w - 8, align: i ? 'right' : 'left' }); cx += c.w; }); y += 20; };
  cab();
  doc.font('Helvetica').fontSize(8.5);
  rep.filas.forEach((f, i) => {
    if (y > doc.page.height - 70) { doc.addPage(); y = M; cab(); doc.font('Helvetica').fontSize(8.5); }
    if (i % 2) doc.rect(M, y - 2, ancho, 15).fillColor('#FBF8F3').fill();
    const v = [f.etiqueta, String(f.facturas), num(f.total), num(f.cobrado), num(f.pendiente)];
    let cx = M; doc.fillColor(COLOR);
    cols.forEach((c, j) => { doc.text(v[j], cx + 4, y, { width: c.w - 8, align: j ? 'right' : 'left', height: 12, ellipsis: true }); cx += c.w; });
    y += 15;
  });
  if (!rep.filas.length) doc.fillColor(GRIS).text('Sin facturas en el período.', M, y + 4);
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(`DOVA · Reporte interno de facturación (no fiscal) · Página ${i - rango.start + 1} de ${rango.count}`, M, doc.page.height - 40, { width: ancho, align: 'center' });
  }
  doc.end();
}

module.exports = { generar, reporte, enLetras };
