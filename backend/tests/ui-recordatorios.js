/* global document, window, DovaApp */
// Pantallas (Playwright): Seguimiento → Recordatorios de turnos y la página
// "Mi turno" del paciente. Usa el mismo WhatsApp falso (puerto 4600) y el mismo
// servidor de prueba que recordatorios.test.js. Requiere DATABASE_URL, DOVA_URL,
// DOVA_TZ, PLAYWRIGHT_MODULE / CHROMIUM_PATH y CAPTURAS (opcional).
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { recibidos.push(JSON.parse(b || '{}')); n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.UI${n}` }] })); }); });

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await db.query("DELETE FROM pacientes WHERE apellido='Recordatorio' AND ci LIKE 'RU%'");
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','odo1'); UPDATE clinicas SET recordatorio_auto=false, recordatorio_hora=10, recordatorio_dias=1 WHERE id=1");
  const suf = String(Date.now() % 1000000);
  const manana = sumar(hoy(), 1);
  const odo = (await q1('SELECT id FROM odontologos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1')).id;
  const ids = [];
  const LU = `Lucía${suf}`; const MA = `Mario${suf}`; const NO = `Nora${suf}`;
  for (const [nom, hora] of [[LU, '05:00'], [MA, '05:30'], [NO, '06:00']]) {
    const p = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,$1,'Recordatorio',$2,$3) RETURNING id", [nom, `RU${suf}${nom.slice(0, 2)}`, `0981${suf}`.slice(0, 10)])).id;
    ids.push((await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo, sala) VALUES (1,$1,$2,$3,$4,30,'reservado','Control',$5) RETURNING id", [p, odo, manana, hora, `U${suf}${hora}`])).id);
  }
  try {
    for (const [dis, vp] of [['moderno', { width: 1366, height: 900 }], ['tecnico', { width: 390, height: 844 }], ['minimalista', { width: 820, height: 1180 }]]) {
      await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido=$1 WHERE username='recep1'", [dis]);
      const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
      p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
      await p.goto(`${URL0}/${dis}/index.html`); await p.waitForSelector('#login-username');
      await p.fill('#login-username', 'recep1'); await p.fill('#login-password', 'clave123'); await p.click('#form-login button[type=submit]');
      await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 10000 }); await p.waitForTimeout(800);
      await p.evaluate(() => { window.DovaSubPendiente = 'recordatorios'; return DovaApp.navegar('seguimiento'); });
      await p.waitForSelector('.dova-rec-estado', { timeout: 10000 }); await p.waitForTimeout(1200);
      // El navegador calcula "mañana" con la hora de Paraguay; el servidor de prueba usa otro huso: se elige el día a mano.
      await p.fill('[data-f] [name=fecha]', manana); await p.click('[data-f] button'); await p.waitForTimeout(1200);
      P(`[${dis}] Muestra WhatsApp Business conectado y el estado del envío automático`, /conectado/.test(await p.textContent('.dova-rec-estado')) && /apagado/.test(await p.textContent('.dova-rec-estado')));
      P(`[${dis}] Lista los turnos de mañana`, await p.locator('main tr', { hasText: LU }).count() === 1);
      P(`[${dis}] Sin desborde`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
      if (dis === 'moderno') {
        await p.locator('main tr', { hasText: LU }).locator('[data-enviar]').click(); await p.waitForTimeout(1500);
        P('Enviar: el turno queda "Enviado" y llegó a WhatsApp', await p.locator('main tr', { hasText: LU }).locator('text=Enviado').count() >= 1 && recibidos.length === 1);
        P('…ya no ofrece "Enviar" de nuevo', await p.locator('main tr', { hasText: LU }).locator('[data-enviar]').count() === 0);
        const pedidos = [];
        ctx.on('request', (rq) => { if (/wa\.me|whatsapp/.test(rq.url())) pedidos.push(rq.url()); });
        const [pop] = await Promise.all([p.waitForEvent('popup'), p.locator('main tr', { hasText: MA }).locator('[data-manual]').click()]);
        await p.waitForTimeout(2000);
        const urlPop = pedidos[0] || pop.url();
        P('"Mandar por mi WhatsApp" abre wa.me con el mensaje y el enlace', /wa\.me\/595\d+\?text=/.test(urlPop) || /whatsapp/.test(urlPop), urlPop);
        await pop.close().catch(() => {});
        await p.screenshot({ path: `${DIR}/rec-moderno.png`, fullPage: true });
      }
      if (dis === 'tecnico') await p.screenshot({ path: `${DIR}/rec-celular.png`, fullPage: true });
      P(`[${dis}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    // Configuración (admin)
    await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='admin'");
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
    await p.goto(`${URL0}/moderno/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForTimeout(800);
    await p.evaluate(() => { window.DovaSubPendiente = 'recordatorios'; return DovaApp.navegar('seguimiento'); });
    await p.waitForSelector('.dova-rec-config summary'); await p.click('.dova-rec-config summary');
    P('Configurar: muestra cómo le llega el mensaje al paciente, con el enlace', /mi-turno\.html#t=/.test(await p.textContent('.dova-rec-ejemplo')));
    await p.check('[data-cfg] [name=automatico]'); await p.selectOption('[data-cfg] [name=hora]', '9'); await p.click('[data-cfg] button'); await p.waitForTimeout(1200);
    const c = await q1('SELECT recordatorio_auto, recordatorio_hora FROM clinicas WHERE id=1');
    P('Guardar: envío automático a las 9 h', c.recordatorio_auto === true && c.recordatorio_hora === 9, c);
    P('…el estado de arriba lo refleja', /9 h/.test(await p.textContent('.dova-rec-estado')));
    await db.query('UPDATE odontologos SET whatsapp_numero=NULL, whatsapp_phone_id=NULL, whatsapp_envia=false WHERE id=$1', [odo]);
    await p.click('[data-remitentes] summary'); await p.waitForSelector(`[data-remitentes] tr[data-odo="${odo}"]`);
    const fila = p.locator(`[data-remitentes] tr[data-odo="${odo}"]`);
    await fila.locator('[name=envia]').check(); await fila.locator('[data-guardar-rem]').click(); await p.waitForTimeout(1000);
    P('WhatsApp de cada odontólogo: "enviar desde su número" sin el ID de Meta avisa y no guarda', (await q1('SELECT whatsapp_envia FROM odontologos WHERE id=$1', [odo])).whatsapp_envia === false && /Meta|ID/i.test(await p.textContent('#dova-toasts')));
    await fila.locator('[name=envia]').check(); await fila.locator('[name=numero]').fill('0981 555 666'); await fila.locator('[name=phoneId]').fill('4445556667'); await fila.locator('[data-guardar-rem]').click(); await p.waitForTimeout(1000);
    const o = await q1('SELECT whatsapp_numero, whatsapp_phone_id, whatsapp_envia FROM odontologos WHERE id=$1', [odo]);
    P('…con número e ID: queda conectado', o.whatsapp_envia === true && o.whatsapp_phone_id === '4445556667', o);
    await p.evaluate(() => { window.DovaSubPendiente = 'recordatorios'; return DovaApp.navegar('seguimiento'); }); await p.waitForTimeout(1500);
    await p.fill('[data-f] [name=fecha]', manana); await p.click('[data-f] button'); await p.waitForTimeout(1200);
    P('La lista muestra de qué número sale cada recordatorio', await p.locator('main tr', { hasText: NO }).filter({ hasText: '555 666' }).count() === 1 && await p.locator('main tr', { hasText: MA }).filter({ hasText: /A mano/ }).count() === 1);
    await ctx.close();
    // El doctor: su WhatsApp y sus turnos
    await db.query("DELETE FROM login_intentos; UPDATE usuarios SET diseno_preferido='minimalista' WHERE username='odo1'");
    await db.query('UPDATE odontologos SET whatsapp_numero=NULL, whatsapp_phone_id=NULL, whatsapp_envia=false WHERE id=$1', [odo]);
    const cd = await b.newContext({ viewport: { width: 390, height: 844 } }); const pd = await cd.newPage(); const errD = [];
    pd.on('pageerror', (e) => errD.push(e.message)); pd.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) errD.push(m.text()); });
    await pd.goto(`${URL0}/minimalista/index.html`); await pd.fill('#login-username', 'odo1'); await pd.fill('#login-password', 'clave123'); await pd.click('#form-login button[type=submit]');
    await pd.waitForSelector('#shell-root:not([style*="display: none"])'); await pd.waitForTimeout(800);
    await pd.evaluate(() => DovaApp.navegar('configuracion')); await pd.waitForSelector('.dova-mi-whatsapp', { timeout: 10000 });
    P('Doctor: Configuración muestra "Mi WhatsApp para recordatorios"', /Todavía no registraste/.test(await pd.textContent('.dova-mi-whatsapp')));
    await pd.fill('#mi-wa-numero', '0981 777 888'); await pd.click('.dova-mi-whatsapp button'); await pd.waitForTimeout(1200);
    P('…guarda su número', /777/.test((await q1('SELECT whatsapp_numero FROM odontologos WHERE id=$1', [odo])).whatsapp_numero || ''));
    P('…y le explica cómo salen los recordatorios', /desde tu celular/.test(await pd.textContent('.dova-mi-whatsapp')));
    await pd.evaluate(() => { window.DovaSubPendiente = 'recordatorios'; return DovaApp.navegar('seguimiento'); }); await pd.waitForTimeout(2000);
    await pd.fill('[data-f] [name=fecha]', manana); await pd.click('[data-f] button'); await pd.waitForTimeout(1200);
    P('Doctor: ve los recordatorios de sus pacientes', await pd.locator('main tr', { hasText: MA }).count() === 1 && await pd.locator('[data-cfgbox] details, .dova-rec-config').count() === 0);
    P('Doctor (celular): sin desborde ni errores', await pd.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0 && errD.length === 0, errD);
    await pd.screenshot({ path: `${DIR}/rec-doctor.png`, fullPage: true });
    await cd.close();
    await db.query('UPDATE odontologos SET whatsapp_numero=NULL, whatsapp_phone_id=NULL, whatsapp_envia=false WHERE id=$1', [odo]);
    // Página del paciente: el enlace del mensaje
    const enlace = recibidos[0].template.components[0].parameters[4].text;
    const pc = await b.newContext({ viewport: { width: 390, height: 844 } }); const pp = await pc.newPage(); const errW = [];
    pp.on('pageerror', (e) => errW.push(e.message));
    await pp.goto(enlace.replace('http://localhost:4500', URL0)); await pp.waitForSelector('.tarjeta-turno', { timeout: 10000 });
    P('El paciente abre el enlace y ve su turno', (await pp.textContent('.tarjeta-turno')).includes(LU) && await pp.locator('[data-confirmar]').count() === 1);
    await pp.click('[data-confirmar]'); await pp.waitForTimeout(1500);
    P('Confirma con un toque: el turno queda confirmado en DOVA', (await q1('SELECT confirmacion FROM turnos WHERE id=$1', [ids[0]])).confirmacion === 'confirmado');
    await pp.screenshot({ path: `${DIR}/rec-paciente.png`, fullPage: true });
    P('Página del paciente sin errores ni desborde', errW.length === 0 && await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, errW);
    await pc.close();
  } finally {
    await db.query('DELETE FROM turnos WHERE id = ANY($1::int[])', [ids]);
    await db.query("DELETE FROM pacientes WHERE apellido='Recordatorio' AND ci LIKE 'RU%'");
    await db.query('UPDATE clinicas SET recordatorio_auto=false, recordatorio_hora=10 WHERE id=1');
  }
  await b.close(); meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
