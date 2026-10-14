/* Informes por período (Reportes → Informes): día, semana, mes y año.
   Para el período pedido y el anterior (para comparar) calcula, con los
   datos guardados:
   - turnos (atendidos, ausencias, cancelados), pacientes nuevos;
   - cobrado (y por método), facturado, egresos de caja;
   - presupuestos emitidos y aceptados;
   - tratamientos más realizados y producción por odontólogo;
   - una serie para el gráfico (por día; en el año, por mes).
   GET /api/reportes/informes/periodo?tipo=dia|semana|mes|anio&fecha=AAAA-MM-DD */
const express = require('express');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { hoyIso } = require('../../utils/recurso');

const FECHA_PAGO = "(p.fecha AT TIME ZONE 'America/Asuncion')::date";
const FECHA_LOCAL = (col) => `(${col} AT TIME ZONE 'America/Asuncion')::date`;
const TIPOS = ['dia', 'semana', 'mes', 'anio'];
const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta de crédito', tarjeta_debito: 'Tarjeta de débito', transferencia: 'Transferencia', qr: 'QR', otro: 'Otro' };

const d = (iso) => new Date(`${iso}T12:00:00Z`);
const iso = (dt) => dt.toISOString().slice(0, 10);
const sumarDias = (s, n) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

// Rango del período que contiene la fecha, y el anterior.
function rango(tipo, fecha) {
  const f = d(fecha);
  if (tipo === 'dia') return { desde: fecha, hasta: fecha };
  if (tipo === 'semana') {
    const dow = (f.getUTCDay() + 6) % 7; // lunes = 0
    const desde = sumarDias(fecha, -dow);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if (tipo === 'mes') {
    const desde = `${fecha.slice(0, 7)}-01`;
    const fin = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0, 12));
    return { desde, hasta: iso(fin) };
  }
  return { desde: `${fecha.slice(0, 4)}-01-01`, hasta: `${fecha.slice(0, 4)}-12-31` };
}
function anterior(tipo, r) {
  if (tipo === 'dia') { const x = sumarDias(r.desde, -1); return { desde: x, hasta: x }; }
  if (tipo === 'semana') return { desde: sumarDias(r.desde, -7), hasta: sumarDias(r.desde, -1) };
  if (tipo === 'mes') return rango('mes', sumarDias(r.desde, -1));
  return rango('anio', `${Number(r.desde.slice(0, 4)) - 1}-06-15`);
}

async function indicadores(c, desde, hasta) {
  const q = async (sql, extra = []) => (await query(sql, [c, desde, hasta, ...extra])).rows;
  const [tur, nuevos, cob, fac, egr, pre, acep] = await Promise.all([
    q(`SELECT count(*) FILTER (WHERE estado NOT IN ('cancelado','reprogramado'))::int AS total,
              count(*) FILTER (WHERE estado='atendido')::int AS atendidos,
              count(*) FILTER (WHERE estado='no_asistio')::int AS ausencias,
              count(*) FILTER (WHERE estado='cancelado')::int AS cancelados
         FROM turnos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3`),
    q(`SELECT count(*)::int AS n FROM pacientes WHERE clinica_id=$1 AND activo AND ${FECHA_LOCAL('creado_en')} BETWEEN $2 AND $3`),
    q(`SELECT COALESCE(sum(p.monto),0)::numeric AS t, count(*)::int AS n FROM pagos p WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3`),
    q("SELECT COALESCE(sum(total),0)::numeric AS t, count(*)::int AS n FROM facturas WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND estado<>'anulada'"),
    q(`SELECT COALESCE(sum(m.monto),0)::numeric AS t, count(*)::int AS n FROM caja_movimientos m JOIN caja_aperturas a ON a.id=m.caja_apertura_id
        WHERE a.clinica_id=$1 AND m.tipo='egreso' AND ${FECHA_LOCAL('m.creado_en')} BETWEEN $2 AND $3`),
    q("SELECT COALESCE(sum(total),0)::numeric AS t, count(*)::int AS n FROM presupuestos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND estado<>'cancelado'"),
    q("SELECT COALESCE(sum(total),0)::numeric AS t, count(*)::int AS n FROM presupuestos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND estado='aceptado'"),
  ]);
  const t = tur[0];
  return {
    turnos: t.total, atendidos: t.atendidos, ausencias: t.ausencias, cancelados: t.cancelados,
    asistencia: t.atendidos + t.ausencias ? Math.round((t.atendidos / (t.atendidos + t.ausencias)) * 1000) / 10 : null,
    pacientesNuevos: nuevos[0].n,
    cobrado: Number(cob[0].t), cobros: cob[0].n,
    facturado: Number(fac[0].t), facturas: fac[0].n,
    egresos: Number(egr[0].t),
    presupuestado: Number(pre[0].t), presupuestos: pre[0].n,
    aceptado: Number(acep[0].t), aceptados: acep[0].n,
  };
}

async function detalle(c, tipo, desde, hasta) {
  const q = async (sql) => (await query(sql, [c, desde, hasta])).rows;
  const porMes = tipo === 'anio';
  const [metodos, tratamientos, odontologos, serieCob, serieAt] = await Promise.all([
    q(`SELECT p.metodo, count(*)::int AS cantidad, sum(p.monto)::numeric AS total FROM pagos p
        WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 3 DESC`),
    q(`SELECT COALESCE(tr.nombre, NULLIF(trim(t.motivo),''), 'Sin tratamiento') AS nombre, count(*)::int AS cantidad
         FROM turnos t LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id
        WHERE t.clinica_id=$1 AND t.estado='atendido' AND t.fecha BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8`),
    q(`SELECT o.id, o.nombre,
              (SELECT count(*) FROM turnos t WHERE t.odontologo_id=o.id AND t.clinica_id=$1 AND t.estado='atendido' AND t.fecha BETWEEN $2 AND $3)::int AS atendidos,
              (SELECT COALESCE(sum(p.monto),0) FROM pagos p JOIN presupuestos pr ON pr.id=p.presupuesto_id
                 WHERE pr.odontologo_id=o.id AND p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3)::numeric AS cobrado
         FROM odontologos o WHERE o.clinica_id=$1`),
    q(`SELECT ${porMes ? `to_char(${FECHA_PAGO}, 'YYYY-MM')` : `to_char(${FECHA_PAGO}, 'YYYY-MM-DD')`} AS k, sum(p.monto)::numeric AS v
         FROM pagos p WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3 GROUP BY 1`),
    q(`SELECT ${porMes ? "to_char(t.fecha, 'YYYY-MM')" : "to_char(t.fecha, 'YYYY-MM-DD')"} AS k, count(*)::int AS v
         FROM turnos t WHERE t.clinica_id=$1 AND t.estado='atendido' AND t.fecha BETWEEN $2 AND $3 GROUP BY 1`),
  ]);
  // Serie completa (los días o meses sin movimiento van en cero).
  const claves = [];
  if (porMes) for (let m = 1; m <= 12; m += 1) claves.push(`${desde.slice(0, 4)}-${String(m).padStart(2, '0')}`);
  else for (let x = desde; x <= hasta; x = sumarDias(x, 1)) claves.push(x);
  const cob = new Map(serieCob.map((r) => [r.k, Number(r.v)]));
  const at = new Map(serieAt.map((r) => [r.k, r.v]));
  return {
    metodos: metodos.map((m) => ({ metodo: METODOS[m.metodo] || m.metodo, cantidad: m.cantidad, total: Number(m.total) })),
    tratamientos,
    odontologos: odontologos.map((o) => ({ ...o, cobrado: Number(o.cobrado) })).filter((o) => o.atendidos > 0 || o.cobrado > 0)
      .sort((a, b) => b.cobrado - a.cobrado || b.atendidos - a.atendidos).slice(0, 15),
    serie: tipo === 'dia' ? [] : claves.map((k) => ({ k, cobrado: cob.get(k) || 0, atendidos: at.get(k) || 0 })),
  };
}

async function periodo(clinicaId, tipoTxt, fechaTxt) {
  const tipo = tipoTxt === undefined || tipoTxt === '' ? 'dia' : tipoTxt;
  if (!TIPOS.includes(tipo)) throw new ApiError(400, 'Período inválido (dia, semana, mes o anio)');
  let fecha = fechaTxt;
  if (fecha === undefined || fecha === '') fecha = hoyIso();
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`)) || iso(d(fecha)) !== fecha) throw new ApiError(400, 'Fecha inválida');
  if (fecha < '2000-01-01' || fecha > '2100-12-31') throw new ApiError(400, 'Fecha fuera de rango');
  const r = rango(tipo, fecha);
  const a = anterior(tipo, r);
  const hoyL = hoyIso();
  // Período en curso: se compara con el mismo tramo del anterior (ej. 1 al 14 contra 1 al 14).
  if (tipo !== 'dia' && r.desde <= hoyL && hoyL <= r.hasta) {
    const dias = Math.round((d(hoyL) - d(r.desde)) / 86400000);
    const tope = sumarDias(a.desde, dias);
    if (tope < a.hasta) a.hasta = tope;
  }
  const [actual, previo, det] = await Promise.all([indicadores(clinicaId, r.desde, r.hasta), indicadores(clinicaId, a.desde, a.hasta), detalle(clinicaId, tipo, r.desde, r.hasta)]);
  return { tipo, fecha, desde: r.desde, hasta: r.hasta, anterior: a, enCurso: r.desde <= hoyL && hoyL <= r.hasta, actual, previo, ...det };
}

const router = express.Router();
router.get('/informes/periodo', requirePermiso('reportes.view'), async (req, res, next) => {
  try { res.json(await periodo(req.clinicaId, req.query.tipo, req.query.fecha)); } catch (e) { next(e); }
});

module.exports = { router, periodo, rango, anterior };
