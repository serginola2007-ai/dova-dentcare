/* Cuenta corriente del paciente, antigüedad de deuda, comisiones y metas.

   Criterio contable (coherente con el resumen que ya mostraba DOVA):
   - DEBE: presupuestos ACEPTADOS (lo que el paciente se comprometió a pagar)
           + ajustes de tipo "recargo".
   - HABER: pagos con estado "pagado" + ajustes que reducen deuda
           (descuento, bonificación, cortesía, incobrable, nota de crédito).
   - Saldo > 0: el paciente debe. Saldo < 0: saldo a favor (anticipo).
   Antigüedad: los pagos se imputan a las deudas más viejas primero (FIFO). */
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso } = require('../../utils/recurso');

const AJUSTES_CREDITO = ['descuento', 'bonificacion', 'cortesia', 'incobrable', 'nota_credito'];
const AJUSTES_DEBITO = ['recargo'];

function diasEntre(desdeIso, hastaIso) {
  return Math.round((Date.parse(`${hastaIso}T12:00:00Z`) - Date.parse(`${String(desdeIso).slice(0, 10)}T12:00:00Z`)) / 86400000);
}

async function movimientos(clinicaId, pacienteId) {
  const [pres, pagos, ajustes] = await Promise.all([
    query("SELECT id, fecha, total, observaciones FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='aceptado'", [clinicaId, pacienteId]),
    query("SELECT id, fecha, monto, metodo, concepto FROM pagos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='pagado'", [clinicaId, pacienteId]),
    query('SELECT a.*, u.nombre AS usuario_nombre FROM ajustes_cuenta a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.clinica_id=$1 AND a.paciente_id=$2 AND NOT a.anulado', [clinicaId, pacienteId]),
  ]);
  const fechaDe = (f) => (f instanceof Date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(f) : String(f).slice(0, 10));
  const lista = [
    ...pres.rows.map((p) => ({ fecha: fechaDe(p.fecha), tipo: 'presupuesto', referenciaId: p.id, concepto: `Presupuesto #${p.id} aceptado`, debe: Number(p.total), haber: 0 })),
    ...pagos.rows.map((p) => ({ fecha: fechaDe(p.fecha), tipo: 'pago', referenciaId: p.id, concepto: `Pago ${p.metodo}${p.concepto ? ' — ' + p.concepto : ''}`, debe: 0, haber: Number(p.monto) })),
    ...ajustes.rows.map((a) => ({
      fecha: fechaDe(a.fecha), tipo: 'ajuste', subtipo: a.tipo, referenciaId: a.id, concepto: `${a.tipo.replace('_', ' ')}: ${a.motivo}`,
      debe: AJUSTES_DEBITO.includes(a.tipo) ? Number(a.monto) : 0, haber: AJUSTES_CREDITO.includes(a.tipo) ? Number(a.monto) : 0, usuario: a.usuario_nombre,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.debe ? -1 : 1));
  let saldo = 0;
  for (const m of lista) { saldo = Math.round((saldo + m.debe - m.haber) * 100) / 100; m.saldo = saldo; }
  return lista;
}

function antiguedad(lista, hoy = hoyIso()) {
  const deudas = lista.filter((m) => m.debe > 0).map((m) => ({ fecha: m.fecha, pendiente: m.debe }));
  let credito = lista.reduce((s, m) => s + m.haber, 0);
  for (const d of deudas) { const usa = Math.min(d.pendiente, credito); d.pendiente -= usa; credito -= usa; }
  const tramos = { '0_30': 0, '31_60': 0, '61_90': 0, '90_mas': 0 };
  for (const d of deudas) {
    if (d.pendiente <= 0) continue;
    const dias = diasEntre(d.fecha, hoy);
    const k = dias <= 30 ? '0_30' : dias <= 60 ? '31_60' : dias <= 90 ? '61_90' : '90_mas';
    tramos[k] = Math.round((tramos[k] + d.pendiente) * 100) / 100;
  }
  return { tramos, saldoAFavor: Math.round(credito * 100) / 100 };
}

async function cuentaCorriente(clinicaId, pacienteId) {
  const pac = await query('SELECT id, nombre, apellido FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  const lista = await movimientos(clinicaId, pacienteId);
  const saldo = lista.length ? lista[lista.length - 1].saldo : 0;
  const cuotas = await query(
    `SELECT c.*, pp.id AS plan_pago_id FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
      WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND c.estado='pendiente' ORDER BY c.vencimiento`, [clinicaId, pacienteId]);
  return {
    paciente: pac.rows[0], movimientos: lista, saldo, ...antiguedad(lista),
    cuotasPendientes: cuotas.rows, cuotasVencidas: cuotas.rows.filter((c) => String(c.vencimiento) < hoyIso()).length,
  };
}

// Antigüedad de deuda de toda la clínica (lista de cobranza).
async function reporteAntiguedad(clinicaId) {
  const pacs = await query(
    `SELECT DISTINCT p.id, p.nombre, p.apellido, p.telefono, p.whatsapp FROM pacientes p
      WHERE p.clinica_id=$1 AND (EXISTS (SELECT 1 FROM presupuestos pr WHERE pr.paciente_id=p.id AND pr.estado='aceptado')
                              OR EXISTS (SELECT 1 FROM ajustes_cuenta a WHERE a.paciente_id=p.id AND a.tipo='recargo' AND NOT a.anulado))`, [clinicaId]);
  const filas = [];
  const totales = { saldo: 0, '0_30': 0, '31_60': 0, '61_90': 0, '90_mas': 0 };
  for (const p of pacs.rows) {
    const lista = await movimientos(clinicaId, p.id);
    const saldo = lista.length ? lista[lista.length - 1].saldo : 0;
    if (saldo <= 0) continue;
    const { tramos } = antiguedad(lista);
    const ultimoPago = [...lista].reverse().find((m) => m.tipo === 'pago');
    filas.push({ paciente: p, saldo, tramos, ultimoPago: ultimoPago ? ultimoPago.fecha : null });
    totales.saldo += saldo;
    for (const k of Object.keys(tramos)) totales[k] += tramos[k];
  }
  filas.sort((a, b) => b.tramos['90_mas'] - a.tramos['90_mas'] || b.saldo - a.saldo);
  for (const k of Object.keys(totales)) totales[k] = Math.round(totales[k] * 100) / 100;
  return { filas, totales };
}

// ================================ COMISIONES ================================
// Producción = sesiones realizadas en el período × valor por sesión del plan
// (precio neto del plan ÷ sesiones totales). Comisión = producción × % de la
// regla (específica del tratamiento o general del odontólogo), menos el costo
// de laboratorio de sus trabajos del período × % general, si la regla lo indica.
async function calcularComisiones(clinicaId, { odontologoId, desde, hasta }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) throw new ApiError(400, 'Indicá desde y hasta (AAAA-MM-DD)');
  if (hasta < desde) throw new ApiError(400, 'El rango de fechas es inválido');
  const params = [clinicaId, desde, hasta];
  let filtro = '';
  if (odontologoId) { params.push(Number(odontologoId)); filtro = `AND COALESCE(s.odontologo_id, pt.odontologo_id)=$${params.length}`; }
  const ses = await query(
    `SELECT s.id, s.fecha, COALESCE(s.odontologo_id, pt.odontologo_id) AS odontologo_id, s.procedimiento, pt.id AS plan_id, pt.nombre AS plan_nombre, pt.tratamiento_id,
            pt.precio, pt.descuento, GREATEST(pt.sesiones_totales,1) AS sesiones_totales, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM sesiones_tratamiento s JOIN planes_tratamiento pt ON pt.id=s.plan_id JOIN pacientes p ON p.id=pt.paciente_id
      WHERE pt.clinica_id=$1 AND s.estado='realizada' AND s.fecha BETWEEN $2 AND $3 AND COALESCE(s.odontologo_id, pt.odontologo_id) IS NOT NULL ${filtro}
      ORDER BY s.fecha`, params);
  const reglas = await query('SELECT * FROM comision_reglas WHERE clinica_id=$1 AND activa', [clinicaId]);
  const lab = await query(
    `SELECT odontologo_id, COALESCE(sum(costo),0) AS costo FROM laboratorio
      WHERE clinica_id=$1 AND estado NOT IN ('cancelado') AND COALESCE(fecha_recepcion, fecha_envio, creado_en::date) BETWEEN $2 AND $3 AND odontologo_id IS NOT NULL
      GROUP BY odontologo_id`, [clinicaId, desde, hasta]);
  const odont = await query('SELECT id, nombre FROM odontologos WHERE clinica_id=$1', [clinicaId]);
  const nombre = Object.fromEntries(odont.rows.map((o) => [o.id, o.nombre]));
  const labPor = Object.fromEntries(lab.rows.map((l) => [l.odontologo_id, Number(l.costo)]));
  const por = {};
  for (const s of ses.rows) {
    const reglaEsp = reglas.rows.find((r) => r.odontologo_id === s.odontologo_id && r.tratamiento_id && r.tratamiento_id === s.tratamiento_id);
    const reglaGen = reglas.rows.find((r) => r.odontologo_id === s.odontologo_id && !r.tratamiento_id);
    const regla = reglaEsp || reglaGen;
    const valor = Math.round(((Number(s.precio) * (1 - Number(s.descuento || 0) / 100)) / Number(s.sesiones_totales)) * 100) / 100;
    const pct = regla ? Number(regla.porcentaje) : 0;
    const o = por[s.odontologo_id] || (por[s.odontologo_id] = { odontologoId: s.odontologo_id, odontologo: nombre[s.odontologo_id], produccion: 0, comisionBruta: 0, sesiones: 0, detalle: [], reglaGeneral: reglaGen || null, sinRegla: 0 });
    o.produccion += valor; o.sesiones++;
    o.comisionBruta += valor * pct / 100;
    if (!regla) o.sinRegla++;
    o.detalle.push({ sesionId: s.id, fecha: s.fecha, paciente: `${s.paciente_nombre} ${s.paciente_apellido}`, plan: s.plan_nombre, valor, porcentaje: pct, comision: Math.round(valor * pct) / 100 });
  }
  const resultado = Object.values(por).map((o) => {
    const costoLab = labPor[o.odontologoId] || 0;
    const descuenta = o.reglaGeneral ? o.reglaGeneral.descontar_laboratorio : false;
    const descuentoLab = descuenta ? Math.round(costoLab * Number(o.reglaGeneral.porcentaje)) / 100 : 0;
    const { reglaGeneral, ...rest } = o;
    return {
      ...rest, produccion: Math.round(o.produccion * 100) / 100, costoLaboratorio: costoLab, descuentoLaboratorio: descuentoLab,
      comision: Math.round((o.comisionBruta - descuentoLab) * 100) / 100, comisionBruta: Math.round(o.comisionBruta * 100) / 100,
      porcentajeGeneral: reglaGeneral ? Number(reglaGeneral.porcentaje) : null,
    };
  });
  return { desde, hasta, odontologos: resultado };
}

// ================================== METAS ==================================
async function progresoMetas(clinicaId, periodo) {
  if (!/^\d{4}-\d{2}$/.test(periodo || '')) throw new ApiError(400, 'Periodo inválido (AAAA-MM)');
  const desde = `${periodo}-01`;
  const [y, m] = periodo.split('-').map(Number);
  const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const metas = await query('SELECT m.*, o.nombre AS odontologo_nombre FROM metas m LEFT JOIN odontologos o ON o.id=m.odontologo_id WHERE m.clinica_id=$1 AND m.periodo=$2 ORDER BY m.tipo', [clinicaId, periodo]);
  const out = [];
  for (const meta of metas.rows) {
    const od = meta.odontologo_id;
    let actual = 0;
    if (meta.tipo === 'produccion') {
      actual = (await calcularComisiones(clinicaId, { odontologoId: od, desde, hasta })).odontologos.reduce((s, o) => s + o.produccion, 0);
    } else if (meta.tipo === 'cobranza') {
      actual = Number((await query("SELECT COALESCE(sum(monto),0) AS n FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND (fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2 AND $3", [clinicaId, desde, hasta])).rows[0].n);
    } else if (meta.tipo === 'pacientes_nuevos') {
      actual = Number((await query('SELECT count(*) AS n FROM pacientes WHERE clinica_id=$1 AND creado_en::date BETWEEN $2 AND $3', [clinicaId, desde, hasta])).rows[0].n);
    } else if (meta.tipo === 'turnos_atendidos') {
      actual = Number((await query(`SELECT count(*) AS n FROM turnos WHERE clinica_id=$1 AND estado='atendido' AND fecha BETWEEN $2 AND $3 ${od ? 'AND odontologo_id=$4' : ''}`, od ? [clinicaId, desde, hasta, od] : [clinicaId, desde, hasta])).rows[0].n);
    } else if (meta.tipo === 'tasa_aceptacion') {
      const r = (await query(`SELECT count(*) FILTER (WHERE estado='aceptado') AS a, count(*) FILTER (WHERE estado IN ('aceptado','rechazado','vencido')) AS t
                                FROM presupuestos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 ${od ? 'AND odontologo_id=$4' : ''}`, od ? [clinicaId, desde, hasta, od] : [clinicaId, desde, hasta])).rows[0];
      actual = Number(r.t) ? Math.round((Number(r.a) / Number(r.t)) * 1000) / 10 : 0;
    }
    actual = Math.round(actual * 100) / 100;
    out.push({ ...meta, actual, avancePct: Number(meta.objetivo) ? Math.round((actual / Number(meta.objetivo)) * 1000) / 10 : null });
  }
  return { periodo, desde, hasta, metas: out };
}

// ============================ PRECIO / COBERTURA ============================
async function precioParaPaciente(clinicaId, pacienteId, tratamientoId) {
  const [pac, trat] = await Promise.all([
    query('SELECT id, lista_precio_id FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]),
    query('SELECT id, nombre, categoria, precio FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, tratamientoId]),
  ]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  if (!trat.rowCount) throw new ApiError(404, 'Tratamiento no encontrado');
  const t = trat.rows[0];
  let precio = Number(t.precio); let origenPrecio = 'lista base';
  const cob = await query(
    `SELECT pc.*, ap.nombre AS plan_nombre, ap.cobertura_general, ap.cobertura, ap.copago_fijo, ap.requiere_autorizacion, ap.tope_anual, a.nombre AS aseguradora_nombre, a.id AS aseguradora_id
       FROM paciente_coberturas pc JOIN aseguradora_planes ap ON ap.id=pc.plan_id JOIN aseguradoras a ON a.id=ap.aseguradora_id
      WHERE pc.clinica_id=$1 AND pc.paciente_id=$2 AND pc.activa AND ap.activo AND a.activa
        AND (pc.vigencia_hasta IS NULL OR pc.vigencia_hasta >= current_date) AND (pc.vigencia_desde IS NULL OR pc.vigencia_desde <= current_date)
      ORDER BY pc.principal DESC LIMIT 1`, [clinicaId, pacienteId]);
  const cobertura = cob.rows[0] || null;
  // Lista de precios: la del paciente, o la del convenio de su cobertura.
  const listaId = pac.rows[0].lista_precio_id
    || (cobertura && (await query('SELECT id FROM listas_precios WHERE clinica_id=$1 AND aseguradora_id=$2 AND activa ORDER BY id LIMIT 1', [clinicaId, cobertura.aseguradora_id])).rows[0]?.id);
  if (listaId) {
    const it = await query('SELECT li.precio, l.nombre FROM lista_precio_items li JOIN listas_precios l ON l.id=li.lista_id WHERE li.lista_id=$1 AND li.tratamiento_id=$2', [listaId, tratamientoId]);
    if (it.rowCount) { precio = Number(it.rows[0].precio); origenPrecio = `lista "${it.rows[0].nombre}"`; }
  }
  let cubre = 0; let porcentaje = 0;
  if (cobertura) {
    const porCategoria = cobertura.cobertura || {};
    porcentaje = Number(t.categoria && porCategoria[t.categoria] !== undefined ? porCategoria[t.categoria] : cobertura.cobertura_general) || 0;
    cubre = Math.round(precio * porcentaje) / 100;
    if (cobertura.copago_fijo) cubre = Math.max(0, Math.min(cubre, precio - Number(cobertura.copago_fijo)));
  }
  return {
    tratamiento: t, precio, origenPrecio,
    cobertura: cobertura ? { aseguradora: cobertura.aseguradora_nombre, plan: cobertura.plan_nombre, afiliado: cobertura.numero_afiliado, porcentaje, requiereAutorizacion: cobertura.requiere_autorizacion } : null,
    montoCubierto: cubre, aCargoPaciente: Math.round((precio - cubre) * 100) / 100,
  };
}

async function verificarBloqueoContable(clinicaId, fecha) {
  const r = await query('SELECT fecha_bloqueo_contable FROM clinicas WHERE id=$1', [clinicaId]);
  const bloqueo = r.rows[0] && r.rows[0].fecha_bloqueo_contable;
  if (bloqueo && String(fecha).slice(0, 10) <= String(bloqueo).slice(0, 10)) {
    throw new ApiError(409, `El período contable está cerrado hasta el ${String(bloqueo).slice(0, 10)}: no se pueden registrar ni modificar movimientos de esa fecha o anteriores.`);
  }
}

module.exports = { cuentaCorriente, reporteAntiguedad, calcularComisiones, progresoMetas, precioParaPaciente, verificarBloqueoContable, movimientos, AJUSTES_CREDITO, AJUSTES_DEBITO };
