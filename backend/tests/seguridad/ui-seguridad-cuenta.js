/* global document, window, getComputedStyle, DOVA, DovaApp, DovaBloqueo */
// Pantallas (Playwright): sesiones abiertas, candado por inactividad y política
// de la clínica, en los 3 diseños. Requiere DATABASE_URL (base de prueba), DOVA_URL,
// PLAYWRIGHT_MODULE / CHROMIUM_PATH si Playwright no está instalado globalmente,
// y CAPTURAS (carpeta) opcional.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const api = async (m, url, body, tok) => { const r = await fetch(`${URL0}/api${url}`, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const nuevaPagina = async (b, vp) => {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
  p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
  return { ctx, p, err };
};
const visibleShell = (p) => p.evaluate(() => { const s = document.getElementById('shell-root'); return s && s.style.display !== 'none' && getComputedStyle(s).visibility !== 'hidden'; });
const entrar = async (p, dis, user, clave) => {
  await p.goto(`${URL0}/${dis}/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', user); await p.fill('#login-password', clave); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 }); await p.waitForTimeout(800);
};

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await db.query("DELETE FROM login_intentos; UPDATE clinicas SET bloqueo_inactividad_min=15 WHERE id=1; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin'");
  const A = (await api('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const rolRecep = (await db.query("SELECT id FROM roles WHERE clinica_id=1 AND codigo='recepcion'")).rows[0].id;
  const user = `uises${suf}`; const clave = 'Pantalla2026ses';
  const u = (await api('POST', '/usuarios', { nombre: 'Laura Sesiones', username: user, password: clave, rolId: rolRecep }, A)).j;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [u.id]);
  try {
    // ---------- Ingreso directo y sesiones abiertas (3 diseños) ----------
    for (const [dis, vp] of [['moderno', { width: 1366, height: 900 }], ['tecnico', { width: 390, height: 844 }], ['minimalista', { width: 820, height: 1180 }]]) {
      await db.query('DELETE FROM login_intentos'); await db.query('UPDATE usuarios SET diseno_preferido=$2 WHERE id=$1', [u.id, dis]);
      const { ctx, p, err } = await nuevaPagina(b, vp);
      await entrar(p, dis, user, clave);
      P(`[${dis}] Usuario y contraseña alcanzan para entrar (sin segundo paso)`, await visibleShell(p));
      await p.evaluate(() => DovaApp.navegar('configuracion'));
      await p.waitForSelector('.dova-tabla-sesiones', { timeout: 8000 });
      P(`[${dis}] Configuración → Seguridad muestra las sesiones abiertas`, await p.locator('text=Esta sesión').count() === 1 && await p.locator('#btn-2fa-activar').count() === 0);
      P(`[${dis}] Sin desborde`, await desborde(p) <= 0, await desborde(p));
      P(`[${dis}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }

    // ---------- Candado ----------
    await db.query('DELETE FROM login_intentos');
    const { ctx, p, err } = await nuevaPagina(b, { width: 1366, height: 900 });
    await entrar(p, 'minimalista', user, clave);
    await p.evaluate(() => DovaApp.navegar('pacientes')); await p.waitForTimeout(1200);
    await p.evaluate(() => DovaBloqueo.bloquear()); await p.waitForSelector('#dova-candado');
    P('Bloquear: el candado tapa la pantalla', await visibleShell(p) === false && await p.locator('#candado-clave').isVisible());
    const r423 = await p.evaluate(async () => { try { await DOVA.get('/pacientes?limite=1'); return 'paso'; } catch (e) { return e.status; } });
    P('Con el candado no salen pedidos', r423 === 423, r423);
    await p.screenshot({ path: `${DIR}/seg-candado.png` });
    await p.reload(); await p.waitForSelector('#dova-candado', { timeout: 10000 });
    P('Recargar la página no lo saltea (el bloqueo es del servidor)', await visibleShell(p) === false);
    await p.fill('#candado-clave', 'incorrecta'); await p.click('#form-candado button[type=submit]');
    await p.waitForSelector('#candado-error:not([style*="display: none"])');
    P('Contraseña incorrecta: avisa los intentos que quedan', /quedan/.test(await p.textContent('#candado-error')));
    await p.fill('#candado-clave', clave); await p.click('#form-candado button[type=submit]');
    await p.waitForSelector('#dova-candado', { state: 'detached', timeout: 8000 });
    P('Contraseña correcta: vuelve a la pantalla donde estaba', await visibleShell(p));
    const r200 = await p.evaluate(async () => { try { await DOVA.get('/pacientes?limite=1'); return 200; } catch (e) { return e.status; } });
    P('…y la API vuelve a responder', r200 === 200, r200);
    await p.clock.install(); await p.reload();
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 }); await p.waitForTimeout(1500);
    await p.clock.fastForward(14 * 60000);
    P('Antes de los 15 minutos no se bloquea', await p.locator('#dova-candado').count() === 0);
    await p.clock.fastForward(2 * 60000);
    await p.waitForSelector('#dova-candado', { timeout: 10000 }).catch(() => null);
    P('15 minutos sin uso: se bloquea solo', await p.locator('#dova-candado').count() === 1);
    await p.setViewportSize({ width: 375, height: 700 });
    P('Candado sin desborde en celular', await desborde(p) <= 0);
    await p.click('#candado-salir'); await p.waitForSelector('#login-username', { timeout: 10000 });
    P('«Salir» desde el candado vuelve al ingreso', true);
    P('Sin errores de consola (candado)', err.length === 0, err);
    await ctx.close();

    // ---------- Política (admin) ----------
    await db.query('DELETE FROM login_intentos');
    const a = await nuevaPagina(b, { width: 1366, height: 900 });
    await entrar(a.p, 'moderno', 'admin', 'admin');
    await a.p.evaluate(() => DovaApp.navegar('configuracion')); await a.p.waitForSelector('#form-politica', { timeout: 8000 });
    P('Política: sin opciones de verificación en dos pasos', await a.p.locator('#pol-2fa').count() === 0);
    await a.p.selectOption('#pol-bloqueo', '30'); await a.p.click('#form-politica button[type=submit]'); await a.p.waitForTimeout(1200);
    P('Política: guarda los minutos de bloqueo', (await db.query('SELECT bloqueo_inactividad_min m FROM clinicas WHERE id=1')).rows[0].m === 30);
    await a.p.evaluate(() => DovaApp.navegar('usuarios')); await a.p.waitForSelector('.dova-tabla-usuarios', { timeout: 8000 });
    P('Usuarios: sin rastros de "2 pasos"', await a.p.locator('text=2 pasos').count() === 0);
    await a.p.screenshot({ path: `${DIR}/seg-config.png`, fullPage: true });
    P('Sin errores de consola (admin)', a.err.length === 0, a.err);
    await a.ctx.close();
  } finally {
    await db.query('UPDATE clinicas SET bloqueo_inactividad_min=15 WHERE id=1');
    await db.query('UPDATE usuarios SET activo=false, eliminado_en=now() WHERE id=$1', [u.id]);
  }
  await b.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
