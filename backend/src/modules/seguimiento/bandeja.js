/* Bandeja de seguimiento (Fase 5).
   Detecta en el momento, con datos reales, los pacientes que necesitan un
   contacto y permite gestionar cada caso (responsable, próximo contacto,
   resultado y estado). Nada se inventa: si no hay casos, la lista sale vacía. */
const express = require('express');
const { query } = require('../../config/db');
const { hoyIso } = require('../../utils/recurso');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const { enlaceWhatsapp, PLANTILLAS } = require('../../utils/mensajes');
const auditoria = require('../../utils/auditoria');
const clinicaRepo = require('../clinica/clinica.repository');

const VER = ['seguimiento.view', 'seguimiento.manage', 'recalls.view'];
const EDITAR = ['seguimiento.manage', 'recalls.manage'];
const TIPOS = {
  tratamiento_incompleto: 'Tratamiento sin terminar',
  tratamiento_atrasado: 'Tratamiento atrasado',
  control_pendiente: 'Control pendiente',
  no_volvio: 'No volvió',
  presupuesto_no_aceptado: 'Presupuesto sin aceptar',
  saldo_pendiente: 'Saldo pendiente',
  cita_perdida: 'Cita perdida',
  manual: 'Otro',
};
const ESTADOS = ['pendiente', 'en_curso', 'resuelto', 'descartado'];
const RESULTADOS = ['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar', 'pago', 'otro'];
const CANALES = ['whatsapp', 'llamada', 'sms', 'email', 'presencial'];
const MOTIVO_COM = { tratamiento_incompleto: 'tratamiento_pendiente', tratamiento_atrasado: 'tratamiento_pendiente', control_pendiente: 'recall', no_volvio: 'reactivacion', presupuesto_no_aceptado: 'presupuesto', saldo_pendiente: 'cobranza', cita_perdida: 'consulta', manual: 'otro' };
const SIN_TURNO_FUTURO = "NOT EXISTS (SELECT 1 FROM turnos tf WHERE tf.paciente_id=p.id AND tf.fecha >= $2::date AND tf.estado IN ('reservado','confirmado'))";

// Cada detección devuelve: tipo, paciente_id, referencia_tipo, referencia_id, detalle, fecha, monto.
const DETECCIONES = {
  tratamiento_atrasado: `SELECT 'tratamiento_atrasado' tipo, p.id paciente_id, 'plan' referencia_tipo, pt.id referencia_id,
      pt.nombre || COALESCE(' · pieza ' || pt.pieza, '') || ' · debía terminar el ' || to_char(pt.fecha_estimada_fin,'DD/MM/YYYY') detalle, pt.fecha_estimada_fin fecha, NULL::numeric monto
    FROM planes_tratamiento pt JOIN pacientes p ON p.id=pt.paciente_id AND p.activo
    WHERE pt.clinica_id=$1 AND pt.estado IN ('pendiente','aprobado','en_proceso') AND pt.fecha_estimada_fin < $2::date`,
  tratamiento_incompleto: `SELECT 'tratamiento_incompleto', p.id, 'plan', pt.id,
      pt.nombre || COALESCE(' · pieza ' || pt.pieza, '') || ' · ' || pt.sesiones_realizadas || '/' || GREATEST(pt.sesiones_totales,1) || ' sesiones, sin turno', COALESCE(pt.fecha_inicio, pt.creado_en::date), NULL::numeric
    FROM planes_tratamiento pt JOIN pacientes p ON p.id=pt.paciente_id AND p.activo
    WHERE pt.clinica_id=$1 AND pt.estado IN ('pendiente','aprobado','en_proceso') AND pt.creado_en::date <= $2::date - 14
      AND (pt.fecha_estimada_fin IS NULL OR pt.fecha_estimada_fin >= $2::date) AND ${SIN_TURNO_FUTURO}`,
  control_pendiente: `SELECT 'control_pendiente', p.id, 'recall', r.id, rt.nombre || ' · correspondía el ' || to_char(r.proxima_fecha,'DD/MM/YYYY'), r.proxima_fecha, NULL::numeric
    FROM paciente_recalls r JOIN recall_tipos rt ON rt.id=r.recall_tipo_id JOIN pacientes p ON p.id=r.paciente_id AND p.activo
    WHERE r.clinica_id=$1 AND r.estado='activo' AND r.proxima_fecha <= $2::date AND ${SIN_TURNO_FUTURO}
    UNION ALL
    SELECT 'control_pendiente', p.id, 'control', c.id, c.titulo || ' · programado el ' || to_char(c.fecha_programada,'DD/MM/YYYY'), c.fecha_programada, NULL::numeric
    FROM controles_programados c JOIN pacientes p ON p.id=c.paciente_id AND p.activo
    WHERE c.clinica_id=$1 AND c.estado='pendiente' AND c.fecha_programada <= $2::date AND ${SIN_TURNO_FUTURO}`,
  no_volvio: `SELECT 'no_volvio', p.id, 'paciente', p.id, 'Última visita: ' || to_char(u.ultima,'DD/MM/YYYY'), u.ultima, NULL::numeric
    FROM pacientes p JOIN LATERAL (SELECT max(t.fecha) ultima FROM turnos t WHERE t.paciente_id=p.id AND t.estado='atendido') u ON true
    WHERE p.clinica_id=$1 AND p.activo AND u.ultima < $2::date - ($3::int * 30) AND ${SIN_TURNO_FUTURO}`,
  presupuesto_no_aceptado: `SELECT 'presupuesto_no_aceptado', p.id, 'presupuesto', x.id, 'Presupuesto N.º ' || x.id || ' enviado el ' || to_char(x.fecha,'DD/MM/YYYY'), x.fecha, x.total
    FROM presupuestos x JOIN pacientes p ON p.id=x.paciente_id AND p.activo
    WHERE x.clinica_id=$1 AND x.estado='enviado' AND x.fecha <= $2::date - 7`,
  saldo_pendiente: `SELECT 'saldo_pendiente', p.id, 'paciente', p.id,
      CASE WHEN cv.n > 0 THEN cv.n || ' cuota(s) vencida(s) desde el ' || to_char(cv.desde,'DD/MM/YYYY') ELSE 'Saldo sin pagos en los últimos 30 días' END,
      COALESCE(cv.desde, s.ultimo_pago::date, s.desde_pres), GREATEST(COALESCE(cv.monto,0), s.saldo)
    FROM pacientes p
    JOIN LATERAL (SELECT
        (SELECT COALESCE(SUM(total),0) FROM presupuestos WHERE paciente_id=p.id AND estado='aceptado')
      - (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE paciente_id=p.id AND estado='pagado')
      - (SELECT COALESCE(SUM(CASE WHEN tipo='recargo' THEN -monto ELSE monto END),0) FROM ajustes_cuenta WHERE paciente_id=p.id AND NOT anulado) AS saldo,
        (SELECT max(fecha) FROM pagos WHERE paciente_id=p.id AND estado='pagado') AS ultimo_pago,
        (SELECT min(fecha) FROM presupuestos WHERE paciente_id=p.id AND estado='aceptado') AS desde_pres) s ON true
    LEFT JOIN LATERAL (SELECT count(*) n, SUM(c.monto) monto, min(c.vencimiento) desde FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
        WHERE pp.paciente_id=p.id AND pp.estado <> 'cancelado' AND c.estado='pendiente' AND c.vencimiento < $2::date) cv ON true
    WHERE p.clinica_id=$1 AND p.activo AND (cv.n > 0 OR (s.saldo > 0 AND (s.ultimo_pago IS NULL OR s.ultimo_pago::date < $2::date - 30)))`,
  cita_perdida: `SELECT DISTINCT ON (p.id) 'cita_perdida', p.id, 'turno', t.id, 'No asistió el ' || to_char(t.fecha,'DD/MM/YYYY') || COALESCE(' · ' || t.motivo, ''), t.fecha, NULL::numeric
    FROM turnos t JOIN pacientes p ON p.id=t.paciente_id AND p.activo
    WHERE t.clinica_id=$1 AND t.estado='no_asistio' AND t.fecha >= $2::date - 60 AND t.fecha <= $2::date
      AND NOT EXISTS (SELECT 1 FROM turnos t2 WHERE t2.paciente_id=p.id AND t2.fecha > t.fecha AND t2.estado IN ('reservado','confirmado','atendido'))
    ORDER BY p.id, t.fecha DESC`,
};

async function detectar(clinicaId, { tipo, meses }) {
  const tipos = tipo && DETECCIONES[tipo] ? [tipo] : Object.keys(DETECCIONES);
  const sql = tipos.map((t) => `(${DETECCIONES[t]})`).join('\nUNION ALL\n');
  return (await query(`WITH _m AS (SELECT $2::date AS hoy, $3::int AS meses), det(tipo, paciente_id, referencia_tipo, referencia_id, detalle, fecha, monto) AS (${sql}) SELECT * FROM det`, [clinicaId, hoyIso(), meses])).rows;
}

const router = express.Router();
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

// GET /seguimiento/bandeja?vista=hoy|todos|mios&tipo=&responsableId=&meses=12
router.get('/bandeja', requirePermiso(...VER), h(async (req) => {
  const c = req.clinicaId; const hoy = hoyIso();
  const meses = Math.min(60, Math.max(3, Number(req.query.meses) || 12));
  const tipo = req.query.tipo && TIPOS[req.query.tipo] ? req.query.tipo : null;
  const [det, casos, cerrados] = await Promise.all([
    tipo === 'manual' ? [] : detectar(c, { tipo, meses }),
    query(`SELECT k.*, u.nombre AS responsable_nombre FROM seguimiento_casos k LEFT JOIN usuarios u ON u.id=k.responsable_id
           WHERE k.clinica_id=$1 AND k.estado IN ('pendiente','en_curso')`, [c]).then((r) => r.rows),
    query(`SELECT tipo, referencia_tipo, referencia_id FROM seguimiento_casos WHERE clinica_id=$1 AND referencia_id IS NOT NULL
           AND (estado='descartado' OR (estado='resuelto' AND cerrado_en > now() - interval '30 days'))`, [c]).then((r) => r.rows),
  ]);
  const clave = (x) => `${x.tipo}|${x.referencia_tipo}|${x.referencia_id}`;
  const abiertos = new Map(casos.map((k) => [clave(k), k]));
  const omitir = new Set(cerrados.map(clave));
  const filas = [];
  for (const d of det) {
    if (omitir.has(clave(d))) continue;
    const k = abiertos.get(clave(d)); if (k) abiertos.delete(clave(d));
    filas.push({ ...d, caso: k || null });
  }
  // Casos abiertos que ya no se detectan (o manuales): se siguen mostrando hasta cerrarlos.
  for (const k of abiertos.values()) {
    if (tipo && k.tipo !== tipo) continue;
    filas.push({ tipo: k.tipo, paciente_id: k.paciente_id, referencia_tipo: k.referencia_tipo, referencia_id: k.referencia_id, detalle: k.motivo || '', fecha: k.creado_en, monto: null, caso: k, yaNoDetectado: k.tipo !== 'manual' });
  }
  const ids = [...new Set(filas.map((f) => f.paciente_id))];
  const pacs = ids.length ? (await query('SELECT id, nombre, apellido, telefono, whatsapp FROM pacientes WHERE clinica_id=$1 AND id = ANY($2::int[])', [c, ids])).rows : [];
  const pm = new Map(pacs.map((p) => [p.id, p]));
  const clinica = await clinicaRepo.findById(c);
  const nomClin = (clinica && clinica.nombre) || 'la clínica';
  let out = filas.filter((f) => pm.has(f.paciente_id)).map((f) => {
    const p = pm.get(f.paciente_id);
    const plant = f.tipo === 'saldo_pendiente' ? PLANTILLAS.cobranza({ nombre: p.nombre, clinica: nomClin, monto: f.monto })
      : f.tipo === 'no_volvio' ? PLANTILLAS.reactivacion({ nombre: p.nombre, clinica: nomClin, meses })
        : ['tratamiento_incompleto', 'tratamiento_atrasado'].includes(f.tipo) ? PLANTILLAS.tratamiento_pendiente({ nombre: p.nombre, clinica: nomClin, tratamiento: String(f.detalle).split(' · ')[0] })
          : `Hola ${p.nombre}, te escribimos de ${nomClin}. ¿Podemos coordinar tu próxima visita?`;
    return { ...f, tipo_nombre: TIPOS[f.tipo] || f.tipo, paciente_nombre: p.nombre, paciente_apellido: p.apellido, telefono: p.whatsapp || p.telefono || null, whatsapp_link: enlaceWhatsapp(p.whatsapp || p.telefono, plant) };
  });
  const vista = req.query.vista || 'hoy';
  if (vista === 'hoy') out = out.filter((f) => !f.caso || !f.caso.proximo_contacto || String(f.caso.proximo_contacto).slice(0, 10) <= hoy);
  if (vista === 'mios') out = out.filter((f) => f.caso && f.caso.responsable_id === req.usuario.id);
  if (req.query.responsableId) out = out.filter((f) => f.caso && f.caso.responsable_id === Number(req.query.responsableId));
  const fk = (f) => (f.fecha ? (f.fecha instanceof Date ? f.fecha.toISOString() : String(f.fecha)) : '9999');
  out.sort((a, b) => fk(a).localeCompare(fk(b)));
  const resumen = {};
  for (const f of out) resumen[f.tipo] = (resumen[f.tipo] || 0) + 1;
  return { total: out.length, resumen, tipos: TIPOS, filas: out.slice(0, 500) };
}));

function validarCaso(d) {
  if (d.estado && !ESTADOS.includes(d.estado)) throw new ApiError(400, 'Estado inválido');
  if (d.proximoContacto && !/^\d{4}-\d{2}-\d{2}$/.test(d.proximoContacto)) throw new ApiError(400, 'Fecha de próximo contacto inválida');
}
async function responsableValido(c, id) {
  if (!id) return null;
  const u = (await query('SELECT id FROM usuarios WHERE clinica_id=$1 AND id=$2 AND activo', [c, Number(id)])).rows[0];
  if (!u) throw new ApiError(400, 'El responsable no es un usuario activo de la clínica');
  return u.id;
}

// Crear (o tomar) un caso: desde una detección o a mano.
router.post('/casos', requirePermiso(...EDITAR), h(async (req) => {
  const c = req.clinicaId; const d = req.body || {};
  const tipo = TIPOS[d.tipo] ? d.tipo : 'manual';
  validarCaso(d);
  const pac = (await query('SELECT id FROM pacientes WHERE clinica_id=$1 AND id=$2', [c, Number(d.pacienteId)])).rows[0];
  if (!pac) throw new ApiError(404, 'Paciente no encontrado');
  if (tipo === 'manual' && String(d.motivo || '').trim().length < 3) throw new ApiError(400, 'Escribí el motivo del seguimiento');
  const resp = await responsableValido(c, d.responsableId);
  const refId = d.referenciaId ? Number(d.referenciaId) : null;
  if (refId) {
    const ya = (await query("SELECT * FROM seguimiento_casos WHERE clinica_id=$1 AND tipo=$2 AND referencia_tipo=$3 AND referencia_id=$4 AND estado IN ('pendiente','en_curso')", [c, tipo, d.referenciaTipo || null, refId])).rows[0];
    if (ya) return ya;
  }
  const k = (await query(`INSERT INTO seguimiento_casos (clinica_id, paciente_id, tipo, referencia_tipo, referencia_id, motivo, estado, responsable_id, proximo_contacto, creado_por)
                          VALUES ($1,$2,$3,$4,$5,$6,'pendiente',$7,$8,$9) RETURNING *`,
  [c, pac.id, tipo, refId ? (d.referenciaTipo || null) : null, refId, d.motivo ? String(d.motivo).slice(0, 2000) : null, resp, d.proximoContacto || null, req.usuario.id])).rows[0];
  await auditoria.registrar({ clinicaId: c, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'crear_seguimiento', modulo: 'seguimiento', entidadId: k.id, detalle: { tipo, pacienteId: pac.id } });
  return k;
}));

// Registrar una gestión: resultado, canal, nota, próximo contacto, estado, responsable.
router.post('/casos/:id/gestion', requirePermiso(...EDITAR), h(async (req) => {
  const c = req.clinicaId; const d = req.body || {};
  validarCaso(d);
  const k = (await query('SELECT * FROM seguimiento_casos WHERE clinica_id=$1 AND id=$2', [c, Number(req.params.id)])).rows[0];
  if (!k) throw new ApiError(404, 'Caso no encontrado');
  if (d.resultado && !RESULTADOS.includes(d.resultado)) throw new ApiError(400, 'Resultado inválido');
  if (d.canal && !CANALES.includes(d.canal)) throw new ApiError(400, 'Canal inválido');
  if (!d.resultado && !d.estado && d.proximoContacto === undefined && d.responsableId === undefined) throw new ApiError(400, 'No hay nada para registrar');
  const estado = d.estado || (d.resultado ? 'en_curso' : k.estado);
  if (estado === 'descartado' && String(d.nota || '').trim().length < 3) throw new ApiError(400, 'Para descartar el caso escribí el motivo');
  const resp = d.responsableId !== undefined ? await responsableValido(c, d.responsableId) : k.responsable_id;
  const cerrado = ['resuelto', 'descartado'].includes(estado);
  const nuevo = (await query(`UPDATE seguimiento_casos SET estado=$3, responsable_id=$4, proximo_contacto=$5,
      ultimo_resultado=COALESCE($6, ultimo_resultado), ultimo_contacto_en=CASE WHEN $6::text IS NOT NULL THEN now() ELSE ultimo_contacto_en END,
      intentos=intentos + CASE WHEN $6::text IS NOT NULL THEN 1 ELSE 0 END, cerrado_en=CASE WHEN $7 THEN now() ELSE NULL END, actualizado_en=now()
    WHERE clinica_id=$1 AND id=$2 RETURNING *`,
  [c, k.id, estado, resp, cerrado ? null : (d.proximoContacto !== undefined ? (d.proximoContacto || null) : k.proximo_contacto), d.resultado || null, cerrado])).rows[0];
  if (d.resultado || d.nota) {
    await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
                 VALUES ($1,$2,$3,'saliente',$4,$5,$6,'seguimiento',$7,$8)`,
    [c, k.paciente_id, d.canal || 'llamada', MOTIVO_COM[k.tipo] || 'otro', ['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar'].includes(d.resultado) ? d.resultado : (d.resultado ? 'contactado' : null),
      [d.nota, estado !== k.estado ? `Estado: ${estado}` : null].filter(Boolean).join(' · ') || null, k.id, req.usuario.id]);
  }
  await auditoria.registrar({ clinicaId: c, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'gestionar_seguimiento', modulo: 'seguimiento', entidadId: k.id,
    detalle: { antes: { estado: k.estado, proximo: k.proximo_contacto, responsable: k.responsable_id }, despues: { estado: nuevo.estado, proximo: nuevo.proximo_contacto, responsable: nuevo.responsable_id }, resultado: d.resultado || null } });
  return nuevo;
}));

router.get('/casos/:id', requirePermiso(...VER), h(async (req) => {
  const c = req.clinicaId;
  const k = (await query(`SELECT k.*, u.nombre AS responsable_nombre, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido FROM seguimiento_casos k
    JOIN pacientes p ON p.id=k.paciente_id LEFT JOIN usuarios u ON u.id=k.responsable_id WHERE k.clinica_id=$1 AND k.id=$2`, [c, Number(req.params.id)])).rows[0];
  if (!k) throw new ApiError(404, 'Caso no encontrado');
  const historial = (await query(`SELECT cm.fecha, cm.canal, cm.resultado, cm.contenido, u.nombre AS usuario_nombre FROM comunicaciones cm LEFT JOIN usuarios u ON u.id=cm.usuario_id
    WHERE cm.clinica_id=$1 AND cm.referencia_tipo='seguimiento' AND cm.referencia_id=$2 ORDER BY cm.fecha DESC`, [c, k.id])).rows;
  return { ...k, tipo_nombre: TIPOS[k.tipo], historial };
}));

router.get('/responsables', requirePermiso(...VER), h(async (req) => (await query('SELECT id, nombre FROM usuarios WHERE clinica_id=$1 AND activo ORDER BY nombre', [req.clinicaId])).rows));

module.exports = { router, TIPOS, detectar };
