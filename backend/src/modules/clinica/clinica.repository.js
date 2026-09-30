const { query } = require('../../config/db');

async function findBySlug(slug) {
  const res = await query('SELECT * FROM clinicas WHERE slug = $1 AND activa = true', [slug]);
  return res.rows[0] || null;
}

async function findById(id) {
  const res = await query('SELECT * FROM clinicas WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function update(id, campos) {
  const columnas = Object.keys(campos);
  if (columnas.length === 0) return findById(id);
  const sets = columnas.map((col, i) => `${col} = $${i + 2}`).join(', ');
  const valores = columnas.map((col) => campos[col]);
  const res = await query(
    `UPDATE clinicas SET ${sets}, actualizado_en = now() WHERE id = $1 RETURNING *`,
    [id, ...valores]
  );
  return res.rows[0];
}

module.exports = { findBySlug, findById, update };
