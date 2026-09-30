const { query } = require('../../config/db');

/* Cada función responde una categoría de "Mis pendientes" (sección 3/23 del
   prompt maestro). Todas aceptan odontologoId opcional: si viene, filtran
   solo lo de ese odontólogo (vista del odontólogo); si no viene, traen todo
   de la clínica (vista admin/recepción). Ninguna usa IA: son consultas
   directas sobre datos reales y reglas de fecha/estado fijas. */

async function tratamientosAbiertos(clinicaId, odontologoId) {
  const params = [clinicaId];
  let cond = 'pt.clinica_id=$1 AND pt.estado IN (\'pendiente\', \'aprobado\', \'en_proceso\')';
  if (odontologoId) { params.push(odontologoId); cond += ` AND pt.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT pt.id, pt.nombre, pt.estado, pt.sesiones_realizadas, pt.sesiones_totales,
            p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM planes_tratamiento pt JOIN pacientes p ON p.id = pt.paciente_id
      WHERE ${cond}
      ORDER BY pt.creado_en ASC`,
    params
  );
  return res.rows;
}

async function pacientesSinProximaCita(clinicaId, odontologoId) {
  // Pacientes con un tratamiento en curso/pendiente pero sin ningún turno futuro reservado.
  const params = [clinicaId];
  let cond = 'pt.clinica_id=$1 AND pt.estado IN (\'pendiente\', \'aprobado\', \'en_proceso\')';
  if (odontologoId) { params.push(odontologoId); cond += ` AND pt.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT DISTINCT p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, pt.nombre AS tratamiento_nombre
       FROM planes_tratamiento pt
       JOIN pacientes p ON p.id = pt.paciente_id
      WHERE ${cond}
        AND NOT EXISTS (
          SELECT 1 FROM turnos t
           WHERE t.paciente_id = p.id AND t.clinica_id = pt.clinica_id
             AND t.estado NOT IN ('cancelado', 'no_asistio')
             AND (t.fecha > CURRENT_DATE OR (t.fecha = CURRENT_DATE))
        )
      ORDER BY p.apellido, p.nombre`,
    params
  );
  return res.rows;
}

async function estudiosPendientes(clinicaId, odontologoId) {
  // "Pendiente" = estudio registrado sin descripción de resultado todavía.
  const params = [clinicaId];
  let cond = 'e.clinica_id=$1 AND (e.descripcion IS NULL OR e.descripcion = \'\')';
  if (odontologoId) { params.push(odontologoId); cond += ` AND e.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT e.id, e.tipo, e.fecha, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM estudios e JOIN pacientes p ON p.id = e.paciente_id
      WHERE ${cond}
      ORDER BY e.fecha DESC`,
    params
  );
  return res.rows;
}

async function evolucionesSinFirmar(clinicaId, odontologoId) {
  const params = [clinicaId];
  let cond = 'h.clinica_id=$1 AND h.firmada=false';
  if (odontologoId) { params.push(odontologoId); cond += ` AND h.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT h.id, h.fecha, h.procedimiento, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM historia_clinica h JOIN pacientes p ON p.id = h.paciente_id
      WHERE ${cond}
      ORDER BY h.fecha ASC`,
    params
  );
  return res.rows;
}

async function consentimientosPendientes(clinicaId, odontologoId) {
  const params = [clinicaId];
  let cond = 'c.clinica_id=$1 AND c.estado=\'pendiente\'';
  if (odontologoId) { params.push(odontologoId); cond += ` AND c.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT c.id, c.procedimiento, c.fecha, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM consentimientos c JOIN pacientes p ON p.id = c.paciente_id
      WHERE ${cond}
      ORDER BY c.fecha ASC`,
    params
  );
  return res.rows;
}

async function controlesVencidos(clinicaId, odontologoId) {
  const params = [clinicaId];
  let cond = 'c.clinica_id=$1 AND c.estado=\'pendiente\' AND c.fecha_control_programada <= CURRENT_DATE';
  if (odontologoId) { params.push(odontologoId); cond += ` AND c.odontologo_id=$${params.length}`; }
  const res = await query(
    `SELECT c.id, c.fecha_control_programada, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM controles_postoperatorios c JOIN pacientes p ON p.id = c.paciente_id
      WHERE ${cond}
      ORDER BY c.fecha_control_programada ASC`,
    params
  );
  return res.rows;
}

async function pacientesParaRevisar(clinicaId, odontologoId) {
  const params = [clinicaId];
  let cond = 'r.clinica_id=$1 AND r.resuelto=false';
  if (odontologoId) { params.push(odontologoId); cond += ` AND r.asignado_a IN (SELECT id FROM usuarios WHERE odontologo_id=$${params.length})`; }
  const res = await query(
    `SELECT r.id, r.motivo, r.detalle, r.creado_en, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM pacientes_revision r JOIN pacientes p ON p.id = r.paciente_id
      WHERE ${cond}
      ORDER BY r.creado_en ASC`,
    params
  );
  return res.rows;
}

async function derivacionesRecibidasPendientes(clinicaId, odontologoId) {
  if (!odontologoId) return [];
  const res = await query(
    `SELECT d.id, d.motivo, d.especialidad, d.creado_en, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM derivaciones d JOIN pacientes p ON p.id = d.paciente_id
      WHERE d.clinica_id=$1 AND d.odontologo_destino_id=$2 AND d.estado='pendiente'
      ORDER BY d.creado_en ASC`,
    [clinicaId, odontologoId]
  );
  return res.rows;
}

module.exports = {
  tratamientosAbiertos, pacientesSinProximaCita, estudiosPendientes,
  evolucionesSinFirmar, consentimientosPendientes, controlesVencidos,
  pacientesParaRevisar, derivacionesRecibidasPendientes,
};
