// Asignación masiva / IDOR por el CUERPO del pedido: el administrador de la
// Clínica B llama a todos los POST de alta de la API mandando, en el cuerpo,
// IDs de filas de la Clínica A (pacienteId, odontologoId, tratamientoId,
// presupuestoId, insumoId…) y también clinicaId / clinica_id de A.
// Después se revisa la base: ninguna fila nueva puede apuntar a datos de A ni
// quedar guardada en la Clínica A. (Correr luego integridad-clinicas.js.)
const { Pool, types } = require('pg');
const path = require('path');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api';
const rutas = require(path.join(__dirname, 'rutas.json'));
const camel = (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
const NO = /^\/api\/(auth|web\/|eventos|usuarios\/me)/;

(async () => {
  await db.query('DELETE FROM login_intentos');
  const login = await (await fetch(`${B}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' }) })).json();
  const tok = login.accessToken; if (!tok) throw new Error('no login adminb');
  const cB = (await db.query("SELECT id FROM clinicas WHERE slug='clinica-b'")).rows[0].id;

  // Columnas FK hacia tablas con clinica_id, y un ID de la Clínica A para cada tabla madre.
  const fks = (await db.query(`
    SELECT DISTINCT kcu.column_name AS col, ccu.table_name AS madre
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      AND ccu.table_name IN (SELECT table_name FROM information_schema.columns WHERE column_name='clinica_id' AND table_schema='public')
      AND ccu.table_name <> 'clinicas'`)).rows;
  const cuerpo = { clinicaId: 1, clinica_id: 1, nombre: 'Inyeccion', apellido: 'FK', descripcion: 'Prueba FK', concepto: 'Prueba FK', titulo: 'Prueba FK', motivo: 'Prueba FK',
    monto: 1000, total: 1000, cantidad: 1, precio: 1000, precioUnitario: 1000, fecha: new Date().toISOString().slice(0, 10), hora: '10:00', horaInicio: '10:00', horaFin: '10:30', duracionMinutos: 30,
    ci: `FK${Date.now() % 100000}`, telefono: '0981000000', cantidadCuotas: 1, tipo: 'ingreso', metodo: 'efectivo', codigo: `fk${Date.now() % 100000}`, mensaje: 'Prueba FK', texto: 'Prueba FK' };
  const ids = {};
  for (const f of fks) {
    if (f.col === 'clinica_id') continue;
    if (!(f.madre in ids)) ids[f.madre] = ((await db.query(`SELECT max(id) AS id FROM ${f.madre} WHERE clinica_id=1`)).rows[0] || {}).id || null;
    if (ids[f.madre]) { cuerpo[f.col] = ids[f.madre]; cuerpo[camel(f.col)] = ids[f.madre]; }
  }
  const item = Object.fromEntries(Object.entries(cuerpo).filter(([k]) => /Id$/.test(k)));
  cuerpo.items = [{ ...item, descripcion: 'Prueba FK', cantidad: 1, precioUnitario: 1000 }];
  cuerpo.lineas = cuerpo.items; cuerpo.detalles = cuerpo.items;

  // Antes: lo último de cada tabla con clinica_id.
  const tablas = (await db.query("SELECT table_name t FROM information_schema.columns WHERE column_name='clinica_id' AND table_schema='public' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_type='BASE TABLE')")).rows.map((r) => r.t);
  const antes = {};
  for (const t of tablas) {
    const tieneId = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='id'", [t])).rowCount;
    if (tieneId) antes[t] = Number((await db.query(`SELECT COALESCE(max(id),0) m FROM ${t}`)).rows[0].m);
  }

  let pedidos = 0; const estados = {};
  for (const r of rutas) {
    if (r.m !== 'POST' || r.ruta.includes(':') || NO.test(r.ruta)) continue;
    const res = await fetch(B + r.ruta.replace(/^\/api/, ''), { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    pedidos++; estados[res.status] = (estados[res.status] || 0) + 1;
    const txt = await res.text().catch(() => ""); if (process.env.VERBOSE) console.log(res.status, r.ruta, txt.slice(0, 110));
  }

  // Después: filas nuevas guardadas en la Clínica A (no debería haber ninguna)
  // y filas nuevas de B que apunten a filas de A.
  let malas = 0;
  for (const t of Object.keys(antes)) {
    // (Correr este archivo solo, sin otras pruebas en paralelo.)
    const n = Number((await db.query(`SELECT count(*) n FROM ${t} WHERE id > $1 AND clinica_id = 1`, [antes[t]])).rows[0].n);
    if (n) { malas++; console.log(`MAL  ${t}: ${n} fila(s) nueva(s) guardada(s) en la Clínica A desde la Clínica B`); }
  }
  const fkHijas = (await db.query(`
    SELECT tc.table_name AS hija, kcu.column_name AS col, ccu.table_name AS madre
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND kcu.column_name <> 'clinica_id' AND ccu.table_name <> 'clinicas'`)).rows;
  for (const f of fkHijas) {
    if (!(f.hija in antes) || !tablas.includes(f.madre)) continue;
    const n = Number((await db.query(`SELECT count(*) n FROM ${f.hija} h JOIN ${f.madre} m ON m.id = h.${f.col} WHERE h.id > $1 AND h.clinica_id = $2 AND m.clinica_id <> $2`, [antes[f.hija], cB])).rows[0].n);
    if (n) { malas++; console.log(`MAL  ${f.hija}.${f.col} → ${f.madre}: ${n} fila(s) de la Clínica B apuntan a la Clínica A`); }
  }
  console.log(`Pedidos POST con IDs ajenos: ${pedidos} (respuestas: ${JSON.stringify(estados)})`);
  console.log(malas ? `${malas} PROBLEMA(S)` : 'OK   Ninguna fila quedó en la Clínica A ni apunta a datos de la Clínica A');
  await db.end();
  process.exit(malas ? 1 : 0);
})();
