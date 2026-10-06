const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || (process.env.DOVA_URL || 'http://localhost:4500')) + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, { tok, form, raw } = {}) => {
  const h = {}; if (tok) h.authorization = `Bearer ${tok}`; if (body && !form) h['content-type'] = 'application/json';
  const r = await fetch(B + url, { method: m, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  if (raw) return r; return { s: r.status, j: await r.json().catch(() => null) };
};
const _login = async (u, p) => (await req('POST', '/auth/login', { username: u, password: p })).j.accessToken;
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
// Aislamiento entre clínicas en listados, búsquedas, reportes y exportaciones (sin IDs: lo que trae "todo").
(async () => {
  await db.query('DELETE FROM login_intentos');
  const TB = (await req('POST', '/auth/login', { username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' })).j.accessToken;
  P('Login del administrador de la Clínica B', !!TB);
  const marca = (await q1("SELECT apellido FROM pacientes WHERE apellido LIKE 'ZZMARCADOR%' AND clinica_id=1 ORDER BY id DESC LIMIT 1")).apellido;
  const rutas = ['/pacientes?q=ZZMARCADOR', '/busqueda?q=ZZMARCADOR', '/agenda?fecha=' + new Date().toISOString().slice(0, 10), '/pagos/paciente/1', '/kpis/auditoria', '/seguimiento/bandeja?vista=todos&porPagina=500',
    '/reportes/centro/cobros?desde=2025-01-01&hasta=2027-12-31', '/reportes/centro/pacientes_nuevos?desde=2025-01-01&hasta=2027-12-31', '/reportes/centro/saldos_pendientes', '/reportes/centro/tratamientos_pendientes',
    '/facturacion', '/inventario/insumos', '/web/solicitudes', '/derivaciones', '/helpdesk', '/usuarios', '/pendientes', '/caja/estado', '/reportes/dashboard/alertas'];
  for (const r0 of rutas) {
    const r = await fetch(B + r0, { headers: { authorization: `Bearer ${TB}` } });
    const t = await r.text();
    P(`Clínica B no ve datos de la A: ${r0.split('?')[0]}`, r.status === 200 && !t.includes(marca) && !t.includes('"clinica_id":1,'), { s: r.status, muestra: t.slice(0, 120) });
  }
  for (const f of ['csv', 'xlsx', 'pdf']) {
    const r = await fetch(`${B}/reportes/centro/cobros?desde=2025-01-01&hasta=2027-12-31&formato=${f}`, { headers: { authorization: `Bearer ${TB}` } });
    const buf = Buffer.from(await r.arrayBuffer());
    P(`Exportación ${f} de la Clínica B sin datos de la A`, r.status === 200 && !buf.toString('latin1').includes('ZZMARCADOR'), r.status);
  }
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); await db.end(); process.exit(ok === res.length ? 0 : 1);
})().catch(async (e) => { console.error(e); process.exit(1); });
