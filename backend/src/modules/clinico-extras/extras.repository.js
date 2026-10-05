const { query } = require('../../config/db');

// ---- Fotos clínicas ----
// Nunca se devuelve el archivo en los listados (puede pesar varios MB): se
// pide aparte por /fotos/:id/archivo.
const COLS_FOTO = `f.id, f.clinica_id, f.paciente_id, f.categoria, f.pieza, f.tratamiento_id, f.plan_id, f.historia_clinica_id, f.etapa_id,
  f.observacion, f.fecha, f.subido_por, f.creado_en, f.mime, f.tamano, (f.archivo IS NOT NULL OR f.storage_path IS NOT NULL) AS tiene_archivo`;
async function listarFotos(clinicaId, pacienteId) {
  const res = await query(
    `SELECT ${COLS_FOTO}, u.nombre AS subido_por_nombre, pt.nombre AS plan_nombre FROM fotos_clinicas f
     LEFT JOIN usuarios u ON u.id = f.subido_por
     LEFT JOIN planes_tratamiento pt ON pt.id = f.plan_id
     WHERE f.clinica_id = $1 AND f.paciente_id = $2 ORDER BY f.fecha DESC, f.id DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function crearFoto(clinicaId, d) {
  const res = await query(
    `INSERT INTO fotos_clinicas (clinica_id, paciente_id, categoria, pieza, tratamiento_id, plan_id, historia_clinica_id, archivo, mime, tamano, observacion, fecha, subido_por, etapa_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, CURRENT_DATE),$13,$14) RETURNING id`,
    [clinicaId, d.pacienteId, d.categoria, d.pieza || null, d.tratamientoId || null, d.planId || null, d.historiaClinicaId || null,
      d.archivo, d.mime, d.archivo.length, d.observacion || null, d.fecha || null, d.subidoPor, d.etapaId || null]
  );
  return obtenerFoto(clinicaId, res.rows[0].id);
}

async function obtenerFoto(clinicaId, id) {
  const res = await query(`SELECT ${COLS_FOTO}, f.storage_path FROM fotos_clinicas f WHERE f.clinica_id=$1 AND f.id=$2`, [clinicaId, id]);
  return res.rows[0] || null;
}

async function actualizarFoto(clinicaId, id, d) {
  await query(
    `UPDATE fotos_clinicas SET categoria=COALESCE($3, categoria), pieza=$4, observacion=$5, plan_id=$6, historia_clinica_id=$7, fecha=COALESCE($8, fecha)
     WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, d.categoria || null, d.pieza || null, d.observacion || null, d.planId || null, d.historiaClinicaId || null, d.fecha || null]
  );
  return obtenerFoto(clinicaId, id);
}

async function eliminarFoto(clinicaId, id) {
  await query('DELETE FROM fotos_clinicas WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
}

// ---- Estudios ----
const COLS_ESTUDIO = `e.id, e.clinica_id, e.paciente_id, e.tipo, e.pieza, e.descripcion, e.observaciones, e.odontologo_id, e.fecha, e.creado_en,
  e.plan_id, e.historia_clinica_id, e.etapa_id, e.mime, e.tamano, e.nombre_archivo, (e.archivo IS NOT NULL OR e.storage_path IS NOT NULL) AS tiene_archivo`;
async function listarEstudios(clinicaId, pacienteId) {
  const res = await query(
    `SELECT ${COLS_ESTUDIO}, o.nombre AS odontologo_nombre, pt.nombre AS plan_nombre FROM estudios e
     LEFT JOIN odontologos o ON o.id = e.odontologo_id
     LEFT JOIN planes_tratamiento pt ON pt.id = e.plan_id
     WHERE e.clinica_id = $1 AND e.paciente_id = $2 ORDER BY e.fecha DESC, e.id DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function crearEstudio(clinicaId, d) {
  const res = await query(
    `INSERT INTO estudios (clinica_id, paciente_id, tipo, pieza, descripcion, observaciones, odontologo_id, archivo, mime, tamano, nombre_archivo, plan_id, historia_clinica_id, fecha, etapa_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, CURRENT_DATE),$15) RETURNING id`,
    [clinicaId, d.pacienteId, d.tipo, d.pieza || null, d.descripcion || null, d.observaciones || null, d.odontologoId || null,
      d.archivo || null, d.mime || null, d.archivo ? d.archivo.length : null, d.nombreArchivo || null, d.planId || null, d.historiaClinicaId || null, d.fecha || null, d.etapaId || null]
  );
  return obtenerEstudio(clinicaId, res.rows[0].id);
}

async function obtenerEstudio(clinicaId, id) {
  const res = await query(`SELECT ${COLS_ESTUDIO}, e.storage_path FROM estudios e WHERE e.clinica_id=$1 AND e.id=$2`, [clinicaId, id]);
  return res.rows[0] || null;
}

async function actualizarEstudio(clinicaId, id, d) {
  await query(
    `UPDATE estudios SET tipo=COALESCE($3, tipo), pieza=$4, descripcion=$5, observaciones=$6, plan_id=$7, historia_clinica_id=$8, fecha=COALESCE($9, fecha)
     WHERE clinica_id=$1 AND id=$2`,
    [clinicaId, id, d.tipo || null, d.pieza || null, d.descripcion || null, d.observaciones || null, d.planId || null, d.historiaClinicaId || null, d.fecha || null]
  );
  return obtenerEstudio(clinicaId, id);
}

async function archivo(clinicaId, tabla, id) {
  const extra = tabla === 'estudios' ? ', nombre_archivo AS nombre' : ', NULL AS nombre';
  const res = await query(`SELECT archivo, mime, storage_path${extra} FROM ${tabla === 'estudios' ? 'estudios' : 'fotos_clinicas'} WHERE clinica_id=$1 AND id=$2`, [clinicaId, id]);
  return res.rows[0] || null;
}

async function eliminarEstudio(clinicaId, id) {
  await query('DELETE FROM estudios WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
}

// ---- Consentimientos ----
async function listarConsentimientos(clinicaId, pacienteId) {
  const res = await query(
    `SELECT c.*, o.nombre AS odontologo_nombre FROM consentimientos c
     LEFT JOIN odontologos o ON o.id = c.odontologo_id
     WHERE c.clinica_id = $1 AND c.paciente_id = $2 ORDER BY c.fecha DESC, c.id DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerConsentimiento(clinicaId, id) {
  const res = await query('SELECT * FROM consentimientos WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  return res.rows[0] || null;
}

async function crearConsentimiento(clinicaId, d) {
  const res = await query(
    `INSERT INTO consentimientos (clinica_id, paciente_id, odontologo_id, procedimiento, texto, estado, fecha)
     VALUES ($1,$2,$3,$4,$5,'pendiente',COALESCE($6, CURRENT_DATE)) RETURNING *`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.procedimiento, d.texto, d.fecha || null]
  );
  return res.rows[0];
}

async function firmarConsentimiento(clinicaId, id, { firmaPaciente, firmaOdontologo }) {
  const res = await query(
    `UPDATE consentimientos SET estado='firmado', firma_paciente=COALESCE($3, firma_paciente), firma_odontologo=COALESCE($4, firma_odontologo)
     WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, firmaPaciente || null, firmaOdontologo || null]
  );
  return res.rows[0] || null;
}

async function cambiarEstadoConsentimiento(clinicaId, id, estado) {
  const res = await query(
    `UPDATE consentimientos SET estado=$3 WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, estado]
  );
  return res.rows[0] || null;
}

// ---- Recetas ----
async function listarRecetas(clinicaId, pacienteId) {
  const res = await query(
    `SELECT r.*, o.nombre AS odontologo_nombre,
            COALESCE((SELECT json_agg(json_build_object('medicamento', i.medicamento, 'concentracion', i.concentracion, 'presentacion', i.presentacion,
                       'dosis', i.dosis, 'frecuencia', i.frecuencia, 'duracion', i.duracion, 'via', i.via, 'indicaciones', i.indicaciones) ORDER BY i.id) FROM receta_items i WHERE i.receta_id = r.id), '[]') AS items
       FROM recetas r
     LEFT JOIN odontologos o ON o.id = r.odontologo_id
     WHERE r.clinica_id = $1 AND r.paciente_id = $2 ORDER BY r.fecha DESC, r.id DESC`,
    [clinicaId, pacienteId]
  );
  return res.rows;
}

async function obtenerReceta(clinicaId, id) {
  const res = await query(`SELECT r.*, o.nombre AS odontologo_nombre, o.matricula AS odontologo_matricula, o.especialidad AS odontologo_especialidad, u.nombre AS anulada_por_nombre
                             FROM recetas r LEFT JOIN odontologos o ON o.id=r.odontologo_id LEFT JOIN usuarios u ON u.id=r.anulada_por
                            WHERE r.clinica_id=$1 AND r.id=$2`, [clinicaId, id]);
  const receta = res.rows[0];
  if (!receta) return null;
  const items = await query('SELECT * FROM receta_items WHERE receta_id=$1 ORDER BY id', [id]);
  return { ...receta, items: items.rows };
}

async function crearReceta(clinicaId, d) {
  const res = await query(
    `INSERT INTO recetas (clinica_id, paciente_id, odontologo_id, fecha, indicaciones, historia_clinica_id, creado_por)
     VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7) RETURNING id`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.fecha || null, d.indicaciones || null, d.historiaClinicaId || null, d.creadoPor || null]
  );
  const recetaId = res.rows[0].id;
  for (const it of (d.items || [])) {
    await query(
      `INSERT INTO receta_items (receta_id, medicamento, concentracion, presentacion, dosis, frecuencia, duracion, via, indicaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [recetaId, it.medicamento, it.concentracion || null, it.presentacion || null, it.dosis || null, it.frecuencia || null, it.duracion || null, it.via || null, it.indicaciones || null]
    );
  }
  return obtenerReceta(clinicaId, recetaId);
}

// ---- Lista de espera ----
async function listarListaEspera(clinicaId, { estado } = {}) {
  const cond = estado ? 'le.clinica_id=$1 AND le.estado=$2' : 'le.clinica_id=$1';
  const params = estado ? [clinicaId, estado] : [clinicaId];
  const res = await query(
    `SELECT le.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono,
            t.nombre AS tratamiento_nombre, o.nombre AS odontologo_nombre
     FROM lista_espera le
     JOIN pacientes p ON p.id = le.paciente_id
     LEFT JOIN tratamientos t ON t.id = le.tratamiento_id
     LEFT JOIN odontologos o ON o.id = le.odontologo_id
     WHERE ${cond} ORDER BY
       CASE le.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, le.creado_en`,
    params
  );
  return res.rows;
}

async function crearListaEspera(clinicaId, d) {
  const res = await query(
    `INSERT INTO lista_espera (clinica_id, paciente_id, tratamiento_id, odontologo_id, preferencia_dia, preferencia_horario, prioridad, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [clinicaId, d.pacienteId, d.tratamientoId || null, d.odontologoId || null, d.preferenciaDia || null,
      d.preferenciaHorario || null, d.prioridad || 'media', d.observaciones || null]
  );
  return res.rows[0];
}

async function actualizarEstadoListaEspera(clinicaId, id, estado) {
  const res = await query(
    `UPDATE lista_espera SET estado=$3 WHERE clinica_id=$1 AND id=$2 RETURNING *`,
    [clinicaId, id, estado]
  );
  return res.rows[0] || null;
}

async function obtenerListaEsperaItem(clinicaId, id) {
  const res = await query('SELECT * FROM lista_espera WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  return res.rows[0] || null;
}

// ---- Laboratorio ----
async function listarLaboratorio(clinicaId, { pacienteId, estado } = {}) {
  const cond = ['l.clinica_id=$1'];
  const params = [clinicaId];
  if (pacienteId) { params.push(pacienteId); cond.push(`l.paciente_id=$${params.length}`); }
  if (estado) { params.push(estado); cond.push(`l.estado=$${params.length}`); }
  const res = await query(
    `SELECT l.*, p.nombre AS paciente_nombre, o.nombre AS odontologo_nombre FROM laboratorio l
     JOIN pacientes p ON p.id = l.paciente_id
     LEFT JOIN odontologos o ON o.id = l.odontologo_id
     WHERE ${cond.join(' AND ')} ORDER BY l.fecha_envio DESC NULLS LAST, l.id DESC`,
    params
  );
  return res.rows;
}

async function crearLaboratorio(clinicaId, d) {
  const res = await query(
    `INSERT INTO laboratorio (clinica_id, paciente_id, odontologo_id, laboratorio_nombre, trabajo, pieza, fecha_envio, fecha_estimada, costo, estado, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'solicitado',$10) RETURNING *`,
    [clinicaId, d.pacienteId, d.odontologoId || null, d.laboratorioNombre || null, d.trabajo || null,
      d.pieza || null, d.fechaEnvio || null, d.fechaEstimada || null, d.costo || null, d.observaciones || null]
  );
  return res.rows[0];
}

async function actualizarLaboratorio(clinicaId, id, campos) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [col, val] of Object.entries(campos)) {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  }
  vals.push(clinicaId, id);
  const res = await query(
    `UPDATE laboratorio SET ${sets.join(', ')} WHERE clinica_id=$${i++} AND id=$${i} RETURNING *`,
    vals
  );
  return res.rows[0] || null;
}

async function obtenerLaboratorioItem(clinicaId, id) {
  const res = await query('SELECT * FROM laboratorio WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  return res.rows[0] || null;
}

// ---- WhatsApp historial ----
async function registrarWhatsapp(clinicaId, { pacienteId, tipoMensaje, usuarioId }) {
  const res = await query(
    `INSERT INTO whatsapp_historial (clinica_id, paciente_id, tipo_mensaje, usuario_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [clinicaId, pacienteId || null, tipoMensaje, usuarioId || null]
  );
  return res.rows[0];
}

async function listarWhatsapp(clinicaId, { pacienteId } = {}) {
  const cond = pacienteId ? 'w.clinica_id=$1 AND w.paciente_id=$2' : 'w.clinica_id=$1';
  const params = pacienteId ? [clinicaId, pacienteId] : [clinicaId];
  const res = await query(
    `SELECT w.*, p.nombre AS paciente_nombre, u.nombre AS usuario_nombre FROM whatsapp_historial w
     LEFT JOIN pacientes p ON p.id = w.paciente_id
     LEFT JOIN usuarios u ON u.id = w.usuario_id
     WHERE ${cond} ORDER BY w.creado_en DESC LIMIT 200`,
    params
  );
  return res.rows;
}

module.exports = {
  listarFotos, crearFoto, obtenerFoto, eliminarFoto, actualizarFoto, archivo,
  listarEstudios, crearEstudio, obtenerEstudio, eliminarEstudio, actualizarEstudio,
  listarConsentimientos, obtenerConsentimiento, crearConsentimiento, firmarConsentimiento, cambiarEstadoConsentimiento,
  listarRecetas, obtenerReceta, crearReceta,
  listarListaEspera, crearListaEspera, actualizarEstadoListaEspera, obtenerListaEsperaItem,
  listarLaboratorio, crearLaboratorio, actualizarLaboratorio, obtenerLaboratorioItem,
  registrarWhatsapp, listarWhatsapp,
};
