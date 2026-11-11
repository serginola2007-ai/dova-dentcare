// Búsqueda de pacientes: sin acentos, nombre completo, C.I. con puntos y teléfono en cualquier formato.
// Requiere DATABASE_URL y DOVA_URL.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin'");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const suf = String(Date.now() % 1000000).padStart(6, '0');
  const ape = `Ñúñez${suf}`; const ci = `7${suf}`; const tel = `0991 ${suf.slice(0, 3)} ${suf.slice(3)}`;
  const pacs = [];
  try {
    pacs.push((await db.query("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,'José María',$1,$2,$3) RETURNING id", [ape, ci, tel])).rows[0].id);
    const ids = async (q) => { const r = await req('GET', `/pacientes?q=${encodeURIComponent(q)}`, undefined, A); return r.s === 200 ? (r.j.data || r.j.items || []).map((p) => p.id) : r; };
    const encontro = async (q) => (await ids(q)).includes?.(pacs[0]);
    P('Sin acentos ni mayúsculas: "jose maria"', await encontro(`jose maria nunez${suf}`));
    P('Apellido y nombre en otro orden', await encontro(`nunez${suf} jose`));
    P('Con acentos igual que en la ficha', await encontro(`José María ${ape}`));
    P('C.I. con puntos', await encontro(`${ci.slice(0, 1)}.${ci.slice(1, 4)}.${ci.slice(4)}`));
    P('Teléfono sin espacios', await encontro(tel.replace(/\s/g, '')));
    P('Teléfono con +595', await encontro(`+595 ${tel.slice(1)}`));
    const todos = await ids('%');
    P('"%" no es un comodín: se comporta como sin filtro', Array.isArray(todos));
    P('Otra palabra no lo encuentra', !(await encontro(`otro${suf}`)));
    let r = await req('GET', `/busqueda?q=${encodeURIComponent(`maria nunez${suf}`)}`, undefined, A);
    P('Búsqueda general: nombre sin acentos', r.s === 200 && (r.j.pacientes || []).some((p) => p.id === pacs[0]), r.j);
    r = await req('GET', `/busqueda?q=${encodeURIComponent(tel.replace(/\s/g, ''))}`, undefined, A);
    P('Búsqueda general: teléfono sin espacios', r.s === 200 && (r.j.pacientes || []).some((p) => p.id === pacs[0]), r.j);
    r = await req('GET', '/busqueda?q=%25%25', undefined, A);
    P('Búsqueda general: solo comodines → 400', r.s === 400, r);
    // Parecidos al dar de alta
    const par = async (qs) => { const x = await req('GET', `/pacientes/parecidos?${new URLSearchParams(qs)}`, undefined, A); return x.s === 200 ? x.j.map((p) => p.id) : x; };
    P('Parecido: mismo nombre y apellido sin acentos', (await par({ nombre: 'jose maria', apellido: `NUNEZ${suf}` })).includes(pacs[0]));
    P('Parecido: misma C.I. con puntos', (await par({ ci: `${ci.slice(0, 1)}.${ci.slice(1, 4)}.${ci.slice(4)}` })).includes(pacs[0]));
    P('Parecido: mismo teléfono con +595', (await par({ telefono: `+595${tel.slice(1).replace(/\s/g, '')}` })).includes(pacs[0]));
    P('Parecido: solo el nombre no alcanza', (await par({ nombre: 'jose maria' })).length === 0);
    P('Parecido: datos raros no rompen', Array.isArray(await par({ nombre: "'; drop table x", apellido: '%%', ci: 'abc', telefono: '12' })));
    P('Parecido: sin sesión → 401', (await req('GET', '/pacientes/parecidos?ci=1234567')).s === 401);
  } finally {
    const c = await db.connect();
    try { await c.query('BEGIN'); await c.query("SET LOCAL dova.borrando_paciente='on'"); await c.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); console.log('limpieza:', e.message); } finally { c.release(); }
    await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
