const { query } = require('../../config/db');

// Dígitos para buscar C.I. y teléfono sin puntos, espacios ni prefijo (595 / 0). Vacío si son pocos.
const digitosDe = (q) => { if (/[a-zñ]/i.test(q)) return ''; const d = String(q).replace(/\D/g, '').replace(/^(595|0)/, ''); return d.length >= 5 ? d : ''; };

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
        AND (translate(LOWER(nombre || ' ' || COALESCE(apellido,'')), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(COALESCE(apellido,'') || ' ' || nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR LOWER(COALESCE(ci,'')) LIKE $2 OR telefono LIKE $2
             OR ($3 <> '' AND (regexp_replace(COALESCE(ci,''), '\\D', '', 'g') LIKE '%' || $3 || '%' OR regexp_replace(COALESCE(telefono,'') || ' ' || COALESCE(whatsapp,''), '\\D', '', 'g') LIKE '%' || $3 || '%')))
      ORDER BY apellido, nombre LIMIT 8`,
    [clinicaId, `%${q}%`, digitosDe(q)]
  );
  return res.rows;
}

async function citas(clinicaId, q) {
  const res = await query(
    `SELECT t.id, t.fecha, t.hora_inicio, t.motivo, p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.clinica_id=$1
        AND (translate(LOWER(t.motivo), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(p.nombre || ' ' || COALESCE(p.apellido,'')), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(COALESCE(p.apellido,'') || ' ' || p.nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
      ORDER BY t.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function tratamientos(clinicaId, q) {
  const res = await query(
    `SELECT id, nombre, categoria, precio FROM tratamientos
      WHERE clinica_id=$1 AND (translate(LOWER(nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(categoria), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
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
      WHERE pr.clinica_id=$1 AND (translate(LOWER(p.nombre || ' ' || COALESCE(p.apellido,'')), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(COALESCE(p.apellido,'') || ' ' || p.nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
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
        AND (translate(LOWER(pg.concepto), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(p.nombre || ' ' || COALESCE(p.apellido,'')), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(COALESCE(p.apellido,'') || ' ' || p.nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
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
        AND (translate(LOWER(h.procedimiento), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(h.diagnostico), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(p.nombre || ' ' || COALESCE(p.apellido,'')), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(COALESCE(p.apellido,'') || ' ' || p.nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
      ORDER BY h.fecha DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function tickets(clinicaId, q) {
  const res = await query(
    `SELECT id, titulo, estado, categoria FROM tickets
      WHERE clinica_id=$1 AND (translate(LOWER(titulo), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(descripcion), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
      ORDER BY creado_en DESC LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

async function usuarios(clinicaId, q) {
  const res = await query(
    `SELECT id, nombre, username FROM usuarios
      WHERE clinica_id=$1 AND activo=true AND (translate(LOWER(nombre), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2 OR translate(LOWER(username), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun') LIKE $2)
      ORDER BY nombre LIMIT 8`,
    [clinicaId, `%${q}%`]
  );
  return res.rows;
}

module.exports = { pacientes, citas, tratamientos, presupuestos, pagos, evoluciones, tickets, usuarios };
