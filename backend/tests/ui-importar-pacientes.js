/* global document, window, DovaApp */
// Pantallas (Playwright): Pacientes → Importar desde Excel (escritorio y celular).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { enVentana } = require('./ayuda-ventana');
const ExcelJS = require('exceljs');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };

(async () => {
  const suf = String(Date.now() % 100000).padStart(5, '0');
  await db.query('DELETE FROM pacientes WHERE clinica_id=1 AND ci LIKE $1', [`8${suf}%`]);
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='recep1'");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [dis, vp, n] of [['moderno', { width: 1366, height: 900 }, 1], ['tecnico', { width: 390, height: 844 }, 2]]) {
    const wb = new ExcelJS.Workbook(); const h = wb.addWorksheet('P');
    h.addRow(['Nombre', 'Apellido', 'CI', 'Teléfono', 'Fecha de nacimiento']);
    h.addRow([`Importada${n}`, `Prueba${suf}`, `8${suf}${n}1`, '0981 123 456', '10/10/1980']);
    h.addRow([`Otra${n}`, `Prueba${suf}`, `8${suf}${n}2`, '', '']);
    h.addRow(['SinApellido', '', `8${suf}${n}3`, '', '']);
    const archivo = path.join(os.tmpdir(), `imp-${suf}-${n}.xlsx`); await wb.xlsx.writeFile(archivo);
    await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido=$1 WHERE username='recep1'", [dis]);
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true }); const p = await ctx.newPage(); const err = [];
    p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', 'recep1'); await p.fill('#login-password', 'clave123'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800); await enVentana(p);
    await p.evaluate(() => DovaApp.navegar('pacientes')); await p.waitForSelector('#btn-importar-pacientes');
    await p.click('#btn-importar-pacientes'); await p.waitForSelector('.dova-imp');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-plantilla]')]);
    P(`[${dis}] Descarga la planilla modelo`, /\.xlsx$/.test(dl.suggestedFilename()));
    await p.setInputFiles('#imp-archivo', archivo); await p.click('[data-revisar]');
    await p.waitForSelector('.dova-imp-revision', { timeout: 10000 });
    const txt = await p.textContent('.dova-imp-revision');
    P(`[${dis}] Revisión: 2 nuevos, 1 con error (fila 4: falta el apellido)`, /2\s*pacientes nuevos/.test(txt) && /Fila 4: Falta el apellido/.test(txt), txt.slice(0, 300));
    P(`[${dis}] Muestra cómo se van a cargar, con la fecha en día/mes/año`, /10\/10\/1980/.test(txt));
    P(`[${dis}] Revisar no guardó nada`, Number((await db.query('SELECT count(*) n FROM pacientes WHERE ci LIKE $1', [`8${suf}${n}%`])).rows[0].n) === 0);
    await p.locator(".dova-imp-revision").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${DIR}/importar-${dis}.png` });
    P(`[${dis}] Sin desborde`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
    await p.click('[data-importar]'); await p.waitForSelector('.dova-imp-listo', { timeout: 10000 });
    P(`[${dis}] Importa y avisa el resultado`, /2 pacientes nuevos/.test(await p.textContent('.dova-imp-listo')));
    await p.click('[data-listo]'); await p.waitForTimeout(800);
    await p.fill('#pacientes-buscar', `Prueba${suf}`); await p.waitForTimeout(1200);
    P(`[${dis}] Aparecen en la lista de pacientes`, await p.locator('#pacientes-tbody tr', { hasText: `Importada${n}` }).count() === 1);
    P(`[${dis}] Sin errores de consola`, err.length === 0, err);
    await ctx.close(); fs.unlinkSync(archivo);
  }
  await b.close();
  await db.query('DELETE FROM pacientes WHERE clinica_id=1 AND ci LIKE $1', [`8${suf}%`]);
  await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='recep1'");
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
