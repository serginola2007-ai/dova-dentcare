/* global document, DovaApp */
// Pantallas de planes: código de clínica en el login, Plataforma (solo proveedor) y "Mi plan".
// Requiere DATABASE_URL, DOVA_URL, PLAYWRIGHT_MODULE / CHROMIUM_PATH.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const entrar = async (p, usuario, clave, clinica) => {
  await p.goto(`${URL0}/moderno/index.html`);
  await p.fill('#login-username', usuario); await p.fill('#login-password', clave);
  if (clinica) { await p.evaluate(() => { document.querySelector('.dova-login-clinica').open = true; }); await p.fill('#login-clinica', clinica); }
  await p.click('#form-login button[type=submit]');
};

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}', activa=true WHERE id=1");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const err = errores(p);
    await p.goto(`${URL0}/moderno/index.html?clinica=dentcarerc`);
    await p.waitForSelector('#login-clinica');
    P('El login trae el código de la clínica (desde el enlace)', (await p.inputValue('#login-clinica')) === 'dentcarerc');
    await entrar(p, 'admin', 'admin', 'no-existe');
    await p.waitForSelector('#login-error:not([style*="none"])', { timeout: 8000 });
    P('Un código de clínica equivocado no deja entrar', /incorrect|inválid|clínica|usuario|contraseña/i.test(await p.textContent('#login-error')), await p.textContent('#login-error'));
    await entrar(p, 'admin', 'admin', 'dentcarerc');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1000);
    P('Con el código correcto entra', true);
    P('El proveedor ve "Plataforma" en el menú', await p.evaluate(() => /Plataforma/.test(document.body.innerText) || !!document.querySelector('[data-ruta="plataforma"]')));
    const fr = (ruta) => p.frameLocator(`.dova-ventana[data-ventana-ruta="${ruta}"] iframe`);
    await p.evaluate(() => DovaApp.navegar('plataforma'));
    const f = fr('plataforma');
    await f.locator('.dova-plat table').waitFor({ timeout: 15000 });
    const txt = await f.locator('.dova-plat').innerText();
    P('Plataforma lista las clínicas con su plan', /DentCareRC/.test(txt) && /Premium/.test(txt), txt.slice(0, 200));
    const cerrar = () => f.locator('[data-cerrar-modal]').first().click();
    await f.locator('[data-plat-nueva]').click(); await f.locator('#pl-slug').waitFor();
    P('Nueva clínica abre el formulario', true);
    await cerrar();
    await f.locator('[data-plat-plan]').first().click(); await f.locator('#pe-plan').waitFor();
    P('El plan muestra un renglón por módulo', (await f.locator('tr[data-mod]').count()) >= 10);
    await p.screenshot({ path: `${DIR}/plataforma-plan.png` });
    await cerrar();
    await f.locator('[data-plat-pagos]').first().click(); await f.locator('#pg-mes').waitFor();
    P('Pagos abre el formulario del mes', (await f.locator('#pg-mes').inputValue()).length === 7);
    await f.locator('[data-cerrar-modal]').last().click();
    await p.screenshot({ path: `${DIR}/plataforma.png` });
    await p.evaluate(() => DovaApp.navegar('configuracion'));
    const c = fr('configuracion');
    await c.locator('text=Tenés todas las funciones').waitFor({ timeout: 15000 });
    P('Configuración muestra "Mi plan"', true);
    P('Sin errores en consola (proveedor)', err.length === 0, err);

    await db.query('DELETE FROM login_intentos');
    const ctx2 = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p2 = await ctx2.newPage(); const err2 = errores(p2);
    await entrar(p2, 'recep1', 'clave123');
    await p2.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p2.waitForTimeout(1000);
    P('Recepción no ve Plataforma', await p2.evaluate(() => !/Plataforma/.test(document.body.innerText) && !document.querySelector('[data-ruta="plataforma"]')));
    await p2.evaluate(() => DovaApp.navegar('plataforma')); await p2.waitForTimeout(1500);
    P('Recepción no abre la ventana de Plataforma', await p2.evaluate(() => !document.querySelector('.dova-ventana[data-ventana-ruta="plataforma"]')));
    P('Sin errores en consola (recepción)', err2.length === 0, err2);
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally { await b.close(); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
