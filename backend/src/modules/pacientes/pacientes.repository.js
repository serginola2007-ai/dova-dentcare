const { query } = require('../../config/db');

const COLUMNAS = `
  id, clinica_id, nombre, apellido, ci, fecha_nacimiento, sexo, telefono, whatsapp,
  email, direccion, ciudad, ocupacion, contacto_emergencia, alergias, medicamentos,
  antecedentes_medicos, antecedentes_odontologicos, observaciones,
  odontologo_principal_id, activo, creado_en, actualizado_en,
  fuente_referencia, referido_por_paciente_id, responsable_paciente_id, responsable_nombre,
  responsable_parentesco, responsable_telefono, responsable_ci, grupo_familiar,
  acepta_whatsapp, acepta_recordatorios, grupo_sanguineo, lista_precio_id
`;

async function listar(clinicaId, { q, page = 1, pageSize = 20, incluirInactivos = false }) {
  const condiciones = ['clinica_id = $1'];
  const params = [clinicaId];

  if (!incluirInactivos) {
    condiciones.push('activo = true');
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    condiciones.push(`(LOWER(nombre) LIKE $${params.length} OR LOWER(apellido) LIKE $${params.length} OR ci LIKE $${params.length})`);
  }

  const where = condiciones.join(' AND ');
  const offset = (page - 1) * pageSize;

  const totalRes = await query(`SELECT COUNT(*) FROM pacientes WHERE ${where}`, params);
  const total = parseInt(totalRes.rows[0].count, 10);

  params.push(pageSize, offset);
  const dataRes = await query(
    `SELECT ${COLUMNAS} FROM pacientes WHERE ${where}
     ORDER BY apellido, nombre
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: dataRes.rows, total, page, pageSize };
}

async function obtenerPorId(clinicaId, id) {
  const res = await query(
    `SELECT ${COLUMNAS} FROM pacientes WHERE clinica_id = $1 AND id = $2`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

async function obtenerPorCi(clinicaId, ci) {
  if (!ci) return null;
  const res = await query(
    `SELECT id FROM pacientes WHERE clinica_id = $1 AND ci = $2`,
    [clinicaId, ci]
  );
  return res.rows[0] || null;
}

async function crear(clinicaId, datos) {
  const res = await query(
    `INSERT INTO pacientes (
       clinica_id, nombre, apellido, ci, fecha_nacimiento, sexo, telefono, whatsapp,
       email, direccion, ciudad, ocupacion, contacto_emergencia, alergias, medicamentos,
       antecedentes_medicos, antecedentes_odontologicos, observaciones, odontologo_principal_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING ${COLUMNAS}`,
    [
      clinicaId, datos.nombre, datos.apellido, datos.ci || null, datos.fechaNacimiento || null,
      datos.sexo || null, datos.telefono || null, datos.whatsapp || null, datos.email || null,
      datos.direccion || null, datos.ciudad || null, datos.ocupacion || null,
      datos.contactoEmergencia || null, datos.alergias || null, datos.medicamentos || null,
      datos.antecedentesMedicos || null, datos.antecedentesOdontologicos || null,
      datos.observaciones || null, datos.odontologoPrincipalId || null,
    ]
  );
  return res.rows[0];
}

async function actualizar(clinicaId, id, datos) {
  const mapaColumnas = {
    nombre: 'nombre', apellido: 'apellido', ci: 'ci', fechaNacimiento: 'fecha_nacimiento',
    sexo: 'sexo', telefono: 'telefono', whatsapp: 'whatsapp', email: 'email',
    direccion: 'direccion', ciudad: 'ciudad', ocupacion: 'ocupacion',
    contactoEmergencia: 'contacto_emergencia', alergias: 'alergias', medicamentos: 'medicamentos',
    antecedentesMedicos: 'antecedentes_medicos', antecedentesOdontologicos: 'antecedentes_odontologicos',
    observaciones: 'observaciones', odontologoPrincipalId: 'odontologo_principal_id',
    fuenteReferencia: 'fuente_referencia', referidoPorPacienteId: 'referido_por_paciente_id',
    responsablePacienteId: 'responsable_paciente_id', responsableNombre: 'responsable_nombre',
    responsableParentesco: 'responsable_parentesco', responsableTelefono: 'responsable_telefono',
    responsableCi: 'responsable_ci', grupoFamiliar: 'grupo_familiar', aceptaWhatsapp: 'acepta_whatsapp',
    aceptaRecordatorios: 'acepta_recordatorios', grupoSanguineo: 'grupo_sanguineo', listaPrecioId: 'lista_precio_id',
  };
  const sets = [];
  const params = [clinicaId, id];
  for (const [key, columna] of Object.entries(mapaColumnas)) {
    if (datos[key] !== undefined) {
      params.push(datos[key]);
      sets.push(`${columna} = $${params.length}`);
    }
  }
  if (sets.length === 0) return obtenerPorId(clinicaId, id);

  const res = await query(
    `UPDATE pacientes SET ${sets.join(', ')}, actualizado_en = now()
     WHERE clinica_id = $1 AND id = $2 RETURNING ${COLUMNAS}`,
    params
  );
  return res.rows[0] || null;
}

async function eliminarLogico(clinicaId, id) {
  const res = await query(
    `UPDATE pacientes SET activo = false, actualizado_en = now()
     WHERE clinica_id = $1 AND id = $2 RETURNING id`,
    [clinicaId, id]
  );
  return res.rows[0] || null;
}

module.exports = { listar, obtenerPorId, obtenerPorCi, crear, actualizar, eliminarLogico };
