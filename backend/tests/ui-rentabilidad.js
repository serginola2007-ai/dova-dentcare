/* global DovaApp */
// Rentabilidad en Finanzas: la pestaña aparece para el dueño, calcula y funciona en modo oscuro.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, tema_preferido='claro' WHERE username IN ('admin','odo1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}' WHERE id=1");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const entrar = async (u, c) => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
    const err = []; p.on('pageerror', (x) => err.push(x.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
    return { ctx, p, err };
  };
  try {
    const { ctx, p, err } = await entrar('admin', 'admin');
    await p.evaluate(() => DovaApp.navegar('finanzas', undefined));
    const F = p.frameLocator('.dova-ventana[data-ventana-ruta="finanzas"] iframe');
    await F.locator('.dova-ext-subtab', { hasText: 'Rentabilidad' }).click({ timeout: 15000 });
    await F.locator('[data-res] .dova-ext-kpi').first().waitFor({ timeout: 15000 });
    P('Finanzas tiene la pestaña Rentabilidad y muestra los totales', await F.locator('[data-res] .dova-ext-kpi').count() === 3);
    P('muestra las tablas por tratamiento y por odontólogo', /Por tratamiento/.test(await F.locator('[data-res]').textContent()) && /Por odontólogo/.test(await F.locator('[data-res]').textContent()));
    await F.locator('input[name="desde"]').fill('2020-03-01'); await F.locator('input[name="hasta"]').fill('2020-03-31'); await F.locator('[data-f] button').click(); await p.waitForTimeout(1200);
    P('un período sin sesiones lo dice sin romper', /No hay sesiones realizadas/.test(await F.locator('[data-res]').textContent()));
    await p.evaluate(() => DovaApp.aplicarModo('oscuro')); await p.waitForTimeout(500);
    await p.screenshot({ path: `${DIR}/rentabilidad-oscuro.png` });
    P('Sin errores de consola', err.length === 0, err);
    await ctx.close();
    const o = await entrar('odo1', 'clave123');
    await o.p.evaluate(() => DovaApp.navegar('finanzas', undefined)).catch(() => null);
    await o.p.waitForTimeout(1500);
    const visible = await o.p.locator('.dova-ventana[data-ventana-ruta="finanzas"] iframe').count() ? await o.p.frameLocator('.dova-ventana[data-ventana-ruta="finanzas"] iframe').locator('.dova-ext-subtab', { hasText: 'Rentabilidad' }).count() : 0;
    P('el odontólogo no ve la pestaña Rentabilidad', visible === 0, visible);
    await o.ctx.close();
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally { await b.close(); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
