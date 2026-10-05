const { query } = require('../../config/db');

const SELECT = `
  h.id, h.clinica_id, h.paciente_id, h.odontologo_id, h.fecha, h.motivo_consulta,
  h.anamnesis, h.diagnostico, h.diagnostico_diferencial, h.procedimiento, h.tratamiento_id,
  h.anestesia, h.materiales, h.evolucion, h.indicaciones, h.observaciones, h.proxima_consulta,
  h.turno_id, h.plan_id, h.piezas, h.complicaciones, h.medicacion, h.proxima_accion,
  h.firmada, h.firmada_en, h.enmendada_de_id, h.motivo_enmienda,
  h.creado_en, o.nombre AS odontologo_nombre, t.nombre AS tratamiento_nombre
`;

async function listarPorPaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT ${SELECT} FROM historia_clinica h
     LEFT JOIN odontologos o ON o.id = h.odontologo_id
     LEFT JOIN tratamientos t ON t.id = h.tratamiento_id
     WHERE h.clinica_id = $1 AND h.paciente_id = $2
     ORDER BY h.fecha DESC, h.creado_en DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT ${SELECT} FROM historia_clinica h
     LEFT JOIN odontologos o ON o.id = h.odontologo_id
     LEFT JOIN tratamientos t ON t.id = h.tratamiento_id
     WHERE h.clinica_id = $1 AND h.id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

/* Historial de evoluciones que mencionan una pieza específica (piezas es un
   array de varchar; usamos el operador @> de contención). Se usa desde el
   "historial por pieza" del odontograma. */
async function listarPorPieza(clinicaId, pacienteId, pieza) {
  const res = await query(
    `SELECT ${SELECT} FROM historia_clinica h
     LEFT JOIN odontologos o ON o.id = h.odontologo_id
     LEFT JOIN tratamientos t ON t.id = h.tratamiento_id
     WHERE h.clinica_id = $1 AND h.paciente_id = $2 AND h.piezas @> ARRAY[$3]::varchar[]
     ORDER BY h.fecha DESC`,
    [clinicaId, pacienteId, pieza]
  );
  return res.rows;
}

async function crear(clinicaId, d, usuarioId) {
  const res = await query(
    `INSERT INTO historia_clinica (
       clinica_id, paciente_id, odontologo_id, fecha, motivo_consulta, anamnesis,
       diagnostico, diagnostico_diferencial, procedimiento, tratamiento_id, anestesia,
       materiales, evolucion, indicaciones, observaciones, proxima_consulta, creado_por,
       turno_id, plan_id, piezas, complicaciones, medicacion, proxima_accion
     ) VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
       $18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.fecha || null, d.motivoConsulta || null,
      d.anamnesis || null, d.diagnostico || null, d.diagnosticoDiferencial || null,
      d.procedimiento || null, d.tratamientoId || null, d.anestesia || null, d.materiales || null,
      d.evolucion || null, d.indicaciones || null, d.observaciones || null,
      d.proximaConsulta || null, usuarioId,
      d.turnoId || null, d.planId || null, d.piezas || null, d.complicaciones || null,
      d.medicacion || null, d.proximaAccion || null]
  );
  return res.rows[0];
}

async function firmar(clinicaId, id) {
  const res = await query(
    `UPDATE historia_clinica SET firmada = true, firmada_en = now()
     WHERE clinica_id = $1 AND id = $2 AND firmada = false RETURNING *`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

/* Enmienda: una evolución firmada nunca se modifica in-place (sección 41).
   En vez de UPDATE, se crea una nueva entrada que referencia a la original
   vía enmendada_de_id, dejando ambas visibles en el timeline. */
async function crearEnmienda(clinicaId, original, d, usuarioId) {
  const res = await query(
    `INSERT INTO historia_clinica (
       clinica_id, paciente_id, odontologo_id, fecha, motivo_consulta, anamnesis,
       diagnostico, diagnostico_diferencial, procedimiento, tratamiento_id, anestesia,
       materiales, evolucion, indicaciones, observaciones, proxima_consulta, creado_por,
       turno_id, plan_id, piezas, complicaciones, medicacion, proxima_accion,
       enmendada_de_id, motivo_enmienda
     ) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [clinicaId, original.paciente_id, d.odontologoId || original.odontologo_id,
      d.motivoConsulta ?? original.motivo_consulta, d.anamnesis ?? original.anamnesis,
      d.diagnostico ?? original.diagnostico, d.diagnosticoDiferencial ?? original.diagnostico_diferencial,
      d.procedimiento ?? original.procedimiento, d.tratamientoId ?? original.tratamiento_id,
      d.anestesia ?? original.anestesia, d.materiales ?? original.materiales,
      d.evolucion ?? original.evolucion, d.indicaciones ?? original.indicaciones,
      d.observaciones ?? original.observaciones, d.proximaConsulta ?? original.proxima_consulta,
      usuarioId, original.turno_id, original.plan_id, d.piezas ?? original.piezas,
      d.complicaciones ?? original.complicaciones, d.medicacion ?? original.medicacion,
      d.proximaAccion ?? original.proxima_accion, original.id, d.motivoEnmienda]
  );
  return res.rows[0];
}

/* Timeline cronológico del paciente (sección 6): combina evoluciones,
   sesiones de tratamiento, fotos, estudios, consentimientos y recetas en
   un solo orden por fecha. Una sola consulta UNION -- nunca N+1. */
async function timelinePaciente(clinicaId, pacienteId) {
  const res = await query(
    `SELECT id, fecha, 'evolucion' AS tipo, procedimiento AS titulo, diagnostico AS subtitulo, odontologo_id
       FROM historia_clinica WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT s.id, s.fecha, 'sesion' AS tipo, s.procedimiento AS titulo, pt.nombre AS subtitulo, s.odontologo_id
       FROM sesiones_tratamiento s JOIN planes_tratamiento pt ON pt.id = s.plan_id
       WHERE pt.clinica_id=$1 AND pt.paciente_id=$2
     UNION ALL
     SELECT id, fecha, 'foto' AS tipo, categoria AS titulo, observacion AS subtitulo, NULL
       FROM fotos_clinicas WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT id, fecha, 'estudio' AS tipo, tipo AS titulo, descripcion AS subtitulo, NULL
       FROM estudios WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT id, fecha, 'consentimiento' AS tipo, procedimiento AS titulo, estado AS subtitulo, NULL
       FROM consentimientos WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT id, fecha, 'receta' AS tipo, indicaciones AS titulo, NULL AS subtitulo, NULL
       FROM recetas WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT id, COALESCE(fecha_control_realizado, fecha_control_programada) AS fecha, 'control_postop' AS tipo,
            'Control postoperatorio' AS titulo, cicatrizacion AS subtitulo, NULL
       FROM controles_postoperatorios WHERE clinica_id=$1 AND paciente_id=$2
     UNION ALL
     SELECT id, creado_en::date AS fecha, 'derivacion' AS tipo, COALESCE(especialidad, 'Derivación') AS titulo, estado AS subtitulo, odontologo_origen_id
       FROM derivaciones WHERE clinica_id=$1 AND paciente_id=$2
     ORDER BY fecha DESC, id DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

// Borrador (sin firmar): se puede corregir libremente; firmado, nunca.
const CAMPOS_BORRADOR = {
  motivoConsulta: 'motivo_consulta', anamnesis: 'anamnesis', diagnostico: 'diagnostico', diagnosticoDiferencial: 'diagnostico_diferencial',
  procedimiento: 'procedimiento', tratamientoId: 'tratamiento_id', anestesia: 'anestesia', materiales: 'materiales', evolucion: 'evolucion',
  indicaciones: 'indicaciones', observaciones: 'observaciones', proximaConsulta: 'proxima_consulta', planId: 'plan_id', piezas: 'piezas',
  complicaciones: 'complicaciones', medicacion: 'medicacion', proximaAccion: 'proxima_accion',
};
async function actualizarBorrador(clinicaId, id, d) {
  const sets = []; const vals = [clinicaId, id];
  for (const [k, col] of Object.entries(CAMPOS_BORRADOR)) {
    if (d[k] === undefined) continue;
    vals.push(d[k] === '' ? null : d[k]); sets.push(`${col}=$${vals.length}`);
  }
  if (!sets.length) return obtenerPorId(clinicaId, id);
  const r = await query(`UPDATE historia_clinica SET ${sets.join(', ')} WHERE clinica_id=$1 AND id=$2 AND firmada=false RETURNING id`, vals);
  return r.rowCount ? obtenerPorId(clinicaId, id) : null;
}

module.exports = { listarPorPaciente, obtenerPorId, listarPorPieza, crear, firmar, crearEnmienda, timelinePaciente, actualizarBorrador, CAMPOS_BORRADOR };
