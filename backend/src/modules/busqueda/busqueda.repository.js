const { query } = require('../../config/db');

/* Búsqueda global (sección 26 del prompt): búsqueda tradicional rápida
   sobre datos reales, sin IA. Cada función busca en una sola tabla con
   LIKE case-insensitive; el service decide cuáles llamar según los
   permisos del usuario. Todas limitan a 8 resultados por categoría para
   mantener la respuesta liviana y legible. */

async function pacientes(clinicaId, q) {
  const res = await query(
    `SELECT id, nombre, apellido, ci, telefono
       FROM pacientes
      WHERE clinica_id=$1 AND activo=true
        AND (LOWER(nombre) LIKE $2 OR LOWER(apellido) LIKE $2 OR ci LIKE $2 OR telefono LIKE $2)
      ORDER BY apellido, nombre LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function citas(clinicaId, q) {
  const res = await query(
    `SELECT t.id, t.fecha, t.hora_inicio, t.motivo, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.clinica_id=$1
        AND (LOWER(t.motivo) LIKE $2 OR LOWER(p.nombre) LIKE $2 OR LOWER(p.apellido) LIKE $2)
      ORDER BY t.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function tratamientos(clinicaId, q) {
  const res = await query(
    `SELECT id, nombre, categoria, precio FROM tratamientos
      WHERE clinica_id=$1 AND (LOWER(nombre) LIKE $2 OR LOWER(categoria) LIKE $2)
      ORDER BY nombre LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function presupuestos(clinicaId, q) {
  // Los presupuestos no tienen texto libre propio: se buscan por nombre del paciente.
  const res = await query(
    `SELECT pr.id, pr.fecha, pr.total, pr.estado, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM presupuestos pr JOIN pacientes p ON p.id = pr.paciente_id
      WHERE pr.clinica_id=$1 AND (LOWER(p.nombre) LIKE $2 OR LOWER(p.apellido) LIKE $2)
      ORDER BY pr.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function pagos(clinicaId, q) {
  const res = await query(
    `SELECT pg.id, pg.fecha, pg.monto, pg.concepto, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM pagos pg JOIN pacientes p ON p.id = pg.paciente_id
      WHERE pg.clinica_id=$1
        AND (LOWER(pg.concepto) LIKE $2 OR LOWER(p.nombre) LIKE $2 OR LOWER(p.apellido) LIKE $2)
      ORDER BY pg.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function evoluciones(clinicaId, q) {
  const res = await query(
    `SELECT h.id, h.fecha, h.procedimiento, h.diagnostico, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM historia_clinica h JOIN pacientes p ON p.id = h.paciente_id
      WHERE h.clinica_id=$1
        AND (LOWER(h.procedimiento) LIKE $2 OR LOWER(h.diagnostico) LIKE $2 OR LOWER(p.nombre) LIKE $2 OR LOWER(p.apellido) LIKE $2)
      ORDER BY h.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function tickets(clinicaId, q) {
  const res = await query(
    `SELECT id, titulo, estado, categoria FROM tickets
      WHERE clinica_id=$1 AND (LOWER(titulo) LIKE $2 OR LOWER(descripcion) LIKE $2)
      ORDER BY creado_en DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function usuarios(clinicaId, q) {
  const res = await query(
    `SELECT id, nombre, username FROM usuarios
      WHERE clinica_id=$1 AND activo=true AND (LOWER(nombre) LIKE $2 OR LOWER(username) LIKE $2)
      ORDER BY nombre LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

module.exports = { pacientes, citas, tratamientos, presupuestos, pagos, evoluciones, tickets, usuarios };
