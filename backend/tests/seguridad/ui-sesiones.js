/* global localStorage, location, document */
// Pantallas: sesión en cookie HttpOnly de punta a punta (navegador real, Playwright).
// Requiere: DATABASE_URL (base de prueba), DOVA_URL, y Playwright instalado
// (PLAYWRIGHT_MODULE=ruta al paquete y CHROMIUM_PATH si el navegador no está en la ruta por defecto).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const SUF = String(Date.now()).slice(-6);
const BASE = process.env.DOVA_URL || 'http://localhost:4500'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/google|ERR_TUNNEL|status of 4\d\d/.test(m.text())) e.push(m.text()); }); return e; };

async function api(m, url, body, tok) { const r = await fetch(`${BASE}/api${url}`, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => null); }
const esperar = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_e) { /* */ } await new Promise((r) => setTimeout(r, 200)); } return false; };
async function entrar(b, user, pass, vp = { width: 1366, height: 900 }) {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${BASE}/moderno/index.html`); await p.waitForLoadState('networkidle'); await p.evaluate(() => localStorage.clear());
  await p.goto(`${BASE}/moderno/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', user); await p.fill('#login-password', pass); await p.click('button[type=submit]'); await p.waitForTimeout(2200);
  return { ctx, p, err };
}
const ir = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload(); await p.waitForTimeout(2200); };
// Sesiones con cookie HttpOnly: nada sensible en el navegador, la sesión sobrevive a recargar,
// migración de sesiones viejas, cerrar sesión y cerrar en todos los dispositivos.
(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='moderno' WHERE username IN ('admin','recep1')");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const { ctx, p, err } = await entrar(b, 'recep1', 'clave123');
  const ls = await p.evaluate(() => JSON.stringify(localStorage));
  P('En el navegador no queda ningún token', !/accessToken|refreshToken|eyJhbGci/.test(ls), ls.slice(0, 200));
  P('La cookie de sesión no es legible desde JavaScript', !(await p.evaluate(() => document.cookie)).includes('dova_rt'));
  const ck = (await ctx.cookies()).find((c) => c.name === 'dova_rt');
  P('Cookie HttpOnly, SameSite=Strict y ruta restringida', ck && ck.httpOnly && ck.sameSite === 'Strict' && ck.path === '/api/auth', ck);
  await ir(p, 'pacientes');
  P('Recargar la página mantiene la sesión', await esperar(async () => (await p.locator('#shell-root').isVisible()) && (await p.locator('.dova-tabla, table').count()) > 0));
  // Otra "computadora" de la misma persona
  const otra = await entrar(b, 'recep1', 'clave123');
  // Cerrar sesión en todos los dispositivos desde Configuración
  await ir(p, 'configuracion');
  await p.click('#btn-logout-todas'); await p.click('#btn-logout-todas');
  P('Cerrar en todos: vuelve al login', await esperar(async () => (await p.locator('#login-username').isVisible().catch(() => false)), 8000));
  await otra.p.evaluate(() => { location.hash = 'pacientes'; }); await otra.p.reload(); await otra.p.waitForTimeout(2500);
  P('…y la otra computadora también queda afuera', await otra.p.locator('#login-username').isVisible().catch(() => false));
  await otra.ctx.close();
  // Cerrar sesión normal
  const { ctx: c3, p: p3 } = await entrar(b, 'recep1', 'clave123');
  await p3.click('#logout-btn').catch(() => {});
  await p3.waitForTimeout(1500); await p3.reload(); await p3.waitForTimeout(2000);
  P('Cerrar sesión: al recargar pide ingresar', await p3.locator('#login-username').isVisible());
  P('…y la cookie se borró', !(await c3.cookies()).some((c) => c.name === 'dova_rt' && c.value));
  await c3.close();
  // Migración de una sesión guardada por la versión anterior (token en localStorage)
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'recep1', password: 'clave123' }) });
  const rt = decodeURIComponent((r.headers.get('set-cookie') || '').match(/dova_rt=([^;]+)/)[1]); const lj = await r.json();
  // Así quedan en la base los tokens emitidos antes de la migración 0040 (sin sesion_id).
  await db.query("UPDATE refresh_tokens SET sesion_id = NULL WHERE token_hash = encode(sha256($1::bytea), 'hex')", [rt]);
  const c4 = await b.newContext(); const p4 = await c4.newPage(); const e4 = errores(p4);
  await p4.goto(`${BASE}/moderno/index.html`); await p4.waitForTimeout(500);
  await p4.evaluate(([t, u, c]) => localStorage.setItem('dova_session', JSON.stringify({ accessToken: 'viejo', refreshToken: t, usuario: u, clinica: c })), [rt, lj.usuario, lj.clinica]);
  await p4.evaluate(() => { location.hash = 'pacientes'; }); await p4.reload(); await p4.waitForTimeout(3000);
  P('Sesión vieja: sigue adentro sin volver a ingresar', await p4.locator('#shell-root').isVisible());
  const ls4 = await p4.evaluate(() => localStorage.getItem('dova_session'));
  P('…y el token viejo se borró del navegador', !/refreshToken|accessToken/.test(ls4 || ''), ls4);
  P('…ahora con cookie HttpOnly', (await c4.cookies()).some((c) => c.name === 'dova_rt' && c.httpOnly));
  // Un token NUEVO (con sesion_id) mandado en el cuerpo, como haría quien lo robó de una cookie, no sirve.
  const r5 = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'recep1', password: 'clave123' }) });
  const rt5 = decodeURIComponent((r5.headers.get('set-cookie') || '').match(/dova_rt=([^;]+)/)[1]);
  const r6 = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt5 }) });
  P('Un refresh token nuevo no se acepta en el cuerpo del pedido (solo en la cookie)', r6.status === 401, r6.status);
  P('Sin errores de consola', err.length === 0 && e4.length === 0, [...err, ...e4].slice(0, 3));
  await c4.close(); await ctx.close();
  // Portal del paciente
  const A = (await api('POST', '/auth/login', { username: 'admin', password: 'admin' })).accessToken;
  const pac = await api('POST', '/pacientes', { nombre: 'Cookie', apellido: `Portal${SUF}`, ci: `64${SUF}`, telefono: '0981 111 999' }, A);
  const cod = (await api('POST', `/web/pacientes/${pac.id}/codigo`, {}, A)).codigo;
  const c5 = await b.newContext(); const p5 = await c5.newPage(); const e5 = errores(p5);
  await p5.goto(`${BASE}/web/ingresar.html?modo=codigo`); await p5.waitForTimeout(1200);
  await p5.fill('#a-ci', pac.ci); await p5.fill('#a-cod', cod);
  const claves = p5.locator('[data-f-activar] input[type=password]'); for (let i = 0; i < await claves.count(); i++) await claves.nth(i).fill('Portal2026x');
  await p5.click('[data-f-activar] button[type=submit]'); await p5.waitForTimeout(2500);
  P('Portal: activa la cuenta y entra', p5.url().includes('mi-cuenta'));
  const ls5 = await p5.evaluate(() => localStorage.getItem('dentcare-sesion'));
  P('Portal: el navegador no guarda el token', ls5 && !/token|eyJ/.test(ls5), ls5);
  const ck5 = (await c5.cookies()).find((c) => c.name === 'dova_portal');
  P('Portal: cookie HttpOnly, SameSite=Strict, ruta del portal', ck5 && ck5.httpOnly && ck5.sameSite === 'Strict' && ck5.path === '/api/web/cuenta', ck5);
  await p5.reload(); await p5.waitForTimeout(2000);
  P('Portal: recargar mantiene la sesión', (await p5.locator('.cuenta-cab h1').count()) === 1);
  await p5.click('[data-salir]'); await p5.waitForTimeout(1500);
  const fuera = await fetch(`${BASE}/api/web/cuenta/yo`, { headers: { cookie: `dova_portal=${encodeURIComponent(ck5.value)}`, 'X-DOVA-CSRF': '1' } });
  P('Portal: al salir, esa sesión deja de valer aunque alguien copiara la cookie', fuera.status === 401, fuera.status);
  P('Portal: sin errores', e5.length === 0, e5);
  await c5.close(); await b.close();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); await db.end(); process.exit(ok === res.length ? 0 : 1);
})().catch(async (e) => { console.error(e); process.exit(1); });
