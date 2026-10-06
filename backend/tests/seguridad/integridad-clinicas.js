// Integridad entre clínicas: ninguna fila puede apuntar (FK) a una fila de OTRA clínica.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const fks = (await db.query(`
    SELECT tc.table_name AS hija, kcu.column_name AS col, ccu.table_name AS madre
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`)).rows;
  const conClinica = new Set((await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='clinica_id'")).rows.map((r) => r.table_name));
  let malas = 0; let revisadas = 0;
  for (const f of fks) {
    if (!conClinica.has(f.hija) || !conClinica.has(f.madre) || f.madre === 'clinicas' || f.col === 'clinica_id') continue;
    revisadas++;
    const r = (await db.query(`SELECT count(*)::int n FROM ${f.hija} h JOIN ${f.madre} m ON m.id = h.${f.col} WHERE h.clinica_id <> m.clinica_id`)).rows[0];
    if (r.n) { malas++; console.log(`CRUZADA: ${f.hija}.${f.col} → ${f.madre}: ${r.n} fila(s)`); }
  }
  console.log(`Relaciones revisadas: ${revisadas}. Con filas cruzadas entre clínicas: ${malas}`);
  await db.end();
})();
