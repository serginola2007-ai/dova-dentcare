const express = require('express');
const { query } = require('../../config/db');
const { hoyIso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const cuentas = require('../finanzas-ext/cuentas.service');
const recalls = require('../recalls/recalls.service');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { const out = await fn(req); if (out && out.__csv !== undefined) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"'); res.send(`\uFEFF${out.__csv}`); return; } res.json(out); } catch (e) { next(e); } };

function rango(q) {
  const hoy = hoyIso();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde || '') ? q.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '') ? q.hasta : hoy;
  if (hasta < desde) throw new ApiError(400, 'El rango de fechas es inválido');
  return { desde, hasta };
}
const pct = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 1000) / 10 : null);

router.get('/', requirePermiso('kpis.view', 'reportes.view'), h(async (req) => {
  const c = req.clinicaId;
  const { desde, hasta } = rango(req.query);
  const P = [c, desde, hasta];
  const [prod, cobr, pres, tur, turOd, nuevos, fuentes, activos, espera, nps, topTrat, ticket, cancelTard] = await Promise.all([
    cuentas.calcularComisiones(c, { desde, hasta }),
    query("SELECT COALESCE(sum(monto),0) AS total, count(*) AS n FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND (fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2 AND $3", P),
    query(`SELECT count(*) FILTER (WHERE estado IN ('enviado','aceptado','rechazado','vencido')) AS presentados,
                  count(*) FILTER (WHERE estado='aceptado') AS aceptados,
                  COALESCE(sum(total) FILTER (WHERE estado IN ('enviado','aceptado','rechazado','vencido')),0) AS monto_presentado,
                  COALESCE(sum(total) FILTER (WHERE estado='aceptado'),0) AS monto_aceptado
             FROM presupuestos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3`, P),
    query(`SELECT count(*) AS total, count(*) FILTER (WHERE estado='atendido') AS atendidos, count(*) FILTER (WHERE estado='no_asistio') AS no_asistio,
                  count(*) FILTER (WHERE estado='cancelado') AS cancelados, count(*) FILTER (WHERE estado IN ('reservado','confirmado') AND fecha < current_date) AS sin_cerrar,
                  COALESCE(sum(duracion_minutos) FILTER (WHERE estado='atendido'),0) AS minutos_atendidos,
                  count(*) FILTER (WHERE primera_vez AND estado='atendido') AS primeras_visitas,
                  count(*) FILTER (WHERE confirmacion='confirmado') AS confirmados
             FROM turnos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3`, P),
    query(`SELECT o.id, o.nombre, count(*) AS total, count(*) FILTER (WHERE t.estado='atendido') AS atendidos, count(*) FILTER (WHERE t.estado='no_asistio') AS no_asistio
             FROM turnos t JOIN odontologos o ON o.id=t.odontologo_id WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 GROUP BY o.id, o.nombre ORDER BY o.nombre`, P),
    query('SELECT count(*) AS n FROM pacientes WHERE clinica_id=$1 AND creado_en::date BETWEEN $2 AND $3', P),
    query("SELECT COALESCE(NULLIF(fuente_referencia,''),'sin_dato') AS fuente, count(*) AS n FROM pacientes WHERE clinica_id=$1 AND creado_en::date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 2 DESC", P),
    query(`SELECT count(*) FILTER (WHERE ult >= current_date - 548) AS activos, count(*) FILTER (WHERE ult < current_date - 548 OR ult IS NULL) AS inactivos
             FROM (SELECT p.id, (SELECT max(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.estado='atendido') AS ult FROM pacientes p WHERE p.clinica_id=$1 AND p.activo) x`, [c]),
    query(`SELECT round(avg(extract(epoch FROM (en_sillon_en - llegada_en))/60)) AS espera, round(avg(extract(epoch FROM (finalizado_en - en_sillon_en))/60)) AS atencion,
                  round(avg(extract(epoch FROM (llegada_en - (fecha + hora_inicio)::timestamp AT TIME ZONE 'America/Asuncion'))/60)) AS puntualidad_paciente
             FROM turnos WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND llegada_en IS NOT NULL AND en_sillon_en IS NOT NULL`, P),
    query(`SELECT count(*) AS n, count(*) FILTER (WHERE nps>=9) AS prom, count(*) FILTER (WHERE nps<=6) AS detr, round(avg(atencion),2) AS atencion, round(avg(puntualidad),2) AS puntualidad,
                  round(avg(limpieza),2) AS limpieza, round(avg(explicacion),2) AS explicacion
             FROM encuestas_satisfaccion WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3`, P),
    query(`SELECT COALESCE(tr.nombre, pt.nombre) AS tratamiento, count(*) AS sesiones FROM sesiones_tratamiento s JOIN planes_tratamiento pt ON pt.id=s.plan_id
             LEFT JOIN tratamientos tr ON tr.id=pt.tratamiento_id WHERE pt.clinica_id=$1 AND s.estado='realizada' AND s.fecha BETWEEN $2 AND $3
             GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, P),
    query("SELECT count(DISTINCT paciente_id) AS pacientes FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND (fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2 AND $3", P),
    query(`SELECT count(*) AS n FROM turno_historial th JOIN turnos t ON t.id=th.turno_id
            WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 AND th.cambio->'estado'->>'a' = 'cancelado'
              AND th.creado_en > ((t.fecha + t.hora_inicio)::timestamp AT TIME ZONE 'America/Asuncion') - interval '24 hours'`, P).catch(() => ({ rows: [{ n: null }] })),
  ]);
  const produccion = prod.odontologos.reduce((s, o) => s + o.produccion, 0);
  const cobranza = Number(cobr.rows[0].total);
  const t = tur.rows[0]; const pr = pres.rows[0]; const n = nps.rows[0];
  const cumplimiento = await recalls.cumplimiento(c);
  return {
    desde, hasta,
    produccion: { total: Math.round(produccion), porOdontologo: prod.odontologos.map((o) => ({ odontologo: o.odontologo, produccion: o.produccion, sesiones: o.sesiones })) },
    cobranza: { total: cobranza, pagos: Number(cobr.rows[0].n), tasaCobranza: pct(cobranza, produccion), ticketPromedio: Number(ticket.rows[0].pacientes) ? Math.round(cobranza / Number(ticket.rows[0].pacientes)) : null },
    presupuestos: {
      presentados: Number(pr.presentados), aceptados: Number(pr.aceptados), tasaAceptacion: pct(pr.aceptados, pr.presentados),
      montoPresentado: Number(pr.monto_presentado), montoAceptado: Number(pr.monto_aceptado), tasaAceptacionMonto: pct(pr.monto_aceptado, pr.monto_presentado),
    },
    agenda: {
      turnos: Number(t.total), atendidos: Number(t.atendidos), noAsistio: Number(t.no_asistio), cancelados: Number(t.cancelados), sinCerrar: Number(t.sin_cerrar),
      tasaInasistencia: pct(t.no_asistio, Number(t.atendidos) + Number(t.no_asistio)), tasaCancelacion: pct(t.cancelados, t.total),
      cancelacionesTardias: cancelTard.rows[0].n === null ? null : Number(cancelTard.rows[0].n),
      tasaConfirmacion: pct(t.confirmados, t.total), horasAtendidas: Math.round(Number(t.minutos_atendidos) / 6) / 10,
      produccionPorHora: Number(t.minutos_atendidos) ? Math.round(produccion / (Number(t.minutos_atendidos) / 60)) : null,
      porOdontologo: turOd.rows.map((x) => ({ ...x, tasaInasistencia: pct(x.no_asistio, Number(x.atendidos) + Number(x.no_asistio)) })),
      esperaPromedioMin: espera.rows[0].espera === null ? null : Number(espera.rows[0].espera),
      atencionPromedioMin: espera.rows[0].atencion === null ? null : Number(espera.rows[0].atencion),
      demoraPacientePromedioMin: espera.rows[0].puntualidad_paciente === null ? null : Number(espera.rows[0].puntualidad_paciente),
    },
    pacientes: {
      nuevos: Number(nuevos.rows[0].n), primerasVisitas: Number(t.primeras_visitas), porFuente: fuentes.rows.map((f) => ({ fuente: f.fuente, cantidad: Number(f.n) })),
      activos: Number(activos.rows[0].activos), inactivos: Number(activos.rows[0].inactivos),
    },
    recalls: cumplimiento,
    satisfaccion: Number(n.n) ? {
      encuestas: Number(n.n), nps: Math.round(((Number(n.prom) - Number(n.detr)) / Number(n.n)) * 100),
      atencion: n.atencion && Number(n.atencion), puntualidad: n.puntualidad && Number(n.puntualidad), limpieza: n.limpieza && Number(n.limpieza), explicacion: n.explicacion && Number(n.explicacion),
    } : null,
    tratamientosMasRealizados: topTrat.rows.map((x) => ({ tratamiento: x.tratamiento, sesiones: Number(x.sesiones) })),
  };
}));

// Serie mensual (últimos N meses) para gráficos de tendencia.
router.get('/serie-mensual', requirePermiso('kpis.view', 'reportes.view'), h(async (req) => {
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 3), 36);
  const r = await query(
    `WITH m AS (SELECT generate_series(date_trunc('month', current_date) - (($2::int - 1) || ' months')::interval, date_trunc('month', current_date), interval '1 month')::date AS mes)
     SELECT to_char(m.mes, 'YYYY-MM') AS periodo,
       (SELECT COALESCE(sum(monto),0) FROM pagos WHERE clinica_id=$1 AND estado='pagado' AND date_trunc('month', fecha AT TIME ZONE 'America/Asuncion')::date = m.mes) AS cobranza,
       (SELECT COALESCE(sum(pt.precio*(1-COALESCE(pt.descuento,0)/100)/GREATEST(pt.sesiones_totales,1)),0) FROM sesiones_tratamiento s JOIN planes_tratamiento pt ON pt.id=s.plan_id
          WHERE pt.clinica_id=$1 AND s.estado='realizada' AND date_trunc('month', s.fecha)::date = m.mes) AS produccion,
       (SELECT count(*) FROM pacientes WHERE clinica_id=$1 AND date_trunc('month', creado_en)::date = m.mes) AS pacientes_nuevos,
       (SELECT count(*) FROM turnos WHERE clinica_id=$1 AND estado='atendido' AND date_trunc('month', fecha)::date = m.mes) AS turnos_atendidos,
       (SELECT count(*) FROM turnos WHERE clinica_id=$1 AND estado='no_asistio' AND date_trunc('month', fecha)::date = m.mes) AS inasistencias
     FROM m ORDER BY m.mes`,
    [req.clinicaId, meses]
  );
  return r.rows.map((x) => ({ periodo: x.periodo, cobranza: Number(x.cobranza), produccion: Math.round(Number(x.produccion)), pacientesNuevos: Number(x.pacientes_nuevos), turnosAtendidos: Number(x.turnos_atendidos), inasistencias: Number(x.inasistencias) }));
}));

// ============================== AUDITORÍA ==============================
router.get('/auditoria', requirePermiso('auditoria.view'), h(async (req) => {
  const cond = ['clinica_id=$1']; const params = [req.clinicaId];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '')) add("(creado_en AT TIME ZONE 'America/Asuncion')::date >= ?", req.query.desde);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta || '')) add("(creado_en AT TIME ZONE 'America/Asuncion')::date <= ?", req.query.hasta);
  if (req.query.usuarioId) add('usuario_id = ?', Number(req.query.usuarioId));
  if (req.query.modulo) add('modulo = ?', String(req.query.modulo));
  if (req.query.accion) add('accion = ?', String(req.query.accion));
  if (req.query.entidadId) add('entidad_id = ?', String(req.query.entidadId));
  if (['ok', 'fallido', 'denegado'].includes(req.query.resultado)) add("COALESCE(resultado,'ok') = ?", req.query.resultado);
  if (req.query.pacienteId) add("(detalle->>'pacienteId' = ? OR (modulo='pacientes' AND entidad_id = ?))", String(req.query.pacienteId));
  if (req.query.q) add('(detalle::text ILIKE ? OR usuario_nombre ILIKE ?)', `%${String(req.query.q).slice(0, 80)}%`);
  const limite = Math.min(Number(req.query.limite) || 200, 1000);
  const csv = req.query.formato === 'csv';
  const [filas, modulos, acciones] = await Promise.all([
    query(`SELECT * FROM auditoria WHERE ${cond.join(' AND ')} ORDER BY creado_en DESC LIMIT ${csv ? 20000 : limite}`, params),
    query('SELECT DISTINCT modulo FROM auditoria WHERE clinica_id=$1 ORDER BY 1', [req.clinicaId]),
    query('SELECT DISTINCT accion FROM auditoria WHERE clinica_id=$1 ORDER BY 1', [req.clinicaId]),
  ]);
  if (csv) {
    const auditoria = require('../../utils/auditoria');
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'exportar_auditoria', modulo: 'auditoria', detalle: { filtros: req.query, filas: filas.rowCount } });
    const e = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const txt = [['Fecha', 'Usuario', 'Acción', 'Módulo', 'Registro', 'Resultado', 'IP', 'Detalle'].map(e).join(';'),
      ...filas.rows.map((a) => [new Date(a.creado_en).toLocaleString('es-PY', { timeZone: 'America/Asuncion' }), a.usuario_nombre || 'sistema', a.accion, a.modulo, a.entidad_id, a.resultado || 'ok', a.ip, a.detalle ? JSON.stringify(a.detalle) : ''].map(e).join(';'))].join('\r\n');
    return { __csv: txt };
  }
  return { registros: filas.rows, modulos: modulos.rows.map((m) => m.modulo), acciones: acciones.rows.map((m) => m.accion) };
}));

// ================== EXPORTACIÓN DEL EXPEDIENTE COMPLETO ==================
// Derecho de acceso del paciente / traslado a otro profesional: TODO lo que
// DOVA tiene de un paciente, en un único JSON. Queda registrado en auditoría.
router.get('/exportar-paciente/:pacienteId', requirePermiso('pacientes.export'), h(async (req) => {
  const c = req.clinicaId; const p = Number(req.params.pacienteId);
  const pac = await query('SELECT * FROM pacientes WHERE clinica_id=$1 AND id=$2', [c, p]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  // Tablas con paciente_id y clinica_id, descubiertas del propio esquema (nombres de la BD, no del cliente).
  const tablas = await query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='paciente_id'
       AND table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='clinica_id')
     ORDER BY table_name`);
  const datos = {};
  for (const { table_name: t } of tablas.rows) {
    if (!/^[a-z_]+$/.test(t)) continue;
    const r = await query(`SELECT * FROM ${t} WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY id`, [c, p]);
    if (r.rowCount) datos[t] = r.rows.map((row) => { const { firma, firma_paciente, firma_odontologo, ...resto } = row; return { ...resto, ...(firma || firma_paciente || firma_odontologo ? { tiene_firma: true } : {}) }; });
  }
  // Tablas hijas sin clinica_id
  if (datos.endodoncias) datos.endo_conductos = (await query('SELECT * FROM endo_conductos WHERE endodoncia_id = ANY($1::int[])', [datos.endodoncias.map((e) => e.id)])).rows;
  if (datos.orto_casos) datos.orto_visitas = (await query('SELECT * FROM orto_visitas WHERE caso_id = ANY($1::int[])', [datos.orto_casos.map((e) => e.id)])).rows;
  await auditoria.registrar({ clinicaId: c, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'exportar_expediente', modulo: 'pacientes', entidadId: p, detalle: { pacienteId: p, tablas: Object.keys(datos) } });
  return { generado: new Date().toISOString(), generadoPor: req.usuario.nombre, paciente: pac.rows[0], datos };
}));

module.exports = router;
