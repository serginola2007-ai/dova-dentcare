/* global document, window, getComputedStyle, DovaApp */
// Mejoras visuales: título sin repetir en ventanas, montos en una línea, ingreso con marca,
// Inicio con turnos de hoy y prioridades, barra de estado útil, celular con barra de accesos,
// campanita que solo resalta lo nuevo y letra grande desde Configuración.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, tema_preferido='claro', letra_preferida='normal' WHERE username='admin' AND clinica_id=1");
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const entrar = async (vp) => {
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
    const err = []; p.on('pageerror', (x) => err.push(x.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) err.push(m.text()); });
    await p.goto(`${URL0}/mecanico/index.html`);
    return { ctx, p, err };
  };
  const login = async (p) => {
    await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1500);
  };
  try {
    // ---------- Escritorio ----------
    const { ctx, p, err } = await entrar({ width: 1366, height: 860 });
    await p.waitForSelector('[data-login-clinica]');
    await p.waitForFunction(() => /DentCare/.test(document.querySelector('[data-login-clinica]').textContent), null, { timeout: 5000 }).catch(() => {});
    P('Ingreso: marca DOVA con el nombre de la clínica', /DOVA/.test(await p.textContent('.dova-login-marca')) && /DentCare/.test(await p.textContent('.dova-login-marca')));
    const anchos = await p.evaluate(() => [document.querySelector('.dova-login-ingresar').getBoundingClientRect().width, document.querySelector('#login-username').getBoundingClientRect().width]);
    P('Ingreso: el botón Ingresar va a lo ancho', Math.abs(anchos[0] - anchos[1]) < 4, anchos);
    await login(p);
    await p.waitForSelector('[data-inicio-hoy] .dova-hoy-fila, [data-inicio-hoy] .dova-nota:not(:empty)', { timeout: 10000 });
    P('Inicio: muestra los turnos de hoy', await p.locator('[data-inicio-hoy] h3', { hasText: 'Turnos de hoy' }).count() === 1);
    const niveles = await p.evaluate(() => Array.from(document.querySelectorAll('[data-para-atender] .dova-atender-fila')).map((f) => f.dataset.nivel || ''));
    const peso = (n) => (n === 'urgente' ? 0 : n === 'aviso' ? 1 : 2);
    P('Para atender: lo urgente arriba, después los avisos', niveles.length > 0 && niveles.every((n, i) => i === 0 || peso(niveles[i - 1]) <= peso(n)) && niveles[0] === 'urgente', niveles);
    const est = await p.textContent('#mec-estado');
    P('Barra de estado: caja y próximo turno', /Caja (abierta|cerrada)/.test(est) && /(Próximo turno|Sin más turnos)/.test(est), est);
    await p.screenshot({ path: `${DIR}/visual-inicio.png` });
    // Ventana: sin título repetido; montos en una línea
    await p.evaluate(() => DovaApp.navegar('caja'));
    const F = p.frameLocator('.dova-ventana[data-ventana-ruta="caja"] iframe');
    await F.locator('.dova-tabla td').first().waitFor({ timeout: 15000 });
    const repetido = await F.locator('.dova-main > .dova-view-title:first-child, .dova-main > :first-child > .dova-view-title:first-child').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
    P('Ventana: el título no se repite adentro', repetido === 0, repetido);
    const montos = await F.locator('.dova-tabla td').evaluateAll((tds) => tds.filter((td) => /^Gs\./.test(td.textContent.trim())).map((td) => ({ t: td.textContent.trim(), alto: td.getBoundingClientRect().height, linea: parseFloat(getComputedStyle(td).lineHeight) || 18 })));
    P('Caja: los montos quedan en una sola línea', montos.length > 0 && montos.every((m) => /^Gs\.\u00a0/.test(m.t)), montos.slice(0, 3));
    P('Caja: horas en formato de 24 horas', !/[ap]\.\s?m\./i.test(await F.locator('.dova-tabla').first().textContent()));
    // Campanita
    const num = p.locator('.dova-campana-num');
    if (await num.isVisible()) {
      await p.click('.dova-campana-btn'); await p.waitForTimeout(400); await p.click('body', { position: { x: 600, y: 820 } });
      P('Campanita: al abrirla, el número pasa a gris (ya visto)', await num.evaluate((n) => n.classList.contains('vista')));
      await p.reload(); await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }).catch(() => null);
    }
    P('[escritorio] Sin errores de consola', err.length === 0, err);
    await ctx.close();

    // ---------- Letra grande ----------
    await db.query('DELETE FROM login_intentos');
    const L = await entrar({ width: 1366, height: 860 }); await login(L.p);
    await L.p.evaluate(() => DovaApp.navegar('configuracion'));
    const C = L.p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe');
    await C.locator('[name="tam-letra"][value="grande"]').check({ timeout: 15000 }); await L.p.waitForTimeout(1000);
    P('Letra grande: se aplica en la pantalla y en la ventana', await L.p.evaluate(() => document.documentElement.dataset.letra) === 'grande'
      && await L.p.evaluate(() => document.querySelector('.dova-ventana[data-ventana-ruta="configuracion"] iframe').contentDocument.documentElement.dataset.letra) === 'grande');
    P('…y queda guardada en el usuario', (await q1("SELECT letra_preferida FROM usuarios WHERE username='admin' AND clinica_id=1")).letra_preferida === 'grande');
    await L.p.screenshot({ path: `${DIR}/visual-letra-grande.png` });
    await C.locator('[name="tam-letra"][value="normal"]').check(); await L.p.waitForTimeout(800);
    P('…y se vuelve a normal', await L.p.evaluate(() => document.documentElement.dataset.letra) === 'normal');
    P('[letra] Sin errores de consola', L.err.length === 0, L.err);
    await L.ctx.close();

    // ---------- Celular ----------
    await db.query('DELETE FROM login_intentos');
    const M = await entrar({ width: 390, height: 844 }); await login(M.p);
    P('Celular: barra de accesos abajo', await M.p.locator('#mec-movil').isVisible() && await M.p.locator('#mec-movil button').count() >= 4);
    P('Celular: arriba sin el campo de búsqueda repetido', await M.p.locator('.dova-topbar .dova-buscador-global').isHidden());
    await M.p.click('#mec-movil [data-mov-ir="agenda"]'); await M.p.waitForTimeout(1500);
    P('Celular: "Agenda" abre la agenda', await M.p.locator('.dova-ventana[data-ventana-ruta="agenda"]').isVisible());
    const tapa = await M.p.evaluate(() => { const v = document.querySelector('.dova-ventana[data-ventana-ruta="agenda"]').getBoundingClientRect(); const bar = document.getElementById('mec-movil').getBoundingClientRect(); return v.bottom <= bar.top + 1; });
    P('Celular: la ventana no queda tapada por la barra', tapa);
    P('Celular: sin desborde horizontal', await M.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
    await M.p.screenshot({ path: `${DIR}/visual-celular.png` });
    P('[celular] Sin errores de consola', M.err.length === 0, M.err);
    await M.ctx.close();
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally {
    await db.query("UPDATE usuarios SET letra_preferida='normal' WHERE username='admin'");
    await b.close(); await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
