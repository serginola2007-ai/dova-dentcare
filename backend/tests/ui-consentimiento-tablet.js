/* global document, window, getComputedStyle, DovaApp */
// Pantallas (Playwright): firma de un consentimiento en modo tablet.
// Requiere DATABASE_URL, DOVA_URL, PLAYWRIGHT_MODULE / CHROMIUM_PATH y CAPTURAS (opcional).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { enVentana } = require('./ayuda-ventana');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await db.query("SET dova.borrando_paciente='on'; DELETE FROM pacientes WHERE apellido='Tablet' AND ci LIKE 'CT%'; RESET dova.borrando_paciente");
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='mecanico' WHERE username='admin'");
  const suf = String(Date.now() % 1000000);
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Sofía','Tablet',$1) RETURNING id", [`CT${suf}`])).id;
  const k = (await q1("INSERT INTO consentimientos (clinica_id, paciente_id, procedimiento, texto) VALUES (1,$1,'Blanqueamiento','Acepto el blanqueamiento dental y sus posibles efectos: sensibilidad temporal.') RETURNING id", [pid])).id;
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false });
  const p = await ctx.newPage(); const err = [];
  p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
  await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800); await enVentana(p);
  await p.evaluate((id) => DovaApp.navegar('paciente', id), pid); await p.waitForTimeout(1500);
  await p.locator('#ficha-tabs [data-tab], main .dova-tab').filter({ hasText: /Consentimientos/ }).first().click(); await p.waitForTimeout(1500);
  await p.locator(`[data-firmar]`).first().click();
  await p.waitForSelector('.dova-firma-tablet');
  P('Modo tablet: ocupa toda la pantalla y tapa DOVA', await p.evaluate(() => getComputedStyle(document.getElementById('shell-root')).visibility === 'hidden' && document.querySelector('.dova-firma-tablet').getBoundingClientRect().width === window.innerWidth));
  P('Muestra el texto y el nombre del paciente', /blanqueamiento/i.test(await p.textContent('.dova-firma-texto')) && /Sofía Tablet/.test(await p.textContent('.dova-firma-quien')));
  await p.click('[data-firmar-ya]');
  P('Sin marcar "acepto": lo pide', /acepto/i.test(await p.textContent('.dova-firma-caja [data-error]')));
  await p.check('[name=acepto]'); await p.click('[data-firmar-ya]');
  P('Sin firmar: lo pide', /Falta la firma/.test(await p.textContent('.dova-firma-caja [data-error]')));
  const cv = await p.locator('[data-lienzo]').boundingBox();
  await p.mouse.move(cv.x + 30, cv.y + 120); await p.mouse.down();
  for (let i = 1; i <= 20; i += 1) await p.mouse.move(cv.x + 30 + i * 18, cv.y + 120 + Math.sin(i / 2) * 40);
  await p.mouse.up();
  await p.screenshot({ path: `${DIR}/firma-tablet.png` });
  await p.click('[data-firmar-ya]'); await p.waitForSelector('.dova-firma-gracias', { timeout: 8000 });
  P('Firmado: pantalla de "¡Gracias! Devolvé la tablet"', /Devolvé la tablet/.test(await p.textContent('.dova-firma-gracias')));
  const fila = await q1('SELECT estado, firmante_relacion, hash_documento, length(firma_paciente) AS largo FROM consentimientos WHERE id=$1', [k]);
  P('En la base: firmado por el paciente, con la imagen de la firma y su huella', fila.estado === 'firmado' && fila.firmante_relacion === 'paciente' && fila.largo > 500 && fila.hash_documento, fila);
  await p.click('[data-listo]'); await p.waitForTimeout(1200);
  P('Al tocar "Listo" vuelve a la ficha con el consentimiento firmado', await p.evaluate(() => getComputedStyle(document.getElementById('shell-root')).visibility !== 'hidden') && await p.locator('main', { hasText: 'Firmado' }).count() > 0);
  P('Sin errores de consola', err.length === 0, err);
  await ctx.close(); await b.close();
  await db.query("SET dova.borrando_paciente='on'; DELETE FROM pacientes WHERE id=" + Number(pid));
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
