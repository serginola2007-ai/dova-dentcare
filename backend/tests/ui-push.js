/* global document, DovaApp, navigator */
// Avisos en el dispositivo: tarjeta en Configuración, service worker con push y navegación al tocar un aviso.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin' AND clinica_id=1");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
    const err = []; p.on('pageerror', (x) => err.push(x.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
    await p.evaluate(() => DovaApp.navegar('configuracion'));
    const F = p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe');
    await F.locator('[data-avisos-box]').waitFor({ state: 'attached', timeout: 15000 });
    await F.locator('[data-avisos-estado]:not(:has-text("Cargando"))').waitFor({ timeout: 10000 });
    const txt = await F.locator('[data-avisos-box]').textContent();
    P('Configuración muestra "Avisos en este dispositivo"', /Avisos en este dispositivo/.test(txt), txt);
    P('explica que el aviso no trae datos de pacientes', /solo dice que hay algo nuevo/.test(txt));
    const btn = await F.locator('[data-avisos-toggle]:visible').textContent();
    P('ofrece "Activar avisos" (aún no activado)', btn === 'Activar avisos', btn);
    P('"Enviarme un aviso de prueba" oculto mientras no esté activado', await F.locator('[data-avisos-prueba]').isHidden());
    const sw = await (await fetch(`${URL0}/sw.js`)).text();
    P('el service worker atiende "push" y el toque del aviso', /addEventListener\('push'/.test(sw) && /addEventListener\('notificationclick'/.test(sw));
    P('el aviso push no lleva datos del paciente (título genérico en el servidor)', /Tenés un aviso nuevo en DOVA/.test(require('fs').readFileSync(`${__dirname}/../src/modules/push/push.service.js`, 'utf8')));
    // Tocar un aviso con la app abierta: el service worker pide ir a la pantalla y la app navega.
    await p.evaluate(() => navigator.serviceWorker.ready).catch(() => null);
    await p.evaluate(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'dova-ir', ruta: 'caja' } })); });
    await p.waitForTimeout(1200);
    P('al tocar el aviso la app va a la pantalla indicada', await p.evaluate(() => !!document.querySelector('.dova-ventana[data-ventana-ruta="caja"], [data-ruta-actual="caja"], .dova-sidebar a.activa[data-ruta="caja"], .dova-nav-item.activa[data-ruta="caja"]') || /caja/i.test(location.hash) || /Caja/.test(document.title)), await p.evaluate(() => location.hash));
    await p.evaluate(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'dova-ir', ruta: '<img src=x onerror=alert(1)>' } })); });
    P('una ruta con caracteres raros se ignora', err.length === 0, err);
    await p.screenshot({ path: `${DIR}/push-config.png` });
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally { await b.close(); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
