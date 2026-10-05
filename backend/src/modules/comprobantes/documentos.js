/* Documentos clínicos y de cuenta en PDF, con datos reales de la base:
   - Historia clínica completa del paciente
   - Una consulta
   - Estado de cuenta
   Cada exportación de historia clínica queda en la auditoría. */
const PDFDocument = require('pdfkit');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const clinicaRepo = require('../clinica/clinica.repository');

const dia = (f) => { if (!f) return '-'; const m = String(f instanceof Date ? f.toISOString() : f).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f); };
const gs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
const SEXO = { F: 'Femenino', M: 'Masculino', X: 'Otro' };
const edad = (f) => {
  if (!f) return null; const n = new Date(`${String(f).slice(0, 10)}T12:00:00Z`); const h = new Date();
  let a = h.getUTCFullYear() - n.getUTCFullYear(); if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) a -= 1;
  return a >= 0 ? a : null;
};

function nuevoDoc(res, nombre) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}.pdf"`);
  doc.pipe(res);
  return doc;
}
function cabecera(doc, clinica, titulo) {
  doc.fontSize(16).fillColor(clinica.color_primario || '#C1673F').text(clinica.nombre || 'DOVA');
  doc.fontSize(8.5).fillColor('#555555').text([clinica.direccion, clinica.telefono, clinica.email].filter(Boolean).join(' · '));
  doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke();
  doc.moveDown(0.8).fontSize(15).fillColor('#000000').text(titulo, { align: 'center' });
  doc.moveDown(0.8);
}
function datosPaciente(doc, p) {
  const e = edad(p.fecha_nacimiento);
  doc.fontSize(10).fillColor('#000000').text(`Paciente: ${p.nombre} ${p.apellido}`, { continued: false });
  doc.fillColor('#333333').text([p.ci ? `C.I. ${p.ci}` : null, e !== null ? `${e} años` : null, SEXO[p.sexo], p.telefono ? `Tel. ${p.telefono}` : null].filter(Boolean).join(' · '));
  doc.moveDown(0.6);
}
function titulo(doc, t) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.4).fontSize(11.5).fillColor('#8F4F32').text(t);
  doc.moveDown(0.2).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#EEEEEE').stroke();
  doc.moveDown(0.3).fillColor('#000000');
}
function campo(doc, etiqueta, valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return;
  if (doc.y > 760) doc.addPage();
  doc.fontSize(9.5).fillColor('#555555').text(`${etiqueta}: `, { continued: true }).fillColor('#000000').text(String(valor));
}
function numerar(doc) {
  const r = doc.bufferedPageRange();
  for (let i = r.start; i < r.start + r.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7.5).fillColor('#999999').text(`Generado por DOVA el ${new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' })} · Página ${i + 1} de ${r.count}`, 50, 805, { width: 495, align: 'center', lineBreak: false });
  }
}
async function paciente(clinicaId, id) {
  const p = (await query('SELECT * FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(id)])).rows[0];
  if (!p) throw new ApiError(404, 'Paciente no encontrado');
  return p;
}
const CAMPOS_HC = [['motivo_consulta', 'Motivo'], ['anamnesis', 'Anamnesis'], ['diagnostico', 'Diagnóstico'], ['diagnostico_diferencial', 'Diagnóstico diferencial'],
  ['piezas', 'Piezas'], ['procedimiento', 'Procedimiento'], ['anestesia', 'Anestesia'], ['materiales', 'Materiales'], ['evolucion', 'Evolución'],
  ['complicaciones', 'Complicaciones'], ['observaciones', 'Observaciones'], ['indicaciones', 'Indicaciones'], ['medicacion', 'Medicación'], ['proxima_accion', 'Próximo paso']];
function consultaEnDoc(doc, h) {
  if (doc.y > 700) doc.addPage();
  doc.fontSize(10.5).fillColor('#000000').text(`${dia(h.fecha)} — ${h.odontologo_nombre || 'Profesional no indicado'}${h.enmendada_de_id ? '  (ENMIENDA)' : ''}${h.firmada ? '' : '  (borrador sin firmar)'}`);
  if (h.enmendada_de_id) campo(doc, 'Motivo de la enmienda', h.motivo_enmienda);
  for (const [k, t] of CAMPOS_HC) campo(doc, t, k === 'piezas' && Array.isArray(h[k]) ? h[k].join(', ') : h[k]);
  if (h.firmada_en) doc.fontSize(8).fillColor('#777777').text(`Firmada el ${new Date(h.firmada_en).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })}`);
  doc.moveDown(0.6);
}

async function historiaClinica(clinicaId, pacienteId, res, usuario) {
  const p = await paciente(clinicaId, pacienteId);
  const [clinica, alergias, meds, hcs, odo, planes] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    query('SELECT sustancia, reaccion, severidad FROM paciente_alergias WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY sustancia', [clinicaId, p.id]).then((r) => r.rows),
    query('SELECT medicamento, dosis, frecuencia FROM paciente_medicacion WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY medicamento', [clinicaId, p.id]).then((r) => r.rows),
    query(`SELECT h.*, o.nombre AS odontologo_nombre FROM historia_clinica h LEFT JOIN odontologos o ON o.id=h.odontologo_id
            WHERE h.clinica_id=$1 AND h.paciente_id=$2 ORDER BY h.fecha DESC, h.id DESC`, [clinicaId, p.id]).then((r) => r.rows),
    query('SELECT pieza, superficie, estado, observacion FROM odontograma_piezas WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY pieza, superficie', [clinicaId, p.id]).then((r) => r.rows).catch(() => []),
    query(`SELECT pt.id, pt.nombre, pt.pieza, pt.estado, pt.fecha_inicio, (SELECT json_agg(json_build_object('nombre', e.nombre, 'estado', e.estado, 'fecha', e.fecha) ORDER BY e.orden, e.id) FROM etapas_tratamiento e WHERE e.plan_id=pt.id) AS etapas
             FROM planes_tratamiento pt WHERE pt.clinica_id=$1 AND pt.paciente_id=$2 ORDER BY pt.id DESC`, [clinicaId, p.id]).then((r) => r.rows),
  ]);
  const doc = nuevoDoc(res, `historia-clinica-${p.apellido}-${p.nombre}`.replace(/\s+/g, '-'));
  cabecera(doc, clinica, 'Historia clínica');
  datosPaciente(doc, p);
  titulo(doc, 'Antecedentes y alertas');
  campo(doc, 'Alergias', [...alergias.map((a) => `${a.sustancia}${a.severidad ? ` (${a.severidad})` : ''}${a.reaccion ? `: ${a.reaccion}` : ''}`), p.alergias].filter(Boolean).join('; ') || 'Sin alergias registradas');
  campo(doc, 'Medicación actual', [...meds.map((m) => [m.medicamento, m.dosis, m.frecuencia].filter(Boolean).join(' ')), p.medicamentos].filter(Boolean).join('; ') || 'Sin medicación registrada');
  campo(doc, 'Antecedentes médicos', p.antecedentes_medicos);
  campo(doc, 'Antecedentes odontológicos', p.antecedentes_odontologicos);
  campo(doc, 'Grupo sanguíneo', p.grupo_sanguineo);
  if (odo.length) {
    titulo(doc, 'Odontograma (estado actual)');
    doc.fontSize(9.5).fillColor('#000000').text(odo.map((o) => `${o.pieza}${o.superficie && !['completa','general'].includes(o.superficie) ? ` (${o.superficie})` : ''}: ${String(o.estado).replace(/_/g, ' ')}`).join(' · '));
  }
  if (planes.length) {
    titulo(doc, 'Tratamientos');
    for (const pl of planes) {
      if (doc.y > 760) doc.addPage();
      doc.fontSize(10).fillColor('#000000').text(`${pl.nombre}${pl.pieza ? ` · pieza ${pl.pieza}` : ''} — ${String(pl.estado).replace(/_/g, ' ')}${pl.fecha_inicio ? ` (desde ${dia(pl.fecha_inicio)})` : ''}`);
      if (pl.etapas) doc.fontSize(9).fillColor('#444444').text(pl.etapas.map((e) => `${e.nombre}: ${String(e.estado).replace(/_/g, ' ')}${e.fecha && e.estado === 'completado' ? ` ${dia(e.fecha)}` : ''}`).join(' · '));
      doc.moveDown(0.3);
    }
  }
  titulo(doc, `Consultas (${hcs.length})`);
  if (!hcs.length) doc.fontSize(9.5).text('Sin consultas registradas.');
  for (const h of hcs) consultaEnDoc(doc, h);
  numerar(doc);
  doc.end();
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'exportar_historia_clinica', modulo: 'historia_clinica', entidadId: p.id, detalle: { consultas: hcs.length } });
}

async function consulta(clinicaId, hcId, res, usuario) {
  const h = (await query(`SELECT h.*, o.nombre AS odontologo_nombre, o.matricula FROM historia_clinica h LEFT JOIN odontologos o ON o.id=h.odontologo_id
                          WHERE h.clinica_id=$1 AND h.id=$2`, [clinicaId, Number(hcId)])).rows[0];
  if (!h) throw new ApiError(404, 'Consulta no encontrada');
  const [p, clinica] = await Promise.all([paciente(clinicaId, h.paciente_id), clinicaRepo.findById(clinicaId)]);
  const doc = nuevoDoc(res, `consulta-${h.id}`);
  cabecera(doc, clinica, 'Consulta odontológica');
  datosPaciente(doc, p);
  consultaEnDoc(doc, h);
  if (h.firmada) {
    const y = Math.max(doc.y + 50, 660);
    doc.moveTo(330, y).lineTo(545, y).strokeColor('#999999').stroke();
    doc.fontSize(9.5).fillColor('#000000').text(h.odontologo_nombre || 'Profesional', 330, y + 6, { width: 215, align: 'center' });
    if (h.matricula) doc.fontSize(8.5).fillColor('#555555').text(`Matrícula ${h.matricula}`, 330, doc.y, { width: 215, align: 'center' });
  }
  numerar(doc);
  doc.end();
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'exportar_consulta', modulo: 'historia_clinica', entidadId: h.id, detalle: { pacienteId: p.id } });
}

async function estadoCuenta(clinicaId, pacienteId, res, usuario) {
  const p = await paciente(clinicaId, pacienteId);
  const resumen = await require('../pagos/pagos.repository').resumenPaciente(clinicaId, p.id);
  const [clinica, press, pagos, cuotas] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    query("SELECT id, fecha, total, estado FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('aceptado','enviado') ORDER BY fecha", [clinicaId, p.id]).then((r) => r.rows),
    query("SELECT id, fecha, concepto, metodo, monto, estado FROM pagos WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha", [clinicaId, p.id]).then((r) => r.rows),
    query(`SELECT c.numero, c.monto, c.vencimiento, c.estado, pp.cantidad_cuotas FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
            WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND pp.estado <> 'cancelado' AND c.estado <> 'pagada' ORDER BY c.vencimiento`, [clinicaId, p.id]).then((r) => r.rows),
  ]);
  const doc = nuevoDoc(res, `estado-de-cuenta-${p.apellido}-${p.nombre}`.replace(/\s+/g, '-'));
  cabecera(doc, clinica, 'Estado de cuenta');
  datosPaciente(doc, p);
  doc.fontSize(10).fillColor('#000000');
  campo(doc, 'Total de presupuestos aceptados', gs(resumen.totalPresupuestado));
  campo(doc, 'Total pagado', gs(resumen.totalPagado));
  if (resumen.totalAjustes) campo(doc, 'Ajustes (descuentos / bonificaciones)', gs(resumen.totalAjustes));
  doc.moveDown(0.3).fontSize(12).fillColor(resumen.saldo > 0 ? '#C62828' : '#2E7D32').text(`Saldo pendiente: ${gs(resumen.saldo)}`);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const vencidas = cuotas.filter((c) => String(c.vencimiento).slice(0, 10) < hoy);
  if (vencidas.length) doc.fontSize(10).fillColor('#C62828').text(`Cuotas vencidas: ${vencidas.length} por ${gs(vencidas.reduce((a, c) => a + Number(c.monto), 0))}`);
  if (press.length) {
    titulo(doc, 'Presupuestos');
    for (const x of press) doc.fontSize(9.5).fillColor('#000000').text(`${dia(x.fecha)} · N.º ${x.id} · ${x.estado} · ${gs(x.total)}`);
  }
  if (cuotas.length) {
    titulo(doc, 'Cuotas pendientes');
    for (const c of cuotas) doc.fontSize(9.5).fillColor(String(c.vencimiento).slice(0, 10) < hoy ? '#C62828' : '#000000').text(`Cuota ${c.numero} de ${c.cantidad_cuotas} · vence ${dia(c.vencimiento)} · ${gs(c.monto)}${String(c.vencimiento).slice(0, 10) < hoy ? ' · VENCIDA' : ''}`);
  }
  titulo(doc, 'Pagos');
  if (!pagos.length) doc.fontSize(9.5).text('Sin pagos registrados.');
  for (const x of pagos) {
    if (doc.y > 770) doc.addPage();
    doc.fontSize(9.5).fillColor(x.estado === 'anulado' ? '#999999' : '#000000').text(`${new Date(x.fecha).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' })} · ${x.concepto || 'Pago'} · ${x.metodo} · ${gs(x.monto)}${x.estado === 'anulado' ? ' · ANULADO' : ''}`);
  }
  numerar(doc);
  doc.end();
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'exportar_estado_cuenta', modulo: 'pagos', entidadId: p.id });
}

module.exports = { historiaClinica, consulta, estadoCuenta };
