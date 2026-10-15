// Rentabilidad por tratamiento y por odontólogo (período 2020-03: no se mezcla con otros datos de prueba).
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 500)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const Q = '?desde=2020-03-01&hasta=2020-03-31';

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}' WHERE id=1");
  const suf = String(Date.now() % 1000000);
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const O = (await req('POST', '/auth/login', { username: 'odo1', password: 'clave123' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const AB = (await req('POST', '/auth/login', { username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' })).j.accessToken;
  const od = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1,$1) RETURNING id", [`Dr. Rentab ${suf}`])).id;
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Rent',$1,$2) RETURNING id", [`Test${suf}`, `RE${suf}`])).id;
  const trat = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio) VALUES (1,$1,1000000) RETURNING id", [`Endodoncia ${suf}`])).id;
  const plan = (await q1("INSERT INTO planes_tratamiento (clinica_id, paciente_id, odontologo_id, tratamiento_id, nombre, precio, descuento, sesiones_totales, sesiones_realizadas, estado) VALUES (1,$1,$2,$3,'Endo',1000000,10,2,2,'finalizado') RETURNING id", [pac, od, trat])).id;
  const s1 = (await q1("INSERT INTO sesiones_tratamiento (plan_id, numero, fecha, odontologo_id, estado) VALUES ($1,1,'2020-03-10',$2,'realizada') RETURNING id", [plan, od])).id;
  const s2 = (await q1("INSERT INTO sesiones_tratamiento (plan_id, numero, fecha, odontologo_id, estado) VALUES ($1,2,'2020-03-20',$2,'realizada') RETURNING id", [plan, od])).id;
  await db.query("INSERT INTO sesiones_tratamiento (plan_id, numero, fecha, odontologo_id, estado) VALUES ($1,3,'2020-03-25',$2,'cancelada')", [plan, od]);
  const i1 = (await q1("INSERT INTO insumos (clinica_id, nombre, precio_compra) VALUES (1,$1,25000) RETURNING id", [`Lima ${suf}`])).id;
  const i2 = (await q1("INSERT INTO insumos (clinica_id, nombre) VALUES (1,$1) RETURNING id", [`Gutapercha ${suf}`])).id;
  await db.query('INSERT INTO sesion_materiales (sesion_id, insumo_id, cantidad) VALUES ($1,$2,2)', [s1, i1]);
  await db.query('INSERT INTO sesion_materiales (sesion_id, insumo_id, cantidad) VALUES ($1,$2,1)', [s2, i2]);
  await db.query("INSERT INTO laboratorio (clinica_id, paciente_id, odontologo_id, trabajo, costo, estado, fecha_recepcion) VALUES (1,$1,$2,'Corona',100000,'recibido','2020-03-12')", [pac, od]);
  const regla = (await q1("INSERT INTO comision_reglas (clinica_id, odontologo_id, porcentaje, descontar_laboratorio) VALUES (1,$1,20,false) RETURNING id", [od])).id;
  try {
    P('sin sesión: 401', (await req('GET', `/finanzas/rentabilidad${Q}`)).s === 401);
    P('el odontólogo no la ve (403)', (await req('GET', `/finanzas/rentabilidad${Q}`, undefined, O)).s === 403);
    P('recepción no la ve (403)', (await req('GET', `/finanzas/rentabilidad${Q}`, undefined, R)).s === 403);
    P('fechas inválidas: 400', (await req('GET', '/finanzas/rentabilidad?desde=ayer&hasta=hoy', undefined, A)).s === 400 && (await req('GET', '/finanzas/rentabilidad?desde=2020-03-31&hasta=2020-03-01', undefined, A)).s === 400);
    const r = await req('GET', `/finanzas/rentabilidad${Q}&odontologoId=${od}`, undefined, A);
    P('el dueño la ve', r.s === 200 && r.j.totales, r);
    const t = r.j.totales;
    P('trabajos realizados: 2 sesiones × (1.000.000 − 10%) ÷ 2 = 900.000 (la cancelada no cuenta)', t.sesiones === 2 && t.produccion === 900000, t);
    P('insumos: 2 × 25.000 = 50.000 (el sin precio cuenta cero)', t.costoInsumos === 50000, t);
    P('laboratorio 100.000 y comisión 20% = 180.000', t.costoLaboratorio === 100000 && t.comision === 180000, t);
    P('margen = 900.000 − 50.000 − 100.000 − 180.000 = 570.000 (63,33%)', t.margen === 570000 && t.margenPct === 63.33, t);
    const x = r.j.porTratamiento.find((y) => y.tratamientoId === trat);
    P('por tratamiento: margen 670.000 (sin laboratorio)', x && x.produccion === 900000 && x.costoInsumos === 50000 && x.comision === 180000 && x.margen === 670000, r.j.porTratamiento);
    P('por odontólogo coincide con el total', r.j.porOdontologo.length === 1 && r.j.porOdontologo[0].margen === 570000 && r.j.porOdontologo[0].odontologoId === od, r.j.porOdontologo);
    P('avisa que un insumo no tiene precio de compra', r.j.avisos.insumosSinPrecio === 1, r.j.avisos);
    const vacio = await req('GET', '/finanzas/rentabilidad?desde=2019-01-01&hasta=2019-01-31', undefined, A);
    P('período sin sesiones: todo en cero, sin errores', vacio.s === 200 && vacio.j.totales.produccion === 0 && vacio.j.totales.margenPct === null && vacio.j.porTratamiento.length === 0, vacio);
    const b = await req('GET', `/finanzas/rentabilidad${Q}`, undefined, AB);
    P('otra clínica no ve nada de estos datos', b.s === 200 && b.j.totales.produccion === 0, b.j && b.j.totales);
    const sin = await req('GET', `/finanzas/rentabilidad${Q}&odontologoId=0 OR 1=1`, undefined, A);
    P('odontologoId con basura no rompe ni filtra de más', sin.s === 400 || (sin.s === 200 && sin.j.totales.produccion === 0), sin);
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally {
    await db.query('DELETE FROM comision_reglas WHERE id=$1', [regla]);
    await db.query('DELETE FROM laboratorio WHERE paciente_id=$1', [pac]);
    await db.query('DELETE FROM sesion_materiales WHERE sesion_id IN ($1,$2)', [s1, s2]);
    await db.query('DELETE FROM planes_tratamiento WHERE id=$1', [plan]);
    await db.query('DELETE FROM insumos WHERE id IN ($1,$2)', [i1, i2]);
    await db.query('DELETE FROM tratamientos WHERE id=$1', [trat]);
    await db.query('DELETE FROM pacientes WHERE id=$1', [pac]).catch(() => null);
    await db.query('DELETE FROM odontologos WHERE id=$1', [od]).catch(() => null);
  }
  const ok = res.filter(Boolean).length;
  console.log(`rentabilidad.test.js ok=${ok} mal=${res.length - ok} | ${ok}/${res.length}`);
  await db.end(); process.exit(ok === res.length ? 0 : 1);
})();
