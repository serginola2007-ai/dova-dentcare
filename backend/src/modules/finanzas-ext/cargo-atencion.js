/* Cargo automático al atender.
   Al marcar "atendido" un turno con tratamiento, si ese trabajo no está ya cobrado
   por otro camino, se carga a la cuenta del paciente (movimiento "atencion", al debe)
   al precio que le corresponde: lista de precios del paciente o de su convenio,
   menos lo que cubre el seguro.

   No se carga cuando:
   - la clínica lo apagó (clinicas.cargo_al_atender);
   - el turno no tiene tratamiento o el precio a cargo del paciente es 0;
   - el paciente tiene un plan de tratamiento en curso con ese tratamiento
     (eso se cobra por el plan / su presupuesto);
   - el paciente tiene un presupuesto aceptado con ese tratamiento en el último año;
   - es un turno de ortodoncia y el paciente tiene un caso de ortodoncia abierto
     (se cobra por las cuotas del caso);
   - la fecha del turno está dentro de un período contable cerrado;
   - ese turno ya generó su cargo (índice único: ni dos veces, ni de nuevo si se anuló). */
const { query } = require('../../config/db');
const auditoria = require('../../utils/auditoria');
const cuentas = require('./cuentas.service');

const fechaDe = (f) => (f instanceof Date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(f) : String(f).slice(0, 10));

async function motivoParaNoCargar(clinicaId, t) {
  const c = await query('SELECT cargo_al_atender, fecha_bloqueo_contable FROM clinicas WHERE id=$1', [clinicaId]);
  if (!c.rowCount || !c.rows[0].cargo_al_atender) return 'apagado';
  if (!t.tratamiento_id) return 'sin_tratamiento';
  const fecha = fechaDe(t.fecha);
  const bloqueo = c.rows[0].fecha_bloqueo_contable;
  if (bloqueo && fecha <= fechaDe(bloqueo)) return 'periodo_cerrado';
  const ya = await query("SELECT 1 FROM ajustes_cuenta WHERE turno_id=$1 AND tipo='atencion'", [t.id]);
  if (ya.rowCount) return 'ya_cargado';
  const plan = await query(
    "SELECT 1 FROM planes_tratamiento WHERE clinica_id=$1 AND paciente_id=$2 AND tratamiento_id=$3 AND estado <> 'finalizado' AND estado <> 'cancelado' LIMIT 1",
    [clinicaId, t.paciente_id, t.tratamiento_id]);
  if (plan.rowCount) return 'en_plan';
  const pres = await query(
    `SELECT 1 FROM presupuestos p JOIN presupuesto_items i ON i.presupuesto_id=p.id
      WHERE p.clinica_id=$1 AND p.paciente_id=$2 AND p.estado='aceptado' AND i.tratamiento_id=$3 AND p.fecha >= $4::date - 365 LIMIT 1`,
    [clinicaId, t.paciente_id, t.tratamiento_id, fecha]);
  if (pres.rowCount) return 'en_presupuesto';
  const orto = await query(
    `SELECT 1 FROM tratamientos tr WHERE tr.id=$2 AND tr.clinica_id=$1 AND lower(COALESCE(tr.categoria,'')) = 'ortodoncia'
        AND EXISTS (SELECT 1 FROM orto_casos oc WHERE oc.clinica_id=$1 AND oc.paciente_id=$3 AND oc.fecha_retiro_real IS NULL)`,
    [clinicaId, t.tratamiento_id, t.paciente_id]);
  if (orto.rowCount) return 'en_ortodoncia';
  return null;
}

/** Genera el cargo del turno atendido. Devuelve { ajusteId, monto } o { omitido: motivo }. Nunca tira error. */
async function cargarAtencion(clinicaId, turnoId, usuario) {
  try {
    const r = await query(
      `SELECT t.id, t.paciente_id, t.odontologo_id, t.tratamiento_id, t.fecha, t.estado, tr.nombre AS tratamiento
         FROM turnos t LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id WHERE t.id=$1 AND t.clinica_id=$2`, [turnoId, clinicaId]);
    const t = r.rows[0];
    if (!t || t.estado !== 'atendido') return { omitido: 'no_atendido' };
    const motivo = await motivoParaNoCargar(clinicaId, t);
    if (motivo) return { omitido: motivo };
    const precio = await cuentas.precioParaPaciente(clinicaId, t.paciente_id, t.tratamiento_id);
    const monto = Math.round(Number(precio.aCargoPaciente) || 0);
    if (monto <= 0) return { omitido: 'sin_precio' };
    const fecha = fechaDe(t.fecha);
    const texto = `Atención del ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}: ${t.tratamiento}${precio.montoCubierto > 0 ? ` (cubre ${precio.cobertura.aseguradora})` : ''}`.slice(0, 250);
    const ins = await query(
      `INSERT INTO ajustes_cuenta (clinica_id, paciente_id, tipo, monto, motivo, fecha, usuario_id, turno_id, tratamiento_id, odontologo_id)
       VALUES ($1,$2,'atencion',$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (turno_id) WHERE tipo = 'atencion' DO NOTHING RETURNING id`,
      [clinicaId, t.paciente_id, monto, texto, fecha, usuario && usuario.id ? usuario.id : null, t.id, t.tratamiento_id, t.odontologo_id]);
    if (!ins.rowCount) return { omitido: 'ya_cargado' };
    await auditoria.registrar({
      clinicaId, usuarioId: usuario && usuario.id, usuarioNombre: usuario && usuario.nombre,
      accion: 'cargo_atencion', modulo: 'cuenta_corriente', entidadId: ins.rows[0].id,
      detalle: { turnoId: t.id, pacienteId: t.paciente_id, tratamientoId: t.tratamiento_id, monto, origenPrecio: precio.origenPrecio },
    });
    return { ajusteId: ins.rows[0].id, monto };
  } catch (e) {
    console.error('[cargo-atencion] no se pudo generar el cargo del turno', turnoId, e.message);
    return { omitido: 'error' };
  }
}

/** Lo que el paciente debe de atenciones. Se pagan con pagos "a cuenta" (sin cuota ni presupuesto)
 *  y las reducen los descuentos/bonificaciones de la cuenta. Fuente única para portal, Mi pago y avisos de cobro.
 *  Devuelve { pendiente, lista, ultimaId, ultimaFecha, enRevision }. */
async function atencionesPendientes(clinicaId, pacienteId) {
  const at = await query(
    "SELECT id, fecha::text AS fecha, motivo, monto FROM ajustes_cuenta WHERE clinica_id=$1 AND paciente_id=$2 AND tipo='atencion' AND NOT anulado ORDER BY fecha DESC, id DESC",
    [clinicaId, pacienteId]);
  const vacio = { pendiente: 0, lista: [], ultimaId: null, ultimaFecha: null, enRevision: false };
  if (!at.rowCount) return vacio;
  const r = (await query(
    `SELECT COALESCE((SELECT sum(monto) FROM pagos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='pagado' AND cuota_id IS NULL AND presupuesto_id IS NULL),0)
          + COALESCE((SELECT sum(monto) FROM ajustes_cuenta WHERE clinica_id=$1 AND paciente_id=$2 AND NOT anulado AND tipo NOT IN ('recargo','atencion')),0) AS a_cuenta,
            EXISTS (SELECT 1 FROM web_pagos w WHERE w.paciente_id=$2 AND w.estado='pendiente' AND w.cuota_id IS NULL AND w.presupuesto_id IS NULL) AS en_revision`,
    [clinicaId, pacienteId])).rows[0];
  const total = at.rows.reduce((acc, x) => acc + Number(x.monto), 0);
  const pendiente = Math.round(Math.max(0, total - Number(r.a_cuenta)));
  if (!pendiente) return vacio;
  // Las que siguen impagas: se cubren primero las más viejas.
  let resto = pendiente; const lista = [];
  for (const x of at.rows) { if (resto <= 0) break; lista.push({ id: x.id, fecha: x.fecha, detalle: x.motivo, monto: Math.min(Number(x.monto), resto) }); resto -= Number(x.monto); }
  return { pendiente, lista, ultimaId: at.rows[0].id, ultimaFecha: at.rows[0].fecha, enRevision: !!r.en_revision };
}

module.exports = { cargarAtencion, motivoParaNoCargar, atencionesPendientes };
