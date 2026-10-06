/* Centro de reportes (Fase 5).
   Reportes clínicos, financieros y de agenda calculados en el momento con los
   datos guardados (nunca se completan con datos inventados). Filtros por
   fecha, odontólogo, tratamiento, estado, método de pago y usuario.
   Exportación a PDF, Excel y CSV con permiso propio (reportes.export);
   cada exportación queda en la auditoría. */
const express = require('express');
const PDFDocument = require('pdfkit');
const { query } = require('../../config/db');
const { hoyIso } = require('../../utils/recurso');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const clinicaRepo = require('../clinica/clinica.repository');

const FECHA_PAGO = "(p.fecha AT TIME ZONE 'America/Asuncion')::date";
const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta de crédito', tarjeta_debito: 'Tarjeta de débito', transferencia: 'Transferencia', qr: 'QR' };
const EST_PLAN = { pendiente: 'Pendiente', aprobado: 'Aprobado', en_proceso: 'En proceso', finalizado: 'Finalizado', cancelado: 'Cancelado' };

/* Cada reporte: grupo, titulo, descripcion, filtros (los que acepta),
   columnas [{k, t, tipo}] (tipo: texto | gs | num | fecha | pct),
   totalizar (claves a sumar) y datos(ctx) → filas. ctx.w(col, filtro) arma
   las condiciones opcionales con parámetros. */
const REPORTES = {
  // ------------------------------------------------------------- CLÍNICOS
  tratamientos_realizados: {
    grupo: 'Clínicos', titulo: 'Tratamientos realizados', descripcion: 'Consultas registradas en la historia clínica en el período.',
    filtros: ['odontologoId', 'tratamientoId'],
    columnas: [{ k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'paciente', t: 'Paciente' }, { k: 'odontologo', t: 'Odontólogo' }, { k: 'tratamiento', t: 'Tratamiento' }, { k: 'procedimiento', t: 'Procedimiento' }, { k: 'piezas', t: 'Piezas' }, { k: 'firmada', t: 'Firmada' }],
    datos: (x) => x.q(`SELECT h.fecha, p.apellido || ', ' || p.nombre AS paciente, o.nombre AS odontologo, tr.nombre AS tratamiento, h.procedimiento,
        array_to_string(h.piezas, ', ') AS piezas, CASE WHEN h.firmada THEN 'Sí' ELSE 'No' END AS firmada
      FROM historia_clinica h JOIN pacientes p ON p.id=h.paciente_id LEFT JOIN odontologos o ON o.id=h.odontologo_id LEFT JOIN tratamientos tr ON tr.id=h.tratamiento_id
      WHERE h.clinica_id=$1 AND h.fecha BETWEEN $2 AND $3 AND h.enmendada_de_id IS NULL ${x.w('h.odontologo_id', 'odontologoId')} ${x.w('h.tratamiento_id', 'tratamientoId')}
      ORDER BY h.fecha, h.id`),
  },
  tratamientos_pendientes: {
    grupo: 'Clínicos', titulo: 'Tratamientos pendientes', descripcion: 'Planes de tratamiento sin terminar (situación actual; el período no aplica).',
    filtros: ['odontologoId', 'tratamientoId', 'estadoPlan'], sinPeriodo: true, totalizar: ['precio'],
    columnas: [{ k: 'paciente', t: 'Paciente' }, { k: 'tratamiento', t: 'Tratamiento' }, { k: 'pieza', t: 'Pieza' }, { k: 'estado', t: 'Estado' }, { k: 'odontologo', t: 'Odontólogo' }, { k: 'sesiones', t: 'Sesiones' }, { k: 'desde', t: 'Desde', tipo: 'fecha' }, { k: 'proximo_turno', t: 'Próximo turno', tipo: 'fecha' }, { k: 'precio', t: 'Precio', tipo: 'gs' }],
    datos: async (x) => (await x.q(`SELECT p.apellido || ', ' || p.nombre AS paciente, pt.nombre AS tratamiento, pt.pieza, pt.estado, o.nombre AS odontologo,
        pt.sesiones_realizadas || '/' || GREATEST(pt.sesiones_totales,1) AS sesiones, COALESCE(pt.fecha_inicio, pt.creado_en::date) AS desde,
        (SELECT min(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= $4::date AND t.estado IN ('reservado','confirmado')) AS proximo_turno,
        COALESCE(pt.precio,0) - COALESCE(pt.descuento,0) AS precio
      FROM planes_tratamiento pt JOIN pacientes p ON p.id=pt.paciente_id AND p.activo LEFT JOIN odontologos o ON o.id=pt.odontologo_id
      WHERE pt.clinica_id=$1 AND ${x.f.estadoPlan ? x.cond('pt.estado', 'estadoPlan') : "pt.estado IN ('pendiente','aprobado','en_proceso')"}
        ${x.w('pt.odontologo_id', 'odontologoId')} ${x.w('pt.tratamiento_id', 'tratamientoId')}
      ORDER BY COALESCE(pt.fecha_inicio, pt.creado_en::date)`)).map((r) => ({ ...r, estado: EST_PLAN[r.estado] || r.estado })),
  },
  tratamientos_mas_realizados: {
    grupo: 'Clínicos', titulo: 'Procedimientos más realizados', descripcion: 'Turnos atendidos en el período, agrupados por tratamiento.',
    filtros: ['odontologoId'], totalizar: ['cantidad'],
    columnas: [{ k: 'tratamiento', t: 'Tratamiento' }, { k: 'cantidad', t: 'Veces', tipo: 'num' }, { k: 'pacientes', t: 'Pacientes distintos', tipo: 'num' }, { k: 'porcentaje', t: '% del total', tipo: 'pct' }],
    datos: async (x) => {
      const r = await x.q(`SELECT COALESCE(tr.nombre, NULLIF(t.motivo,''), 'Sin tratamiento indicado') AS tratamiento, count(*)::int AS cantidad, count(DISTINCT t.paciente_id)::int AS pacientes
        FROM turnos t LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id
        WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 AND t.estado='atendido' ${x.w('t.odontologo_id', 'odontologoId')}
        GROUP BY 1 ORDER BY 2 DESC, 1`);
      const tot = r.reduce((s, f) => s + f.cantidad, 0);
      return r.map((f) => ({ ...f, porcentaje: tot ? Math.round((f.cantidad / tot) * 1000) / 10 : 0 }));
    },
  },
  diagnosticos: {
    grupo: 'Clínicos', titulo: 'Diagnósticos', descripcion: 'Diagnósticos escritos en las consultas del período (agrupados por texto).',
    filtros: ['odontologoId'], totalizar: ['cantidad'],
    columnas: [{ k: 'diagnostico', t: 'Diagnóstico' }, { k: 'cantidad', t: 'Consultas', tipo: 'num' }, { k: 'pacientes', t: 'Pacientes', tipo: 'num' }],
    datos: (x) => x.q(`SELECT min(trim(h.diagnostico)) AS diagnostico, count(*)::int AS cantidad, count(DISTINCT h.paciente_id)::int AS pacientes
      FROM historia_clinica h WHERE h.clinica_id=$1 AND h.fecha BETWEEN $2 AND $3 AND COALESCE(trim(h.diagnostico),'') <> '' AND h.enmendada_de_id IS NULL ${x.w('h.odontologo_id', 'odontologoId')}
      GROUP BY lower(trim(h.diagnostico)) ORDER BY 2 DESC, 1 LIMIT 300`),
  },
  pacientes_nuevos: {
    grupo: 'Clínicos', titulo: 'Pacientes nuevos', descripcion: 'Pacientes dados de alta en el período.',
    filtros: [],
    columnas: [{ k: 'alta', t: 'Alta', tipo: 'fecha' }, { k: 'paciente', t: 'Paciente' }, { k: 'ci', t: 'C.I.' }, { k: 'telefono', t: 'Teléfono' }, { k: 'como_llego', t: 'Cómo llegó' }, { k: 'primera_visita', t: 'Primera visita', tipo: 'fecha' }],
    datos: (x) => x.q(`SELECT (p.creado_en AT TIME ZONE 'America/Asuncion')::date AS alta, p.apellido || ', ' || p.nombre AS paciente, p.ci, COALESCE(p.whatsapp, p.telefono) AS telefono,
        p.fuente_referencia AS como_llego, (SELECT min(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.estado='atendido') AS primera_visita
      FROM pacientes p WHERE p.clinica_id=$1 AND p.activo AND (p.creado_en AT TIME ZONE 'America/Asuncion')::date BETWEEN $2 AND $3 ORDER BY p.creado_en`),
  },
  pacientes_recurrentes: {
    grupo: 'Clínicos', titulo: 'Pacientes recurrentes', descripcion: 'Pacientes atendidos dos o más veces en el período.',
    filtros: ['odontologoId'],
    columnas: [{ k: 'paciente', t: 'Paciente' }, { k: 'visitas', t: 'Visitas', tipo: 'num' }, { k: 'primera', t: 'Primera del período', tipo: 'fecha' }, { k: 'ultima', t: 'Última', tipo: 'fecha' }, { k: 'telefono', t: 'Teléfono' }],
    datos: (x) => x.q(`SELECT p.apellido || ', ' || p.nombre AS paciente, count(*)::int AS visitas, min(t.fecha) AS primera, max(t.fecha) AS ultima, COALESCE(p.whatsapp, p.telefono) AS telefono
      FROM turnos t JOIN pacientes p ON p.id=t.paciente_id WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 AND t.estado='atendido' ${x.w('t.odontologo_id', 'odontologoId')}
      GROUP BY p.id HAVING count(*) >= 2 ORDER BY 2 DESC, 1`),
  },
  produccion_odontologo: {
    grupo: 'Clínicos', titulo: 'Producción por odontólogo', descripcion: 'Atención y montos por profesional en el período. "Presupuestado" son los presupuestos aceptados del período; "Cobrado" son los cobros vinculados a presupuestos de ese profesional.',
    filtros: ['odontologoId'], totalizar: ['atendidos', 'pacientes', 'consultas', 'presupuestado', 'cobrado'],
    columnas: [{ k: 'odontologo', t: 'Odontólogo' }, { k: 'atendidos', t: 'Turnos atendidos', tipo: 'num' }, { k: 'pacientes', t: 'Pacientes', tipo: 'num' }, { k: 'consultas', t: 'Consultas registradas', tipo: 'num' }, { k: 'horas', t: 'Horas en sillón', tipo: 'num' }, { k: 'presupuestado', t: 'Presupuestado', tipo: 'gs' }, { k: 'cobrado', t: 'Cobrado', tipo: 'gs' }],
    datos: (x) => x.q(`SELECT o.nombre AS odontologo,
        (SELECT count(*)::int FROM turnos t WHERE t.odontologo_id=o.id AND t.fecha BETWEEN $2 AND $3 AND t.estado='atendido') AS atendidos,
        (SELECT count(DISTINCT t.paciente_id)::int FROM turnos t WHERE t.odontologo_id=o.id AND t.fecha BETWEEN $2 AND $3 AND t.estado='atendido') AS pacientes,
        (SELECT count(*)::int FROM historia_clinica h WHERE h.odontologo_id=o.id AND h.fecha BETWEEN $2 AND $3 AND h.enmendada_de_id IS NULL) AS consultas,
        (SELECT round(COALESCE(sum(t.duracion_minutos),0)/60.0, 1) FROM turnos t WHERE t.odontologo_id=o.id AND t.fecha BETWEEN $2 AND $3 AND t.estado='atendido') AS horas,
        (SELECT COALESCE(sum(pr.total),0) FROM presupuestos pr WHERE pr.odontologo_id=o.id AND pr.estado='aceptado' AND pr.fecha BETWEEN $2 AND $3) AS presupuestado,
        (SELECT COALESCE(sum(p.monto),0) FROM pagos p JOIN presupuestos pr ON pr.id=p.presupuesto_id WHERE pr.odontologo_id=o.id AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3) AS cobrado
      FROM odontologos o WHERE o.clinica_id=$1 AND (o.activo OR EXISTS (SELECT 1 FROM turnos t WHERE t.odontologo_id=o.id AND t.fecha BETWEEN $2 AND $3)) ${x.w('o.id', 'odontologoId')} ORDER BY o.nombre`),
  },
  // ------------------------------------------------------------- FINANCIEROS
  resumen_financiero: {
    grupo: 'Financieros', titulo: 'Resumen financiero', descripcion: 'Indicadores del período. Pendiente y vencido son la situación al día de hoy.',
    filtros: [],
    columnas: [{ k: 'indicador', t: 'Indicador' }, { k: 'valor', t: 'Valor', tipo: 'gs' }, { k: 'detalle', t: 'Detalle' }],
    datos: async (x) => {
      const [fac, cob, anu, pend, venc] = await Promise.all([
        x.q("SELECT COALESCE(sum(total),0) AS t, count(*)::int AS n FROM facturas WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND estado<>'anulada'"),
        x.q(`SELECT COALESCE(sum(p.monto),0) AS t, count(*)::int AS n, count(DISTINCT p.paciente_id)::int AS pac FROM pagos p WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3`),
        x.q(`SELECT COALESCE(sum(p.monto),0) AS t, count(*)::int AS n FROM pagos p WHERE p.clinica_id=$1 AND p.estado='anulado' AND ${FECHA_PAGO} BETWEEN $2 AND $3`),
        x.q(`SELECT COALESCE(sum(s.saldo),0) AS t, count(*)::int AS n FROM (${SQL_SALDOS}) s WHERE s.saldo > 0`),
        x.q(`SELECT COALESCE(sum(c.monto),0) AS t, count(*)::int AS n FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id JOIN pacientes pa ON pa.id=pp.paciente_id AND pa.activo
             WHERE pp.clinica_id=$1 AND pp.estado <> 'cancelado' AND c.estado='pendiente' AND c.vencimiento < $4::date`),
      ]);
      const n = (r) => Number(r[0].t);
      return [
        { indicador: 'Facturado', valor: n(fac), detalle: `${fac[0].n} comprobante(s)` },
        { indicador: 'Cobrado', valor: n(cob), detalle: `${cob[0].n} cobro(s) de ${cob[0].pac} paciente(s)` },
        { indicador: 'Ticket promedio por cobro', valor: cob[0].n ? Math.round(n(cob) / cob[0].n) : 0, detalle: cob[0].n ? '' : 'Sin cobros en el período' },
        { indicador: 'Ticket promedio por paciente', valor: cob[0].pac ? Math.round(n(cob) / cob[0].pac) : 0, detalle: '' },
        { indicador: 'Cobros anulados', valor: n(anu), detalle: `${anu[0].n} anulación(es)` },
        { indicador: 'Pendiente de cobro (hoy)', valor: n(pend), detalle: `${pend[0].n} paciente(s) con saldo` },
        { indicador: 'Cuotas vencidas (hoy)', valor: n(venc), detalle: `${venc[0].n} cuota(s)` },
      ];
    },
  },
  cobros: {
    grupo: 'Financieros', titulo: 'Cobros', descripcion: 'Detalle de cobros del período.',
    filtros: ['metodo', 'usuarioId', 'estadoPago'], totalizar: ['monto'],
    columnas: [{ k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'recibo', t: 'Recibo N.º' }, { k: 'paciente', t: 'Paciente' }, { k: 'concepto', t: 'Concepto' }, { k: 'metodo', t: 'Método' }, { k: 'usuario', t: 'Cobró' }, { k: 'estado', t: 'Estado' }, { k: 'monto', t: 'Monto', tipo: 'gs' }],
    datos: async (x) => (await x.q(`SELECT ${FECHA_PAGO} AS fecha, p.id AS recibo, pa.apellido || ', ' || pa.nombre AS paciente, p.concepto, p.metodo, u.nombre AS usuario, p.estado, p.monto
      FROM pagos p JOIN pacientes pa ON pa.id=p.paciente_id LEFT JOIN usuarios u ON u.id=p.usuario_id
      WHERE p.clinica_id=$1 AND ${FECHA_PAGO} BETWEEN $2 AND $3 ${x.f.estadoPago ? `AND ${x.cond('p.estado', 'estadoPago')}` : "AND p.estado='pagado'"} ${x.w('p.metodo', 'metodo')} ${x.w('p.usuario_id', 'usuarioId')}
      ORDER BY p.fecha, p.id`)).map((r) => ({ ...r, metodo: METODOS[r.metodo] || r.metodo, estado: r.estado === 'pagado' ? 'Cobrado' : 'Anulado' })),
  },
  facturacion: {
    grupo: 'Financieros', titulo: 'Facturación', descripcion: 'Comprobantes emitidos en el período.',
    filtros: ['estadoFactura'], totalizar: ['total', 'iva'],
    columnas: [{ k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'numero', t: 'Número' }, { k: 'cliente', t: 'Cliente' }, { k: 'documento', t: 'RUC / C.I.' }, { k: 'condicion', t: 'Condición' }, { k: 'estado', t: 'Estado' }, { k: 'iva', t: 'IVA', tipo: 'gs' }, { k: 'total', t: 'Total', tipo: 'gs' }],
    datos: (x) => x.q(`SELECT f.fecha, f.numero_completo AS numero, f.cliente_nombre AS cliente, COALESCE(f.cliente_ruc, f.cliente_documento) AS documento, f.condicion, f.estado,
        COALESCE(f.iva_5,0) + COALESCE(f.iva_10,0) AS iva, f.total
      FROM facturas f WHERE f.clinica_id=$1 AND f.fecha BETWEEN $2 AND $3 ${x.f.estadoFactura ? `AND ${x.cond('f.estado', 'estadoFactura')}` : "AND f.estado<>'anulada'"} ORDER BY f.fecha, f.id`),
  },
  saldos_pendientes: {
    grupo: 'Financieros', titulo: 'Saldos pendientes', descripcion: 'Pacientes con saldo a la fecha (presupuestos aceptados − cobros − ajustes). El período no aplica.',
    filtros: [], sinPeriodo: true, totalizar: ['presupuestado', 'pagado', 'saldo'],
    columnas: [{ k: 'paciente', t: 'Paciente' }, { k: 'telefono', t: 'Teléfono' }, { k: 'presupuestado', t: 'Presupuestado', tipo: 'gs' }, { k: 'pagado', t: 'Pagado', tipo: 'gs' }, { k: 'saldo', t: 'Saldo', tipo: 'gs' }, { k: 'ultimo_pago', t: 'Último pago', tipo: 'fecha' }],
    datos: (x) => x.q(`SELECT s.* FROM (${SQL_SALDOS}) s WHERE s.saldo > 0 ORDER BY s.saldo DESC`),
  },
  cuotas_vencidas: {
    grupo: 'Financieros', titulo: 'Cuotas vencidas', descripcion: 'Cuotas sin pagar con vencimiento anterior a hoy. El período no aplica.',
    filtros: [], sinPeriodo: true, totalizar: ['monto'],
    columnas: [{ k: 'paciente', t: 'Paciente' }, { k: 'telefono', t: 'Teléfono' }, { k: 'cuota', t: 'Cuota' }, { k: 'vencimiento', t: 'Vencimiento', tipo: 'fecha' }, { k: 'dias', t: 'Días de atraso', tipo: 'num' }, { k: 'monto', t: 'Monto', tipo: 'gs' }],
    datos: (x) => x.q(`SELECT pa.apellido || ', ' || pa.nombre AS paciente, COALESCE(pa.whatsapp, pa.telefono) AS telefono, c.numero || ' de ' || pp.cantidad_cuotas AS cuota, c.vencimiento,
        ($4::date - c.vencimiento)::int AS dias, c.monto
      FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id JOIN pacientes pa ON pa.id=pp.paciente_id AND pa.activo
      WHERE pp.clinica_id=$1 AND pp.estado <> 'cancelado' AND c.estado='pendiente' AND c.vencimiento < $4::date ORDER BY c.vencimiento`),
  },
  metodos_pago: {
    grupo: 'Financieros', titulo: 'Métodos de pago', descripcion: 'Cobros del período por método.',
    filtros: ['usuarioId'], totalizar: ['cantidad', 'total'],
    columnas: [{ k: 'metodo', t: 'Método' }, { k: 'cantidad', t: 'Cobros', tipo: 'num' }, { k: 'total', t: 'Total', tipo: 'gs' }, { k: 'porcentaje', t: '% del total', tipo: 'pct' }],
    datos: async (x) => {
      const r = await x.q(`SELECT p.metodo, count(*)::int AS cantidad, sum(p.monto) AS total FROM pagos p
        WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3 ${x.w('p.usuario_id', 'usuarioId')} GROUP BY 1 ORDER BY 3 DESC`);
      const tot = r.reduce((s, f) => s + Number(f.total), 0);
      return r.map((f) => ({ ...f, metodo: METODOS[f.metodo] || f.metodo, porcentaje: tot ? Math.round((Number(f.total) / tot) * 1000) / 10 : 0 }));
    },
  },
  ingresos_odontologo: {
    grupo: 'Financieros', titulo: 'Ingresos por odontólogo', descripcion: 'Cobros del período según el profesional del presupuesto pagado. Los cobros sin presupuesto figuran como "Sin presupuesto".',
    filtros: ['metodo'], totalizar: ['cantidad', 'total'],
    columnas: [{ k: 'odontologo', t: 'Odontólogo' }, { k: 'cantidad', t: 'Cobros', tipo: 'num' }, { k: 'total', t: 'Total', tipo: 'gs' }, { k: 'porcentaje', t: '% del total', tipo: 'pct' }],
    datos: async (x) => {
      const r = await x.q(`SELECT COALESCE(o.nombre, CASE WHEN p.presupuesto_id IS NULL THEN 'Sin presupuesto' ELSE 'Presupuesto sin profesional' END) AS odontologo, count(*)::int AS cantidad, sum(p.monto) AS total
        FROM pagos p LEFT JOIN presupuestos pr ON pr.id=p.presupuesto_id LEFT JOIN odontologos o ON o.id=pr.odontologo_id
        WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3 ${x.w('p.metodo', 'metodo')} GROUP BY 1 ORDER BY 3 DESC`);
      const tot = r.reduce((s, f) => s + Number(f.total), 0);
      return r.map((f) => ({ ...f, porcentaje: tot ? Math.round((Number(f.total) / tot) * 1000) / 10 : 0 }));
    },
  },
  ingresos_tratamiento: {
    grupo: 'Financieros', titulo: 'Ingresos por tratamiento', descripcion: 'Cobros del período repartidos entre los ítems del presupuesto pagado (en proporción a su importe). Los cobros sin presupuesto se agrupan por concepto.',
    filtros: ['metodo', 'tratamientoId'], totalizar: ['total'],
    columnas: [{ k: 'tratamiento', t: 'Tratamiento / concepto' }, { k: 'total', t: 'Total', tipo: 'gs' }, { k: 'porcentaje', t: '% del total', tipo: 'pct' }],
    datos: async (x) => {
      const r = await x.q(`WITH pg AS (SELECT p.id, p.monto, p.presupuesto_id, p.concepto FROM pagos p WHERE p.clinica_id=$1 AND p.estado='pagado' AND ${FECHA_PAGO} BETWEEN $2 AND $3 ${x.w('p.metodo', 'metodo')}),
        it AS (SELECT i.presupuesto_id, i.tratamiento_id, COALESCE(tr.nombre, i.descripcion, 'Ítem') AS nombre, i.cantidad * i.precio_unitario AS importe,
                      sum(i.cantidad * i.precio_unitario) OVER (PARTITION BY i.presupuesto_id) AS total_pres
               FROM presupuesto_items i LEFT JOIN tratamientos tr ON tr.id=i.tratamiento_id WHERE i.presupuesto_id IN (SELECT presupuesto_id FROM pg))
        SELECT nombre AS tratamiento, round(sum(monto)) AS total FROM (
          SELECT it.nombre, it.tratamiento_id, pg.monto * CASE WHEN it.total_pres > 0 THEN it.importe / it.total_pres ELSE 0 END AS monto FROM pg JOIN it ON it.presupuesto_id=pg.presupuesto_id
          UNION ALL
          SELECT 'Sin presupuesto: ' || COALESCE(NULLIF(trim(pg.concepto),''), 'sin concepto'), NULL, pg.monto FROM pg WHERE pg.presupuesto_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM it WHERE it.presupuesto_id=pg.presupuesto_id)
        ) z WHERE true ${x.w('z.tratamiento_id', 'tratamientoId')} GROUP BY 1 HAVING round(sum(monto)) > 0 ORDER BY 2 DESC`);
      const tot = r.reduce((s, f) => s + Number(f.total), 0);
      return r.map((f) => ({ ...f, porcentaje: tot ? Math.round((Number(f.total) / tot) * 1000) / 10 : 0 }));
    },
  },
  // ------------------------------------------------------------- AGENDA
  asistencia: {
    grupo: 'Agenda', titulo: 'Asistencia, ausencias y ocupación', descripcion: 'Por odontólogo. Horas disponibles = horario de atención configurado (Configuración → página web → horarios) en los días del período, menos bloqueos de agenda.',
    filtros: ['odontologoId'], totalizar: ['turnos', 'atendidos', 'ausentes', 'cancelados', 'horas_usadas', 'horas_disponibles'],
    columnas: [{ k: 'odontologo', t: 'Odontólogo' }, { k: 'turnos', t: 'Turnos', tipo: 'num' }, { k: 'atendidos', t: 'Atendidos', tipo: 'num' }, { k: 'ausentes', t: 'Ausencias', tipo: 'num' }, { k: 'cancelados', t: 'Cancelaciones', tipo: 'num' },
      { k: 'asistencia', t: '% asistencia', tipo: 'pct' }, { k: 'horas_usadas', t: 'Horas utilizadas', tipo: 'num' }, { k: 'horas_disponibles', t: 'Horas disponibles', tipo: 'num' }, { k: 'ocupacion', t: '% ocupación', tipo: 'pct' }],
    datos: async (x) => {
      const filas = await x.q(`SELECT o.id, o.nombre AS odontologo, count(t.id)::int AS turnos,
          count(*) FILTER (WHERE t.estado='atendido')::int AS atendidos, count(*) FILTER (WHERE t.estado='no_asistio')::int AS ausentes, count(*) FILTER (WHERE t.estado='cancelado')::int AS cancelados,
          round(COALESCE(sum(t.duracion_minutos) FILTER (WHERE t.estado IN ('atendido','reservado','confirmado')),0)/60.0, 1) AS horas_usadas
        FROM odontologos o LEFT JOIN turnos t ON t.odontologo_id=o.id AND t.fecha BETWEEN $2 AND $3
        WHERE o.clinica_id=$1 AND (o.activo OR t.id IS NOT NULL) ${x.w('o.id', 'odontologoId')} GROUP BY o.id ORDER BY o.nombre`);
      const disp = await horasDisponibles(x.clinicaId, x.desde, x.hasta);
      return filas.map((f) => {
        const hd = disp.get(f.id);
        const efectivos = f.atendidos + f.ausentes;
        return { odontologo: f.odontologo, turnos: f.turnos, atendidos: f.atendidos, ausentes: f.ausentes, cancelados: f.cancelados,
          asistencia: efectivos ? Math.round((f.atendidos / efectivos) * 1000) / 10 : null, horas_usadas: Number(f.horas_usadas),
          horas_disponibles: hd === undefined ? null : hd, ocupacion: hd ? Math.round((Number(f.horas_usadas) / hd) * 1000) / 10 : null };
      });
    },
  },
  ausencias: {
    grupo: 'Agenda', titulo: 'Ausencias', descripcion: 'Turnos a los que el paciente no asistió.',
    filtros: ['odontologoId', 'tratamientoId'],
    columnas: [{ k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'hora', t: 'Hora' }, { k: 'paciente', t: 'Paciente' }, { k: 'telefono', t: 'Teléfono' }, { k: 'odontologo', t: 'Odontólogo' }, { k: 'motivo', t: 'Motivo' }, { k: 'reprogramo', t: '¿Volvió a reservar?' }],
    datos: (x) => x.q(`SELECT t.fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, p.apellido || ', ' || p.nombre AS paciente, COALESCE(p.whatsapp, p.telefono) AS telefono, o.nombre AS odontologo,
        COALESCE(tr.nombre, t.motivo) AS motivo, CASE WHEN EXISTS (SELECT 1 FROM turnos t2 WHERE t2.paciente_id=t.paciente_id AND t2.fecha > t.fecha AND t2.estado IN ('reservado','confirmado','atendido')) THEN 'Sí' ELSE 'No' END AS reprogramo
      FROM turnos t JOIN pacientes p ON p.id=t.paciente_id LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id
      WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 AND t.estado='no_asistio' ${x.w('t.odontologo_id', 'odontologoId')} ${x.w('t.tratamiento_id', 'tratamientoId')} ORDER BY t.fecha, t.hora_inicio`),
  },
  cancelaciones: {
    grupo: 'Agenda', titulo: 'Cancelaciones', descripcion: 'Turnos cancelados (fecha del turno dentro del período).',
    filtros: ['odontologoId', 'tratamientoId'],
    columnas: [{ k: 'fecha', t: 'Fecha del turno', tipo: 'fecha' }, { k: 'hora', t: 'Hora' }, { k: 'paciente', t: 'Paciente' }, { k: 'odontologo', t: 'Odontólogo' }, { k: 'motivo', t: 'Motivo del turno' }, { k: 'origen', t: 'Origen' }],
    datos: (x) => x.q(`SELECT t.fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, p.apellido || ', ' || p.nombre AS paciente, o.nombre AS odontologo, COALESCE(tr.nombre, t.motivo) AS motivo,
        CASE WHEN t.origen='web' THEN 'Página web' ELSE 'Clínica' END AS origen
      FROM turnos t JOIN pacientes p ON p.id=t.paciente_id LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id
      WHERE t.clinica_id=$1 AND t.fecha BETWEEN $2 AND $3 AND t.estado='cancelado' ${x.w('t.odontologo_id', 'odontologoId')} ${x.w('t.tratamiento_id', 'tratamientoId')} ORDER BY t.fecha, t.hora_inicio`),
  },
};

const SQL_SALDOS = `SELECT pa.apellido || ', ' || pa.nombre AS paciente, COALESCE(pa.whatsapp, pa.telefono) AS telefono,
    (SELECT COALESCE(SUM(total),0) FROM presupuestos WHERE paciente_id=pa.id AND estado='aceptado') AS presupuestado,
    (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE paciente_id=pa.id AND estado='pagado') AS pagado,
    (SELECT COALESCE(SUM(total),0) FROM presupuestos WHERE paciente_id=pa.id AND estado='aceptado')
      - (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE paciente_id=pa.id AND estado='pagado')
      - (SELECT COALESCE(SUM(CASE WHEN tipo='recargo' THEN -monto ELSE monto END),0) FROM ajustes_cuenta WHERE paciente_id=pa.id AND NOT anulado) AS saldo,
    (SELECT max((fecha AT TIME ZONE 'America/Asuncion')::date) FROM pagos WHERE paciente_id=pa.id AND estado='pagado') AS ultimo_pago
  FROM pacientes pa WHERE pa.clinica_id=$1 AND pa.activo`;

// Horas disponibles por odontólogo activo, según el horario de atención y los bloqueos.
async function horasDisponibles(clinicaId, desde, hasta) {
  const cfg = (await query('SELECT horarios FROM web_config WHERE clinica_id=$1 LIMIT 1', [clinicaId]).catch(() => ({ rows: [] }))).rows[0];
  const out = new Map();
  if (!cfg || !cfg.horarios) return out;
  const mins = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const [odos, bloq] = await Promise.all([
    query('SELECT id FROM odontologos WHERE clinica_id=$1 AND activo', [clinicaId]),
    query(`SELECT odontologo_id, fecha::text AS fecha, COALESCE(fecha_hasta, fecha)::text AS fecha_hasta, to_char(hora_desde,'HH24:MI') AS hd, to_char(hora_hasta,'HH24:MI') AS hh
           FROM agenda_bloqueos WHERE clinica_id=$1 AND fecha <= $3 AND COALESCE(fecha_hasta, fecha) >= $2`, [clinicaId, desde, hasta]),
  ]);
  for (const o of odos.rows) out.set(o.id, 0);
  const d = new Date(`${desde}T12:00:00Z`); const fin = new Date(`${hasta}T12:00:00Z`);
  let guard = 0;
  while (d <= fin && guard++ < 800) {
    const iso = d.toISOString().slice(0, 10);
    const franjas = cfg.horarios[String(d.getUTCDay())] || [];
    for (const o of odos.rows) {
      let total = 0;
      for (const [a, b] of franjas) {
        let libre = mins(b) - mins(a);
        for (const k of bloq.rows) {
          if ((k.odontologo_id && k.odontologo_id !== o.id) || iso < k.fecha || iso > k.fecha_hasta) continue;
          const bd = k.hd ? mins(k.hd) : 0; const bh = k.hh ? mins(k.hh) : 24 * 60;
          libre -= Math.max(0, Math.min(mins(b), bh) - Math.max(mins(a), bd));
        }
        total += Math.max(0, libre);
      }
      out.set(o.id, out.get(o.id) + total);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  for (const [k, v] of out) out.set(k, Math.round((v / 60) * 10) / 10);
  return out;
}

const FILTROS = {
  odontologoId: { tipo: 'id' }, tratamientoId: { tipo: 'id' }, usuarioId: { tipo: 'id' },
  metodo: { tipo: 'enum', valores: Object.keys(METODOS) },
  estadoPlan: { tipo: 'enum', valores: ['pendiente', 'aprobado', 'en_proceso', 'finalizado', 'cancelado'] },
  estadoPago: { tipo: 'enum', valores: ['pagado', 'anulado'] },
  estadoFactura: { tipo: 'enum', valores: ['pendiente', 'pagada', 'anulada'] },
};

async function ejecutar(clinicaId, clave, q) {
  const def = REPORTES[clave];
  if (!def) throw new ApiError(404, 'Reporte inexistente');
  const hoy = hoyIso();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde || '') ? q.desde : `${hoy.slice(0, 8)}01`;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '') ? q.hasta : hoy;
  if (desde > hasta) throw new ApiError(400, 'La fecha "desde" es posterior a "hasta"');
  if ((new Date(hasta) - new Date(desde)) / 864e5 > 1830) throw new ApiError(400, 'El período no puede superar 5 años');
  const f = {};
  for (const k of def.filtros) {
    const v = q[k]; if (v === undefined || v === '') continue;
    const spec = FILTROS[k];
    if (spec.tipo === 'id') { if (!/^\d+$/.test(String(v))) throw new ApiError(400, `Filtro inválido: ${k}`); f[k] = Number(v); }
    else { if (!spec.valores.includes(v)) throw new ApiError(400, `Filtro inválido: ${k}`); f[k] = v; }
  }
  const x = {
    clinicaId, desde, hasta, f,
    params: [clinicaId, desde, hasta, hoy],
    cond(col, k) { this.params.push(f[k]); return `${col} = $${this.params.length}`; },
    w(col, k) { return f[k] !== undefined ? `AND ${this.cond(col, k)}` : ''; },
  };
  // $1 clínica, $2 desde, $3 hasta, $4 hoy; los filtros siguen desde $5.
  // El CTE _p fija el tipo de $2..$4 aunque la consulta no los use.
  x.q = async (sql) => {
    const t = sql.trim();
    const conTipos = /^WITH\s/i.test(t) ? t.replace(/^WITH\s/i, 'WITH _p AS (SELECT $2::date AS d, $3::date AS h, $4::date AS hoy), ') : `WITH _p AS (SELECT $2::date AS d, $3::date AS h, $4::date AS hoy) ${t}`;
    const params = x.params; x.params = [clinicaId, desde, hasta, hoy];
    return (await query(conTipos, params)).rows;
  };
  const filas = await def.datos(x);
  const totales = def.totalizar ? Object.fromEntries(def.totalizar.map((k) => [k, filas.reduce((s, r) => s + (Number(r[k]) || 0), 0)])) : null;
  return { clave, grupo: def.grupo, titulo: def.titulo, descripcion: def.descripcion, sinPeriodo: !!def.sinPeriodo, desde, hasta, filtros: f, columnas: def.columnas, filas, totales };
}

// ---------------------------------------------------------------- exportación
const fmtFecha = (v) => { if (!v) return ''; const s = v instanceof Date ? v.toISOString() : String(v); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
const fmtCelda = (v, tipo) => {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'gs') return `Gs. ${Math.round(Number(v)).toLocaleString('es-PY')}`;
  if (tipo === 'pct') return `${String(v).replace('.', ',')} %`;
  if (tipo === 'num') return Number(v).toLocaleString('es-PY');
  if (tipo === 'fecha') return fmtFecha(v);
  return String(v);
};
async function nombresFiltros(clinicaId, f) {
  const out = [];
  if (f.odontologoId) out.push(`Odontólogo: ${(await query('SELECT nombre FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, f.odontologoId])).rows[0]?.nombre || f.odontologoId}`);
  if (f.tratamientoId) out.push(`Tratamiento: ${(await query('SELECT nombre FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, f.tratamientoId])).rows[0]?.nombre || f.tratamientoId}`);
  if (f.usuarioId) out.push(`Usuario: ${(await query('SELECT nombre FROM usuarios WHERE clinica_id=$1 AND id=$2', [clinicaId, f.usuarioId])).rows[0]?.nombre || f.usuarioId}`);
  if (f.metodo) out.push(`Método: ${METODOS[f.metodo]}`);
  for (const k of ['estadoPlan', 'estadoPago', 'estadoFactura']) if (f[k]) out.push(`Estado: ${f[k]}`);
  return out;
}
function encabezados(r, filtrosTxt) {
  return [r.titulo, r.sinPeriodo ? `Situación al ${fmtFecha(hoyIso())}` : `Período: ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)}`, ...filtrosTxt];
}

function csv(res, r, filtrosTxt) {
  const e = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [...encabezados(r, filtrosTxt).map((t) => e(t)), '', r.columnas.map((c) => e(c.t)).join(';'),
    ...r.filas.map((f) => r.columnas.map((c) => e(c.tipo === 'gs' || c.tipo === 'num' ? (f[c.k] ?? '') : c.tipo === 'fecha' ? fmtFecha(f[c.k]) : f[c.k])).join(';'))];
  if (r.totales) lineas.push(r.columnas.map((c, i) => e(i === 0 ? 'TOTAL' : r.totales[c.k] !== undefined ? r.totales[c.k] : '')).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${r.clave}-${r.desde}-${r.hasta}.csv"`);
  res.send(`﻿${lineas.join('\r\n')}`);
}

async function xlsx(res, r, filtrosTxt, clinica) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); wb.creator = 'DOVA'; wb.created = new Date();
  const ws = wb.addWorksheet(r.titulo.slice(0, 31));
  ws.addRow([clinica.nombre || 'DOVA']).font = { bold: true, size: 13 };
  for (const t of encabezados(r, filtrosTxt)) ws.addRow([t]);
  ws.addRow([]);
  const cab = ws.addRow(r.columnas.map((c) => c.t));
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8F4F32' } }; });
  for (const f of r.filas) {
    ws.addRow(r.columnas.map((c) => {
      const v = f[c.k];
      if (v === null || v === undefined) return null;
      if (c.tipo === 'gs' || c.tipo === 'num') return Number(v);
      if (c.tipo === 'pct') return Number(v) / 100;
      if (c.tipo === 'fecha') { const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : s; }
      return String(v);
    }));
  }
  if (r.totales) { const t = ws.addRow(r.columnas.map((c, i) => (i === 0 ? 'TOTAL' : r.totales[c.k] !== undefined ? r.totales[c.k] : null))); t.font = { bold: true }; }
  r.columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(45, Math.max(10, c.t.length + 4, ...r.filas.slice(0, 200).map((f) => String(f[c.k] ?? '').length + 2)));
    if (c.tipo === 'gs') col.numFmt = '#,##0';
    if (c.tipo === 'pct') col.numFmt = '0.0%';
    if (c.tipo === 'fecha') col.numFmt = 'dd/mm/yyyy';
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${r.clave}-${r.desde}-${r.hasta}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function pdf(res, r, filtrosTxt, clinica) {
  const ancho = r.columnas.length > 6;
  const doc = new PDFDocument({ size: 'A4', layout: ancho ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.clave}-${r.desde}-${r.hasta}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width - 72;
  doc.fontSize(14).fillColor(clinica.color_primario || '#C1673F').text(clinica.nombre || 'DOVA');
  const [tit, ...resto] = encabezados(r, filtrosTxt);
  doc.moveDown(0.3).fontSize(13).fillColor('#000').text(tit);
  doc.fontSize(9).fillColor('#555').text(resto.join(' · '));
  if (r.descripcion) doc.fontSize(8).fillColor('#777').text(r.descripcion);
  doc.moveDown(0.6);
  // Ancho de columnas proporcional al contenido.
  const largo = r.columnas.map((c) => Math.min(40, Math.max(c.t.length, ...r.filas.slice(0, 100).map((f) => fmtCelda(f[c.k], c.tipo).length))) + 2);
  const sum = largo.reduce((a, b) => a + b, 0);
  const anchos = largo.map((l) => (l / sum) * W);
  const derecha = (c) => ['gs', 'num', 'pct'].includes(c.tipo);
  const fila = (vals, { negrita, fondo } = {}) => {
    const alto = Math.max(...vals.map((v, i) => doc.fontSize(8).heightOfString(v, { width: anchos[i] - 4 }))) + 6;
    if (doc.y + alto > doc.page.height - 50) { doc.addPage(); cabecera(); }
    const y = doc.y; let x = 36;
    if (fondo) doc.rect(36, y, W, alto).fill(fondo);
    vals.forEach((v, i) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(fondo === '#8F4F32' ? '#FFFFFF' : '#000000')
        .text(v, x + 2, y + 3, { width: anchos[i] - 4, align: derecha(r.columnas[i]) ? 'right' : 'left' });
      x += anchos[i];
    });
    doc.y = y + alto; doc.x = 36;
    doc.moveTo(36, doc.y).lineTo(36 + W, doc.y).strokeColor('#EEEEEE').lineWidth(0.5).stroke();
  };
  const cabecera = () => fila(r.columnas.map((c) => c.t), { negrita: true, fondo: '#8F4F32' });
  cabecera();
  if (!r.filas.length) doc.font('Helvetica').fontSize(9).fillColor('#555').text('Sin datos para estos filtros.', 36, doc.y + 6);
  for (const f of r.filas) fila(r.columnas.map((c) => fmtCelda(f[c.k], c.tipo)));
  if (r.totales) fila(r.columnas.map((c, i) => (i === 0 ? 'TOTAL' : r.totales[c.k] !== undefined ? fmtCelda(r.totales[c.k], c.tipo) : '')), { negrita: true, fondo: '#F3EDE8' });
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor('#999').text(`Generado por DOVA el ${new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' })} · Página ${i + 1} de ${rango.count}`, 36, doc.page.height - 30, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
}

// ---------------------------------------------------------------- rutas
const router = express.Router();
router.get('/centro', requirePermiso('reportes.view'), (req, res) => {
  res.json(Object.entries(REPORTES).map(([clave, d]) => ({ clave, grupo: d.grupo, titulo: d.titulo, descripcion: d.descripcion, filtros: d.filtros, sinPeriodo: !!d.sinPeriodo })));
});
router.get('/centro-opciones', requirePermiso('reportes.view'), async (req, res, next) => {
  try {
    const c = req.clinicaId;
    const [o, t, u] = await Promise.all([
      query('SELECT id, nombre, activo FROM odontologos WHERE clinica_id=$1 ORDER BY activo DESC, nombre', [c]),
      query('SELECT id, nombre FROM tratamientos WHERE clinica_id=$1 ORDER BY activo DESC, nombre', [c]),
      query('SELECT id, nombre FROM usuarios WHERE clinica_id=$1 ORDER BY activo DESC, nombre', [c]),
    ]);
    res.json({ odontologos: o.rows, tratamientos: t.rows, usuarios: u.rows, metodos: METODOS, puedeExportar: (req.usuario.permisos || []).includes('reportes.export') });
  } catch (e) { next(e); }
});
router.get('/centro/:clave', requirePermiso('reportes.view'), async (req, res, next) => {
  try {
    const formato = req.query.formato || 'json';
    if (!['json', 'csv', 'xlsx', 'pdf'].includes(formato)) throw new ApiError(400, 'Formato inválido');
    if (formato !== 'json' && !(req.usuario.permisos || []).includes('reportes.export')) throw new ApiError(403, 'No tenés permiso para exportar reportes');
    const r = await ejecutar(req.clinicaId, req.params.clave, req.query);
    if (formato === 'json') { res.json(r); return; }
    const [clinica, filtrosTxt] = await Promise.all([clinicaRepo.findById(req.clinicaId), nombresFiltros(req.clinicaId, r.filtros)]);
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'exportar_reporte', modulo: 'reportes', entidadId: null,
      detalle: { reporte: r.clave, formato, desde: r.desde, hasta: r.hasta, filtros: r.filtros, filas: r.filas.length } });
    if (formato === 'csv') return csv(res, r, filtrosTxt);
    if (formato === 'xlsx') return await xlsx(res, r, filtrosTxt, clinica || {});
    return pdf(res, r, filtrosTxt, clinica || {});
  } catch (e) { next(e); }
});

module.exports = { router, ejecutar, REPORTES };
