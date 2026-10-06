// Barrido de TODAS las rutas de la API: sin token (espera 401) y con un usuario sin permisos (espera 403).
// Las rutas que cierran la sesión (logout, logout-todas) se prueban al final:
// si no, invalidarían el token del usuario de prueba para el resto del barrido.
const CIERRAN = /^\/api\/auth\/(logout|logout-todas)$/;
const rutas = require('./rutas.json').slice().sort((a, b) => Number(CIERRAN.test(a.ruta)) - Number(CIERRAN.test(b.ruta)));
const B = (process.env.DOVA_URL || 'http://localhost:4500');
const PUBLICAS = [/^\/api\/auth\/(login|refresh|logout)$/, /^\/api\/web\/publico\//, /^\/api\/web\/cuenta\/(registro|pedir-codigo|activar|ingresar)$/, /^\/api\/clinica\/branding-publico$/, /^\/api\/health$/];
const SOLO_SESION = [/^\/api\/auth\//, /^\/api\/notificaciones/, /^\/api\/usuarios\/me\//, /^\/api\/busqueda$/, /^\/api\/odontologos/, /^\/api\/clinica$/, /^\/api\/eventos$/];
const esPortal = (r) => r.startsWith('/api/web/cuenta/');
(async () => {
  const login = async (u, p) => (await (await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).accessToken;
  const tok = await login('sinperm', 'Clave1234!');
  if (!tok) throw new Error('sin token sinperm');
  const vistos = new Set(); const anom = []; let n = 0;
  for (const r of rutas) {
    const url = r.ruta.replace(/:[a-zA-Z]+/g, '1');
    const k = `${r.m} ${url}`; if (vistos.has(k)) continue; vistos.add(k); n++;
    const pub = PUBLICAS.some((x) => x.test(url));
    const h = { 'content-type': 'application/json' };
    const r1 = await fetch(B + url, { method: r.m, headers: h, body: r.m === 'GET' ? undefined : '{}' });
    if (!pub && r1.status !== 401) anom.push({ tipo: 'SIN_TOKEN_NO_401', k, s: r1.status, archivo: r.archivo });
    if (pub || esPortal(url)) continue;
    const r2 = await fetch(B + url, { method: r.m, headers: { ...h, authorization: `Bearer ${tok}` }, body: r.m === 'GET' ? undefined : '{}' });
    const sesion = SOLO_SESION.some((x) => x.test(url));
    // DELETE de facturas responde 405 a todos: una factura nunca se borra, se anula.
    const bloqueada = r.m === 'DELETE' && /^\/api\/facturacion\/1$/.test(url) && r2.status === 405;
    if (!sesion && !bloqueada && r2.status !== 403) anom.push({ tipo: 'SIN_PERMISO_NO_403', k, s: r2.status, archivo: r.archivo });
    if (r2.status >= 500) anom.push({ tipo: 'ERROR_500', k, s: r2.status, archivo: r.archivo });
  }
  console.log(`Rutas probadas: ${n}. Anomalías: ${anom.length}`);
  for (const a of anom) console.log(a.tipo, a.s, a.k, a.archivo);
})().catch((e) => { console.error(e); process.exit(1); });
