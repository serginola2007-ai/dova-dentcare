/* global document, window, DovaApp, DovaVentanas, DovaBloqueo, getComputedStyle */
// Pantallas (Playwright): escritorio con ventanas. Inicio siempre de fondo; cada
// función abre una ventana de tamaño fijo, que se mueve, tiene zoom, se
// minimiza y se cierra; varias a la vez. En celular, a pantalla completa.
// Requiere DATABASE_URL, DOVA_URL, DOVA_TZ.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0);
const login = async (b, vp, u, c, dis = 'mecanico') => {
  await db.query('DELETE FROM login_intentos'); await db.query('UPDATE usuarios SET diseno_preferido=$1, debe_cambiar_clave=false WHERE username=$2', [dis, u]);
  const ctx = await b.newContext({ viewport: vp, timezoneId: TZ, hasTouch: vp.width < 800 }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
  return { ctx, p, err };
};
const ventana = (p, ruta) => p.locator(`.dova-ventana[data-ventana-ruta="${ruta}"]`);
const marco = (p, ruta) => p.frameLocator(`.dova-ventana[data-ventana-ruta="${ruta}"] iframe`);
const caja = (l) => l.boundingBox();
const menu = async (p, grupo, ruta, sub) => {
  await p.click(`#menu-root .dova-menu-grupo[data-grupo="${grupo}"] .dova-menu-grupo-btn`);
  if (sub) { await p.hover(`#menu-root [data-fila="${ruta}"]`); await p.click(`#menu-root [data-ruta="${ruta}"][data-sub="${sub}"]`); } else await p.click(`#menu-root [data-ruta="${ruta}"]:not([data-sub])`);
};

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    // ---------------- Escritorio (mecánico) ----------------
    {
      const vp = { width: 1440, height: 900 };
      const { ctx, p, err } = await login(b, vp, 'admin', 'admin');
      P('No hay botón "Inicio" en el menú', await p.locator('#menu-root [data-ruta="dashboard"]').count() === 0);
      P('Inicio queda de fondo', await p.locator('#main-root .dova-inicio').isVisible());
      await menu(p, 'movimientos', 'agenda', 'dia');
      await ventana(p, 'agenda').waitFor({ timeout: 10000 });
      await marco(p, 'agenda').locator('h2, .dova-view-title').first().waitFor({ timeout: 15000 });
      P('Agenda se abre en una ventana', await ventana(p, 'agenda').isVisible() && /Agenda/.test(await ventana(p, 'agenda').locator('.dova-ventana-titulo').textContent()));
      P('…y el Inicio sigue en la página', await p.locator('#main-root .dova-inicio').count() === 1);
      const v1 = await caja(ventana(p, 'agenda'));
      P('La ventana no ocupa toda la pantalla', v1.width < vp.width * 0.8 && v1.height < (vp.height - 60) * 0.9, v1);
      P('No se puede agrandar ni achicar (sin borde para estirar)', await ventana(p, 'agenda').evaluate((e) => getComputedStyle(e).resize === 'none'));
      await menu(p, 'reportes', 'pacientes');
      await ventana(p, 'pacientes').waitFor();
      await menu(p, 'movimientos', 'facturacion', 'nueva');
      await ventana(p, 'facturacion').waitFor();
      await marco(p, 'facturacion').locator('.dova-ext-subtab.activo').waitFor({ timeout: 15000 });
      P('Desde el submenú abre directo en la pestaña elegida', /Nueva factura/.test(await marco(p, 'facturacion').locator('.dova-ext-subtab.activo').textContent()));
      P('Tres ventanas abiertas a la vez, con su barra de tareas', await p.locator('.dova-ventana').count() === 3 && await p.locator('#dova-tareas [data-tarea]').count() === 3);
      const v2 = await caja(ventana(p, 'pacientes'));
      P('Todas del mismo tamaño fijo', Math.abs(v2.width - v1.width) < 1 && Math.abs(v2.height - v1.height) < 1);
      // Abrir de nuevo la misma: no duplica
      await menu(p, 'movimientos', 'agenda', 'dia');
      await p.waitForTimeout(500);
      P('Abrir una sección ya abierta la trae adelante (no duplica)', await p.locator('.dova-ventana[data-ventana-ruta="agenda"]').count() === 1 && await ventana(p, 'agenda').evaluate((e) => e.classList.contains('activa')));
      // Mover
      const antes = await caja(ventana(p, 'agenda'));
      const t = await caja(ventana(p, 'agenda').locator('.dova-ventana-titulo'));
      await p.mouse.move(t.x + 20, t.y + t.height / 2); await p.mouse.down(); await p.mouse.move(t.x + 140, t.y + 70, { steps: 8 }); await p.mouse.up();
      const despues = await caja(ventana(p, 'agenda'));
      P('Se mueve arrastrando la barra de título', Math.abs(despues.x - antes.x - 120) < 3 && Math.abs(despues.y - antes.y - (70 - t.height / 2)) < 4, { antes, despues });
      P('…sin cambiar de tamaño', Math.abs(despues.width - antes.width) < 1 && Math.abs(despues.height - antes.height) < 1);
      // Zoom
      await ventana(p, 'agenda').locator('[data-zoom="+"]').click(); await ventana(p, 'agenda').locator('[data-zoom="+"]').click();
      const zoom = await ventana(p, 'agenda').locator('iframe').evaluate((f) => f.contentDocument.documentElement.style.zoom);
      P('Zoom: + dos veces = 120 %', (await ventana(p, 'agenda').locator('[data-zoom-valor]').textContent()) === '120%' && zoom === '1.2', zoom);
      await ventana(p, 'agenda').locator('[data-zoom="0"]').click();
      P('Tocar el porcentaje vuelve a 100 %', (await ventana(p, 'agenda').locator('[data-zoom-valor]').textContent()) === '100%');
      // Minimizar y restaurar
      await ventana(p, 'agenda').locator('[data-minimizar]').click();
      P('Minimizar: la ventana se oculta y queda en la barra', await ventana(p, 'agenda').isHidden() && await p.locator('#dova-tareas .dova-tarea-item.minimizada').count() === 1);
      await p.locator('#dova-tareas .dova-tarea', { hasText: 'Agenda' }).click();
      P('Tocarla en la barra la vuelve a mostrar adelante', await ventana(p, 'agenda').isVisible() && await ventana(p, 'agenda').evaluate((e) => e.classList.contains('activa')));
      // Traer al frente tocando adentro: una ventana de atrás, en un punto que no esté tapado.
      const pt = await p.evaluate(() => {
        for (const v of document.querySelectorAll('.dova-ventana:not(.activa):not([hidden])')) {
          const r = v.getBoundingClientRect();
          for (let y = r.bottom - 12; y > r.top + 40; y -= 20) for (let x = r.right - 12; x > r.left + 10; x -= 30) { const e = document.elementFromPoint(x, y); if (e && v.contains(e)) return { x, y, ruta: v.dataset.ventanaRuta, z: Number(v.style.zIndex) }; }
        }
        return null;
      });
      await p.mouse.click(pt.x, pt.y);
      await p.waitForTimeout(300);
      P('Tocar una ventana de atrás la trae adelante', await ventana(p, pt.ruta).evaluate((e) => e.classList.contains('activa')) && Number(await ventana(p, pt.ruta).evaluate((e) => e.style.zIndex)) > pt.z, pt);
      await p.evaluate(() => DovaApp.navegar('pacientes')); await p.waitForTimeout(300);
      // Navegar adentro y volver
      await marco(p, 'pacientes').locator('[data-ver-paciente]').first().click();
      await p.waitForFunction(() => /Ficha del paciente/.test(document.querySelector('.dova-ventana.activa .dova-ventana-titulo').textContent), null, { timeout: 15000 });
      P('Ver ficha dentro de la ventana: cambia el título', /Ficha del paciente/.test(await p.locator('.dova-ventana.activa .dova-ventana-titulo').textContent()));
      P('…con botón Volver', await p.locator('.dova-ventana.activa [data-atras]').isVisible());
      await p.locator('.dova-ventana.activa [data-atras]').click();
      await p.waitForFunction(() => document.querySelector('.dova-ventana.activa .dova-ventana-titulo').textContent.trim() === 'Pacientes', null, { timeout: 10000 });
      P('Volver regresa a Pacientes', true);
      // Inicio: una fila de "Para atender" abre su ventana
      await p.click('#dova-tareas [data-escritorio]');
      P('"Inicio" en la barra minimiza todo', await p.locator('.dova-ventana:visible').count() === 0);
      const fila = p.locator('[data-para-atender] .dova-atender-fila').first();
      if (await fila.count()) {
        const ruta = await fila.getAttribute('data-ir-ruta');
        await fila.click(); await p.waitForTimeout(800);
        P('Una fila de Inicio abre su sección en una ventana', await ventana(p, ruta).isVisible());
      }
      // Tema
      await p.evaluate(() => DovaApp.aplicarModo('oscuro')); await p.waitForTimeout(300);
      const tp = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const tv = await ventana(p, 'agenda').locator('iframe').evaluate((f) => f.contentDocument.documentElement.getAttribute('data-theme'));
      P('Claro/oscuro llega a las ventanas abiertas', tp === 'dark' && tp === tv, { tp, tv });
      await p.evaluate(() => DovaApp.aplicarModo('claro'));
      await p.screenshot({ path: `${DIR}/ventanas-escritorio.png` });
      // Recargar: vuelven las ventanas
      const abiertas = await p.evaluate(() => DovaVentanas.abiertas().map((v) => v.ruta).sort().join(','));
      await p.reload(); await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1500);
      P('Al recargar vuelven las ventanas que estaban abiertas', (await p.evaluate(() => DovaVentanas.abiertas().map((v) => v.ruta).sort().join(','))) === abiertas, abiertas);
      // Cerrar
      await p.evaluate(() => DovaApp.navegar('pacientes')); await p.waitForTimeout(300);
      await ventana(p, 'pacientes').locator('[data-cerrar]').click();
      P('Cerrar quita la ventana y su botón de la barra', await ventana(p, 'pacientes').count() === 0 && await p.locator('#dova-tareas .dova-tarea', { hasText: 'Pacientes' }).count() === 0);
      // Bloqueo de pantalla: el candado tapa también las ventanas y al desbloquear siguen andando
      await p.evaluate(() => DovaBloqueo.bloquear()); await p.waitForSelector('#dova-candado', { timeout: 5000 });
      const zc = Number(await p.$eval('#dova-candado', (e) => getComputedStyle(e).zIndex));
      P('El candado queda por encima de las ventanas', zc > 400);
      await p.fill('#dova-candado input[type=password]', 'admin'); await p.click('#dova-candado button[type=submit]');
      await p.waitForSelector('#dova-candado', { state: 'detached', timeout: 10000 });
      await p.evaluate(() => DovaApp.navegar('pacientes'));
      await marco(p, 'pacientes').locator('#pacientes-tbody tr').first().waitFor({ timeout: 15000 });
      P('Después de desbloquear, una ventana nueva carga datos', await marco(p, 'pacientes').locator('#pacientes-tbody tr').count() > 0);
      P('[escritorio] Sin desborde', await sinDesborde(p));
      P('[escritorio] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    // ---------------- Los otros diseños ----------------
    for (const dis of ['mecanico']) {
      const { ctx, p, err } = await login(b, { width: 1366, height: 860 }, 'admin', 'admin', dis);
      await p.evaluate(() => { window.DovaSubPendiente = null; return DovaApp.navegar('agenda'); });
      await marco(p, 'agenda').locator('h2, .dova-view-title').first().waitFor({ timeout: 15000 });
      await p.evaluate(() => DovaApp.navegar('pacientes'));
      await marco(p, 'pacientes').locator('#pacientes-tbody tr').first().waitFor({ timeout: 15000 });
      P(`[${dis}] Dos ventanas abiertas con su contenido`, await p.locator('.dova-ventana').count() === 2);
      P(`[${dis}] Adentro de la ventana no se repite el menú`, await marco(p, 'pacientes').locator('.dova-topbar').isHidden());
      if (dis === 'mecanico') {
        P('[mecanico] Adentro no aparecen los paneles laterales', await marco(p, 'pacientes').locator('.mec-lateral').isHidden() && await marco(p, 'pacientes').locator('.mec-iconos').isHidden());
        P('[mecanico] Ya no hay ícono de Inicio', await p.locator('#mec-iconos [data-mec-ir="dashboard"]').count() === 0);
        await p.click('#dova-tareas [data-escritorio]');
        P('[mecanico] "Inicio" de la barra de tareas minimiza todo', await p.locator('.dova-ventana:visible').count() === 0);
        await p.click('#mec-iconos [data-mec-ir="informes"]'); await p.waitForTimeout(400);
        P('[mecanico] Un ícono abre su ventana', await ventana(p, 'informes').isVisible());
        P('[mecanico] La barra de tareas no tapa la barra de estado', (await caja(p.locator('#dova-tareas'))).y + 1 < (await caja(p.locator('#mec-estado'))).y + 1);
      }
      await p.screenshot({ path: `${DIR}/ventanas-${dis}.png` });
      P(`[${dis}] Sin desborde`, await sinDesborde(p));
      P(`[${dis}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    // ---------------- Tablet y celular ----------------
    for (const vp of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      const tag = `[${vp.width}]`;
      const { ctx, p, err } = await login(b, vp, 'recep1', 'clave123');
      await p.evaluate(() => DovaApp.navegar('agenda'));
      await marco(p, 'agenda').locator('h2, .dova-view-title').first().waitFor({ timeout: 15000 });
      await p.evaluate(() => DovaApp.navegar('pacientes'));
      await marco(p, 'pacientes').locator('#pacientes-tbody tr').first().waitFor({ timeout: 15000 });
      const v = await caja(ventana(p, 'pacientes'));
      if (vp.width < 769) {
        P(`${tag} Celular: la ventana ocupa todo el ancho`, Math.abs(v.width - vp.width) < 2, v);
        P(`${tag} Celular: se ve solo la activa`, await p.locator('.dova-ventana:visible').count() === 1);
        await p.locator('#dova-tareas .dova-tarea', { hasText: 'Agenda' }).click();
        P(`${tag} Celular: la barra de abajo cambia de ventana`, await ventana(p, 'agenda').isVisible() && await ventana(p, 'pacientes').isHidden());
      } else {
        P(`${tag} Tablet: ventana más chica que la pantalla`, v.width < vp.width && v.width > 300, v);
      }
      await p.screenshot({ path: `${DIR}/ventanas-${vp.width}.png` });
      P(`${tag} Sin desborde`, await sinDesborde(p));
      P(`${tag} Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
  } finally {
    await b.close();
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
