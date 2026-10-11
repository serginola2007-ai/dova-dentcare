// Intrusión desde afuera: un atacante SIN usuario ni contraseña intenta entrar
// o sacar información. Corre contra un servidor de prueba en NODE_ENV=production
// (ver README.md). Ningún intento puede devolver datos, un 200 en la API ni un 500.
const crypto = require('crypto');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE = process.env.DOVA_URL || 'http://localhost:4500'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const pedir = async (m, url, { body, headers = {}, crudo } = {}) => {
  const r = await fetch(BASE + url, { method: m, headers: { 'content-type': 'application/json', ...headers }, body: crudo !== undefined ? crudo : (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const t = await r.text();
  return { s: r.status, t, h: r.headers };
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const firmar = (pl, secreto, alg = 'HS256') => { const h = b64({ alg, typ: 'JWT' }); const p = b64(pl); const f = crypto.createHmac(alg === 'HS512' ? 'sha512' : 'sha256', secreto).update(`${h}.${p}`).digest('base64url'); return `${h}.${p}.${f}`; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const FILTRA = /DATABASE_URL|JWT_SECRET|password_hash|BEGIN [A-Z ]*PRIVATE KEY|node_modules|at [A-Za-z.]+ \(\/|"stack"/;

(async () => {
  await db.query('DELETE FROM login_intentos');

  // 1) Archivos del servidor que no deben poder bajarse
  const rutasSecretas = ['/.env', '/backend/.env', '/../backend/.env', '/%2e%2e/backend/.env', '/shared/..%2f..%2fbackend%2f.env', '/shared/%2e%2e/%2e%2e/backend/.env',
    '/.git/config', '/.git/HEAD', '/package.json', '/backend/package.json', '/src/app.js', '/backend/src/app.js', '/render.yaml', '/CLAUDE.md', '/SECURITY-AUDIT.md',
    '/README.md', '/backend/src/config/env.js', '/node_modules/express/package.json', '/uploads/', '/shared/', '/moderno/../../backend/.env', '/web/..%5c..%5cbackend%5c.env',
    '/api/../backend/.env', '/%2e/%2e/etc/passwd', '/shared/..%252f..%252fbackend%252f.env'];
  let expuestos = [];
  for (const r of rutasSecretas) {
    const x = await pedir('GET', r);
    if (x.s === 200 && (FILTRA.test(x.t) || /"dependencies"|JWT_|^\[core\]|ref: refs|<title>Index of/i.test(x.t))) expuestos.push(`${r} → ${x.s}`);
  }
  P(`Ningún archivo del servidor se puede bajar (${rutasSecretas.length} rutas probadas, con y sin codificación)`, expuestos.length === 0, expuestos);

  // 2) La API sin sesión no entrega nada
  const lecturas = ['/api/pacientes', '/api/usuarios', '/api/auditoria', '/api/reportes/dashboard/alertas', '/api/caja', '/api/facturacion', '/api/pacientes/1', '/api/usuarios/1', '/api/clinica', '/api/auth/sesiones', '/api/eventos', '/api/busqueda?q=a'];
  const sinSesion = [];
  for (const u of lecturas) { const x = await pedir('GET', u); if (x.s !== 401 && x.s !== 404) sinSesion.push(`${u} → ${x.s}`); }
  P('Sin sesión, la API no responde datos (401)', sinSesion.length === 0, sinSesion);

  // 3) Tokens falsificados
  const ahora = Math.floor(Date.now() / 1000);
  const pl = { sub: 1, clinicaId: 1, rolCodigo: 'admin', permisos: ['usuarios.manage'], tv: 0, iat: ahora, exp: ahora + 900 };
  const falsos = {
    'alg none': `${b64({ alg: 'none', typ: 'JWT' })}.${b64(pl)}.`,
    'secreto "secret"': firmar(pl, 'secret'), 'secreto "dova"': firmar(pl, 'dova'), 'secreto vacío': firmar(pl, ''),
    'secreto de ejemplo del .env.example': firmar(pl, 'CAMBIAR_por_un_secreto_largo_y_aleatorio'),
    'HS512': firmar(pl, 'secret', 'HS512'), 'firma cortada': firmar(pl, 'x').split('.').slice(0, 2).join('.') + '.',
    'basura': 'a.b.c', 'muy largo': 'x'.repeat(20000),
  };
  const aceptados = [];
  for (const [n, t] of Object.entries(falsos)) { const x = await pedir('GET', '/api/usuarios', { headers: { authorization: `Bearer ${t}` } }); if (x.s !== 401 && x.s !== 431) aceptados.push(`${n} → ${x.s}`); }
  P('Ningún token falsificado es aceptado (alg none, secretos adivinados, HS512…)', aceptados.length === 0, aceptados);
  const cookies = await Promise.all(['dova_rt=' + 'a'.repeat(96), 'dova_rt=../../etc', 'dova_portal=' + firmar({ sub: 1 }, 'secret')].map((c) => pedir('POST', c.startsWith('dova_rt') ? '/api/auth/refresh' : '/api/web/cuenta/yo', { body: {}, headers: { cookie: c, 'x-dova-csrf': '1' } })));
  P('Cookies de sesión inventadas: rechazadas', cookies.every((x) => x.s === 401 || x.s === 400 || x.s === 404), cookies.map((x) => x.s));

  // 4) Inyección en el ingreso
  const cargas = [
    { username: "admin' --", password: 'x' }, { username: "' OR '1'='1", password: "' OR '1'='1" }, { username: 'admin', password: { $ne: null } },
    { username: { $gt: '' }, password: 'x' }, { username: ['admin'], password: ['admin'] }, { username: 'admin\u0000', password: 'admin' },
    { username: 'a'.repeat(100000), password: 'b' }, { username: 'admin', password: 'x'.repeat(100000) }, { username: null, password: null },
    { username: 'admin; DROP TABLE usuarios;--', password: 'x' }, { username: '<script>alert(1)</script>', password: 'x' },
  ];
  const malas = [];
  for (const c of cargas) { const x = await pedir('POST', '/api/auth/login', { body: c }); if (!(x.s >= 400 && x.s < 500) || /accessToken/.test(x.t) || FILTRA.test(x.t)) malas.push(`${JSON.stringify(c).slice(0, 60)} → ${x.s}`); }
  P('Inyección SQL / de objetos en el ingreso: nunca entra ni rompe el servidor', malas.length === 0, malas);
  await db.query('DELETE FROM login_intentos');
  P('…la tabla de usuarios sigue intacta', Number((await db.query('SELECT count(*)::int n FROM usuarios')).rows[0].n) > 0);
  const roto = await pedir('POST', '/api/auth/login', { crudo: '{"username": "admin", "password": ' });
  P('JSON mal formado: 400 sin detalles internos', roto.s === 400 && !FILTRA.test(roto.t), roto);
  const anidado = await pedir('POST', '/api/auth/login', { crudo: '{"a":'.repeat(5000) + '1' + '}'.repeat(5000) });
  P('JSON anidado 5.000 niveles: rechazado sin caerse', anidado.s >= 400 && anidado.s < 500, anidado.s);
  const grande = await pedir('POST', '/api/auth/login', { crudo: JSON.stringify({ username: 'x', password: 'y', relleno: 'z'.repeat(3 * 1024 * 1024) }) });
  P('Cuerpo de 3 MB: rechazado (413)', grande.s === 413, grande.s);

  // 5) Fuerza bruta y relleno de credenciales
  await db.query('DELETE FROM login_intentos');
  let ultimo;
  for (let i = 0; i < 6; i += 1) ultimo = await pedir('POST', '/api/auth/login', { body: { username: 'admin', password: `adivinanza${i}` } });
  const conLaBuena = await pedir('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin' } });
  P('Adivinar la contraseña: a los 5 intentos se bloquea la cuenta, aunque después acierte', ultimo.s === 429 && conLaBuena.s === 429, [ultimo.s, conLaBuena.s]);
  await db.query('DELETE FROM login_intentos');
  const usuarios = Array.from({ length: 35 }, (_, i) => `usuario${i}x`);
  let bloqueoIp = false;
  for (const u of usuarios) { const x = await pedir('POST', '/api/auth/login', { body: { username: u, password: 'Verano2026' } }); if (x.s === 429) { bloqueoIp = true; break; } }
  P('Probar una contraseña en muchos usuarios (relleno de credenciales): se bloquea la IP', bloqueoIp);
  await db.query('DELETE FROM login_intentos');
  await dormir(61000); // ventana del límite por minuto

  // 6) No se puede averiguar qué usuarios existen
  const existe = await pedir('POST', '/api/auth/login', { body: { username: 'admin', password: 'NoEsLaClave1' } });
  const noExiste = await pedir('POST', '/api/auth/login', { body: { username: 'noexiste-zz', password: 'NoEsLaClave1' } });
  P('Mismo mensaje y código si el usuario existe o no', existe.s === noExiste.s && existe.t === noExiste.t, [existe.t, noExiste.t]);
  const medir = async (u) => { const t0 = process.hrtime.bigint(); await pedir('POST', '/api/auth/login', { body: { username: u, password: 'NoEsLaClave1' } }); return Number(process.hrtime.bigint() - t0) / 1e6; };
  const ta = []; const tb = [];
  for (let i = 0; i < 3; i += 1) { ta.push(await medir('admin')); tb.push(await medir(`noexiste${i}`)); }
  const med = (a) => a.sort((x, y) => x - y)[1];
  P('Mismo tiempo de respuesta (no se adivina por la demora)', Math.abs(med(ta) - med(tb)) < 60, { existe: med(ta), noExiste: med(tb) });
  await db.query('DELETE FROM login_intentos');

  // 7) Cabeceras, CORS y métodos
  const home = await pedir('GET', '/moderno/');
  const h = home.h;
  P('No revela la tecnología del servidor (sin X-Powered-By)', !h.get('x-powered-by'));
  P('Cabeceras de protección: CSP, HSTS, nosniff, anti-iframe ajeno, Referrer-Policy', /script-src 'self'/.test(h.get('content-security-policy') || '') && /max-age/.test(h.get('strict-transport-security') || '') && h.get('x-content-type-options') === 'nosniff' && /frame-ancestors 'self'/.test(h.get('content-security-policy') || '') && !!h.get('referrer-policy'));
  const cors = await pedir('OPTIONS', '/api/auth/login', { headers: { origin: 'https://sitio-malicioso.example', 'access-control-request-method': 'POST' } });
  P('Otro sitio no puede usar la API desde el navegador (CORS)', !cors.h.get('access-control-allow-origin'), cors.h.get('access-control-allow-origin'));
  const trace = await new Promise((ok) => {
    const rq = require('http').request(`${BASE}/api/auth/login`, { method: 'TRACE', headers: { authorization: 'Bearer secreto-de-prueba' } }, (rs) => { let t = ''; rs.on('data', (d) => { t += d; }); rs.on('end', () => ok({ s: rs.statusCode, t })); });
    rq.on('error', () => ok({ s: 0, t: '' })); rq.end();
  });
  P('TRACE no refleja el pedido', trace.s >= 400 && !/secreto-de-prueba/i.test(trace.t), trace.s);
  const e404 = await pedir('GET', '/api/no-existe/../../etc/passwd');
  P('Errores sin detalles internos', !FILTRA.test(e404.t), e404.t.slice(0, 200));

  // 8) El portal del paciente tampoco abre puertas
  const portales = [];
  for (const c of [{ usuario: "1' OR '1'='1", clave: "' OR 1=1--" }, { usuario: ['1234567'], clave: ['x'] }, { usuario: { $ne: '' }, clave: 'x' }, { usuario: '123\u0000', clave: 'x' }, { usuario: 'a'.repeat(50000), clave: 'x' }]) {
    const x = await pedir('POST', '/api/web/cuenta/ingresar', { body: c, headers: { 'x-dova-csrf': '1' } });
    if (!(x.s >= 400 && x.s < 500) || /token/i.test(x.t)) portales.push(`${JSON.stringify(c).slice(0, 50)} → ${x.s}`);
  }
  P('Portal del paciente: inyección y tipos raros en el ingreso rechazados', portales.length === 0, portales);
  P('Nada quedó como error 500 en la auditoría', !(await db.query("SELECT 1 FROM auditoria WHERE resultado='error' AND creado_en > now() - interval '10 minutes'")).rowCount);

  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
