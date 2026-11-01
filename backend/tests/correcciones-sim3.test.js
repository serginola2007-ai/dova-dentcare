// Correcciones de la simulación 3:
//  1) Cuotas en guaraníes enteros (sin centavos) y la suma cierra exacto.
//  2) Un odontólogo ve solo sus liquidaciones de comisiones (antes veía las de todos).
// Uso: DATABASE_URL=… DOVA_URL=http://localhost:4500 node tests/correcciones-sim3.test.js
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','odo2') AND clinica_id=1");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const O1 = (await req('POST', '/auth/login', { username: 'odo1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Cuotas',$1,$2) RETURNING id", [`Sim${suf}`, `CS${suf}`])).id;
  const od1 = (await q1("SELECT odontologo_id id FROM usuarios WHERE username='odo1' AND clinica_id=1")).id;
  const otro = (await q1('SELECT id FROM odontologos WHERE clinica_id=1 AND id<>$1 ORDER BY id LIMIT 1', [od1])).id;
  const liqs = [];
  try {
    // ---- 1) Cuotas enteras
    for (const [total, entrega, n] of [[2200000, 440000, 6], [250000, 50000, 6], [1000000, 0, 3], [999999, 1, 7]]) {
      const r = await req('POST', '/planes-pago', { pacienteId: pac, total, entrega, cantidadCuotas: n }, A);
      const cuotas = (await db.query('SELECT monto::numeric m FROM cuotas WHERE plan_pago_id=$1 ORDER BY numero', [r.j && r.j.id])).rows.map((x) => Number(x.m));
      const suma = cuotas.reduce((a, b) => a + b, 0);
      P(`${total} − ${entrega} en ${n} cuotas: todas enteras y suman ${total - entrega}`, r.s < 300 && cuotas.length === n && cuotas.every(Number.isInteger) && suma === total - entrega, cuotas);
    }
    // ---- 2) Liquidaciones: cada odontólogo, las suyas
    for (const o of [od1, otro]) {
      liqs.push((await q1("INSERT INTO comision_liquidaciones (clinica_id, odontologo_id, desde, hasta, produccion, costo_laboratorio, comision, detalle, estado) VALUES (1,$1,'2026-09-01','2026-09-30',1000000,0,300000,'[]','aprobada') RETURNING id", [o])).id);
    }
    let r = await req('GET', '/finanzas/comision-liquidaciones', undefined, O1);
    P('El odontólogo lista solo sus liquidaciones', r.s === 200 && r.j.length >= 1 && r.j.every((x) => x.odontologo_id === od1), r.j && r.j.map((x) => x.odontologo_id));
    r = await req('GET', `/finanzas/comision-liquidaciones?odontologoId=${otro}`, undefined, O1);
    P('…aunque pida las de otro por filtro', r.s === 200 && r.j.length === 0, r.j);
    r = await req('GET', `/finanzas/comision-liquidaciones/${liqs[1]}`, undefined, O1);
    P('…y el detalle de una ajena da 404', r.s === 404, r);
    r = await req('GET', `/finanzas/comision-liquidaciones/${liqs[0]}`, undefined, O1);
    P('…el detalle de la suya sí', r.s === 200 && r.j.odontologo_id === od1, r);
    r = await req('GET', '/finanzas/comision-liquidaciones', undefined, A);
    P('El administrador ve las de todos', r.s === 200 && liqs.every((id) => r.j.some((x) => x.id === id)), r.j && r.j.length);
  } finally {
    await db.query('DELETE FROM comision_liquidaciones WHERE id = ANY($1)', [liqs]).catch(() => {});
    await db.query('DELETE FROM cuotas WHERE plan_pago_id IN (SELECT id FROM planes_pago WHERE paciente_id=$1)', [pac]).catch(() => {});
    await db.query('DELETE FROM planes_pago WHERE paciente_id=$1', [pac]).catch(() => {});
    await db.query("SET dova.borrando_paciente='on'").catch(() => {});
    await db.query('DELETE FROM pacientes WHERE id=$1', [pac]).catch(() => {});
    await db.end();
  }
  const ok = res.filter(Boolean).length;
  console.log(`correcciones-sim3.test.js ok=${ok} mal=${res.length - ok} | ${ok}/${res.length}`);
  process.exit(ok === res.length ? 0 : 1);
})();
