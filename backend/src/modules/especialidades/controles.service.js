/* Controles programados: el lugar único donde vive TODO control futuro de un
   paciente que nace de un tratamiento (endodoncia a 6/12/24 meses, implante,
   contención de ortodoncia, sellantes, biopsia…). Así la recepción y el
   odontólogo tienen una sola lista de "a quién hay que ver y cuándo". */
const { query } = require('../../config/db');
const { sumarMeses } = require('../../utils/recurso');

// Crea los controles que falten (idempotente: no duplica si ya existe uno
// con el mismo origen y título).
async function programar(clinicaId, { pacienteId, origenTipo, origenId, odontologoId, controles }) {
  const creados = [];
  for (const c of controles) {
    const ya = await query(
      'SELECT id FROM controles_programados WHERE clinica_id=$1 AND origen_tipo=$2 AND origen_id=$3 AND titulo=$4',
      [clinicaId, origenTipo, origenId, c.titulo]
    );
    if (ya.rowCount) continue;
    const fecha = c.fecha || sumarMeses(c.desde, c.meses);
    const r = await query(
      `INSERT INTO controles_programados (clinica_id, paciente_id, origen_tipo, origen_id, titulo, fecha_programada, odontologo_id, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [clinicaId, pacienteId, origenTipo, origenId, c.titulo, fecha, odontologoId || null, c.notas || null]
    );
    creados.push(r.rows[0].id);
  }
  return creados;
}

function sumarDias(fechaIso, dias) {
  const d = new Date(`${String(fechaIso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

module.exports = { programar, sumarDias };
