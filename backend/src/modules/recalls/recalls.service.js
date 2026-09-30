/* Motor de recalls (controles periódicos).

   Un recall es "este paciente tiene que volver para X cada N meses". Nace:
   - a mano (el odontólogo lo asigna desde la ficha), o
   - solo, cuando se atiende un turno o se completa un plan cuyo tratamiento
     tiene un tipo de recall asociado (ej. "Limpieza" -> control 6 meses), o
     cuando un periodontograma diagnostica periodontitis (-> mantenimiento
     periodontal 3 meses), o cuando la evaluación de riesgo de caries sugiere
     un intervalo.

   Cada vez que el paciente vuelve y se atiende, la próxima fecha se recalcula
   desde la última atención. La recepción trabaja la "lista de recalls"
   (vencidos / próximos), registra cada intento de contacto y ve si el
   paciente ya tiene un turno reservado. */
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { sumarMeses, hoyIso } = require('../../utils/recurso');
const auditoria = require('../../utils/auditoria');
const { enlaceWhatsapp, PLANTILLAS } = require('../../utils/mensajes');

async function obtener(clinicaId, id) {
  const r = await query(
    `SELECT r.*, rt.nombre AS tipo_nombre, rt.codigo AS tipo_codigo, rt.color AS tipo_color, rt.intervalo_meses AS tipo_intervalo,
            COALESCE(r.intervalo_meses, rt.intervalo_meses) AS intervalo_efectivo,
            p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono, p.whatsapp AS paciente_whatsapp,
            p.acepta_recordatorios, o.nombre AS odontologo_nombre
       FROM paciente_recalls r
       JOIN recall_tipos rt ON rt.id = r.recall_tipo_id
       JOIN pacientes p ON p.id = r.paciente_id
       LEFT JOIN odontologos o ON o.id = r.odontologo_id
      WHERE r.clinica_id=$1 AND r.id=$2`,
    [clinicaId, id]
  );
  return r.rows[0] || null;
}

async function tipoDe(clinicaId, tipoId) {
  const r = await query('SELECT * FROM recall_tipos WHERE clinica_id=$1 AND id=$2', [clinicaId, tipoId]);
  if (!r.rowCount) throw new ApiError(400, 'Tipo de recall inexistente en esta clínica');
  return r.rows[0];
}

async function tipoPorCodigo(clinicaId, codigo) {
  const r = await query('SELECT * FROM recall_tipos WHERE clinica_id=$1 AND codigo=$2 AND activo', [clinicaId, codigo]);
  return r.rows[0] || null;
}

async function listarPorPaciente(clinicaId, pacienteId) {
  const r = await query(
    `SELECT r.*, rt.nombre AS tipo_nombre, rt.codigo AS tipo_codigo, rt.color AS tipo_color,
            COALESCE(r.intervalo_meses, rt.intervalo_meses) AS intervalo_efectivo, o.nombre AS odontologo_nombre,
            (SELECT min(t.fecha) FROM turnos t WHERE t.paciente_id=r.paciente_id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado')) AS proximo_turno
       FROM paciente_recalls r JOIN recall_tipos rt ON rt.id=r.recall_tipo_id LEFT JOIN odontologos o ON o.id=r.odontologo_id
      WHERE r.clinica_id=$1 AND r.paciente_id=$2 ORDER BY (r.estado<>'activo'), r.proxima_fecha`,
    [clinicaId, pacienteId]
  );
  return r.rows;
}

/* Crea o actualiza el recall de un tipo para un paciente (hay a lo sumo uno
   por tipo). Usado tanto a mano como por los disparadores automáticos. */
async function asignar(clinicaId, { pacienteId, recallTipoId, intervaloMeses, ultimaFecha, proximaFecha, odontologoId, notas }, usuario, origen = 'manual') {
  const tipo = await tipoDe(clinicaId, recallTipoId);
  const pac = await query('SELECT 1 FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  const intervalo = intervaloMeses ? Number(intervaloMeses) : null;
  if (intervalo !== null && (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 60)) throw new ApiError(400, 'El intervalo debe ser de 1 a 60 meses');
  // Si el paciente ya tiene un intervalo propio para este control (ej. flúor
  // cada 4 meses en vez de 6), se respeta al volver a dispararse.
  let intervaloPropio = null;
  if (intervalo === null) {
    const ex = await query('SELECT intervalo_meses FROM paciente_recalls WHERE paciente_id=$1 AND recall_tipo_id=$2', [pacienteId, recallTipoId]);
    intervaloPropio = ex.rows[0] ? ex.rows[0].intervalo_meses : null;
  }
  const base = ultimaFecha || hoyIso();
  const proxima = proximaFecha || sumarMeses(base, intervalo || intervaloPropio || tipo.intervalo_meses);
  const r = await query(
    `INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, intervalo_meses, ultima_fecha, proxima_fecha, odontologo_id, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (paciente_id, recall_tipo_id) DO UPDATE SET
       intervalo_meses = COALESCE(EXCLUDED.intervalo_meses, paciente_recalls.intervalo_meses),
       ultima_fecha = COALESCE(EXCLUDED.ultima_fecha, paciente_recalls.ultima_fecha),
       proxima_fecha = EXCLUDED.proxima_fecha,
       odontologo_id = COALESCE(EXCLUDED.odontologo_id, paciente_recalls.odontologo_id),
       notas = COALESCE(EXCLUDED.notas, paciente_recalls.notas),
       estado = CASE WHEN paciente_recalls.estado='desactivado' AND $9::text <> 'manual' THEN 'desactivado' ELSE 'activo' END,
       intentos_contacto = 0, turno_id = NULL, actualizado_en = now()
     RETURNING id`,
    [clinicaId, pacienteId, recallTipoId, intervalo, ultimaFecha || null, proxima, odontologoId || null, notas || null, origen]
  );
  await auditoria.registrar({
    clinicaId, usuarioId: usuario && usuario.id, usuarioNombre: usuario ? usuario.nombre : 'sistema',
    accion: 'asignar_recall', modulo: 'recalls', entidadId: r.rows[0].id, detalle: { pacienteId, tipo: tipo.codigo, proxima, origen },
  });
  return obtener(clinicaId, r.rows[0].id);
}

// Disparador: el paciente fue atendido con un tratamiento que tiene recall asociado.
async function registrarAtencion(clinicaId, { pacienteId, tratamientoId, fecha, odontologoId }, usuario) {
  if (!tratamientoId) return null;
  const t = await query('SELECT recall_tipo_id FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, tratamientoId]);
  const tipoId = t.rows[0] && t.rows[0].recall_tipo_id;
  if (!tipoId) return null;
  return asignar(clinicaId, { pacienteId, recallTipoId: tipoId, ultimaFecha: fecha || hoyIso(), odontologoId }, usuario, 'automatico');
}

// Disparador por código de tipo (perio, riesgo de caries, fin de ortodoncia…).
async function asignarPorCodigo(clinicaId, pacienteId, codigo, { intervaloMeses, ultimaFecha, odontologoId, notas } = {}, usuario) {
  const tipo = await tipoPorCodigo(clinicaId, codigo);
  if (!tipo) return null;
  return asignar(clinicaId, { pacienteId, recallTipoId: tipo.id, intervaloMeses, ultimaFecha, odontologoId, notas }, usuario, 'automatico');
}

/* Lista de trabajo de la recepción.
   vista: vencidos (ya pasó la fecha), proximos (en los próximos N días),
          sin_turno (vencidos o próximos que NO tienen turno reservado), todos. */
async function lista(clinicaId, { vista = 'vencidos', dias = 30, tipoId, odontologoId } = {}) {
  const cond = ["r.clinica_id=$1", "p.activo"];
  const params = [clinicaId];
  // Los pausados vuelven a la lista solos cuando vence la pausa.
  cond.push("(r.estado='activo' OR (r.estado='pausado' AND r.pausado_hasta IS NOT NULL AND r.pausado_hasta <= current_date))");
  params.push(Number(dias) || 30);
  const iDias = params.length;
  if (vista === 'vencidos') cond.push('r.proxima_fecha < current_date');
  else if (vista === 'proximos') cond.push(`r.proxima_fecha >= current_date AND r.proxima_fecha <= current_date + $${iDias}::int`);
  else if (vista === 'sin_turno') cond.push(`r.proxima_fecha <= current_date + $${iDias}::int`);
  if (tipoId) { params.push(Number(tipoId)); cond.push(`r.recall_tipo_id=$${params.length}`); }
  if (odontologoId) { params.push(Number(odontologoId)); cond.push(`r.odontologo_id=$${params.length}`); }
  const r = await query(
    `SELECT r.*, rt.nombre AS tipo_nombre, rt.codigo AS tipo_codigo, rt.color AS tipo_color,
            COALESCE(r.intervalo_meses, rt.intervalo_meses) AS intervalo_efectivo,
            p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono, p.whatsapp AS paciente_whatsapp,
            p.acepta_recordatorios, o.nombre AS odontologo_nombre,
            (current_date - r.proxima_fecha) AS dias_vencido,
            (SELECT min(t.fecha) FROM turnos t WHERE t.paciente_id=r.paciente_id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado')) AS proximo_turno,
            ($${iDias}::int) AS _dias
       FROM paciente_recalls r
       JOIN recall_tipos rt ON rt.id=r.recall_tipo_id
       JOIN pacientes p ON p.id=r.paciente_id
       LEFT JOIN odontologos o ON o.id=r.odontologo_id
      WHERE ${cond.join(' AND ')}
      ORDER BY r.proxima_fecha ASC
      LIMIT 1000`,
    params
  );
  let filas = r.rows;
  if (vista === 'sin_turno') filas = filas.filter((f) => !f.proximo_turno);
  const clinica = await nombreClinica(clinicaId);
  return filas.map((f) => ({
    ...f,
    whatsapp_link: f.acepta_recordatorios === false ? null : enlaceWhatsapp(f.paciente_whatsapp || f.paciente_telefono,
      PLANTILLAS.recall({ nombre: f.paciente_nombre, clinica, tipo: f.tipo_nombre, fecha: f.proxima_fecha < hoyIso() ? f.proxima_fecha : null })),
  }));
}

async function nombreClinica(clinicaId) {
  const c = await query('SELECT nombre FROM clinicas WHERE id=$1', [clinicaId]);
  return c.rows[0] ? c.rows[0].nombre : 'la clínica';
}

const RESULTADOS = ['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar'];
const CANALES = ['whatsapp', 'llamada', 'sms', 'email', 'presencial', 'carta'];

async function registrarContacto(clinicaId, id, { canal = 'whatsapp', resultado, nota }, usuario) {
  const rec = await obtener(clinicaId, id);
  if (!rec) throw new ApiError(404, 'Recall no encontrado');
  if (!RESULTADOS.includes(resultado)) throw new ApiError(400, `Resultado inválido. Opciones: ${RESULTADOS.join(', ')}`);
  if (!CANALES.includes(canal)) throw new ApiError(400, `Canal inválido. Opciones: ${CANALES.join(', ')}`);
  await query(
    `UPDATE paciente_recalls SET intentos_contacto = intentos_contacto + 1, ultimo_contacto_en = now(), ultimo_contacto_resultado=$3::text,
       estado = CASE WHEN $3::text='rechaza' THEN 'pausado' ELSE estado END,
       pausado_hasta = CASE WHEN $3::text='rechaza' THEN current_date + 90 ELSE pausado_hasta END,
       motivo_estado = CASE WHEN $3::text='rechaza' THEN 'El paciente rechazó el control (se vuelve a ofrecer en 90 días)' ELSE motivo_estado END,
       actualizado_en = now()
     WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, resultado]
  );
  await query(
    `INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
     VALUES ($1,$2,$3,'saliente','recall',$4,$5,'recall',$6,$7)`,
    [clinicaId, rec.paciente_id, canal, resultado, nota || `Contacto por ${rec.tipo_nombre}`, id, usuario.id]
  );
  return obtener(clinicaId, id);
}

async function completar(clinicaId, id, { fecha }, usuario) {
  const rec = await obtener(clinicaId, id);
  if (!rec) throw new ApiError(404, 'Recall no encontrado');
  const f = fecha || hoyIso();
  const proxima = sumarMeses(f, rec.intervalo_efectivo);
  await query(
    `UPDATE paciente_recalls SET ultima_fecha=$3, proxima_fecha=$4, intentos_contacto=0, turno_id=NULL, estado='activo', pausado_hasta=NULL, motivo_estado=NULL, actualizado_en=now()
      WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, f, proxima]
  );
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'completar_recall', modulo: 'recalls', entidadId: id, detalle: { fecha: f, proxima } });
  return obtener(clinicaId, id);
}

async function cambiarEstado(clinicaId, id, { estado, pausadoHasta, motivo }, usuario) {
  const rec = await obtener(clinicaId, id);
  if (!rec) throw new ApiError(404, 'Recall no encontrado');
  if (!['activo', 'pausado', 'desactivado'].includes(estado)) throw new ApiError(400, 'Estado inválido (activo, pausado, desactivado)');
  if (estado === 'pausado' && !pausadoHasta) throw new ApiError(400, 'Indicá hasta qué fecha se pausa');
  await query(
    `UPDATE paciente_recalls SET estado=$3, pausado_hasta=$4, motivo_estado=$5, actualizado_en=now() WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, estado, estado === 'pausado' ? pausadoHasta : null, motivo || null]
  );
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'estado_recall', modulo: 'recalls', entidadId: id, detalle: { estado, pausadoHasta, motivo } });
  return obtener(clinicaId, id);
}

async function editar(clinicaId, id, { intervaloMeses, proximaFecha, odontologoId, notas }, usuario) {
  const rec = await obtener(clinicaId, id);
  if (!rec) throw new ApiError(404, 'Recall no encontrado');
  const intervalo = intervaloMeses === undefined ? rec.intervalo_meses : (intervaloMeses === null || intervaloMeses === '' ? null : Number(intervaloMeses));
  if (intervalo !== null && (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 60)) throw new ApiError(400, 'El intervalo debe ser de 1 a 60 meses');
  if (proximaFecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(proximaFecha))) throw new ApiError(400, 'Fecha inválida');
  await query(
    `UPDATE paciente_recalls SET intervalo_meses=$3, proxima_fecha=COALESCE($4, proxima_fecha), odontologo_id=$5, notas=$6, actualizado_en=now() WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, intervalo, proximaFecha || null, odontologoId === undefined ? rec.odontologo_id : (odontologoId || null), notas === undefined ? rec.notas : notas]
  );
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar_recall', modulo: 'recalls', entidadId: id, detalle: { intervaloMeses, proximaFecha } });
  return obtener(clinicaId, id);
}

async function eliminar(clinicaId, id, usuario) {
  const rec = await obtener(clinicaId, id);
  if (!rec) throw new ApiError(404, 'Recall no encontrado');
  await query('DELETE FROM paciente_recalls WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'borrar_recall', modulo: 'recalls', entidadId: id, detalle: rec });
}

/* Cumplimiento de recalls: de los recalls activos que vencían hasta hoy,
   qué porcentaje tiene al paciente atendido o con turno reservado. */
async function cumplimiento(clinicaId) {
  const r = await query(
    `SELECT count(*) FILTER (WHERE r.estado='activo') AS activos,
            count(*) FILTER (WHERE r.estado='activo' AND r.proxima_fecha < current_date) AS vencidos,
            count(*) FILTER (WHERE r.estado='activo' AND r.proxima_fecha BETWEEN current_date AND current_date + 30) AS proximos_30,
            count(*) FILTER (WHERE r.estado='activo' AND r.proxima_fecha < current_date
                              AND EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=r.paciente_id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))) AS vencidos_con_turno,
            count(*) FILTER (WHERE r.estado='activo' AND r.ultima_fecha >= current_date - 365) AS atendidos_ultimo_anio
       FROM paciente_recalls r JOIN pacientes p ON p.id=r.paciente_id AND p.activo
      WHERE r.clinica_id=$1`,
    [clinicaId]
  );
  const x = r.rows[0];
  const activos = Number(x.activos);
  const vencidos = Number(x.vencidos);
  return {
    activos, vencidos, proximos30: Number(x.proximos_30), vencidosConTurno: Number(x.vencidos_con_turno),
    atendidosUltimoAnio: Number(x.atendidos_ultimo_anio),
    tasaAlDia: activos ? Math.round(((activos - vencidos + Number(x.vencidos_con_turno)) / activos) * 1000) / 10 : null,
  };
}

module.exports = { obtener, listarPorPaciente, asignar, registrarAtencion, asignarPorCodigo, lista, registrarContacto, completar, cambiarEstado, editar, eliminar, cumplimiento, RESULTADOS, CANALES };
