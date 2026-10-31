/* Prueba de pantalla: odontograma dibujado (frontend/app/components/odontograma.js).
   - 32 piezas dibujadas, cada una con su forma (cantidad de raíces según la pieza).
   - Vista "como en la boca" y "en fila", con animación al cambiar; la vista elegida se recuerda.
   - Tocar una pieza abre su expediente; el presupuesto desde el odontograma sigue andando.
   - Modo oscuro y celular sin desbordes ni errores de consola.
   Uso: DATABASE_URL=… DOVA_URL=http://localhost:4500 [DOVA_USUARIO=admin DOVA_CLAVE=admin] node tests/ui-odontograma.js */
/* global document, getComputedStyle, window, localStorage */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');

const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const USUARIO = process.env.DOVA_USUARIO || 'admin';
const CLAVE = process.env.DOVA_CLAVE || 'admin';
const db = new Pool({ connectionString: process.env.DATABASE_URL });
let ok = 0; let mal = 0;
const P = (texto, cond, extra) => { if (cond) { ok++; console.log('OK  ', texto); } else { mal++; console.log('MAL ', texto, extra === undefined ? '' : JSON.stringify(extra)); } };

(async () => {
  const sufijo = String(Date.now()).slice(-7);
  const pac = (await db.query("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Odonto','Prueba',$1) RETURNING id", [`OD${sufijo}`])).rows[0].id;
  await db.query("INSERT INTO odontograma_piezas (clinica_id, paciente_id, pieza, superficie, estado) VALUES (1,$1,'16','general','caries'), (1,$1,'36','general','extraccion_indicada'), (1,$1,'26','general','corona'), (1,$1,'38','general','ausente')", [pac]);
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE username=$1', [USUARIO]);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  const abrir = async (vp, tema) => {
    await db.query('DELETE FROM login_intentos');
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
    p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text()); });
    await p.addInitScript((t) => { try { localStorage.setItem('dova-tema', t); } catch (_e) { /* */ } }, tema);
    await p.goto(`${URL0}/mecanico/index.html`);
    await p.fill('#login-username', USUARIO); await p.fill('#login-password', CLAVE); await p.click('#form-login button[type=submit]');
    await p.waitForTimeout(2000);
    await p.goto(`${URL0}/mecanico/index.html?ventana=1#paciente/${pac}`);
    await p.waitForSelector('[data-tab="odontograma"]'); await p.click('[data-tab="odontograma"]'); await p.waitForTimeout(700);
    return { ctx, p, err };
  };
  const posiciones = (p) => p.evaluate(() => [...document.querySelectorAll('.odo-lienzo [data-ver-pieza]')].map((e) => [e.dataset.verPieza, Math.round(parseFloat(e.style.left)), Math.round(parseFloat(e.style.top)), e.style.getPropertyValue('--giro')]));

  try {
    // ---- Escritorio, modo claro
    {
      const { ctx, p, err } = await abrir({ width: 1280, height: 900 }, 'light');
      await p.evaluate(() => { try { localStorage.removeItem('dova-odonto-vista'); } catch (_e) { /* */ } });
      P('Se dibujan las 32 piezas', await p.locator('.odo-lienzo [data-ver-pieza]').count() === 32);
      const raices = await p.evaluate(() => Object.fromEntries(['11', '14', '16', '36', '46'].map((x) => [x, document.querySelectorAll(`[data-ver-pieza="${x}"] .odo-raiz`).length])));
      P('Cada pieza con su forma: el 14 y el 16 con raíz bifurcada + palatina, el 36 con dos raíces (un trazo)', raices['11'] === 1 && raices['14'] === 1 && raices['16'] === 2 && raices['36'] === 1, raices);
      P('Sin colores: el trazo usa el color del texto', await p.evaluate(() => getComputedStyle(document.querySelector('.odo-corona')).stroke === getComputedStyle(document.body).color));
      P('Arranca en la vista "como en la boca"', await p.getAttribute('.dova-odonto', 'data-vista') === 'boca');
      const boca = await posiciones(p);
      const giros = boca.filter(([, , , g]) => g && g !== '0deg').length;
      P('En la boca las piezas están giradas siguiendo la arcada', giros >= 28, giros);
      P('Hallazgos marcados: caries (16), corona rayada (26), X (36), ausente (38)', await p.locator('[data-ver-pieza="16"] .odo-marca-llena').count() === 1
        && await p.locator('[data-ver-pieza="26"] .odo-marca-relleno').count() === 1 && await p.locator('[data-ver-pieza="36"] .odo-marca-x').count() === 1
        && await p.locator('[data-ver-pieza="38"] .odo-ausente').count() === 1);

      await p.click('[data-odo-cambiar]'); await p.waitForTimeout(120);
      const animando = await p.evaluate(() => document.getAnimations().length);
      P('Cambiar de vista anima el movimiento de las piezas', animando >= 32, animando);
      await p.waitForTimeout(1600);
      const filas = await posiciones(p);
      const yArriba = new Set(filas.filter(([x]) => x[0] === '1' || x[0] === '2').map(([, , y]) => y));
      const yAbajo = new Set(filas.filter(([x]) => x[0] === '3' || x[0] === '4').map(([, , y]) => y));
      P('En fila: las 16 de arriba en una línea y las 16 de abajo en otra, sin girar', yArriba.size === 1 && yAbajo.size === 1 && [...yArriba][0] < [...yAbajo][0] && filas.every(([, , , g]) => g === '0deg'));
      const xs = filas.filter(([x]) => x[0] === '1' || x[0] === '2').map(([, x]) => x);
      P('…ordenadas de 18 a 28, una al lado de la otra', xs.every((x, i) => !i || x > xs[i - 1]));
      P('El botón indica la vista', await p.getAttribute('[data-odo-cambiar]', 'aria-pressed') === 'true' && /fila/.test(await p.textContent('[data-odo-texto]')));

      await p.click('[data-ver-pieza="16"]'); await p.waitForSelector('.dova-expediente-pieza');
      P('Tocar una pieza abre su expediente', /Pieza 16/.test(await p.textContent('.dova-expediente-pieza')));

      await p.click('[data-modo-pres]'); await p.waitForSelector('.dova-odo-pres-lista:not([hidden])');
      await p.click('[data-marcar-hallazgos]'); await p.waitForTimeout(300);
      P('Presupuesto desde el odontograma: marca la 16 y la 36', await p.locator('[data-fila-pieza]').count() === 2 && await p.locator('.dova-pieza-elegida').count() === 2);
      await p.click('[data-salir-pres]');

      await p.reload(); await p.waitForSelector('[data-tab="odontograma"]'); await p.click('[data-tab="odontograma"]'); await p.waitForTimeout(500);
      P('La vista elegida se recuerda al volver', await p.getAttribute('.dova-odonto', 'data-vista') === 'filas');
      await p.click('[data-odo-cambiar]'); await p.waitForTimeout(1600);
      const vuelta = await posiciones(p);
      P('Y vuelve a la boca a la misma ubicación', JSON.stringify(vuelta) === JSON.stringify(boca));
      P('[claro] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    // ---- Modo oscuro y celular
    for (const [nombre, vp, tema] of [['oscuro', { width: 1280, height: 900 }, 'dark'], ['celular', { width: 390, height: 844 }, 'light']]) {
      const { ctx, p, err } = await abrir(vp, tema);
      for (const vista of ['primera', 'segunda']) {
        const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const fuera = await p.evaluate(() => { const l = document.querySelector('.odo-lienzo').getBoundingClientRect(); return [...document.querySelectorAll('.odo-lienzo [data-ver-pieza]')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < l.left - 2 || r.right > l.right + 2; }).length; });
        P(`[${nombre}, ${vista} vista] Ninguna pieza se sale del ancho y no hay desborde`, !desborde && fuera === 0, { desborde, fuera });
        await p.click('[data-odo-cambiar]'); await p.waitForTimeout(1600);
      }
      P(`[${nombre}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
  } finally {
    await db.query('DELETE FROM odontograma_piezas WHERE paciente_id=$1', [pac]).catch(() => {});
    await db.query("SET dova.borrando_paciente='on'").catch(() => {});
    await db.query('DELETE FROM pacientes WHERE id=$1', [pac]).catch(() => {});
    await b.close(); await db.end();
  }
  console.log(`ui-odontograma.js ok=${ok} mal=${mal} | ${ok}/${ok + mal}`);
  process.exit(mal ? 1 : 0);
})();
