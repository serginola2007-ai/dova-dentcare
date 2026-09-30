const express = require('express');
const { query, conCandado } = require('../../config/db');
const { crearRecurso, hoyIso, sumarMeses } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const { enlaceWhatsapp, PLANTILLAS } = require('../../utils/mensajes');

const router = express.Router();

// ================================ SILLONES ================================
router.use('/sillones', crearRecurso({
  tabla: 'sillones', modulo: 'agenda', permisos: { ver: ['agenda.view'], editar: ['agenda.config'] }, borrado: 'logico:activo', orden: 't.nombre',
  campos: { nombre: { tipo: 'texto', requerido: true, max: 60 }, ubicacion: { tipo: 'texto', max: 100 }, color: { tipo: 'texto', max: 20 }, activo: { tipo: 'bool' } },
}));

// ============================ BLOQUEOS DE AGENDA ============================
router.use('/bloqueos', crearRecurso({
  tabla: 'agenda_bloqueos', modulo: 'agenda', permisos: { ver: ['agenda.view'], editar: ['agenda.config'] }, borrado: 'fisico', creadoPor: 'creado_por',
  orden: 't.fecha DESC', selectExtra: 'o.nombre AS odontologo_nombre, s.nombre AS sillon_nombre',
  joins: 'LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN sillones s ON s.id=t.sillon_id',
  filtros: { desde: { col: 'fecha', op: '>=', tipo: 'fecha' }, hasta: { col: 'fecha', op: '<=', tipo: 'fecha' } },
  campos: {
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    sillonId: { tipo: 'id', ref: 'sillones' },
    fecha: { tipo: 'fecha', requerido: true },
    fechaHasta: { tipo: 'fecha' },
    horaDesde: { tipo: 'hora' },
    horaHasta: { tipo: 'hora' },
    tipo: { tipo: 'enum', valores: ['feriado', 'vacaciones', 'almuerzo', 'reunion', 'capacitacion', 'urgencias', 'mantenimiento', 'otro'], defecto: 'otro' },
    motivo: { tipo: 'texto', max: 200 },
  },
  antesDeGuardar: async (d, ctx) => {
    const p = ctx.previo || {};
    const desde = d.fecha || p.fecha; const hasta = d.fecha_hasta !== undefined ? d.fecha_hasta : p.fecha_hasta;
    if (hasta && hasta < desde) throw new ApiError(400, 'La fecha "hasta" no puede ser anterior a la fecha de inicio');
    const hd = d.hora_desde !== undefined ? d.hora_desde : p.hora_desde; const hh = d.hora_hasta !== undefined ? d.hora_hasta : p.hora_hasta;
    if ((hd && !hh) || (!hd && hh)) throw new ApiError(400, 'Indicá hora de inicio y de fin, o ninguna (bloqueo de día completo)');
    if (hd && hh && hh <= hd) throw new ApiError(400, 'La hora de fin debe ser posterior a la de inicio');
  },
}));

const x = express.Router();
x.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

// ¿Hay un bloqueo que afecte este horario? (la agenda lo consulta antes de reservar)
async function bloqueoQueAfecta(clinicaId, { fecha, horaInicio, duracionMinutos, odontologoId, sillonId }) {
  const r = await query(
    `SELECT b.*, o.nombre AS odontologo_nombre FROM agenda_bloqueos b LEFT JOIN odontologos o ON o.id=b.odontologo_id
      WHERE b.clinica_id=$1 AND $2::date BETWEEN b.fecha AND COALESCE(b.fecha_hasta, b.fecha)
        AND (b.odontologo_id IS NULL OR b.odontologo_id = $3)
        AND (b.sillon_id IS NULL OR $4::int IS NULL OR b.sillon_id = $4)
        AND (b.hora_desde IS NULL OR ($5::time < b.hora_hasta AND ($5::time + ($6::int * interval '1 minute')) > b.hora_desde))
      LIMIT 1`,
    [clinicaId, fecha, odontologoId || null, sillonId || null, horaInicio || '00:00', duracionMinutos || 30]
  );
  return r.rows[0] || null;
}
x.get('/bloqueos-verificar', requirePermiso('agenda.view'), h(async (req) => ({ bloqueo: await bloqueoQueAfecta(req.clinicaId, req.query) })));

// =========================== FLUJO DEL PACIENTE ===========================
// Llegada a la sala de espera -> pasa al sillón -> termina. Mide espera y duración real.
const PASOS = { llegada: 'llegada_en', sillon: 'en_sillon_en', finalizado: 'finalizado_en' };
x.post('/flujo/:turnoId/:paso', requirePermiso('agenda.edit', 'historia_clinica.edit'), h(async (req) => {
  const col = PASOS[req.params.paso];
  if (!col) throw new ApiError(400, 'Paso inválido (llegada, sillon, finalizado)');
  const t = await query('SELECT * FROM turnos WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.turnoId)]);
  if (!t.rowCount) throw new ApiError(404, 'Turno no encontrado');
  if (['cancelado', 'no_asistio'].includes(t.rows[0].estado)) throw new ApiError(409, `El turno está ${t.rows[0].estado}`);
  const sillon = req.body && req.body.sillonId ? Number(req.body.sillonId) : null;
  const guardar = () => query(`UPDATE turnos SET ${col}=now()${sillon ? ', sillon_id=$3' : ''}, actualizado_en=now() WHERE id=$1 AND clinica_id=$2`, sillon ? [t.rows[0].id, req.clinicaId, sillon] : [t.rows[0].id, req.clinicaId]);
  if (sillon && sillon !== t.rows[0].sillon_id) {
    // Pasar al sillón: el sillón tiene que ser de la clínica y estar libre en
    // el horario del turno (mismo candado que usa la agenda al reservar).
    const tu = t.rows[0];
    const dia = String(tu.fecha).slice(0, 10);
    await conCandado(`agenda:sillon:${req.clinicaId}:${sillon}:${dia}`, async () => {
      const { verificarReferencia } = require('../../utils/recurso');
      await verificarReferencia(req.clinicaId, 'sillones', sillon, 'sillonId');
      const ocupado = await query(
        `SELECT t.id, p.nombre || ' ' || p.apellido AS paciente FROM turnos t JOIN pacientes p ON p.id=t.paciente_id
          WHERE t.clinica_id=$1 AND t.sillon_id=$2 AND t.fecha=$3 AND t.id<>$6
            AND t.estado NOT IN ('cancelado','reprogramado','no_asistio','atendido') AND t.finalizado_en IS NULL
            AND t.hora_inicio < ($4::time + ($5::int * interval '1 minute')) AND (t.hora_inicio + (t.duracion_minutos * interval '1 minute')) > $4::time
          LIMIT 1`,
        [req.clinicaId, sillon, dia, tu.hora_inicio, tu.duracion_minutos || 30, tu.id]);
      if (ocupado.rowCount) throw new ApiError(409, `Ese sillón está ocupado en ese horario (turno #${ocupado.rows[0].id}, ${ocupado.rows[0].paciente}). Elegí otro sillón.`);
      await guardar();
    });
  } else {
    await guardar();
  }
  if (req.params.paso === 'finalizado' && t.rows[0].estado !== 'atendido') {
    const agenda = require('../agenda/agenda.service');
    await agenda.cambiarEstado(req.clinicaId, t.rows[0].id, 'atendido', req.usuario);
  }
  return (await query('SELECT id, estado, llegada_en, en_sillon_en, finalizado_en, sillon_id FROM turnos WHERE id=$1', [t.rows[0].id])).rows[0];
}));
x.post('/confirmacion/:turnoId', requirePermiso('agenda.edit'), h(async (req) => {
  const valor = req.body && req.body.confirmacion;
  if (!['sin_confirmar', 'recordatorio_enviado', 'confirmado', 'no_responde', 'pide_reprogramar'].includes(valor)) throw new ApiError(400, 'Valor de confirmación inválido');
  const t = await query(`UPDATE turnos SET confirmacion=$3::text, confirmado_en = CASE WHEN $3::text='confirmado' THEN now() ELSE confirmado_en END,
                           estado = CASE WHEN $3::text='confirmado' AND estado='reservado' THEN 'confirmado' ELSE estado END, actualizado_en=now()
                         WHERE clinica_id=$1 AND id=$2 RETURNING id, estado, confirmacion, confirmado_en, paciente_id`, [req.clinicaId, Number(req.params.turnoId), valor]);
  if (!t.rowCount) throw new ApiError(404, 'Turno no encontrado');
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'confirmacion_turno', modulo: 'agenda', entidadId: t.rows[0].id, detalle: { confirmacion: valor } });
  return t.rows[0];
}));
// Sala de espera de hoy: quién llegó, quién está en el sillón y cuánto espera.
x.get('/sala-espera', requirePermiso('agenda.view'), h(async (req) => {
  const r = await query(
    `SELECT t.id, t.hora_inicio, t.duracion_minutos, t.estado, t.confirmacion, t.llegada_en, t.en_sillon_en, t.finalizado_en,
            p.id AS paciente_id, p.nombre, p.apellido, o.nombre AS odontologo_nombre, s.nombre AS sillon_nombre,
            CASE WHEN t.llegada_en IS NOT NULL AND t.en_sillon_en IS NULL THEN round(extract(epoch FROM (now()-t.llegada_en))/60) END AS minutos_esperando,
            CASE WHEN t.llegada_en IS NOT NULL AND t.en_sillon_en IS NOT NULL THEN round(extract(epoch FROM (t.en_sillon_en - t.llegada_en))/60) END AS minutos_espera,
            CASE WHEN t.en_sillon_en IS NOT NULL AND t.finalizado_en IS NOT NULL THEN round(extract(epoch FROM (t.finalizado_en - t.en_sillon_en))/60) END AS minutos_atencion
       FROM turnos t JOIN pacientes p ON p.id=t.paciente_id LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN sillones s ON s.id=t.sillon_id
      WHERE t.clinica_id=$1 AND t.fecha=current_date AND t.estado NOT IN ('cancelado','reprogramado')
      ORDER BY t.hora_inicio`,
    [req.clinicaId]
  );
  return r.rows;
}));

// ================================ EQUIPOS ================================
router.use('/equipos', crearRecurso({
  tabla: 'equipos', modulo: 'equipos', permisos: { ver: ['equipos.manage', 'esterilizacion.manage', 'inventario.view'], editar: ['equipos.manage'] },
  actualizadoEn: true, borrado: 'fisico', orden: 't.nombre',
  selectExtra: '(SELECT max(m.fecha) FROM equipo_mantenimientos m WHERE m.equipo_id=t.id) AS ultimo_mantenimiento',
  campos: {
    nombre: { tipo: 'texto', requerido: true, max: 120 },
    tipo: { tipo: 'enum', valores: ['autoclave', 'sillon', 'compresor', 'rayos_x', 'sensor_rx', 'escaner_intraoral', 'lampara_fotocurado', 'ultrasonido', 'micromotor', 'turbina', 'aspiracion', 'localizador_apical', 'motor_endo', 'otro'], defecto: 'otro' },
    marca: { tipo: 'texto', max: 80 }, modelo: { tipo: 'texto', max: 80 }, numeroSerie: { tipo: 'texto', max: 80 },
    ubicacion: { tipo: 'texto', max: 80 },
    fechaCompra: { tipo: 'fecha' }, garantiaHasta: { tipo: 'fecha' },
    frecuenciaMantenimientoMeses: { tipo: 'entero', min: 1, maxNum: 60 },
    proximoMantenimiento: { tipo: 'fecha' },
    estado: { tipo: 'enum', valores: ['operativo', 'en_mantenimiento', 'fuera_de_servicio', 'baja'], defecto: 'operativo' },
    notas: { tipo: 'texto' },
  },
}));

router.use('/mantenimientos', crearRecurso({
  tabla: 'equipo_mantenimientos', modulo: 'equipos', permisos: { ver: ['equipos.manage'], editar: ['equipos.manage'] }, borrado: 'fisico', orden: 't.fecha DESC',
  selectExtra: 'e.nombre AS equipo_nombre', joins: 'JOIN equipos e ON e.id=t.equipo_id',
  filtros: { equipoId: { col: 'equipo_id', tipo: 'id' } },
  campos: {
    equipoId: { tipo: 'id', requerido: true, ref: 'equipos', soloCrear: true },
    fecha: { tipo: 'fecha' },
    tipo: { tipo: 'enum', valores: ['preventivo', 'correctivo', 'calibracion', 'validacion', 'dosimetria'], defecto: 'preventivo' },
    realizadoPor: { tipo: 'texto', max: 120 },
    costo: { tipo: 'numero', min: 0 },
    descripcion: { tipo: 'texto' },
  },
  // Recalcula el próximo mantenimiento del equipo según su frecuencia.
  despuesDeGuardar: async (f, ctx) => {
    const e = await query('SELECT frecuencia_mantenimiento_meses FROM equipos WHERE id=$1 AND clinica_id=$2', [f.equipo_id, ctx.clinicaId]);
    const meses = e.rows[0] && e.rows[0].frecuencia_mantenimiento_meses;
    if (meses && ['preventivo', 'validacion', 'calibracion'].includes(f.tipo)) {
      await query("UPDATE equipos SET proximo_mantenimiento=$3, estado=CASE WHEN estado='en_mantenimiento' THEN 'operativo' ELSE estado END, actualizado_en=now() WHERE id=$1 AND clinica_id=$2",
        [f.equipo_id, ctx.clinicaId, sumarMeses(String(f.fecha).slice(0, 10), meses)]);
    }
  },
}));

// ============================== ESTERILIZACIÓN ==============================
router.use('/esterilizacion/ciclos', crearRecurso({
  tabla: 'esterilizacion_ciclos', modulo: 'esterilizacion', permisos: { ver: ['esterilizacion.manage', 'pacientes.clinical.view'], editar: ['esterilizacion.manage'] },
  borrado: false, orden: 't.fecha DESC', creadoPor: 'operador_id',
  selectExtra: "e.nombre AS equipo_nombre, u.nombre AS operador_nombre, (SELECT count(*) FROM esterilizacion_paquetes p WHERE p.ciclo_id=t.id) AS paquetes, (SELECT count(*) FROM esterilizacion_paquetes p WHERE p.ciclo_id=t.id AND p.estado='usado') AS paquetes_usados",
  joins: 'LEFT JOIN equipos e ON e.id=t.equipo_id LEFT JOIN usuarios u ON u.id=t.operador_id',
  filtros: { estado: { col: 'estado' } },
  campos: {
    numero: { tipo: 'texto', requerido: true, max: 40, soloCrear: true },
    equipoId: { tipo: 'id', ref: 'equipos' },
    fecha: { tipo: 'fechahora' },
    metodo: { tipo: 'enum', valores: ['vapor', 'calor_seco', 'quimico', 'plasma'], defecto: 'vapor' },
    temperaturaC: { tipo: 'numero', min: 0, maxNum: 250 },
    presionBar: { tipo: 'numero', min: 0, maxNum: 5 },
    duracionMin: { tipo: 'entero', min: 1, maxNum: 300 },
    indicadorQuimico: { tipo: 'enum', valores: ['pasa', 'falla', 'na'], defecto: 'pasa' },
    indicadorBiologico: { tipo: 'enum', valores: ['pasa', 'falla', 'pendiente', 'na'], defecto: 'na' },
    bowieDick: { tipo: 'enum', valores: ['pasa', 'falla', 'na'], defecto: 'na' },
    notas: { tipo: 'texto' },
  },
  // Un ciclo con un indicador fallido nunca queda liberado.
  antesDeGuardar: async (d, ctx) => {
    const p = ctx.previo || {};
    const iq = d.indicador_quimico || p.indicador_quimico; const ib = d.indicador_biologico || p.indicador_biologico; const bd = d.bowie_dick || p.bowie_dick;
    d.estado = [iq, ib, bd].includes('falla') ? 'rechazado' : ib === 'pendiente' ? 'en_cuarentena' : 'liberado';
  },
  despuesDeGuardar: async (f, ctx) => {
    if (f.estado === 'rechazado') {
      // Todos los paquetes del ciclo pasan a reprocesar y se avisa si alguno ya se usó en un paciente.
      await query("UPDATE esterilizacion_paquetes SET estado='reprocesar' WHERE ciclo_id=$1 AND estado='disponible'", [f.id]);
      const usados = await query("SELECT count(*) n FROM esterilizacion_paquetes WHERE ciclo_id=$1 AND estado='usado'", [f.id]);
      if (Number(usados.rows[0].n) > 0) {
        await query(`INSERT INTO tareas (clinica_id, titulo, descripcion, prioridad, creado_por) VALUES ($1,$2,$3,'urgente',$4)`,
          [ctx.clinicaId, `Ciclo de esterilización ${f.numero} FALLIDO con paquetes ya usados`,
            `Se usaron ${usados.rows[0].n} paquete(s) de este ciclo en pacientes. Revisar la trazabilidad en Operaciones > Esterilización y evaluar el protocolo a seguir.`, ctx.usuario.id]);
      }
    }
  },
}));

// Un paquete cuya fecha de vencimiento ya pasó deja de estar disponible
// (se marca "vencido" para reprocesar). Se aplica al listar y en las alertas.
async function marcarPaquetesVencidos(clinicaId) {
  await query("UPDATE esterilizacion_paquetes SET estado='vencido' WHERE clinica_id=$1 AND estado='disponible' AND fecha_vencimiento < $2::date", [clinicaId, hoyIso()]);
}
router.use('/esterilizacion/paquetes', crearRecurso({
  antesDeListar: marcarPaquetesVencidos,
  tabla: 'esterilizacion_paquetes', modulo: 'esterilizacion', permisos: { ver: ['esterilizacion.manage', 'pacientes.clinical.view'], editar: ['esterilizacion.manage'] },
  borrado: 'fisico', orden: 't.id DESC',
  selectExtra: "c.numero AS ciclo_numero, c.estado AS ciclo_estado, c.fecha AS ciclo_fecha, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido",
  joins: 'JOIN esterilizacion_ciclos c ON c.id=t.ciclo_id LEFT JOIN pacientes p ON p.id=t.paciente_id',
  filtros: { cicloId: { col: 'ciclo_id', tipo: 'id' }, estado: { col: 'estado' }, pacienteId: { col: 'paciente_id', tipo: 'id' }, codigo: { col: 'codigo' } },
  campos: {
    cicloId: { tipo: 'id', requerido: true, ref: 'esterilizacion_ciclos', soloCrear: true },
    codigo: { tipo: 'texto', requerido: true, max: 40 },
    descripcion: { tipo: 'texto', max: 150 },
    fechaVencimiento: { tipo: 'fecha' },
    estado: { tipo: 'enum', valores: ['disponible', 'usado', 'vencido', 'reprocesar'], defecto: 'disponible' },
  },
  antesDeGuardar: async (d, ctx) => {
    if (ctx.creando && !d.fecha_vencimiento) d.fecha_vencimiento = sumarMeses(hoyIso(), 1); // bolsa de papel grado médico: ~30 días
  },
}));

// Usar un paquete en un paciente: la trazabilidad paciente <-> ciclo.
x.post('/esterilizacion/paquetes/usar', requirePermiso('esterilizacion.manage', 'historia_clinica.edit'), h(async (req) => {
  const { codigo, pacienteId, turnoId } = req.body || {};
  if (!codigo || !pacienteId) throw new ApiError(400, 'Indicá el código del paquete y el paciente');
  const r = await query(
    `SELECT pq.*, c.estado AS ciclo_estado, c.numero AS ciclo_numero FROM esterilizacion_paquetes pq JOIN esterilizacion_ciclos c ON c.id=pq.ciclo_id
      WHERE pq.clinica_id=$1 AND pq.codigo=$2`, [req.clinicaId, String(codigo).trim()]);
  if (!r.rowCount) throw new ApiError(404, `No existe el paquete "${codigo}"`);
  const pq = r.rows[0];
  if (pq.ciclo_estado !== 'liberado') throw new ApiError(409, `El ciclo ${pq.ciclo_numero} está ${pq.ciclo_estado}: NO usar este paquete`);
  if (pq.estado !== 'disponible') throw new ApiError(409, `El paquete está ${pq.estado}`);
  if (pq.fecha_vencimiento && String(pq.fecha_vencimiento) < hoyIso()) {
    await query("UPDATE esterilizacion_paquetes SET estado='vencido' WHERE id=$1", [pq.id]);
    throw new ApiError(409, 'El paquete está vencido: reprocesar');
  }
  const pac = await query('SELECT 1 FROM pacientes WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(pacienteId)]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  // Atómico: solo se marca si SIGUE disponible (dos usos simultáneos del
  // mismo paquete: el segundo recibe 409 en vez de pisar al primero).
  const u = await query("UPDATE esterilizacion_paquetes SET estado='usado', paciente_id=$2, turno_id=$3, usado_en=now(), usado_por=$4 WHERE id=$1 AND estado='disponible' RETURNING id",
    [pq.id, Number(pacienteId), turnoId ? Number(turnoId) : null, req.usuario.id]);
  if (!u.rowCount) throw new ApiError(409, 'El paquete acaba de ser usado en otro paciente');
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'usar_paquete', modulo: 'esterilizacion', entidadId: pq.id, detalle: { codigo, pacienteId, ciclo: pq.ciclo_numero } });
  return { ok: true, paquete: pq.codigo, ciclo: pq.ciclo_numero };
}));

// ============================== LABORATORIOS ==============================
router.use('/laboratorios', crearRecurso({
  tabla: 'laboratorios', modulo: 'laboratorio', permisos: { ver: ['laboratorio.manage', 'pacientes.clinical.view'], editar: ['laboratorio.manage'] },
  borrado: 'logico:activo', orden: 't.nombre',
  selectExtra: "(SELECT count(*) FROM laboratorio l WHERE l.laboratorio_id=t.id AND l.estado NOT IN ('instalado','entregado','cancelado')) AS trabajos_abiertos",
  campos: {
    nombre: { tipo: 'texto', requerido: true, max: 150 }, contacto: { tipo: 'texto', max: 120 }, telefono: { tipo: 'texto', max: 40 },
    email: { tipo: 'texto', max: 150 }, direccion: { tipo: 'texto' }, diasEntrega: { tipo: 'entero', min: 1, maxNum: 90, defecto: 7 },
    servicios: { tipo: 'texto' }, activo: { tipo: 'bool' },
  },
}));

// Trabajos de laboratorio con ciclo de vida completo:
// solicitado -> enviado -> en_proceso -> recibido -> controlado -> instalado (o rehacer / cancelado).
function sumarDiasHabiles(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  let n = 0;
  while (n < dias) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return d.toISOString().slice(0, 10);
}
router.use('/trabajos-laboratorio', crearRecurso({
  tabla: 'laboratorio', modulo: 'laboratorio', porPaciente: true, permisos: { ver: ['laboratorio.manage', 'pacientes.clinical.view'], editar: ['laboratorio.manage'] },
  actualizadoEn: true, borrado: false, joinPaciente: true,
  orden: "(t.estado IN ('instalado','entregado','cancelado')), t.fecha_estimada NULLS LAST",
  selectExtra: "o.nombre AS odontologo_nombre, lb.nombre AS laboratorio_directorio, (t.fecha_estimada < current_date AND t.estado IN ('solicitado','enviado','en_proceso','rehacer')) AS atrasado, (SELECT min(tu.fecha) FROM turnos tu WHERE tu.paciente_id=t.paciente_id AND tu.fecha >= current_date AND tu.estado IN ('reservado','confirmado')) AS proximo_turno",
  joins: 'LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN laboratorios lb ON lb.id=t.laboratorio_id',
  filtros: { estado: { col: 'estado' }, laboratorioId: { col: 'laboratorio_id', tipo: 'id' } },
  campos: {
    laboratorioId: { tipo: 'id', ref: 'laboratorios' },
    laboratorioNombre: { tipo: 'texto', max: 150 },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    trabajo: { tipo: 'texto', requerido: true, max: 200 },
    pieza: { tipo: 'texto', max: 10 },
    material: { tipo: 'texto', max: 100 },
    colorTono: { tipo: 'texto', max: 20 },
    instrucciones: { tipo: 'texto' },
    fechaEnvio: { tipo: 'fecha' }, fechaEstimada: { tipo: 'fecha' }, fechaRecepcion: { tipo: 'fecha' }, fechaControlado: { tipo: 'fecha' }, fechaInstalado: { tipo: 'fecha' },
    costo: { tipo: 'numero', min: 0 }, precioPaciente: { tipo: 'numero', min: 0 }, facturaNumero: { tipo: 'texto', max: 40 },
    turnoInstalacionId: { tipo: 'id', ref: 'turnos' },
    estado: { tipo: 'enum', valores: ['solicitado', 'enviado', 'en_proceso', 'recibido', 'controlado', 'instalado', 'rehacer', 'entregado', 'cancelado'], defecto: 'solicitado' },
    motivoRehacer: { tipo: 'texto' },
    observaciones: { tipo: 'texto' },
  },
  antesDeGuardar: async (d, ctx) => {
    const p = ctx.previo || {};
    const hoy = hoyIso();
    if (d.laboratorio_id && !d.laboratorio_nombre) {
      const l = await query('SELECT nombre, dias_entrega FROM laboratorios WHERE id=$1', [d.laboratorio_id]);
      d.laboratorio_nombre = l.rows[0].nombre;
      d._diasEntrega = l.rows[0].dias_entrega;
    }
    if (d.estado === 'enviado' && !p.fecha_envio && !d.fecha_envio) d.fecha_envio = hoy;
    if (d.estado === 'recibido' && !p.fecha_recepcion && !d.fecha_recepcion) d.fecha_recepcion = hoy;
    if (d.estado === 'controlado' && !p.fecha_controlado && !d.fecha_controlado) d.fecha_controlado = hoy;
    if (d.estado === 'instalado' && !p.fecha_instalado && !d.fecha_instalado) d.fecha_instalado = hoy;
    if (d.estado === 'rehacer' && !d.motivo_rehacer && !p.motivo_rehacer) throw new ApiError(400, 'Indicá el motivo por el que se rehace el trabajo');
    // Fecha estimada automática según el tiempo de entrega del laboratorio (días hábiles).
    const envio = d.fecha_envio || p.fecha_envio;
    if (envio && !d.fecha_estimada && !p.fecha_estimada) {
      let dias = d._diasEntrega;
      const labId = d.laboratorio_id || p.laboratorio_id;
      if (!dias && labId) dias = (await query('SELECT dias_entrega FROM laboratorios WHERE id=$1', [labId])).rows[0]?.dias_entrega;
      if (dias) d.fecha_estimada = sumarDiasHabiles(String(envio).slice(0, 10), dias);
    }
    delete d._diasEntrega;
  },
}));

x.get('/trabajos-laboratorio-aviso/:id', requirePermiso('laboratorio.manage'), h(async (req) => {
  const r = await query('SELECT l.trabajo, p.nombre, p.telefono, p.whatsapp FROM laboratorio l JOIN pacientes p ON p.id=l.paciente_id WHERE l.clinica_id=$1 AND l.id=$2', [req.clinicaId, Number(req.params.id)]);
  if (!r.rowCount) throw new ApiError(404, 'Trabajo no encontrado');
  const c = await query('SELECT nombre FROM clinicas WHERE id=$1', [req.clinicaId]);
  const texto = PLANTILLAS.laboratorio_listo({ nombre: r.rows[0].nombre, clinica: c.rows[0].nombre, trabajo: r.rows[0].trabajo });
  return { texto, whatsapp_link: enlaceWhatsapp(r.rows[0].whatsapp || r.rows[0].telefono, texto) };
}));

// ================================= FICHAJE =================================
x.get('/fichaje/estado', requirePermiso('fichaje.use'), h(async (req) => {
  const r = await query('SELECT * FROM fichajes WHERE clinica_id=$1 AND usuario_id=$2 ORDER BY fecha DESC LIMIT 1', [req.clinicaId, req.usuario.id]);
  const ultimo = r.rows[0] || null;
  const dentro = ultimo && ['entrada', 'fin_pausa'].includes(ultimo.tipo);
  const enPausa = ultimo && ultimo.tipo === 'inicio_pausa';
  return { ultimo, estado: dentro ? 'trabajando' : enPausa ? 'en_pausa' : 'fuera' };
}));
x.post('/fichaje', requirePermiso('fichaje.use'), h(async (req) => {
  const tipo = req.body && req.body.tipo;
  // Bajo candado por usuario: un doble clic no registra dos "entrada".
  return conCandado(`fichaje:${req.clinicaId}:${req.usuario.id}`, async () => {
  const TRANSICIONES = { fuera: ['entrada'], trabajando: ['inicio_pausa', 'salida'], en_pausa: ['fin_pausa', 'salida'] };
  const r = await query('SELECT tipo FROM fichajes WHERE clinica_id=$1 AND usuario_id=$2 ORDER BY fecha DESC LIMIT 1', [req.clinicaId, req.usuario.id]);
  const ult = r.rows[0] && r.rows[0].tipo;
  const estado = ['entrada', 'fin_pausa'].includes(ult) ? 'trabajando' : ult === 'inicio_pausa' ? 'en_pausa' : 'fuera';
  if (!TRANSICIONES[estado].includes(tipo)) throw new ApiError(409, `No se puede marcar "${tipo}" estando ${estado.replace('_', ' ')}`);
  const ins = await query('INSERT INTO fichajes (clinica_id, usuario_id, tipo, nota) VALUES ($1,$2,$3,$4) RETURNING *', [req.clinicaId, req.usuario.id, tipo, (req.body.nota || '').slice(0, 200) || null]);
  return ins.rows[0];
  });
}));
// Reporte de horas: empareja entradas/salidas y descuenta pausas.
x.get('/fichaje/reporte', requirePermiso('fichaje.use', 'fichaje.view_all'), h(async (req) => {
  const verTodos = (req.usuario.permisos || []).includes('fichaje.view_all');
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '') ? req.query.desde : hoyIso().slice(0, 8) + '01';
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta || '') ? req.query.hasta : hoyIso();
  const params = [req.clinicaId, desde, hasta];
  let filtroUsuario = '';
  if (!verTodos) { params.push(req.usuario.id); filtroUsuario = `AND f.usuario_id=$${params.length}`; }
  else if (req.query.usuarioId) { params.push(Number(req.query.usuarioId)); filtroUsuario = `AND f.usuario_id=$${params.length}`; }
  const r = await query(
    `SELECT f.*, u.nombre AS usuario_nombre FROM fichajes f JOIN usuarios u ON u.id=f.usuario_id
      WHERE f.clinica_id=$1 AND (f.fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2 AND $3 ${filtroUsuario}
      ORDER BY f.usuario_id, f.fecha`, params);
  const porUsuario = {};
  for (const f of r.rows) {
    const u = porUsuario[f.usuario_id] || (porUsuario[f.usuario_id] = { usuarioId: f.usuario_id, usuario: f.usuario_nombre, dias: {}, minutos: 0, _abierto: null, _pausa: null });
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(f.fecha));
    const t = new Date(f.fecha).getTime();
    if (f.tipo === 'entrada') u._abierto = t;
    else if (f.tipo === 'inicio_pausa') u._pausa = t;
    else if (f.tipo === 'fin_pausa' && u._pausa && u._abierto) { u._abierto += (t - u._pausa); u._pausa = null; }
    else if (f.tipo === 'salida' && u._abierto) {
      const fin = u._pausa || t;
      const min = Math.max(0, Math.round((fin - u._abierto) / 60000));
      u.minutos += min; u.dias[dia] = (u.dias[dia] || 0) + min; u._abierto = null; u._pausa = null;
    }
  }
  return {
    desde, hasta,
    usuarios: Object.values(porUsuario).map(({ _abierto, _pausa, ...u }) => ({ ...u, horas: Math.round((u.minutos / 60) * 100) / 100, abierto: !!_abierto })),
    marcas: r.rows,
  };
}));

// =========================== ALERTAS OPERATIVAS ===========================
x.get('/alertas', requirePermiso('equipos.manage', 'esterilizacion.manage', 'inventario.view', 'laboratorio.manage'), h(async (req) => {
  const c = req.clinicaId;
  await marcarPaquetesVencidos(c);
  const [mant, garantias, ciclosPend, paquetesVencen, paquetesVencidos, insumosVencen, insumosBajos] = await Promise.all([
    query("SELECT id, nombre, proximo_mantenimiento FROM equipos WHERE clinica_id=$1 AND estado <> 'baja' AND proximo_mantenimiento <= current_date + 15 ORDER BY proximo_mantenimiento", [c]),
    query("SELECT id, nombre, garantia_hasta FROM equipos WHERE clinica_id=$1 AND estado <> 'baja' AND garantia_hasta BETWEEN current_date AND current_date + 30", [c]),
    query("SELECT id, numero, fecha FROM esterilizacion_ciclos WHERE clinica_id=$1 AND estado='en_cuarentena' ORDER BY fecha", [c]),
    // "Por vencer" = disponibles que vencen entre hoy y 3 días (antes contaba también los ya vencidos).
    query("SELECT count(*)::int AS n FROM esterilizacion_paquetes WHERE clinica_id=$1 AND estado='disponible' AND fecha_vencimiento BETWEEN $2::date AND $2::date + 3", [c, hoyIso()]),
    query("SELECT count(*)::int AS n FROM esterilizacion_paquetes WHERE clinica_id=$1 AND estado='vencido'", [c]),
    query("SELECT id, nombre, lote, fecha_vencimiento, stock_actual FROM insumos WHERE clinica_id=$1 AND activo AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= current_date + 60 AND stock_actual > 0 ORDER BY fecha_vencimiento", [c]),
    query('SELECT id, nombre, stock_actual, stock_minimo FROM insumos WHERE clinica_id=$1 AND activo AND stock_actual <= stock_minimo ORDER BY nombre', [c]),
  ]);
  return {
    mantenimientos: mant.rows, garantiasPorVencer: garantias.rows, ciclosEnCuarentena: ciclosPend.rows,
    paquetesPorVencer: paquetesVencen.rows[0].n, paquetesVencidos: paquetesVencidos.rows[0].n, insumosPorVencer: insumosVencen.rows, insumosStockBajo: insumosBajos.rows,
  };
}));

router.use('/', x);
module.exports = router;
module.exports.bloqueoQueAfecta = bloqueoQueAfecta;
