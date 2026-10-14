/* global document, window, DovaApp */
// Pantallas (Playwright): Finanzas → Avisos de cobro, la página "Mi pago" del
// paciente y el horario de cada odontólogo. Usa el WhatsApp falso (puerto 4600).
const http = require('http');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { enVentana } = require('./ayuda-ventana');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { recibidos.push(JSON.parse(b || '{}')); n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.UIC${n}` }] })); }); });
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const login = async (b, dis, vp, u, c) => {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800); await enVentana(p);
  return { ctx, p, err };
};

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  const suf = String(Date.now() % 1000000); const h = hoy();
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1')");
  const web = await q1('SELECT pagos_activos FROM web_config WHERE clinica_id=1');
  await db.query('UPDATE web_config SET pagos_activos=true WHERE clinica_id=1');
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,$1,'Avisos',$2,$3) RETURNING id", [`Lola${suf}`, `UC${suf}`, `0973${suf}`.slice(0, 10)])).id;
  const pl = (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, entrega, cantidad_cuotas, fecha_inicio, estado) VALUES (1,$1,600000,0,2,$2,'activo') RETURNING id", [pid, sumar(h, -30)])).id;
  const c1 = (await q1("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,1,300000,$2,'pendiente') RETURNING id", [pl, sumar(h, -6)])).id;
  await q1("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,2,300000,$2,'pendiente') RETURNING id", [pl, sumar(h, 24)]);
  const pr = (await q1("INSERT INTO presupuestos (clinica_id, paciente_id, fecha, total, estado, creado_en, actualizado_en) VALUES (1,$1,$2,1800000,'enviado', now() - interval '6 days', now() - interval '6 days') RETURNING id", [pid, sumar(h, -6)])).id;
  await db.query("INSERT INTO presupuesto_items (presupuesto_id, descripcion, pieza, cantidad, precio_unitario) VALUES ($1,'Endodoncia','26',1,1800000)", [pr]);
  const LO = `Lola${suf}`;
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    // ---------- Recepción: Avisos de cobro ----------
    for (const [dis, vp] of [['moderno', { width: 1366, height: 900 }], ['tecnico', { width: 390, height: 844 }]]) {
      await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido=$1 WHERE username='recep1'", [dis]);
      const { ctx, p, err } = await login(b, dis, vp, 'recep1', 'clave123');
      await p.evaluate(() => { window.DovaSubPendiente = 'cobro'; return DovaApp.navegar('finanzas'); });
      await p.waitForSelector('[data-cuotas]', { timeout: 10000 }); await p.waitForTimeout(800);
      const filaC = p.locator('[data-cuotas] tr', { hasText: LO }).filter({ hasText: '6 días de atraso' });
      P(`[${dis}] Avisos de cobro: la cuota vencida aparece con los días de atraso${dis === 'moderno' ? ' y "Toca hoy"' : ' y el aviso ya enviado'}`, await (dis === 'moderno' ? filaC.filter({ hasText: 'Toca hoy' }) : filaC.filter({ hasText: 'Enviado' })).count() === 1);
      P(`[${dis}] El presupuesto sin respuesta también`, await p.locator('[data-press] tr', { hasText: LO }).count() === 1);
      P(`[${dis}] Sin desborde`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
      if (dis === 'moderno') {
        await p.locator('[data-cuotas] tr', { hasText: LO }).locator('[data-cob-enviar]').click(); await p.waitForTimeout(1500);
        P('Enviar: llega a WhatsApp y la fila muestra el aviso', recibidos.length === 1 && await p.locator('[data-cuotas] tr', { hasText: LO }).filter({ hasText: 'Enviado' }).count() === 1);
        const pedidos = []; ctx.on('request', (rq) => { if (/wa\.me|whatsapp/.test(rq.url())) pedidos.push(rq.url()); });
        const [pop] = await Promise.all([p.waitForEvent('popup'), p.locator('[data-press] tr', { hasText: LO }).locator('[data-cob-manual]').click()]);
        await p.waitForTimeout(1500);
        P('"Mandar por mi WhatsApp" abre wa.me con el mensaje y el enlace', pedidos.some((u) => /wa\.me\/595\d+\?text=.*mi-pago/.test(u)), pedidos);
        await pop.close().catch(() => {});
        P('…sin avisos de error (un solo pedido por toque)', !/Ya se le mand/.test((await p.locator('#dova-toasts').textContent().catch(() => '')) || ''));
        await p.screenshot({ path: `${DIR}/cobro-recepcion.png`, fullPage: false });
      } else await p.screenshot({ path: `${DIR}/cobro-celular.png` });
      P(`[${dis}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    // ---------- Admin: configurar ----------
    await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='admin'");
    {
      const { ctx, p, err } = await login(b, 'moderno', { width: 1366, height: 900 }, 'admin', 'admin');
      await p.evaluate(() => { window.DovaSubPendiente = 'cobro'; return DovaApp.navegar('finanzas'); });
      await p.waitForSelector('[data-cob-cfg] summary'); await p.click('[data-cob-cfg] summary');
      P('Configurar: muestra cómo le llega el mensaje', /venció el/.test(await p.textContent('[data-cob-cfg]')));
      await p.selectOption('.dova-cob-form [name=hora]', '9'); await p.selectOption('.dova-cob-form [name=maxAvisos]', '2'); await p.click('.dova-cob-form button'); await p.waitForTimeout(1200);
      const c = await q1('SELECT cobranza_hora, cobranza_max_avisos FROM clinicas WHERE id=1');
      P('Guardar la configuración', c.cobranza_hora === 9 && c.cobranza_max_avisos === 2, c);
      // Horario de un odontólogo
      await p.evaluate(() => { window.DovaSubPendiente = 'odo'; return DovaApp.navegar('catalogo'); });
      await p.waitForSelector('[data-accion]', { timeout: 10000 });
      const fila = p.locator('tr', { has: p.locator('[data-accion]', { hasText: 'Horario' }) }).first();
      const nombre = (await fila.locator('td').first().textContent()).trim();
      const odo = (await q1('SELECT id FROM odontologos WHERE clinica_id=1 AND nombre=$1 ORDER BY id LIMIT 1', [nombre])).id;
      const antes = (await q1('SELECT horarios FROM odontologos WHERE id=$1', [odo])).horarios;
      await fila.locator('[data-accion]', { hasText: 'Horario' }).click(); await p.waitForSelector('[data-horario]');
      await p.uncheck('[data-horario] [data-abre="1"]'); await p.uncheck('[data-horario] [data-abre="3"]');
      await p.screenshot({ path: `${DIR}/horario-odontologo.png` });
      await p.click('[data-horario] button.dova-btn-primary'); await p.waitForTimeout(1200);
      const hh = (await q1('SELECT horarios FROM odontologos WHERE id=$1', [odo])).horarios;
      P('Horario del odontólogo: se guarda sin lunes ni miércoles', hh && hh['1'].length === 0 && hh['3'].length === 0 && hh['2'].length > 0, hh);
      P('…y la lista muestra los días que atiende', /Ma /.test(await fila.textContent()) || await p.locator('tr', { hasText: nombre }).filter({ hasText: 'Ma ' }).count() >= 1);
      await db.query('UPDATE odontologos SET horarios=$2 WHERE id=$1', [odo, antes ? JSON.stringify(antes) : null]);
      P('[admin] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    // ---------- Paciente: página "Mi pago" ----------
    const enlace = recibidos[0].template.components[0].parameters[3].text.replace('http://localhost:4500', URL0);
    const comp = path.join(os.tmpdir(), `comp-${suf}.png`);
    fs.writeFileSync(comp, Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex'));
    const pc = await b.newContext({ viewport: { width: 390, height: 844 } }); const pp = await pc.newPage(); const errW = errores(pp);
    await pp.goto(enlace); await pp.waitForSelector('.tarjeta-pago', { timeout: 10000 });
    const t = await pp.textContent('.tarjeta-pago');
    P('Mi pago: saluda, muestra las cuotas y el presupuesto con su detalle', t.includes(`Hola, ${LO}`) && /Cuota 1 de 2/.test(t) && /Venció/.test(t) && /Endodoncia/.test(t), t.slice(0, 300));
    await pp.screenshot({ path: `${DIR}/mi-pago.png`, fullPage: true });
    await pp.locator('[data-pagar]').first().click(); await pp.waitForSelector('[data-f-pago]');
    await pp.setInputFiles('#p-comp', comp); await pp.click('[data-f-pago] button[type=submit]'); await pp.waitForTimeout(1500);
    P('Manda el comprobante: queda para revisar y la cuota pasa a "En revisión"', !!(await q1("SELECT 1 x FROM web_pagos WHERE cuota_id=$1 AND estado='pendiente'", [c1])) && /En revisión/.test(await pp.textContent('.tarjeta-pago')));
    await pp.locator(`[data-presu="${pr}"] [data-resp="quiero_empezar"]`).click(); await pp.waitForTimeout(1200);
    P('"Quiero empezar": confirma en pantalla', /Te vamos a contactar/.test(await pp.textContent(`[data-presu="${pr}"]`)));
    P('Mi pago: sin desborde ni errores', await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0 && errW.length === 0, errW);
    await pp.goto(`${URL0}/web/mi-pago.html#t=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`); await pp.reload(); await pp.waitForTimeout(1500);
    P('Enlace inválido: lo explica', /No pudimos abrir el enlace/.test(await pp.textContent('[data-vista-pago]')));
    await pc.close(); fs.unlinkSync(comp);
  } finally {
    await b.close();
    await db.query('UPDATE web_config SET pagos_activos=$1 WHERE clinica_id=1', [web.pagos_activos]);
    await db.query('UPDATE clinicas SET cobranza_hora=10, cobranza_max_avisos=3 WHERE id=1');
    await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='recep1'");
    await db.query('DELETE FROM web_pagos WHERE paciente_id=$1', [pid]);
    await db.query('DELETE FROM pacientes WHERE id=$1', [pid]);
  }
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
