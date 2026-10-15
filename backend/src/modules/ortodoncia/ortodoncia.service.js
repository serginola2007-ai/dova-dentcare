/* Ortodoncia: tablero de la clínica y cuotas mensuales del tratamiento.
   Los casos y las visitas viven en /api/especialidades/orto-casos y orto-visitas. Acá:
   - panel(): quién está en tratamiento, a quién le toca control (y quién lo tiene atrasado) y quién
     debe cuotas.
   - generarCuotas(): convierte el honorario del caso en un plan de cuotas mensuales (el mismo plan de
     pago de siempre, así todo lo de cobranza funciona solo). */
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const { hoyIso } = require('../../utils/recurso');

const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

async function panel(clinicaId) {
  const hoy = hoyIso();
  const r = await query(`
    SELECT c.id, c.paciente_id, c.fase, c.tipo_aparatologia, c.marca, c.fecha_instalacion::text AS fecha_instalacion, c.fecha_retiro_estimada::text AS fecha_retiro_estimada,
           c.honorario_total, c.entrega_inicial, c.cuota_mensual, c.plan_pago_id, c.total_alineadores,
           p.nombre || ' ' || p.apellido AS paciente, o.nombre AS odontologo,
           (SELECT max(v.fecha)::text FROM orto_visitas v WHERE v.caso_id=c.id) AS ultima_visita,
           (SELECT max(v.alineador_actual) FROM orto_visitas v WHERE v.caso_id=c.id) AS alineador_actual,
           (SELECT pr.proxima_fecha::text FROM paciente_recalls pr JOIN recall_tipos rt ON rt.id=pr.recall_tipo_id
             WHERE pr.paciente_id=c.paciente_id AND pr.clinica_id=c.clinica_id AND rt.codigo='control_ortodoncia' AND pr.estado='activo') AS proximo_control,
           COALESCE((SELECT count(*) FROM cuotas q WHERE q.plan_pago_id=c.plan_pago_id AND q.estado<>'pagada' AND q.vencimiento < $2::date),0)::int AS cuotas_vencidas,
           COALESCE((SELECT sum(q.monto) FROM cuotas q WHERE q.plan_pago_id=c.plan_pago_id AND q.estado<>'pagada' AND q.vencimiento < $2::date),0) AS monto_vencido,
           COALESCE((SELECT count(*) FROM cuotas q WHERE q.plan_pago_id=c.plan_pago_id AND q.estado='pagada'),0)::int AS cuotas_pagadas,
           COALESCE((SELECT count(*) FROM cuotas q WHERE q.plan_pago_id=c.plan_pago_id),0)::int AS cuotas_total
      FROM orto_casos c JOIN pacientes p ON p.id=c.paciente_id LEFT JOIN odontologos o ON o.id=c.odontologo_id
     WHERE c.clinica_id=$1 AND c.fase IN ('diagnostico','activa','contencion')
     ORDER BY (c.fase='activa') DESC, c.fecha_instalacion DESC NULLS LAST, c.id DESC LIMIT 500`, [clinicaId, hoy]);
  const casos = r.rows.map((c) => ({
    id: c.id, pacienteId: c.paciente_id, paciente: c.paciente, odontologo: c.odontologo, fase: c.fase, aparato: c.tipo_aparatologia, marca: c.marca,
    instalacion: c.fecha_instalacion, retiroEstimado: c.fecha_retiro_estimada, ultimaVisita: c.ultima_visita,
    proximoControl: c.fase === 'activa' ? c.proximo_control : null,
    controlAtrasado: c.fase === 'activa' && c.proximo_control && c.proximo_control < hoy ? dias(c.proximo_control, hoy) : 0,
    alineador: c.tipo_aparatologia === 'alineadores' && c.total_alineadores ? { actual: c.alineador_actual || 0, total: c.total_alineadores } : null,
    honorario: Number(c.honorario_total || 0), entrega: Number(c.entrega_inicial || 0), cuotaMensual: Number(c.cuota_mensual || 0),
    tienePlan: !!c.plan_pago_id, cuotasPagadas: c.cuotas_pagadas, cuotasTotal: c.cuotas_total, cuotasVencidas: c.cuotas_vencidas, montoVencido: Number(c.monto_vencido),
    sinPlanDeCuotas: !c.plan_pago_id && Number(c.honorario_total || 0) > Number(c.entrega_inicial || 0) && c.fase !== 'diagnostico',
  }));
  return {
    resumen: {
      activos: casos.filter((c) => c.fase === 'activa').length, enContencion: casos.filter((c) => c.fase === 'contencion').length, enDiagnostico: casos.filter((c) => c.fase === 'diagnostico').length,
      controlesAtrasados: casos.filter((c) => c.controlAtrasado > 0).length, conCuotasVencidas: casos.filter((c) => c.cuotasVencidas > 0).length,
      montoVencido: casos.reduce((s, c) => s + c.montoVencido, 0), sinPlanDeCuotas: casos.filter((c) => c.sinPlanDeCuotas).length,
    },
    casos,
  };
}

async function cargarCaso(clinicaId, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Caso inválido');
  const c = (await query('SELECT * FROM orto_casos WHERE id=$1 AND clinica_id=$2', [n, clinicaId])).rows[0];
  if (!c) throw new ApiError(404, 'Caso no encontrado');
  return c;
}

async function cuotasDelCaso(clinicaId, id) {
  const c = await cargarCaso(clinicaId, id);
  if (!c.plan_pago_id) return { tienePlan: false, honorario: Number(c.honorario_total || 0), entrega: Number(c.entrega_inicial || 0), cuotaMensual: Number(c.cuota_mensual || 0), cuotas: [] };
  const q = await query("SELECT id, numero, monto, vencimiento::text AS vencimiento, estado, pagado_en FROM cuotas WHERE plan_pago_id=$1 ORDER BY numero", [c.plan_pago_id]);
  const hoy = hoyIso();
  return {
    tienePlan: true, planPagoId: c.plan_pago_id, honorario: Number(c.honorario_total || 0), entrega: Number(c.entrega_inicial || 0), cuotaMensual: Number(c.cuota_mensual || 0),
    cuotas: q.rows.map((x) => ({ id: x.id, numero: x.numero, monto: Number(x.monto), vencimiento: x.vencimiento, estado: x.estado, pagadoEn: x.pagado_en, vencida: x.estado !== 'pagada' && x.vencimiento < hoy })),
  };
}

// d: { cantidad?, primerVencimiento? }. Sin cantidad, sale de honorario ÷ cuota mensual del caso.
async function generarCuotas(clinicaId, id, d, usuario) {
  return conCandado([`orto:cuotas:${Number(id)}`], async () => {
    const c = await cargarCaso(clinicaId, id);
    if (c.plan_pago_id) throw new ApiError(409, 'Este caso ya tiene su plan de cuotas.');
    const honorario = Number(c.honorario_total || 0); const entrega = Number(c.entrega_inicial || 0);
    if (!(honorario > 0)) throw new ApiError(409, 'Cargá primero el honorario total del caso.');
    if (entrega >= honorario) throw new ApiError(409, 'La entrega inicial cubre todo el honorario: no hay cuotas para generar.');
    const saldo = honorario - entrega;
    let cantidad = d && d.cantidad !== undefined && d.cantidad !== '' ? Number(d.cantidad) : null;
    if (cantidad === null) {
      const cm = Number(c.cuota_mensual || 0);
      if (!(cm > 0)) throw new ApiError(400, 'Indicá en cuántas cuotas, o cargá la cuota mensual del caso.');
      cantidad = Math.ceil(saldo / cm);
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 60) throw new ApiError(400, 'La cantidad de cuotas tiene que ser de 1 a 60.');
    // Las cuotas vencen cada mes: la primera, un mes después de la fecha de inicio.
    let inicio = d && d.primerVencimiento ? String(d.primerVencimiento).slice(0, 10) : null;
    if (inicio && (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(`${inicio}T12:00:00Z`)))) throw new ApiError(400, 'Fecha inválida');
    if (!inicio) inicio = hoyIso();
    const plan = await require('../planes-pago/planespago.service').crear(clinicaId, { pacienteId: c.paciente_id, total: honorario, entrega, cantidadCuotas: cantidad, fechaInicio: inicio }, usuario);
    await query('UPDATE orto_casos SET plan_pago_id=$2, actualizado_en=now() WHERE id=$1', [c.id, plan.id]);
    await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'generar_cuotas_ortodoncia', modulo: 'ortodoncia', entidadId: c.id, detalle: { planPagoId: plan.id, cantidad, saldo } });
    return cuotasDelCaso(clinicaId, c.id);
  });
}

module.exports = { panel, cuotasDelCaso, generarCuotas };
