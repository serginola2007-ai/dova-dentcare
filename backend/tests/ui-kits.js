/* global document, window, DovaApp, DovaClinica */
// Kits por tratamiento (Inventario) y registrar sesión desde el plan, con descuento del kit.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { enVentana } = require('./ayuda-ventana');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, tema_preferido='claro' WHERE username='admin' AND clinica_id=1");
  const suf = String(Date.now() % 1000000);
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Kiti',$1,$2) RETURNING id", [`Ui${suf}`, `KU${suf}`])).id;
  const trat = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio) VALUES (1,$1,250000) RETURNING id", [`Sellante UI ${suf}`])).id;
  const ins = (await q1("INSERT INTO insumos (clinica_id, nombre, stock_actual, stock_minimo) VALUES (1,$1,20,2) RETURNING id", [`Resina UI ${suf}`])).id;
  const plan = (await q1("INSERT INTO planes_tratamiento (clinica_id, paciente_id, tratamiento_id, nombre, precio, sesiones_totales, estado) VALUES (1,$1,$2,'Sellantes',250000,2,'en_proceso') RETURNING id", [pac, trat])).id;
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
    const err = []; p.on('pageerror', (x) => err.push(x.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800); await enVentana(p);
    await p.evaluate(() => { window.DovaSubPendiente = 'kits'; return DovaApp.navegar('inventario'); });
    const fila = p.locator('tr', { hasText: `Sellante UI ${suf}` });
    await fila.waitFor({ timeout: 15000 });
    P('Inventario → Kits por tratamiento lista el tratamiento sin kit', /Sin kit/.test(await fila.textContent()));
    await fila.locator('[data-kit]').click();
    await p.locator('[data-kit-form] [data-insumo]').first().selectOption(String(ins));
    await p.locator('[data-kit-form] [data-cant]').first().fill('3');
    await p.locator('[data-kit-form] button.dova-btn-primary').click(); await p.waitForTimeout(1200);
    P('Armar el kit lo guarda (1 insumo, 3 por sesión)', Number((await q1('SELECT cantidad FROM tratamiento_kits WHERE tratamiento_id=$1 AND insumo_id=$2', [trat, ins])).cantidad) === 3 && /1/.test(await fila.textContent()));
    await p.screenshot({ path: `${DIR}/kits-lista.png` });
    // Plan del paciente: registrar sesión
    await p.evaluate(({ planId }) => { const d = document.createElement('div'); d.id = 'prueba-plan'; document.getElementById('main-root').replaceChildren(d); return DovaClinica.planDetalle(d, planId); }, { planId: plan });
    await p.waitForSelector('[data-nueva-sesion]', { timeout: 15000 });
    P('El plan muestra las sesiones y ofrece descontar el kit', await p.locator('[data-nueva-sesion] [name=descontarKit]').isChecked() && /Sesiones realizadas: 0 de 2/.test(await p.textContent('[data-sesiones]')));
    await p.fill('[data-nueva-sesion] [name=procedimiento]', 'Sellante en 16 y 26');
    await p.click('[data-nueva-sesion] button'); await p.waitForTimeout(1500);
    const st = Number((await q1('SELECT stock_actual FROM insumos WHERE id=$1', [ins])).stock_actual);
    P('Registrar la sesión descuenta el kit (20 → 17) y avisa', st === 17 && /descontó el kit/.test(await p.locator('#dova-toasts').textContent().catch(() => '')), st);
    await p.waitForSelector('[data-sesiones] li', { timeout: 10000 });
    P('La sesión aparece en la lista con "kit descontado"', /kit descontado/.test(await p.textContent('[data-sesiones]')) && /Sesiones realizadas: 1 de 2/.test(await p.textContent('[data-sesiones]')));
    await p.screenshot({ path: `${DIR}/kits-sesion.png` });
    P('Sin desborde', await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
    P('Sin errores de consola', err.length === 0, err);
    await ctx.close();
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally {
    await b.close();
    await db.query('DELETE FROM planes_tratamiento WHERE id=$1', [plan]).catch(() => null);
    await db.query('DELETE FROM tratamientos WHERE id=$1', [trat]).catch(() => null);
    await db.query('DELETE FROM pacientes WHERE id=$1', [pac]).catch(() => null);
    await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
