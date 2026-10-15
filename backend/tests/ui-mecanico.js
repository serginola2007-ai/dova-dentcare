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
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='mecanico' WHERE username IN ('admin','recep1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  // ---- API ----
  const rr = await req('PATCH', '/usuarios/me/preferencias', { tema: 'oscuro' }, R);
  P('Cualquier usuario puede elegir el modo oscuro', rr.s === 200 && rr.j.temaPreferido === 'oscuro' && (await q1("SELECT tema_preferido FROM usuarios WHERE username='recep1'")).tema_preferido === 'oscuro', rr);
  P('Modo inexistente o con otro tipo de dato: 400', (await req('PATCH', '/usuarios/me/preferencias', { tema: ['oscuro'] }, A)).s === 400 && (await req('PATCH', '/usuarios/me/preferencias', { tema: 'azul' }, A)).s === 400);
  P('Los diseños que ya no existen se rechazan: 400', (await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: 'moderno' }, A)).s === 400);
  const lr = await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' });
  P('Al entrar, la recepción recibe su modo guardado', lr.s === 200 && lr.j.usuario.temaPreferido === 'oscuro' && lr.j.usuario.disenoPreferido === 'mecanico', lr.j && lr.j.usuario);
  await req('PATCH', '/usuarios/me/preferencias', { tema: 'claro' }, R);
  await db.query("UPDATE usuarios SET diseno_preferido='mecanico', tema_preferido='claro' WHERE username IN ('admin','recep1')");

  // ---- Pantallas ----
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [nombre, vp] of [['escritorio', { width: 1366, height: 900 }], ['tablet', { width: 1024, height: 768 }], ['celular', { width: 390, height: 844 }]]) {
    await db.query('DELETE FROM login_intentos');
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
    p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
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
      await p.click('#mec-iconos [data-mec-ir="nueva-factura"]'); await p.waitForTimeout(1500);
      await p.click('#mec-iconos [data-mec-ir="nuevo-presupuesto"]'); await p.waitForTimeout(1500);
      const rec = await p.textContent('#mec-recientes');
      P('Ventanas abiertas recientemente: Presupuestos, Facturación (lo último primero)', rec.indexOf('Presupuestos') > -1 && rec.indexOf('Facturación') > rec.indexOf('Presupuestos'), rec);
      P('El ícono de la sección actual queda marcado', await p.locator('#mec-iconos [data-mec-ir="nuevo-presupuesto"].activo').count() === 1);
      await p.evaluate(() => document.querySelectorAll('.dova-ventana [data-cerrar], .dova-ventana [data-ventana-cerrar]').forEach((b) => b.click()));
      await p.locator('#mec-recientes [data-mec-rec]', { hasText: 'Facturación' }).click(); await p.waitForTimeout(1200);
      P('Tocar una ventana reciente la vuelve a abrir', await p.locator('.dova-ventana[data-ventana-ruta="facturacion"].activa').count() === 1);
      await p.evaluate(() => DovaApp.navegar('configuracion'));
      await p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe').locator('[name="modo-color"]').first().waitFor({ timeout: 15000 });
      P('Configuración → Apariencia ofrece claro y oscuro (y no hay otro diseño)', await p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe').locator('[name="modo-color"]').count() === 2 && await p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe').locator('[data-elegir-diseno-config]').count() === 0);
      P('No hay botón de claro/oscuro fuera de Configuración', await p.locator('#theme-toggle-btn').count() === 0);
      await p.evaluate(() => DovaApp.navegar('dashboard')); await p.waitForTimeout(1800);
      await p.screenshot({ path: `${DIR}/mecanico-escritorio.png` });
    } else {
      await p.screenshot({ path: `${DIR}/mecanico-${nombre}.png` });
    }
    P(`[${nombre}] Sin desborde horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, await p.evaluate(() => document.documentElement.scrollWidth));
    P(`[${nombre}] Sin errores de consola`, err.length === 0, err);
    await ctx.close();
  }
  // Recepción: el login no ofrece diseños; el modo oscuro se cambia solo en Configuración, llega a las ventanas y se conserva.
  await db.query('DELETE FROM login_intentos');
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const errR = [];
  p.on('pageerror', (e) => errR.push(e.message));
  await p.goto(`${URL0}/mecanico/index.html`);
  P('En el login no hay selector de diseño ni botón de modo', await p.locator('[data-diseno-radio-card]').count() === 0 && await p.locator('#theme-toggle-btn').count() === 0 && await p.locator('#login-username').count() === 1);
  P('Sin elección guardada arranca en modo claro', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
  await p.screenshot({ path: `${DIR}/mecanico-login.png` });
  await p.fill('#login-username', 'recep1'); await p.fill('#login-password', 'clave123'); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800);
  const colorFondo = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const claro = await colorFondo();
  await p.evaluate(() => DovaApp.navegar('configuracion'));
  const cfgR = p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe');
  await cfgR.locator('[name="modo-color"][value="oscuro"]').waitFor({ timeout: 15000 });
  P('Recepción: Configuración ofrece el modo claro y el oscuro', await cfgR.locator('[name="modo-color"]').count() === 2 && await cfgR.locator('[name="modo-color"][value="claro"]').isChecked());
  await p.screenshot({ path: `${DIR}/mecanico-apariencia.png` });
  await cfgR.locator('[name="modo-color"][value="oscuro"]').check(); await p.waitForTimeout(1200);
  const oscuro = await colorFondo();
  P('Al elegir oscuro cambia toda la pantalla, también la ventana abierta', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark' && oscuro !== claro && await p.evaluate(() => document.querySelector('.dova-ventana[data-ventana-ruta="configuracion"] iframe').contentDocument.documentElement.getAttribute('data-theme')) === 'dark', { claro, oscuro });
  P('…y queda guardado en su usuario', (await q1("SELECT tema_preferido FROM usuarios WHERE username='recep1'")).tema_preferido === 'oscuro');
  await p.screenshot({ path: `${DIR}/mecanico-oscuro.png` });
  await p.evaluate(() => DovaApp.navegar('dashboard')); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${DIR}/mecanico-oscuro-escritorio.png` });
  await p.reload(); await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(1200);
  P('Al recargar sigue en modo oscuro', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  // Otro dispositivo (navegador limpio): el modo lo trae la cuenta.
  const ctx2 = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p2 = await ctx2.newPage();
  await db.query('DELETE FROM login_intentos');
  await p2.goto(`${URL0}/mecanico/index.html`); await p2.fill('#login-username', 'recep1'); await p2.fill('#login-password', 'clave123'); await p2.click('#form-login button[type=submit]');
  await p2.waitForSelector('#shell-root:not([style*="display: none"])'); await p2.waitForTimeout(800);
  P('En otro dispositivo, al ingresar, también aparece en oscuro', await p2.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  await ctx2.close();
  await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForTimeout(800);
  await p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe').locator('[name="modo-color"][value="claro"]').check(); await p.waitForTimeout(1000);
  P('Vuelve al modo claro desde Configuración', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light' && (await q1("SELECT tema_preferido FROM usuarios WHERE username='recep1'")).tema_preferido === 'claro');
  await p.evaluate(() => DovaApp.navegar('dashboard')); await p.waitForTimeout(1000);
  P('…con sus accesos (sin los que no puede ver) y parámetros', await p.locator('#mec-iconos [data-mec-ir="nuevo-turno"]').count() === 1 && await p.locator('#mec-iconos [data-mec-ir="usuarios"]').count() === 0 && /Recepci/i.test(await p.textContent('#mec-parametros')));
  await p.screenshot({ path: `${DIR}/mecanico-recepcion.png` });
  P('…sin errores de consola', errR.length === 0, errR);
  await ctx.close(); await b.close();
  await db.query("UPDATE usuarios SET diseno_preferido='mecanico', tema_preferido='claro' WHERE username IN ('admin','recep1')");
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
