const { query } = require('../../config/db');

async function obtenerPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT op.*, o.nombre AS odontologo_nombre FROM odontograma_piezas op
     LEFT JOIN odontologos o ON o.id = op.odontologo_id
     WHERE op.clinica_id = $1 AND op.paciente_id = $2`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerHistorialPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT h.*, o.nombre AS odontologo_nombre FROM odontograma_historial h
     LEFT JOIN odontologos o ON o.id = h.odontologo_id
     JOIN pacientes p ON p.id = h.paciente_id
     WHERE h.paciente_id = $2 AND h.pieza = $3 AND p.clinica_id = $1
     ORDER BY h.fecha DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

/* Upsert del estado actual de una pieza+superficie + inserción en historial.
   Nunca se pierde el estado anterior: queda registrado en odontograma_historial
   antes/junto con actualizar el estado "actual" en odontograma_piezas. */
async function actualizarPieza(clinicaId, pacienteId, datos) {
  const superficie = datos.superficie || 'general';
  await query(
    `INSERT INTO odontograma_historial (paciente_id, pieza, superficie, estado, tratamiento, observacion, odontologo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [pacienteId, datos.pieza, superficie, datos.estado, datos.tratamiento || null, datos.observacion || null, datos.odontologoId || null]
  );

  const res = await query(
    `INSERT INTO odontograma_piezas (clinica_id, paciente_id, pieza, superficie, estado, tratamiento, observacion, odontologo_id, actualizado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (paciente_id, pieza, superficie)
     DO UPDATE SET estado = EXCLUDED.estado, tratamiento = EXCLUDED.tratamiento,
       observacion = EXCLUDED.observacion, odontologo_id = EXCLUDED.odontologo_id, actualizado_en = now()
     RETURNING *`,
    [clinicaId, pacienteId, datos.pieza, superficie, datos.estado, datos.tratamiento || null, datos.observacion || null, datos.odontologoId || null]
  );
  return res.rows[0];
}

/* Expediente completo de una pieza (sección 10 del prompt maestro):
   combina el historial de cambios de estado del odontograma con las
   evoluciones clínicas, sesiones de tratamiento, planes, fotos y estudios
   que mencionan esa pieza. Cada fuente en su propia consulta indexada
   (nunca N+1) y se combinan en el service, no con UNION, porque cada una
   tiene forma distinta y se muestran en secciones separadas en el frontend. */
async function estadoActualPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT * FROM odontograma_piezas WHERE clinica_id=$1 AND paciente_id=$2 AND pieza=$3`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

async function evolucionesPorPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT h.id, h.fecha, h.diagnostico, h.procedimiento, h.evolucion, h.observaciones, h.firmada,
            o.nombre AS odontologo_nombre
     FROM historia_clinica h LEFT JOIN odontologos o ON o.id = h.odontologo_id
     WHERE h.clinica_id=$1 AND h.paciente_id=$2 AND h.piezas @> ARRAY[$3]::varchar[]
     ORDER BY h.fecha DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

async function planesPorPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT id, nombre, diagnostico, estado, sesiones_realizadas, sesiones_totales, fecha_inicio, fecha_estimada_fin
     FROM planes_tratamiento WHERE clinica_id=$1 AND paciente_id=$2 AND pieza=$3
     ORDER BY creado_en DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

async function fotosPorPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT id, categoria, observacion, fecha, (archivo IS NOT NULL OR storage_path IS NOT NULL) AS tiene_archivo FROM fotos_clinicas
     WHERE clinica_id=$1 AND paciente_id=$2 AND pieza=$3 ORDER BY fecha DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

async function estudiosPorPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT id, tipo, descripcion, fecha, mime, (archivo IS NOT NULL OR storage_path IS NOT NULL) AS tiene_archivo FROM estudios
     WHERE clinica_id=$1 AND paciente_id=$2 AND pieza=$3 ORDER BY fecha DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

module.exports = {
  obtenerPorPaciente, obtenerHistorialPieza, actualizarPieza,
  estadoActualPieza, evolucionesPorPieza, planesPorPieza, fotosPorPieza, estudiosPorPieza,
};
