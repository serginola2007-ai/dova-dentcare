/* global document, window */
// Pantallas (Playwright): sección Presupuestos (no guarda sin C.I. ni tratamientos)
// e Informes del día, semana, mes y año. Requiere DATABASE_URL, DOVA_URL, DOVA_TZ.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const sinDesborde = (f) => f.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0);
const login = async (b, vp, u, c, dis = 'mecanico') => {
  await db.query('DELETE FROM login_intentos'); await db.query('UPDATE usuarios SET diseno_preferido=$1, debe_cambiar_clave=false WHERE username=$2', [dis, u]);
  const ctx = await b.newContext({ viewport: vp, timezoneId: TZ, hasTouch: vp.width < 800 }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
  return { ctx, p, err };
};
const menu = async (p, grupo, ruta, sub) => {
  if (await p.locator('#dova-menu-toggle').isVisible()) await p.click('#dova-menu-toggle');
  await p.click(`#menu-root .dova-menu-grupo[data-grupo="${grupo}"] .dova-menu-grupo-btn`);
  if (sub) { await p.click(`#menu-root [data-fila="${ruta}"] .dova-submenu-padre`); await p.click(`#menu-root [data-ruta="${ruta}"][data-sub="${sub}"]`); } else await p.click(`#menu-root [data-ruta="${ruta}"]:not([data-sub])`);
};
const frame = (p, ruta) => p.frameLocator(`.dova-ventana[data-ventana-ruta="${ruta}"] iframe`);
const frameObj = async (p, ruta) => (await p.locator(`.dova-ventana[data-ventana-ruta="${ruta}"] iframe`).elementHandle()).contentFrame();

(async () => {
  const suf = String(Date.now() % 1000000);
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido) VALUES (1,'Presu',$1) RETURNING id", [`SinCi${suf}`])).id;
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    for (const [vp, u, c] of [[{ width: 1440, height: 900 }, 'recep1', 'clave123'], [{ width: 390, height: 844 }, 'admin', 'admin']]) {
      const tag = `[${u} ${vp.width}]`;
      const { ctx, p, err } = await login(b, vp, u, c);
      // ---------- Presupuestos ----------
      await menu(p, 'movimientos', 'presupuestos');
      const f = frame(p, 'presupuestos');
      await f.locator('.dova-pres-tabla').waitFor({ timeout: 15000 });
      P(`${tag} Movimientos → Presupuestos abre la sección con la lista`, await f.locator('.dova-pres-tabla tbody tr').count() > 0);
      if (vp.width < 800) {
        await p.waitForTimeout(400);
        const tb = await p.locator('.dova-topbar').boundingBox(); const vb = await p.locator('.dova-ventana[data-ventana-ruta="presupuestos"]').boundingBox();
        P(`${tag} Celular: la ventana arranca justo debajo de la barra (con el menú ya cerrado)`, Math.abs(vb.y - (tb.y + tb.height)) < 3, { tb, vb });
      }
      if (vp.width > 800) {
        await f.locator('#pres-q').fill(`SinCi${suf}`); await p.waitForTimeout(900);
        P(`${tag} Buscar filtra la lista`, /No hay presupuestos/.test(await f.locator('.dova-pres-tabla').textContent()));
        await f.locator('#pres-q').fill('');
      }
      await f.locator('[data-pres-nuevo]').click();
      await f.locator('[data-pres-form]').waitFor();
      const guardar = f.locator('[data-guardar]');
      P(`${tag} Nuevo: el botón Guardar arranca desactivado y dice qué falta`, await guardar.isDisabled() && /elegir el paciente/.test(await f.locator('[data-falta]').textContent()));
      await f.locator('[data-buscar-pac]').fill(`SinCi${suf}`);
      await f.locator('.dova-op-res-item').first().click();
      await f.locator('[data-ci-campo]:not([hidden])').waitFor({ timeout: 5000 });
      P(`${tag} Paciente sin C.I.: aparece el campo obligatorio`, await f.locator('#pres-ci').isVisible() && /C\.I\./.test(await f.locator('[data-falta]').textContent()) && await guardar.isDisabled());
      const fr = await frameObj(p, 'presupuestos');
      const trat = await fr.$eval('[data-items] [data-t] option:nth-child(2)', (o) => o.value);
      await f.locator('[data-items] [data-t]').first().selectOption(trat);
      P(`${tag} Con tratamiento pero sin C.I.: sigue sin dejar guardar`, await guardar.isDisabled() && /C\.I\./.test(await f.locator('[data-falta]').textContent()));
      await f.locator('[data-agregar]').click();
      await f.locator('#pres-ci').fill(`PI${suf}${vp.width}`);
      P(`${tag} Una fila sin elegir tratamiento también lo frena`, await guardar.isDisabled() && /cada fila/.test(await f.locator('[data-falta]').textContent()));
      await f.locator('[data-items] tr').last().locator('[data-quitar]').click();
      P(`${tag} Con C.I. y tratamiento: se puede guardar`, await guardar.isEnabled() && (await f.locator('[data-falta]').textContent()).trim() === '');
      await guardar.click();
      await f.locator('.dova-modal-box').waitFor({ timeout: 10000 });
      P(`${tag} Guardado: muestra el presupuesto`, /Presupuesto N\.º \d+/.test(await f.locator('.dova-modal-box').textContent()));
      const ci = (await q1('SELECT ci FROM pacientes WHERE id=$1', [pac])).ci;
      P(`${tag} La C.I. quedó en la ficha del paciente`, ci === `PI${suf}${vp.width}` || (vp.width < 800 && !!ci), ci);
      if (vp.width < 800) P(`${tag} Sin desborde en la ventana`, await sinDesborde(fr));
      await f.locator('.dova-modal-box [data-cerrar-modal]').last().click();
      await db.query('UPDATE pacientes SET ci=NULL WHERE id=$1', [pac]);
      await p.screenshot({ path: `${DIR}/presupuestos-${vp.width}.png` });

      // ---------- Informes ----------
      if (u === 'admin') {
        await menu(p, 'reportes', 'informes', 'mes');
        const g = frame(p, 'informes');
        await g.locator('.dova-inf-kpis').waitFor({ timeout: 15000 });
        P(`${tag} Informes → Del mes: indicadores y comparación`, /Cobrado/.test(await g.locator('.dova-inf-kpis').textContent()) && /comparan con/.test(await g.locator('body').textContent()));
        const t1 = await g.locator('.dova-inf-nav h3').textContent();
        await g.locator('[data-mover="-1"]').click(); await g.locator('[data-actual]').waitFor({ timeout: 10000 });
        P(`${tag} ‹ pasa al mes anterior (y aparece "Este mes")`, (await g.locator('.dova-inf-nav h3').textContent()) !== t1);
        for (const [id, texto] of [['dia', /\d{4}/], ['semana', /Semana del/], ['anio', /Año \d{4}/]]) {
          await g.locator(`[data-subtab="${id}"]`).click(); await g.locator('.dova-inf-kpis').waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
          P(`${tag} Informe ${id}`, texto.test(await g.locator('.dova-inf-nav h3').textContent()));
        }
        await g.locator('[data-subtab="detalle"]').click(); await g.locator('.dova-rep').waitFor({ timeout: 10000 });
        P(`${tag} Reportes detallados dentro de Informes`, await g.locator('.dova-rep [data-rep-select] option').count() > 5);
        const fi = await frameObj(p, 'informes');
        P(`${tag} Informes sin desborde`, await sinDesborde(fi));
        await p.screenshot({ path: `${DIR}/informes-${vp.width}.png` });
      }
      P(`${tag} Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
  } finally {
    await b.close();
    const cl = await db.connect();
    try { await cl.query('BEGIN'); await cl.query("SET LOCAL dova.borrando_paciente='on'"); await cl.query('DELETE FROM pacientes WHERE id=$1', [pac]); await cl.query('COMMIT'); } catch (e) { await cl.query('ROLLBACK'); console.error(e.message); } finally { cl.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
