/* global document, DovaApp */
// Pantallas del cobro online: "Pagar ahora" en Mi pago (paciente) y Finanzas → Cobro online (clínica).
// Requiere el servidor con la pasarela falsa configurada (PAGOPAR_API_URL=http://localhost:4700).
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|status of 5|Failed to load resource/.test(m.text())) e.push(m.text()); }); return e; };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const mock = http.createServer((rq, rs) => {
  rq.on('data', () => {});
  rq.on('end', () => { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(rq.url.includes('iniciar') ? { respuesta: true, resultado: [{ data: `UIHASH${crypto.randomBytes(3).toString('hex')}`, pedido: '1' }] } : { respuesta: false })); });
});

(async () => {
  await new Promise((r) => mock.listen(4700, r));
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin' AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}', cobro_online_activo=true WHERE id=1");
  const suf = String(Date.now() % 1000000); const hoy = new Date().toISOString().slice(0, 10);
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, email) VALUES (1,'Uli',$1,$2,'uli@ejemplo.com') RETURNING id", [`UiOnline${suf}`, `UO${suf}`])).id;
  const pl = (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, entrega, cantidad_cuotas, fecha_inicio, estado) VALUES (1,$1,450000,0,1,$2,'activo') RETURNING id", [pid, hoy])).id;
  const cu = (await q1("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,1,450000,$2,'pendiente') RETURNING id", [pl, hoy])).id;
  const tok = crypto.randomBytes(24).toString('base64url');
  await db.query("INSERT INTO cobranza_enlaces (clinica_id, paciente_id, token_hash, expira_en) VALUES (1,$1,$2, now() + interval '1 day')", [pid, crypto.createHash('sha256').update(tok).digest('hex')]);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    // ---- Paciente ----
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); const err = errores(p);
    let destino = null;
    await p.route(/pagopar\.com/, (r) => { destino = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Pasarela de prueba</h1>' }); });
    await p.goto(`${URL0}/web/mi-pago.html#t=${tok}`);
    await p.waitForSelector('[data-pagar-ahora]', { timeout: 10000 });
    P('Mi pago muestra "Pagar ahora" en la cuota', (await p.textContent('[data-pagar-ahora]')).includes('Pagar ahora'));
    await p.screenshot({ path: `${DIR}/mi-pago-online.png` });
    await p.click('[data-pagar-ahora]');
    await p.waitForFunction(() => /Pasarela de prueba/.test(document.body.innerText), null, { timeout: 10000 });
    P('Al tocarlo lo lleva a la pasarela', /pagopar\.com\/pagos\/UIHASH/.test(destino || ''), destino);
    P('Sin errores en consola (paciente)', err.length === 0, err);
    // ---- Clínica ----
    await db.query('DELETE FROM login_intentos');
    const ctx2 = await b.newContext({ viewport: { width: 1366, height: 900 } }); const a = await ctx2.newPage(); const err2 = errores(a);
    await a.goto(`${URL0}/mecanico/index.html`); await a.fill('#login-username', 'admin'); await a.fill('#login-password', 'admin'); await a.click('#form-login button[type=submit]');
    await a.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await a.waitForTimeout(1000);
    await a.evaluate(() => DovaApp.navegar('finanzas'));
    const f = a.frameLocator('.dova-ventana[data-ventana-ruta="finanzas"] iframe');
    await f.locator('text=Cobro online').first().click();
    await f.locator('.dova-cobro-online').waitFor({ timeout: 10000 });
    const txt = await f.locator('.dova-cobro-online').innerText();
    P('Finanzas → Cobro online muestra el estado y la URL de aviso', /Pasarela conectada/.test(txt) && /Activado/.test(txt) && /api\/cobro-online\/aviso\/pagopar/.test(txt), txt.slice(0, 300));
    P('lista el cobro recién iniciado', /UiOnline/.test(txt) && /Esperando el pago/.test(txt), txt.slice(0, 400));
    await a.screenshot({ path: `${DIR}/cobro-online-panel.png` });
    P('Sin errores en consola (clínica)', err2.length === 0, err2);
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally {
    await db.query("UPDATE clinicas SET cobro_online_activo=false WHERE id=1");
    await b.close(); await db.end(); mock.close();
  }
  void cu;
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
