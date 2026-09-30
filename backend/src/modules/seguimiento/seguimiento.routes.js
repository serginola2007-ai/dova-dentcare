const express = require('express');
const { query } = require('../../config/db');
const { crearRecurso, hoyIso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const { enlaceWhatsapp, PLANTILLAS } = require('../../utils/mensajes');

const VER = ['seguimiento.view', 'seguimiento.manage', 'recalls.view'];
const EDITAR = ['seguimiento.manage', 'recalls.manage'];
const router = express.Router();

router.use('/comunicaciones', crearRecurso({
  tabla: 'comunicaciones', modulo: 'comunicaciones', porPaciente: true,
  permisos: { ver: [...VER, 'pacientes.clinical.view'], editar: [...EDITAR, 'whatsapp.send'] },
  borrado: false, orden: 't.fecha DESC', joinPaciente: true,
  selectExtra: 'u.nombre AS usuario_nombre', joins: 'LEFT JOIN usuarios u ON u.id = t.usuario_id',
  creadoPor: 'usuario_id',
  filtros: { motivo: { col: 'motivo' }, canal: { col: 'canal' } },
  campos: {
    canal: { tipo: 'enum', valores: ['whatsapp', 'llamada', 'sms', 'email', 'presencial', 'carta'], defecto: 'whatsapp' },
    direccion: { tipo: 'enum', valores: ['saliente', 'entrante'], defecto: 'saliente' },
    motivo: { tipo: 'enum', valores: ['recall', 'recordatorio_turno', 'confirmacion', 'cumpleanos', 'reactivacion', 'tratamiento_pendiente', 'presupuesto', 'cobranza', 'postoperatorio', 'encuesta', 'resultado', 'laboratorio', 'consulta', 'reclamo', 'otro'], defecto: 'otro' },
    resultado: { tipo: 'enum', valores: ['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar', 'confirmado', 'enviado'] },
    contenido: { tipo: 'texto' },
    referenciaTipo: { tipo: 'texto', max: 40 },
    referenciaId: { tipo: 'entero' },
    fecha: { tipo: 'fechahora' },
  },
}));

router.use('/encuestas', crearRecurso({
  tabla: 'encuestas_satisfaccion', modulo: 'encuestas', porPaciente: true,
  permisos: { ver: [...VER, 'kpis.view'], editar: EDITAR }, borrado: 'fisico', orden: 't.fecha DESC', joinPaciente: true,
  selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  campos: {
    turnoId: { tipo: 'id', ref: 'turnos' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    fecha: { tipo: 'fecha' },
    nps: { tipo: 'entero', min: 0, maxNum: 10 },
    atencion: { tipo: 'entero', min: 1, maxNum: 5 },
    puntualidad: { tipo: 'entero', min: 1, maxNum: 5 },
    limpieza: { tipo: 'entero', min: 1, maxNum: 5 },
    explicacion: { tipo: 'entero', min: 1, maxNum: 5 },
    comentario: { tipo: 'texto' },
    canal: { tipo: 'enum', valores: ['presencial', 'whatsapp', 'telefono', 'email', 'formulario'] },
  },
}));

router.use('/tareas', crearRecurso({
  tabla: 'tareas', modulo: 'tareas', permisos: { ver: ['tareas.manage', 'seguimiento.view'], editar: ['tareas.manage'] },
  actualizadoEn: true, borrado: 'fisico', creadoPor: 'creado_por',
  orden: "(t.estado IN ('hecha','cancelada')), t.vencimiento NULLS LAST, t.id DESC",
  selectExtra: "ua.nombre AS asignado_nombre, uc.nombre AS creado_por_nombre, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido",
  joins: 'LEFT JOIN usuarios ua ON ua.id=t.asignado_a LEFT JOIN usuarios uc ON uc.id=t.creado_por LEFT JOIN pacientes p ON p.id=t.paciente_id',
  filtros: { estado: { col: 'estado' }, asignadoA: { col: 'asignado_a', tipo: 'id' }, pacienteId: { col: 'paciente_id', tipo: 'id' } },
  campos: {
    titulo: { tipo: 'texto', requerido: true, max: 200 },
    descripcion: { tipo: 'texto' },
    pacienteId: { tipo: 'id', ref: 'pacientes' },
    asignadoA: { tipo: 'id', ref: 'usuarios' },
    vencimiento: { tipo: 'fecha' },
    prioridad: { tipo: 'enum', valores: ['baja', 'media', 'alta', 'urgente'], defecto: 'media' },
    estado: { tipo: 'enum', valores: ['pendiente', 'en_curso', 'hecha', 'cancelada'], defecto: 'pendiente' },
  },
  antesDeGuardar: async (d) => {
    if (d.estado === 'hecha') d.completada_en = new Date().toISOString();
    else if (d.estado) d.completada_en = null;
  },
}));

const r = express.Router();
r.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

async function nombreClinica(clinicaId) {
  const c = await query('SELECT nombre FROM clinicas WHERE id=$1', [clinicaId]);
  return c.rows[0] ? c.rows[0].nombre : 'la clínica';
}

// Familia del paciente: mismo grupo familiar, su responsable y a quiénes él es responsable.
r.get('/familia/:pacienteId', requirePermiso('pacientes.view'), h(async (req) => {
  const p = await query('SELECT id, grupo_familiar, responsable_paciente_id FROM pacientes WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.pacienteId)]);
  if (!p.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  const x = p.rows[0];
  const rs = await query(
    `SELECT p.id, p.nombre, p.apellido, p.fecha_nacimiento, p.telefono,
            CASE WHEN p.id = $3 THEN 'responsable' WHEN p.responsable_paciente_id = $2 THEN 'a_cargo' ELSE 'grupo_familiar' END AS relacion,
            (SELECT min(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado')) AS proximo_turno
       FROM pacientes p
      WHERE p.clinica_id=$1 AND p.activo AND p.id <> $2
        AND (($4::text IS NOT NULL AND lower(p.grupo_familiar) = lower($4::text)) OR p.id = $3 OR p.responsable_paciente_id = $2)
      ORDER BY p.fecha_nacimiento NULLS LAST`,
    [req.clinicaId, x.id, x.responsable_paciente_id, x.grupo_familiar && x.grupo_familiar.trim() ? x.grupo_familiar.trim() : null]
  );
  return rs.rows;
}));

// Integrantes del equipo (solo id, nombre y rol) para asignar tareas o
// filtrar la auditoría, sin exponer la administración de usuarios.
r.get('/equipo', requirePermiso('tareas.manage', 'seguimiento.view', 'auditoria.view', 'fichaje.view_all'), h(async (req) => {
  const rs = await query(
    `SELECT u.id, u.nombre, u.activo, r.nombre AS rol_nombre FROM usuarios u LEFT JOIN roles r ON r.id=u.rol_id
      WHERE u.clinica_id=$1 ORDER BY u.activo DESC, u.nombre`, [req.clinicaId]);
  return rs.rows;
}));

// Pacientes que no vienen hace N meses y no tienen turno futuro ni tratamiento en curso.
r.get('/reactivacion', requirePermiso(...VER), h(async (req) => {
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 3), 60);
  const rs = await query(
    `WITH ult AS (
       SELECT paciente_id, max(fecha) AS ultima FROM turnos WHERE clinica_id=$1 AND estado='atendido' GROUP BY paciente_id
     )
     SELECT p.id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_recordatorios, ult.ultima AS ultima_visita,
            (current_date - ult.ultima) AS dias_sin_venir,
            (SELECT max(c.fecha) FROM comunicaciones c WHERE c.paciente_id=p.id AND c.motivo='reactivacion') AS ultimo_intento
       FROM pacientes p JOIN ult ON ult.paciente_id=p.id
      WHERE p.clinica_id=$1 AND p.activo
        AND ult.ultima < current_date - ($2::int * 30)
        AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))
      ORDER BY ult.ultima DESC LIMIT 500`,
    [req.clinicaId, meses]
  );
  const clinica = await nombreClinica(req.clinicaId);
  return rs.rows.map((p) => ({
    ...p,
    whatsapp_link: p.acepta_recordatorios === false ? null : enlaceWhatsapp(p.whatsapp || p.telefono, PLANTILLAS.reactivacion({ nombre: p.nombre, clinica, meses: Math.floor(p.dias_sin_venir / 30) })),
  }));
}));

// Cumpleaños de los próximos N días (incluye hoy).
r.get('/cumpleanos', requirePermiso(...VER), h(async (req) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 0), 60);
  const rs = await query(
    `SELECT id, nombre, apellido, telefono, whatsapp, fecha_nacimiento, acepta_whatsapp,
            date_part('year', age(current_date, fecha_nacimiento))::int + CASE WHEN to_char(fecha_nacimiento,'MM-DD') = to_char(current_date,'MM-DD') THEN 0 ELSE 1 END AS cumple_anios,
            ((make_date(extract(year FROM current_date)::int, 1, 1) + (fecha_nacimiento - make_date(extract(year FROM fecha_nacimiento)::int, 1, 1)))) AS _aux
       FROM pacientes
      WHERE clinica_id=$1 AND activo AND fecha_nacimiento IS NOT NULL
        AND (
          (to_char(fecha_nacimiento, 'MM-DD') BETWEEN to_char(current_date, 'MM-DD') AND to_char(current_date + $2::int, 'MM-DD'))
          OR (to_char(current_date + $2::int, 'MM-DD') < to_char(current_date, 'MM-DD')
              AND (to_char(fecha_nacimiento, 'MM-DD') >= to_char(current_date, 'MM-DD') OR to_char(fecha_nacimiento, 'MM-DD') <= to_char(current_date + $2::int, 'MM-DD')))
        )
      ORDER BY (to_char(fecha_nacimiento,'MM-DD') < to_char(current_date,'MM-DD')), to_char(fecha_nacimiento, 'MM-DD')`,
    [req.clinicaId, dias]
  );
  const clinica = await nombreClinica(req.clinicaId);
  return rs.rows.map(({ _aux, ...p }) => ({
    ...p,
    es_hoy: String(p.fecha_nacimiento).slice(5) === hoyIso().slice(5),
    whatsapp_link: p.acepta_whatsapp === false ? null : enlaceWhatsapp(p.whatsapp || p.telefono, PLANTILLAS.cumpleanos({ nombre: p.nombre, clinica })),
  }));
}));

// Tratamientos planificados/aprobados/en curso sin turno futuro (Treatment Finder).
r.get('/tratamientos-sin-turno', requirePermiso(...VER, 'planes_tratamiento.view'), h(async (req) => {
  const params = [req.clinicaId];
  let filtroOd = '';
  if (req.query.odontologoId) { params.push(Number(req.query.odontologoId)); filtroOd = `AND pt.odontologo_id=$${params.length}`; }
  const rs = await query(
    `SELECT pt.id AS plan_id, pt.nombre AS plan_nombre, pt.estado, pt.pieza, pt.prioridad, pt.precio, pt.sesiones_totales, pt.sesiones_realizadas,
            pt.creado_en, pt.actualizado_en, p.id AS paciente_id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_recordatorios, o.nombre AS odontologo_nombre,
            (SELECT max(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.estado='atendido') AS ultima_visita,
            (current_date - pt.actualizado_en::date) AS dias_sin_movimiento
       FROM planes_tratamiento pt
       JOIN pacientes p ON p.id=pt.paciente_id AND p.activo
       LEFT JOIN odontologos o ON o.id=pt.odontologo_id
      WHERE pt.clinica_id=$1 AND pt.estado IN ('pendiente','aprobado','en_proceso') ${filtroOd}
        AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))
      ORDER BY CASE pt.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, pt.actualizado_en ASC
      LIMIT 500`,
    params
  );
  const clinica = await nombreClinica(req.clinicaId);
  return rs.rows.map((x) => ({
    ...x,
    whatsapp_link: x.acepta_recordatorios === false ? null : enlaceWhatsapp(x.whatsapp || x.telefono, PLANTILLAS.tratamiento_pendiente({ nombre: x.nombre, clinica, tratamiento: x.plan_nombre })),
  }));
}));

// Presupuestos presentados que el paciente todavía no aceptó ni rechazó.
r.get('/presupuestos-sin-respuesta', requirePermiso(...VER, 'presupuestos.view'), h(async (req) => {
  const rs = await query(
    `SELECT pr.id, pr.fecha, pr.vencimiento, pr.total, pr.estado, p.id AS paciente_id, p.nombre, p.apellido, p.telefono, p.whatsapp,
            (current_date - pr.fecha) AS dias
       FROM presupuestos pr JOIN pacientes p ON p.id=pr.paciente_id AND p.activo
      WHERE pr.clinica_id=$1 AND pr.estado IN ('borrador','enviado','pendiente','presentado')
      ORDER BY pr.fecha ASC LIMIT 500`,
    [req.clinicaId]
  );
  return rs.rows;
}));

// Recordatorios de turnos de un día (por defecto, mañana) con enlace de WhatsApp.
r.get('/recordatorios-turnos', requirePermiso(...VER, 'agenda.view'), h(async (req) => {
  const fecha = req.query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha) ? req.query.fecha : null;
  const rs = await query(
    `SELECT t.id, t.fecha, t.hora_inicio, t.estado, t.confirmacion, t.motivo, p.id AS paciente_id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_recordatorios,
            o.nombre AS odontologo_nombre,
            (SELECT max(c.fecha) FROM comunicaciones c WHERE c.referencia_tipo='turno' AND c.referencia_id=t.id) AS recordado_en
       FROM turnos t JOIN pacientes p ON p.id=t.paciente_id LEFT JOIN odontologos o ON o.id=t.odontologo_id
      WHERE t.clinica_id=$1 AND t.fecha = COALESCE($2::date, current_date + 1) AND t.estado IN ('reservado','confirmado')
      ORDER BY t.hora_inicio`,
    [req.clinicaId, fecha]
  );
  const clinica = await nombreClinica(req.clinicaId);
  return rs.rows.map((t) => ({
    ...t,
    whatsapp_link: t.acepta_recordatorios === false ? null : enlaceWhatsapp(t.whatsapp || t.telefono, PLANTILLAS.recordatorio_turno({ nombre: t.nombre, clinica, fecha: t.fecha, hora: t.hora_inicio, odontologo: t.odontologo_nombre })),
  }));
}));

// Marca un turno como "recordatorio enviado" y lo deja en el historial de comunicaciones.
r.post('/recordatorios-turnos/:turnoId/enviado', requirePermiso(...EDITAR, 'agenda.edit', 'whatsapp.send'), h(async (req) => {
  const t = await query('SELECT id, paciente_id FROM turnos WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.turnoId)]);
  if (!t.rowCount) throw new ApiError(404, 'Turno no encontrado');
  await query("UPDATE turnos SET confirmacion = CASE WHEN confirmacion='confirmado' THEN confirmacion ELSE 'recordatorio_enviado' END WHERE id=$1", [t.rows[0].id]);
  await query(
    `INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
     VALUES ($1,$2,$3,'saliente','recordatorio_turno','enviado',$4,'turno',$5,$6)`,
    [req.clinicaId, t.rows[0].paciente_id, req.body.canal || 'whatsapp', req.body.contenido || 'Recordatorio de turno', t.rows[0].id, req.usuario.id]
  );
  return { ok: true };
}));

// Genera el texto y el enlace wa.me de cualquier plantilla para un paciente.
r.post('/mensaje', requirePermiso(...EDITAR, 'whatsapp.send'), h(async (req) => {
  const { pacienteId, plantilla, datos = {} } = req.body || {};
  if (!PLANTILLAS[plantilla]) throw new ApiError(400, `Plantilla inválida. Opciones: ${Object.keys(PLANTILLAS).join(', ')}`);
  const p = await query('SELECT nombre, telefono, whatsapp FROM pacientes WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(pacienteId)]);
  if (!p.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  const texto = PLANTILLAS[plantilla]({ ...datos, nombre: p.rows[0].nombre, clinica: await nombreClinica(req.clinicaId) });
  return { texto, whatsapp_link: enlaceWhatsapp(p.rows[0].whatsapp || p.rows[0].telefono, texto) };
}));

// Panel de seguimiento: todos los contadores de un vistazo.
r.get('/panel', requirePermiso(...VER), h(async (req) => {
  const c = req.clinicaId;
  const uno = async (sql, params = [c]) => Number((await query(sql, params)).rows[0].n);
  const [recallsVencidos, recallsProximos, controlesVencidos, controlesSemana, observacionesVencidas, sinTurno, reactivar, cumpleHoy, turnosManana, sinConfirmar, labAtrasados, biopsiasPendientes, tareasPend, nps] = await Promise.all([
    uno("SELECT count(*) n FROM paciente_recalls r JOIN pacientes p ON p.id=r.paciente_id AND p.activo WHERE r.clinica_id=$1 AND r.estado='activo' AND r.proxima_fecha < current_date"),
    uno("SELECT count(*) n FROM paciente_recalls r JOIN pacientes p ON p.id=r.paciente_id AND p.activo WHERE r.clinica_id=$1 AND r.estado='activo' AND r.proxima_fecha BETWEEN current_date AND current_date + 30"),
    uno("SELECT count(*) n FROM controles_programados WHERE clinica_id=$1 AND estado='pendiente' AND fecha_programada < current_date"),
    uno("SELECT count(*) n FROM controles_programados WHERE clinica_id=$1 AND estado='pendiente' AND fecha_programada BETWEEN current_date AND current_date + 7"),
    uno("SELECT count(*) n FROM piezas_observacion WHERE clinica_id=$1 AND estado='en_observacion' AND fecha_reevaluacion <= current_date"),
    uno(`SELECT count(*) n FROM planes_tratamiento pt JOIN pacientes p ON p.id=pt.paciente_id AND p.activo WHERE pt.clinica_id=$1 AND pt.estado IN ('pendiente','aprobado','en_proceso')
          AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))`),
    uno(`SELECT count(*) n FROM pacientes p WHERE p.clinica_id=$1 AND p.activo
          AND (SELECT max(t.fecha) FROM turnos t WHERE t.paciente_id=p.id AND t.estado='atendido') < current_date - 365
          AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))`),
    uno("SELECT count(*) n FROM pacientes WHERE clinica_id=$1 AND activo AND to_char(fecha_nacimiento,'MM-DD') = to_char(current_date,'MM-DD')"),
    uno("SELECT count(*) n FROM turnos WHERE clinica_id=$1 AND fecha = current_date + 1 AND estado IN ('reservado','confirmado')"),
    uno("SELECT count(*) n FROM turnos WHERE clinica_id=$1 AND fecha BETWEEN current_date AND current_date + 1 AND estado='reservado' AND confirmacion <> 'confirmado'"),
    uno("SELECT count(*) n FROM laboratorio WHERE clinica_id=$1 AND estado NOT IN ('recibido','controlado','instalado','cancelado','entregado') AND fecha_estimada < current_date"),
    uno("SELECT count(*) n FROM biopsias WHERE clinica_id=$1 AND estado IN ('tomada','enviada')"),
    uno("SELECT count(*) n FROM tareas WHERE clinica_id=$1 AND estado IN ('pendiente','en_curso')"),
    query("SELECT round(avg(nps),1) AS promedio, count(*) AS n, count(*) FILTER (WHERE nps>=9) AS promotores, count(*) FILTER (WHERE nps<=6) AS detractores FROM encuestas_satisfaccion WHERE clinica_id=$1 AND nps IS NOT NULL AND fecha >= current_date - 180", [c]).then((x) => x.rows[0]),
  ]);
  const n = Number(nps.n);
  return {
    recallsVencidos, recallsProximos, controlesVencidos, controlesSemana, observacionesVencidas,
    tratamientosSinTurno: sinTurno, pacientesParaReactivar: reactivar, cumpleanosHoy: cumpleHoy,
    turnosManana, turnosSinConfirmar: sinConfirmar, laboratorioAtrasado: labAtrasados, biopsiasPendientes, tareasPendientes: tareasPend,
    nps: n ? { encuestas: n, puntaje: Math.round(((Number(nps.promotores) - Number(nps.detractores)) / n) * 100) } : null,
  };
}));

// Línea de seguimiento de un paciente: todo lo que tiene pendiente a futuro.
r.get('/paciente/:pacienteId', requirePermiso(...VER, 'pacientes.clinical.view'), h(async (req) => {
  const c = req.clinicaId; const p = Number(req.params.pacienteId);
  const [recalls, ctrl, obs, planes, turnos, comunicaciones, tareas] = await Promise.all([
    query(`SELECT r.*, rt.nombre AS tipo_nombre, rt.color AS tipo_color, COALESCE(r.intervalo_meses, rt.intervalo_meses) AS intervalo_efectivo
             FROM paciente_recalls r JOIN recall_tipos rt ON rt.id=r.recall_tipo_id WHERE r.clinica_id=$1 AND r.paciente_id=$2 ORDER BY (r.estado<>'activo'), r.proxima_fecha`, [c, p]),
    query("SELECT * FROM controles_programados WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY (estado<>'pendiente'), fecha_programada", [c, p]),
    query("SELECT * FROM piezas_observacion WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY (estado<>'en_observacion'), fecha_reevaluacion NULLS LAST", [c, p]),
    query("SELECT id, nombre, estado, pieza, prioridad FROM planes_tratamiento WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('pendiente','aprobado','en_proceso')", [c, p]),
    query("SELECT t.id, t.fecha, t.hora_inicio, t.estado, t.confirmacion, t.motivo, o.nombre AS odontologo_nombre FROM turnos t LEFT JOIN odontologos o ON o.id=t.odontologo_id WHERE t.clinica_id=$1 AND t.paciente_id=$2 ORDER BY t.fecha DESC, t.hora_inicio DESC LIMIT 30", [c, p]),
    query('SELECT c.*, u.nombre AS usuario_nombre FROM comunicaciones c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE c.clinica_id=$1 AND c.paciente_id=$2 ORDER BY c.fecha DESC LIMIT 50', [c, p]),
    query("SELECT t.*, u.nombre AS asignado_nombre FROM tareas t LEFT JOIN usuarios u ON u.id=t.asignado_a WHERE t.clinica_id=$1 AND t.paciente_id=$2 ORDER BY (t.estado IN ('hecha','cancelada')), t.vencimiento NULLS LAST", [c, p]),
  ]);
  return { recalls: recalls.rows, controles: ctrl.rows, observaciones: obs.rows, planesPendientes: planes.rows, turnos: turnos.rows, comunicaciones: comunicaciones.rows, tareas: tareas.rows };
}));

router.use('/', r);
module.exports = router;
