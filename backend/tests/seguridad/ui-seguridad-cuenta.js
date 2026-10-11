/* global document, location, window, getComputedStyle, DOVA, DovaApp, DovaBloqueo */
// Pantallas (Playwright): ingreso en dos pasos, activación desde Configuración,
// sesiones abiertas, candado por inactividad, activación obligatoria y Usuarios.
// Requiere DATABASE_URL (base de prueba), DOVA_URL, PLAYWRIGHT_MODULE / CHROMIUM_PATH
// si Playwright no está instalado globalmente, y CAPTURAS (carpeta) opcional.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'; process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'y';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const totp = require('../../src/utils/totp');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const api = async (m, url, body, tok) => { const r = await fetch(`${URL0}/api${url}`, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarPaso = async () => { const p = totp.pasoActual(); while (totp.pasoActual() === p) await dormir(400); };
const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const nuevaPagina = async (b, vp) => {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
  p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
  return { ctx, p, err };
};
const visibleShell = (p) => p.evaluate(() => { const s = document.getElementById('shell-root'); return s && s.style.display !== 'none' && getComputedStyle(s).visibility !== 'hidden'; });

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await db.query("DELETE FROM login_intentos; UPDATE clinicas SET exigir_2fa_admin=false, bloqueo_inactividad_min=15 WHERE id=1; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin'");
  const A = (await api('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const rolRecep = (await db.query("SELECT id FROM roles WHERE clinica_id=1 AND codigo='recepcion'")).rows[0].id;
  const rolAdmin = (await db.query("SELECT id FROM roles WHERE clinica_id=1 AND codigo='admin'")).rows[0].id;
  const user = `ui2f${suf}`; const clave = 'Pantalla2026dos';
  const u = (await api('POST', '/usuarios', { nombre: 'Laura Dos Pasos', username: user, password: clave, rolId: rolRecep }, A)).j;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido=$2 WHERE id=$1', [u.id, 'moderno']);

  // ---------- Activar desde Configuración ----------
  let { ctx, p, err } = await nuevaPagina(b, { width: 1366, height: 900 });
  await p.goto(`${URL0}/moderno/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', user); await p.fill('#login-password', clave); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800);
  await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForSelector('#btn-2fa-activar', { timeout: 8000 });
  P('Configuración muestra la verificación en dos pasos y las sesiones', await p.locator('.dova-tabla-sesiones tbody tr').count() >= 1 && await p.locator('text=Esta sesión').count() === 1);
  await p.click('#btn-2fa-activar');
  await p.fill('#clave-2fa', clave); await p.click('#form-2fa-clave button[type=submit]');
  await p.waitForSelector('.dova-2fa-qr img');
  const secreto = (await p.textContent('.dova-2fa-clave')).replace(/\s/g, '');
  P('Muestra el código QR y la clave para cargar a mano', secreto.length === 32 && await p.locator('.dova-2fa-qr img').evaluate((i) => i.naturalWidth > 0));
  await p.screenshot({ path: `${DIR}/seg-qr.png` });
  await esperarPaso();
  await p.fill('#codigo-confirmar', totp.codigoEnPaso(secreto, totp.pasoActual())); await p.click('#form-2fa-confirmar button[type=submit]');
  await p.waitForSelector('.dova-2fa-codigos');
  P('Activa y muestra 10 códigos de recuperación', await p.locator('.dova-2fa-codigos li').count() === 10);
  const recup = (await p.locator('.dova-2fa-codigos code').allTextContents()).map((t) => t.trim());
  P('«Listo» espera a que confirmes que los guardaste', await p.locator('[data-listo]').isDisabled());
  await p.screenshot({ path: `${DIR}/seg-codigos.png` });
  await p.check('[data-guardados]'); await p.click('[data-listo]');
  await p.waitForSelector('#btn-2fa-desactivar');
  P('El panel queda en «Activa» con 10 códigos', /10/.test(await p.textContent('#dova-seguridad-panel')));
  P('Sin errores de consola (activación)', err.length === 0, err);
  await ctx.close();

  // ---------- Ingreso en dos pasos ----------
  for (const [dis, vp] of [['moderno', { width: 1366, height: 900 }], ['tecnico', { width: 390, height: 844 }], ['minimalista', { width: 820, height: 1180 }]]) {
    await db.query('DELETE FROM login_intentos');
    ({ ctx, p, err } = await nuevaPagina(b, vp));
    await p.goto(`${URL0}/${dis}/index.html`); await p.waitForSelector('#login-username');
    await p.fill('#login-username', user); await p.fill('#login-password', clave); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#codigo-2fa');
    P(`[${dis}] Pide el código del celular`, await p.locator('h1:has-text("Verificación en dos pasos")').count() === 1 && await visibleShell(p) === false);
    await p.fill('#codigo-2fa', '000000'); await p.click('#form-2fa button[type=submit]');
    await p.waitForSelector('#error-2fa:not([style*="display: none"])');
    P(`[${dis}] Código incorrecto: lo dice y deja reintentar`, /incorrecto/i.test(await p.textContent('#error-2fa')));
    if (dis === 'tecnico') await p.screenshot({ path: `${DIR}/seg-login2fa-celular.png` });
    P(`[${dis}] Sin desborde en la pantalla del código`, await desborde(p) <= 0);
    await esperarPaso();
    await p.fill('#codigo-2fa', totp.codigoEnPaso(secreto, totp.pasoActual())); await p.click('#form-2fa button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 });
    P(`[${dis}] Código correcto: entra a DOVA`, await visibleShell(p));
    P(`[${dis}] Sin errores de consola`, err.length === 0, err);
    await ctx.close();
  }
  // Código de recuperación
  await db.query('DELETE FROM login_intentos');
  ({ ctx, p, err } = await nuevaPagina(b, { width: 1366, height: 900 }));
  await p.goto(`${URL0}/moderno/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', user); await p.fill('#login-password', clave); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#codigo-2fa');
  await p.fill('#codigo-2fa', recup[0]); await p.click('#form-2fa button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 });
  P('Entra con un código de recuperación y avisa cuántos quedan', await visibleShell(p) && /quedan 9/.test(await p.textContent('#dova-toasts')));

  // ---------- Candado ----------
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
  P('Contraseña correcta: vuelve a la pantalla donde estaba', await visibleShell(p) && /pacientes/.test(await p.evaluate(() => location.hash)));
  const r200 = await p.evaluate(async () => { try { await DOVA.get('/pacientes?limite=1'); return 200; } catch (e) { return e.status; } });
  P('…y la API vuelve a responder', r200 === 200, r200);
  // Inactividad real (reloj adelantado): se bloquea solo
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

  // ---------- Usuarios: estado y reinicio ----------
  await db.query('DELETE FROM login_intentos');
  ({ ctx, p, err } = await nuevaPagina(b, { width: 1366, height: 900 }));
  await p.goto(`${URL0}/moderno/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800);
  await p.evaluate(() => DovaApp.navegar('usuarios')); await p.waitForSelector(`[data-reiniciar-2fa="${u.id}"]`, { timeout: 8000 });
  P('Usuarios: marca quién tiene 2 pasos', await p.locator(`tr:has([data-reiniciar-2fa="${u.id}"]) .dova-etiqueta-2fa`).count() === 1);
  await p.click(`[data-reiniciar-2fa="${u.id}"]`); await p.click('#btn-confirmar-reinicio-2fa');
  await p.waitForTimeout(1500);
  P('Reiniciar 2 pasos desde Usuarios', !(await db.query('SELECT totp_activo FROM usuarios WHERE id=$1', [u.id])).rows[0].totp_activo);
  // Política de la clínica
  await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForSelector('#form-politica', { timeout: 8000 });
  P('Política: «exigir 2 pasos» deshabilitado si el admin no la tiene', await p.locator('#pol-2fa').isDisabled());
  await p.selectOption('#pol-bloqueo', '30'); await p.click('#form-politica button[type=submit]'); await p.waitForTimeout(1200);
  P('Política: guarda los minutos de bloqueo', (await db.query('SELECT bloqueo_inactividad_min m FROM clinicas WHERE id=1')).rows[0].m === 30);
  await p.screenshot({ path: `${DIR}/seg-config.png`, fullPage: true });
  P('Sin errores de consola (admin)', err.length === 0, err);
  await ctx.close();

  // ---------- Activación obligatoria ----------
  await db.query("UPDATE usuarios SET rol_id=$2 WHERE id=$1", [u.id, rolAdmin]);
  await db.query('UPDATE clinicas SET exigir_2fa_admin=true, bloqueo_inactividad_min=15 WHERE id=1');
  await db.query('DELETE FROM login_intentos');
  ({ ctx, p, err } = await nuevaPagina(b, { width: 1366, height: 900 }));
  await p.goto(`${URL0}/moderno/index.html`); await p.waitForSelector('#login-username');
  await p.fill('#login-username', user); await p.fill('#login-password', clave); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#clave-2fa', { timeout: 8000 });
  P('Admin sin 2 pasos con la exigencia: tiene que activarla antes de entrar', await visibleShell(p) === false && await p.locator('h1:has-text("Activá la verificación")').count() === 1);
  await p.fill('#clave-2fa', clave); await p.click('#form-2fa-clave button[type=submit]');
  await p.waitForSelector('.dova-2fa-clave');
  const s2 = (await p.textContent('.dova-2fa-clave')).replace(/\s/g, '');
  await p.fill('#codigo-confirmar', totp.codigoEnPaso(s2, totp.pasoActual())); await p.click('#form-2fa-confirmar button[type=submit]');
  await p.waitForSelector('[data-guardados]'); await p.check('[data-guardados]'); await p.click('[data-listo]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 });
  P('…después de activarla entra a DOVA', await visibleShell(p));
  P('Sin errores de consola (obligatoria)', err.length === 0, err);
  await ctx.close();

  await db.query('UPDATE clinicas SET exigir_2fa_admin=false, bloqueo_inactividad_min=15 WHERE id=1');
  await db.query('UPDATE usuarios SET activo=false, eliminado_en=now() WHERE id=$1', [u.id]);
  await b.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
