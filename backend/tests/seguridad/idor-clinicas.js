// IDOR / aislamiento entre clínicas: el admin de la Clínica B (con TODOS los permisos)
// intenta leer, modificar y referenciar datos del paciente marcador de la Clínica A.
const { Pool } = require('pg');
const crypto = require('crypto');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const rutas = require('./rutas.json');
const B = (process.env.DOVA_URL || 'http://localhost:4500');
const PAC = Number(process.argv[2]);
(async () => {
  const tok = (await (await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' }) })).json()).accessToken;
  if (!tok) throw new Error('no login adminb');
  // IDs del marcador en todas las tablas que tienen paciente_id
  const tablas = (await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='paciente_id' AND table_name NOT IN ('auditoria')")).rows.map((r) => r.table_name);
  const ids = new Set([PAC]); const snap = {};
  for (const t of tablas) {
    const rows = (await db.query(`SELECT * FROM ${t} WHERE paciente_id=$1`, [PAC])).rows;
    for (const r of rows) if (r.id) ids.add(Number(r.id));
    snap[t] = crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex');
  }
  for (const [t, col] of [['etapas_tratamiento', 'plan_id'], ['receta_items', 'receta_id'], ['cuotas', 'plan_pago_id'], ['presupuesto_items', 'presupuesto_id']]) {
    const parent = { etapas_tratamiento: 'planes_tratamiento', receta_items: 'recetas', cuotas: 'planes_pago', presupuesto_items: 'presupuestos' }[t];
    const rows = (await db.query(`SELECT * FROM ${t} WHERE ${col} IN (SELECT id FROM ${parent} WHERE paciente_id=$1)`, [PAC])).rows;
    for (const r of rows) ids.add(Number(r.id));
    snap[t] = crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex');
  }
  const pacRow = JSON.stringify((await db.query('SELECT * FROM pacientes WHERE id=$1', [PAC])).rows);
  const lista = [...ids];
  console.log(`IDs del marcador: ${lista.length} · tablas: ${tablas.length}`);
  const fugas = []; const escrituras = [];
  const vistos = new Set();
  const cuerpo = (id) => ({ pacienteId: PAC, odontologoId: id, planId: id, presupuestoId: id, turnoId: id, historiaClinicaId: id, insumoId: id, tratamientoId: id, cuotaId: id, recetaId: id, etapaId: id,
    nombre: 'x', motivo: 'auditoria idor', monto: 1000, cantidad: 1, fecha: '2026-12-01', horaInicio: '06:00', duracionMinutos: 30, texto: 'auditoria', procedimiento: 'x', titulo: 'auditoria',
    descripcion: 'auditoria', metodo: 'efectivo', concepto: 'x', estado: 'cancelado', diagnostico: 'x', items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, insumoId: id, tratamientoId: id, medicamento: 'x' }], visible: true, observaciones: 'x', pieza: '36' });
  let n = 0;
  for (const r of rutas) {
    if (!r.ruta.includes(':') && r.m === 'GET') continue;
    if (/^\/api\/(web\/publico|web\/cuenta|auth)/.test(r.ruta)) continue;
    const k = `${r.m} ${r.ruta}`; if (vistos.has(k)) continue; vistos.add(k);
    const candidatos = r.ruta.includes(':') ? lista : [0];
    for (const id of candidatos) {
      const url = r.ruta.replace(/:pieza/g, '36').replace(/:paso/g, 'llegada').replace(/:accion/g, 'confirmar').replace(/:codigoPermiso/g, 'pagos.view').replace(/:clave/g, 'x').replace(/:[a-zA-Z]+/g, String(id));
      const resp = await fetch(B + url, { method: r.m, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: r.m === 'GET' ? undefined : JSON.stringify(cuerpo(id)) });
      n++;
      const ct = resp.headers.get('content-type') || '';
      const txt = ct.includes('json') || ct.includes('text') ? await resp.text() : '';
      if (r.m === 'GET') {
        if (resp.status === 200 && (txt.includes('ZZMARCADOR') || /pdf|image|octet|sheet|csv/.test(ct))) fugas.push(`${resp.status} ${r.m} ${url} (${ct.split(';')[0]}) ${r.archivo}`);
      } else if (resp.status < 300) escrituras.push(`${resp.status} ${r.m} ${url} ${txt.slice(0, 120)} ${r.archivo}`);
    }
  }
  console.log(`Pedidos: ${n}`);
  console.log(`\n== Lecturas que devolvieron datos de la Clínica A: ${fugas.length}`); fugas.forEach((x) => console.log(x));
  console.log(`\n== Escrituras aceptadas (revisar): ${escrituras.length}`); escrituras.forEach((x) => console.log(x));
  // ¿Cambió algún dato del marcador?
  const cambios = [];
  for (const t of tablas) { const rows = (await db.query(`SELECT * FROM ${t} WHERE paciente_id=$1`, [PAC])).rows; if (crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex') !== snap[t]) cambios.push(t); }
  if (JSON.stringify((await db.query('SELECT * FROM pacientes WHERE id=$1', [PAC])).rows) !== pacRow) cambios.push('pacientes');
  console.log(`\n== Tablas del marcador modificadas desde la Clínica B: ${cambios.length ? cambios.join(', ') : 'ninguna'}`);
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
