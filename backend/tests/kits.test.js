// Kits de insumos por tratamiento: se descuentan solos al registrar una sesión.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 500)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const stock = async (id) => Number((await q1('SELECT stock_actual FROM insumos WHERE id=$1', [id])).stock_actual);
const hoy = new Date().toISOString().slice(0, 10);

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}' WHERE id=1");
  const suf = String(Date.now() % 1000000);
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const O = (await req('POST', '/auth/login', { username: 'odo1', password: 'clave123' })).j.accessToken;
  const AB = (await req('POST', '/auth/login', { username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' })).j.accessToken;
  const od = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1,$1) RETURNING id", [`Dr. Kit ${suf}`])).id;
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Kit',$1,$2) RETURNING id", [`Prueba${suf}`, `KI${suf}`])).id;
  const trat = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio) VALUES (1,$1,300000) RETURNING id", [`Limpieza ${suf}`])).id;
  const i1 = (await q1("INSERT INTO insumos (clinica_id, nombre, stock_actual, stock_minimo, precio_compra) VALUES (1,$1,10,8,5000) RETURNING id", [`Pasta ${suf}`])).id;
  const i2 = (await q1("INSERT INTO insumos (clinica_id, nombre, stock_actual, stock_minimo) VALUES (1,$1,1,0) RETURNING id", [`Cepillo ${suf}`])).id;
  const iB = (await q1("INSERT INTO insumos (clinica_id, nombre, stock_actual) SELECT id, $1, 50 FROM clinicas WHERE slug='clinica-b' RETURNING id", [`Ajeno ${suf}`])).id;
  const tratB = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio) SELECT id, $1, 1 FROM clinicas WHERE slug='clinica-b' RETURNING id", [`TB ${suf}`])).id;
  const plan = (await q1("INSERT INTO planes_tratamiento (clinica_id, paciente_id, odontologo_id, tratamiento_id, nombre, precio, sesiones_totales, estado) VALUES (1,$1,$2,$3,'Limpieza',300000,5,'en_proceso') RETURNING id", [pac, od, trat])).id;
  try {
    P('sin sesión: 401', (await req('GET', '/inventario/kits')).s === 401);
    const lista = await req('GET', '/inventario/kits', undefined, A);
    P('lista los tratamientos con su kit', lista.s === 200 && lista.j.some((t) => t.id === trat && t.insumos === 0), lista.s);
    P('quien no gestiona inventario no puede guardar un kit (403)', (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: i1, cantidad: 1 }] }, O)).s === 403);
    P('insumo de otra clínica: 400', (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: iB, cantidad: 1 }] }, A)).s === 400);
    P('tratamiento de otra clínica: 404', (await req('PUT', `/inventario/kits/${tratB}`, { items: [] }, A)).s === 404 && (await req('GET', `/inventario/kits/${tratB}`, undefined, A)).s === 404);
    P('cantidad cero o negativa: 400', (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: i1, cantidad: 0 }] }, A)).s === 400 && (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: i1, cantidad: -2 }] }, A)).s === 400);
    P('insumo repetido: 400', (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: i1, cantidad: 1 }, { insumoId: i1, cantidad: 2 }] }, A)).s === 400);
    P('sin lista o con basura: 400', (await req('PUT', `/inventario/kits/${trat}`, { items: 'x' }, A)).s === 400 && (await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: '1 OR 1=1', cantidad: 1 }] }, A)).s === 400);
    const g = await req('PUT', `/inventario/kits/${trat}`, { items: [{ insumoId: i1, cantidad: 2 }, { insumoId: i2, cantidad: 1 }] }, A);
    P('se guarda el kit (2 insumos)', g.s === 200 && g.j.items.length === 2, g);
    P('el plan avisa que su tratamiento tiene kit', (await req('GET', `/planes-tratamiento/${plan}`, undefined, A)).j.kitInsumos === 2);
    // Sesión 1: descuenta todo
    P('sesión sin fecha: 400', (await req('POST', `/planes-tratamiento/${plan}/sesiones`, { procedimiento: 'x' }, A)).s === 400);
    const odB = await q1("SELECT o.id FROM odontologos o JOIN clinicas c ON c.id=o.clinica_id WHERE c.slug='clinica-b' LIMIT 1");
    if (odB) P('sesión con odontólogo de otra clínica: 400', (await req('POST', `/planes-tratamiento/${plan}/sesiones`, { fecha: hoy, odontologoId: odB.id }, A)).s === 400);
    const s1 = await req('POST', `/planes-tratamiento/${plan}/sesiones`, { fecha: hoy, odontologoId: od, procedimiento: 'Limpieza' }, A);
    P('registrar la sesión descuenta el kit', s1.s === 201 && s1.j.kit.aplicado && s1.j.kit.descontados.length === 2 && s1.j.kit.faltantes.length === 0, s1.j && s1.j.kit);
    P('…el stock bajó (10→8 y 1→0)', await stock(i1) === 8 && await stock(i2) === 0);
    const ses1 = (await q1('SELECT id, kit_aplicado FROM sesiones_tratamiento WHERE plan_id=$1 AND numero=1', [plan]));
    P('…quedó anotado en la sesión, con sus movimientos de inventario', ses1.kit_aplicado && Number((await q1('SELECT count(*) FROM sesion_materiales WHERE sesion_id=$1', [ses1.id])).count) === 2);
    const aviso = await q1("SELECT count(*)::int n FROM notificaciones WHERE clinica_id=1 AND tipo='inventario' AND titulo=$1", [`Queda poco: Pasta ${suf}`]);
    P('…y avisa que la pasta llegó al mínimo', aviso.n >= 1, aviso);
    // Sesión 2: falta cepillo, la sesión se registra igual
    const s2 = await req('POST', `/planes-tratamiento/${plan}/sesiones`, { fecha: hoy, odontologoId: od }, A);
    P('sin stock de un insumo la sesión se registra igual y avisa cuál faltó', s2.s === 201 && s2.j.kit.faltantes.length === 1 && s2.j.kit.faltantes[0].insumoId === i2 && s2.j.kit.descontados.length === 1, s2.j && s2.j.kit);
    P('…el stock nunca queda negativo', await stock(i2) === 0 && await stock(i1) === 6);
    // Sesión 3: se elige no descontar
    const s3 = await req('POST', `/planes-tratamiento/${plan}/sesiones`, { fecha: hoy, descontarKit: false }, A);
    P('si se elige no descontar, no se toca el stock', s3.s === 201 && !s3.j.kit.aplicado && await stock(i1) === 6);
    // Nunca dos veces la misma sesión
    const kits = require('../src/modules/inventario/kits.service');
    const rep = await kits.aplicarASesion(1, ses1.id, trat, { id: null, nombre: 'prueba' });
    P('aplicar de nuevo a la misma sesión no descuenta otra vez', !rep.aplicado && await stock(i1) === 6, rep);
    // Quitar el kit
    P('vaciar el kit lo quita', (await req('PUT', `/inventario/kits/${trat}`, { items: [] }, A)).j.items.length === 0 && (await req('GET', `/planes-tratamiento/${plan}`, undefined, A)).j.kitInsumos === 0);
    P('otra clínica no ve los kits de esta', !(await req('GET', '/inventario/kits', undefined, AB)).j.some((t) => t.id === trat));
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally {
    await db.query('DELETE FROM planes_tratamiento WHERE id=$1', [plan]).catch(() => null);
    await db.query('DELETE FROM tratamientos WHERE id = ANY($1::int[])', [[trat, tratB]]).catch(() => null);
    await db.query('DELETE FROM pacientes WHERE id=$1', [pac]).catch(() => null);
    await db.query('DELETE FROM odontologos WHERE id=$1', [od]).catch(() => null);
  }
  const ok = res.filter(Boolean).length;
  console.log(`kits.test.js ok=${ok} mal=${res.length - ok} | ${ok}/${res.length}`);
  await db.end(); process.exit(ok === res.length ? 0 : 1);
})();
