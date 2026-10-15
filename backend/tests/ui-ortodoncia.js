/* global document, DovaApp */
// Pantalla Ortodoncia: tablero y generación de cuotas mensuales.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) e.push(m.text()); }); return e; };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin' AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}' WHERE id=1");
  const suf = String(Date.now() % 1000000);
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Tina',$1,$2) RETURNING id", [`UiOrto${suf}`, `UT${suf}`])).id;
  await db.query("INSERT INTO orto_casos (clinica_id, paciente_id, fase, tipo_aparatologia, fecha_instalacion, honorario_total, entrega_inicial, cuota_mensual) VALUES (1,$1,'activa','brackets_esteticos', CURRENT_DATE, 1800000, 300000, 250000)", [pid]);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const err = errores(p);
    await p.goto(`${URL0}/moderno/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1000);
    P('El menú trae "Ortodoncia"', await p.evaluate(() => !!document.querySelector('[data-ruta="ortodoncia"]')));
    await p.evaluate(() => DovaApp.navegar('ortodoncia'));
    const f = p.frameLocator('.dova-ventana[data-ventana-ruta="ortodoncia"] iframe');
    await f.locator('.dova-orto table').waitFor({ timeout: 15000 });
    const fila = f.locator('tr', { hasText: `UiOrto${suf}` });
    P('El tablero muestra el caso y dice que faltan las cuotas', (await fila.count()) === 1 && /Sin generar/.test(await fila.innerText()), await fila.innerText());
    await fila.locator('[data-or-cuotas]').click();
    await f.locator('#oc-cant').waitFor();
    P('Propone la cantidad según la cuota mensual (1.500.000 ÷ 250.000 = 6)', (await f.locator('#oc-cant').inputValue()) === '6');
    await p.screenshot({ path: `${DIR}/ortodoncia-cuotas.png` });
    await f.locator('.dova-ext-modal-form button[type=submit]').click();
    await f.locator('.dova-ext-modal table tbody tr').first().waitFor({ timeout: 10000 });
    P('Genera las 6 cuotas y las muestra', (await f.locator('.dova-ext-modal table tbody tr').count()) === 6);
    await f.locator('[data-cerrar-modal]').first().click();
    await f.locator('tr', { hasText: `UiOrto${suf}` }).locator('td', { hasText: '0/6' }).waitFor({ timeout: 10000 });
    P('El tablero se actualiza (0/6)', true);
    await p.screenshot({ path: `${DIR}/ortodoncia.png` });
    P('Sin errores en consola', err.length === 0, err);
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally { await b.close(); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
