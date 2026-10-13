/* global document, window, DovaApp, DOVA */
// Pantallas (Playwright): Mensajes automáticos (configuración, turnos liberados,
// control con enlace), páginas del paciente (tomar turno, reservar control,
// encuesta), presupuesto desde el odontograma y visor de radiografías.
// Usa el WhatsApp falso (puerto 4600). Requiere DATABASE_URL, DOVA_URL, DOVA_TZ, RX_DIR (dos PNG de prueba).
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500'; const B = `${URL0}/api`;
const DIR = process.env.CAPTURAS || os.tmpdir(); const RX = process.env.RX_DIR || DIR; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { recibidos.push(JSON.parse(b || '{}')); n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.UIM${n}` }] })); }); });
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0);
const login = async (b, vp, u, c, dis = 'moderno') => {
  await db.query('DELETE FROM login_intentos'); await db.query('UPDATE usuarios SET diseno_preferido=$1 WHERE username=$2', [dis, u]);
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
  return { ctx, p, err };
};

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  const suf = String(Date.now() % 1000000); const h = hoy();
  await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','odo1')");
  const cfgAntes = await q1('SELECT lista_espera_auto, controles_auto, encuesta_auto, mensajes_hora, resena_url FROM clinicas WHERE id=1');
  const webAntes = await q1('SELECT reservas_activas FROM web_config WHERE clinica_id=1');
  await db.query('UPDATE web_config SET reservas_activas=true WHERE clinica_id=1');
  await db.query('UPDATE clinicas SET lista_espera_auto=false, controles_auto=false, encuesta_auto=false WHERE id=1');
  const odo = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1,$1) RETURNING id", [`Dra. Pantalla Msj ${suf}`])).id;
  const tel = (k) => `09${k}${suf}`.slice(0, 10);
  const pac = async (nombre, k) => (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,$1,'Pantalla',$2,$3) RETURNING id", [nombre, `UM${suf}${k}`, tel(k)])).id;
  const pT = await pac('Tito', 81); const pL = await pac(`Lara${suf}`, 82); const pR = await pac('Rosa', 83); const pE = await pac('Elsa', 84); const pO = await pac('Olga', 85);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    // ---------- Admin: configuración ----------
    {
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, 'admin', 'admin');
      await p.evaluate(() => DovaApp.navegar('configuracion')); await p.waitForSelector('#cfg-mensajes', { timeout: 10000 });
      P('Configuración → Mensajes automáticos con los 3 mensajes y su ejemplo', await p.locator('#cfg-mensajes .dova-msg-op').count() === 3 && /Se liberó un turno/.test(await p.textContent('#cfg-mensajes')));
      await p.check('#cfg-mensajes [name=listaEspera]'); await p.fill('#msg-resena', 'https://g.page/r/prueba/review');
      await p.click('#cfg-mensajes button.dova-btn-primary'); await p.waitForTimeout(1200);
      const c = await q1('SELECT lista_espera_auto, resena_url FROM clinicas WHERE id=1');
      P('…guarda', c.lista_espera_auto === true && /g\.page/.test(c.resena_url), c);
      await p.locator('#cfg-mensajes').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${DIR}/mensajes-config.png` });
      P('[admin] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    // ---------- Turno liberado: recepción cancela, la lista recibe la oferta ----------
    const fecha = sumar(h, 3);
    const tT = (await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'11:00',30,'reservado','Control') RETURNING id", [pT, odo, fecha])).id;
    await db.query("INSERT INTO lista_espera (clinica_id, paciente_id, odontologo_id, prioridad, estado) VALUES (1,$1,$2,'alta','esperando')", [pL, odo]);
    {
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, 'recep1', 'clave123');
      await p.evaluate(async (id) => { await DOVA.patch(`/agenda/${id}/estado`, { estado: 'cancelado' }); }, tT);
      await p.waitForTimeout(1500);
      await p.evaluate(() => { window.DovaSubPendiente = 'espera'; return DovaApp.navegar('agenda'); });
      await p.waitForSelector('.dova-ofertas', { timeout: 10000 });
      const t = await p.textContent('.dova-ofertas');
      P('Agenda → Lista de espera muestra el turno liberado y a quién se ofreció', /Turnos liberados/.test(t) && t.includes(`Lara${suf}`) && /Ofrecido/.test(t), t.slice(0, 300));
      await p.screenshot({ path: `${DIR}/turnos-liberados.png` });
      P('[recepción] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    const mL = recibidos.find((x) => x.to === `595${tel(82).slice(1)}`);
    P('El paciente de la lista recibió el WhatsApp con el enlace', !!mL);
    // Paciente: tomar el turno (celular)
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const err = errores(p);
      await p.goto(mL.template.components[0].parameters[3].text.replace('http://localhost:4500', URL0)); await p.waitForSelector('[data-tomar]', { timeout: 10000 });
      P('Tomar turno: muestra el horario y "Quiero este turno"', /11:00/.test(await p.textContent('[data-vista-oferta]')));
      await p.screenshot({ path: `${DIR}/tomar-turno.png`, fullPage: true });
      await p.click('[data-tomar]'); await p.waitForURL(/mi-turno\.html#t=/, { timeout: 10000 }); await p.waitForSelector('.tarjeta-turno');
      P('…al tocarlo queda reservado y confirmado ("Mi turno")', /Confirmado/.test(await p.textContent('.tarjeta-turno')));
      P('Tomar turno: sin desborde ni errores', await sinDesborde(p) && err.length === 0, err);
      await ctx.close();
    }
    // ---------- Control: enlace a mano desde Seguimiento y reserva del paciente ----------
    const tipo = await q1('SELECT id, nombre FROM recall_tipos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1');
    await db.query("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, estado, odontologo_id) VALUES (1,$1,$2,$3,'activo',$4)", [pR, tipo.id, sumar(h, -2), odo]);
    let enlaceControl = null;
    {
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, 'recep1', 'clave123');
      const pedidos = []; ctx.on('request', (rq) => { if (/wa\.me/.test(rq.url())) pedidos.push(rq.url()); });
      await p.evaluate(() => { window.DovaSubPendiente = 'recalls'; return DovaApp.navegar('seguimiento'); });
      await p.waitForTimeout(2500);
      const fila = p.locator('tr', { hasText: 'Rosa Pantalla' }).first();
      P('Controles periódicos: botón "Mandar enlace para reservar"', await fila.locator('[data-enlace-control]').count() === 1);
      const [pop] = await Promise.all([p.waitForEvent('popup'), fila.locator('[data-enlace-control]').click()]);
      await p.waitForTimeout(1500); await pop.close().catch(() => {});
      enlaceControl = decodeURIComponent((pedidos[0] || '').split('text=')[1] || '').match(/https?:\/\/\S+reservar\.html#c=[\w-]+/);
      P('…abre WhatsApp con el mensaje y el enlace para reservar', !!enlaceControl, pedidos);
      P('[seguimiento] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    if (enlaceControl) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const err = errores(p);
      await p.goto(enlaceControl[0].replace('http://localhost:4500', URL0)); await p.waitForSelector('.aviso-control', { timeout: 10000 });
      P('Reservar control: saluda por el nombre y no pide datos', /Hola, Rosa/.test(await p.textContent('.aviso-control')));
      // Elegir profesional (si hace falta), día y hora
      if (await p.locator(`[data-o="${odo}"]`).count()) await p.click(`[data-o="${odo}"]`);
      await p.waitForSelector('[data-dia].libre', { timeout: 10000 }); await p.locator('[data-dia].libre').first().click();
      await p.waitForSelector('[data-hora]', { timeout: 10000 }); await p.locator('[data-hora]').first().click();
      await p.waitForSelector('[data-confirmar-control]');
      P('…paso final: "Reservás como Rosa", sin formulario de datos', /Reservás como/.test(await p.textContent('[data-reserva]')) && await p.locator('[data-form-reserva]').count() === 0);
      await p.screenshot({ path: `${DIR}/reservar-control.png`, fullPage: true });
      await p.click('[data-confirmar-control]'); await p.waitForURL(/mi-turno\.html#t=/, { timeout: 10000 });
      P('…queda el turno reservado', !!(await q1("SELECT 1 x FROM turnos WHERE paciente_id=$1 AND fecha >= $2 AND estado IN ('reservado','confirmado')", [pR, h])));
      P('Reservar control: sin desborde ni errores', await sinDesborde(p) && err.length === 0, err);
      await ctx.close();
    }
    // ---------- Encuesta ----------
    await db.query("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'09:00',30,'atendido','Control')", [pE, odo, sumar(h, -1)]);
    await db.query('UPDATE clinicas SET encuesta_auto=true, mensajes_hora=8 WHERE id=1');
    await fetch(`${B}/recordatorios/cron`, { method: 'POST', headers: { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' } });
    const mE = recibidos.find((x) => x.to === `595${tel(84).slice(1)}`);
    P('La encuesta salió por WhatsApp', !!mE);
    if (mE) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const err = errores(p);
      await p.goto(mE.template.components[0].parameters[3].text.replace('http://localhost:4500', URL0)); await p.waitForSelector('.nps', { timeout: 10000 });
      P('Encuesta: botones del 0 al 10', await p.locator('.nps-n').count() === 11);
      await p.screenshot({ path: `${DIR}/encuesta.png`, fullPage: true });
      await p.click('.nps-n[data-n="10"]'); await p.click('[data-enviar]'); await p.waitForTimeout(1500);
      P('Con 10: agradece y ofrece dejar la reseña en Google', /Dejar mi opinión en Google/.test(await p.textContent('[data-vista-encuesta]')));
      P('Encuesta: sin desborde ni errores', await sinDesborde(p) && err.length === 0, err);
      await ctx.close();
    }
    // ---------- Presupuesto desde el odontograma + visor ----------
    await db.query("INSERT INTO odontograma_piezas (clinica_id, paciente_id, pieza, superficie, estado) VALUES (1,$1,'16','general','caries'), (1,$1,'36','general','extraccion_indicada')", [pO]);
    for (const [arch, pieza] of [['rx1.png', '16'], ['rx2.png', '36']]) {
      const buf = fs.readFileSync(path.join(RX, arch));
      await db.query("INSERT INTO estudios (clinica_id, paciente_id, tipo, pieza, fecha, archivo, mime, tamano, nombre_archivo) VALUES (1,$1,'periapical',$2,$3,$4,'image/png',$5,$6)", [pO, pieza, h, buf, buf.length, arch]);
    }
    await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username='odo1'");
    {
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, 'admin', 'admin');
      await p.evaluate((id) => DovaApp.navegar('paciente', id), pO); await p.waitForTimeout(1500);
      await p.click('#ficha-tabs [data-tab="odontograma"], .dova-tab[data-tab="odontograma"]'); await p.waitForTimeout(600);
      await p.click('[data-modo-pres]'); await p.waitForSelector('.dova-odo-pres-lista:not([hidden])');
      await p.click('[data-marcar-hallazgos]'); await p.waitForTimeout(300);
      const filas = await p.locator('[data-fila-pieza]').count();
      P('Odontograma: "Marcar las piezas con hallazgos" suma la 16 (caries) y la 36 (extracción indicada)', filas === 2 && await p.locator('.dova-pieza-elegida').count() === 2, filas);
      const sel36 = await p.locator('[data-fila-pieza="36"] [data-trat-pieza]').inputValue();
      P('…sugiere el tratamiento según el hallazgo (extracción para la 36)', !!sel36 && /extrac/i.test(await p.locator(`[data-fila-pieza="36"] [data-trat-pieza] option[value="${sel36}"]`).textContent()), sel36);
      const sel16 = await p.locator('[data-fila-pieza="16"] [data-trat-pieza]').inputValue();
      if (!sel16) await p.selectOption('[data-fila-pieza="16"] [data-trat-pieza]', { index: 1 });
      await p.screenshot({ path: `${DIR}/odontograma-presupuesto.png` });
      await p.click('[data-crear-pres]'); await p.waitForSelector('[data-pres]');
      const items = await p.locator('[data-pres] [data-items] tr').count();
      P('Crear presupuesto: abre el presupuesto con las 2 piezas y sus precios', items === 2 && await p.locator('[data-pres] [data-pieza]').first().inputValue() !== '');
      await p.click('[data-pres] button.dova-btn-primary'); await p.waitForTimeout(1500);
      const pr = await q1('SELECT p.id, (SELECT count(*) FROM presupuesto_items i WHERE i.presupuesto_id=p.id)::int AS n, (SELECT string_agg(i.pieza, \',\' ORDER BY i.pieza) FROM presupuesto_items i WHERE i.presupuesto_id=p.id) AS piezas FROM presupuestos p WHERE p.paciente_id=$1', [pO]);
      P('…se guarda con las piezas 16 y 36', pr && pr.n === 2 && pr.piezas === '16,36', pr);
      // Visor
      await p.click('#ficha-tabs [data-tab="fotos"], .dova-tab[data-tab="fotos"]').catch(() => {});
      await p.waitForSelector('[data-abrir-visor]', { timeout: 10000 });
      await p.click('[data-abrir-visor]'); await p.waitForSelector('.dova-visor [data-img]'); await p.waitForTimeout(1500);
      P('Visor: abre la radiografía a pantalla completa', await p.evaluate(() => { const i = document.querySelector('.dova-visor [data-area="a"] img'); return i && i.naturalWidth === 800; }));
      const z0 = await p.textContent('[data-zoom]'); await p.click('[data-z="+"]'); const z1 = await p.textContent('[data-zoom]');
      P('…zoom con el botón', z0 !== z1, [z0, z1]);
      await p.fill('[data-contraste]', '180'); await p.click('[data-negativo]');
      P('…contraste y negativo', /contrast\(180%\).*invert\(1\)/.test(await p.evaluate(() => document.querySelector('.dova-visor [data-area="a"] img').style.filter)));
      await p.click('[data-medir]');
      const box = await p.locator('.dova-visor [data-area="a"] [data-svg]').boundingBox();
      await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5); await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
      P('…medir: dibuja la línea con su medida', await p.locator('.dova-visor-medida').count() === 1 && /\d+ px/.test(await p.textContent('.dova-visor-medida text')));
      await p.click('[data-calibrar]');
      await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.7); await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.7);
      await p.fill('[data-mm]', '10'); await p.click('[data-calib] button:not([type=button])'); await p.waitForTimeout(300);
      P('…calibrar: las medidas pasan a milímetros', /mm/.test(await p.textContent('.dova-visor-medida text')));
      await p.click('[data-comparar]'); await p.waitForTimeout(1500);
      P('…comparar: dos radiografías lado a lado', await p.evaluate(() => !document.querySelector('.dova-visor [data-area="b"]').hidden && document.querySelector('.dova-visor [data-area="b"] img').naturalWidth === 800));
      await p.screenshot({ path: `${DIR}/visor-radiografias.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      P('…Esc cierra el visor', await p.locator('.dova-visor').count() === 0);
      P('[odontograma y visor] Sin errores de consola', err.length === 0, err);
      await ctx.close();
    }
    // Visor en el celular
    {
      const { ctx, p, err } = await login(b, { width: 390, height: 844 }, 'admin', 'admin', 'tecnico');
      await p.evaluate((id) => DovaApp.navegar('paciente', id), pO); await p.waitForTimeout(1500);
      await p.click('.dova-tab[data-tab="fotos"], [data-tab="fotos"]').catch(() => {});
      await p.waitForSelector('[data-abrir-visor]', { timeout: 10000 }); await p.click('[data-abrir-visor]'); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${DIR}/visor-celular.png` });
      P('Visor en el celular: sin desborde ni errores', await sinDesborde(p) && err.length === 0, err);
      await ctx.close();
    }
  } finally {
    await b.close();
    await db.query('UPDATE clinicas SET lista_espera_auto=$1, controles_auto=$2, encuesta_auto=$3, mensajes_hora=$4, resena_url=$5 WHERE id=1', [cfgAntes.lista_espera_auto, cfgAntes.controles_auto, cfgAntes.encuesta_auto, cfgAntes.mensajes_hora, cfgAntes.resena_url]);
    await db.query('UPDATE web_config SET reservas_activas=$1 WHERE clinica_id=1', [webAntes.reservas_activas]);
    await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username IN ('admin','recep1')");
    await db.query('DELETE FROM ofertas_turno WHERE odontologo_id=$1', [odo]);
    await db.query('DELETE FROM turnos WHERE odontologo_id=$1 OR paciente_id IN (SELECT id FROM pacientes WHERE ci LIKE $2)', [odo, `UM${suf}%`]);
    await db.query("SET dova.borrando_paciente='on'; DELETE FROM pacientes WHERE ci LIKE '" + `UM${suf}` + "%'; RESET dova.borrando_paciente");
    await db.query('DELETE FROM odontologos WHERE id=$1', [odo]).catch(() => {});
  }
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
