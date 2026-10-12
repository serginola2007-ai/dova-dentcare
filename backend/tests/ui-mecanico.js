/* global document, window, getComputedStyle, DovaApp */
// Diseño "mecánico" (colores de la clínica, para todos los usuarios): API y pantallas (Playwright).
// Requiere DATABASE_URL, DOVA_URL, PLAYWRIGHT_MODULE / CHROMIUM_PATH y CAPTURAS (opcional).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500'; const B = `${URL0}/api`;
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='moderno' WHERE username IN ('admin','recep1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  // ---- API ----
  const rr = await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: 'mecanico' }, R);
  P('Recepción también puede elegir el diseño mecánico', rr.s === 200 && (await q1("SELECT diseno_preferido FROM usuarios WHERE username='recep1'")).diseno_preferido === 'mecanico', rr);
  P('Diseño inexistente o con otro tipo de dato: 400', (await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: ['mecanico'] }, A)).s === 400 && (await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: 'otro' }, A)).s === 400);
  const r = await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: 'mecanico' }, A);
  P('El admin también', r.s === 200 && r.j.disenoPreferido === 'mecanico', r);
  const lr = await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' });
  P('Al entrar, la recepción recibe su diseño mecánico guardado', lr.s === 200 && lr.j.usuario.disenoPreferido === 'mecanico', lr.j && lr.j.usuario);
  await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='recep1'");

  // ---- Pantallas ----
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [nombre, vp] of [['escritorio', { width: 1366, height: 900 }], ['tablet', { width: 1024, height: 768 }], ['celular', { width: 390, height: 844 }]]) {
    await db.query('DELETE FROM login_intentos');
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
    p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/moderno/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForURL(/\/mecanico\//, { timeout: 15000 });
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1500);
    P(`[${nombre}] Con "mecánico" guardado, entra en ese diseño`, /\/mecanico\//.test(p.url()));
    if (nombre === 'escritorio') {
      P('Tira de íconos a la izquierda con accesos', await p.locator('#mec-iconos .mec-icono').count() >= 8);
      const params = await p.textContent('#mec-parametros');
      P('Parámetros activos: usuario, clínica, caja, fecha y reloj', /Usuario/.test(params) && /Clínica/.test(params) && /Caja/.test(params) && /\d{2}:\d{2}:\d{2}/.test(params), params);
      const t1 = await p.textContent('[data-mec-reloj]'); await p.waitForTimeout(1200);
      P('…el reloj avanza', t1 !== await p.textContent('[data-mec-reloj]'));
      P('Menú en mayúsculas', await p.evaluate(() => getComputedStyle(document.querySelector('#menu-root .dova-menu-item')).textTransform === 'uppercase'));
      P('Área de trabajo terracota (color de la clínica) y letra Tahoma', await p.evaluate(() => getComputedStyle(document.querySelector('.mec-cuerpo')).backgroundColor === 'rgb(154, 85, 54)' && /Tahoma/.test(getComputedStyle(document.body).fontFamily)));
      await p.click('#mec-iconos [data-mec-ir="agenda"]'); await p.waitForTimeout(1500);
      await p.click('#mec-iconos [data-mec-ir="pacientes"]'); await p.waitForTimeout(1500);
      const rec = await p.textContent('#mec-recientes');
      P('Ventanas abiertas recientemente: Pacientes, Agenda (lo último primero)', rec.indexOf('Pacientes') > -1 && rec.indexOf('Agenda') > rec.indexOf('Pacientes'), rec);
      P('El ícono de la sección actual queda marcado', await p.locator('#mec-iconos [data-mec-ir="pacientes"].activo').count() === 1);
      await p.locator('#mec-recientes [data-mec-rec]', { hasText: 'Agenda' }).click(); await p.waitForTimeout(1200);
      P('Tocar una ventana reciente la vuelve a abrir', /#agenda/.test(p.url()));
      await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForTimeout(1500);
      P('Configuración → Apariencia ofrece el diseño mecánico', await p.locator('[data-elegir-diseno-config="mecanico"]').count() === 1);
      await p.evaluate(() => DovaApp.navegar('dashboard')); await p.waitForTimeout(1800);
      await p.screenshot({ path: `${DIR}/mecanico-escritorio.png` });
    } else {
      await p.screenshot({ path: `${DIR}/mecanico-${nombre}.png` });
    }
    P(`[${nombre}] Sin desborde horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, await p.evaluate(() => document.documentElement.scrollWidth));
    P(`[${nombre}] Sin errores de consola`, err.length === 0, err);
    await ctx.close();
  }
  // Recepción: lo ve en el login y en Configuración, lo elige y entra con él.
  await db.query('DELETE FROM login_intentos');
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const errR = [];
  p.on('pageerror', (e) => errR.push(e.message));
  await p.goto(`${URL0}/moderno/index.html`);
  P('En el login aparecen los 4 diseños, mecánico incluido', await p.locator('[data-diseno-radio-card="mecanico"]').count() === 1 && await p.locator('.dova-disenos-grid-login [data-diseno-radio-card]').count() === 4);
  await p.screenshot({ path: `${DIR}/mecanico-login.png` });
  await p.fill('#login-username', 'recep1'); await p.fill('#login-password', 'clave123'); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800);
  await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForTimeout(1200);
  P('Recepción: Configuración ofrece el diseño mecánico', await p.locator('[data-elegir-diseno-config="mecanico"]').count() === 1);
  await p.screenshot({ path: `${DIR}/mecanico-apariencia.png` });
  await p.click('[data-elegir-diseno-config="mecanico"]'); await p.waitForURL(/\/mecanico\//, { timeout: 15000 });
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(1500);
  P('Recepción entra al diseño mecánico y lo conserva', /\/mecanico\//.test(p.url()) && (await q1("SELECT diseno_preferido FROM usuarios WHERE username='recep1'")).diseno_preferido === 'mecanico');
  P('…con sus accesos (sin los que no puede ver) y parámetros', await p.locator('#mec-iconos [data-mec-ir="agenda"]').count() === 1 && await p.locator('#mec-iconos [data-mec-ir="usuarios"]').count() === 0 && /Recepci/i.test(await p.textContent('#mec-parametros')));
  await p.screenshot({ path: `${DIR}/mecanico-recepcion.png` });
  P('…sin errores de consola', errR.length === 0, errR);
  await ctx.close(); await b.close();
  await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username IN ('admin','recep1')");
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
