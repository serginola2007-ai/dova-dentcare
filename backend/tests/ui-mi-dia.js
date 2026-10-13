/* global document, window, location */
// Pantallas (Playwright): Mi día del odontólogo con lo que hay que tener en
// cuenta de cada paciente (hoy y mañana). Requiere DATABASE_URL, DOVA_URL, DOVA_TZ.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500';
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0);
const login = async (b, vp, u, c, dis = 'moderno') => {
  await db.query('DELETE FROM login_intentos'); await db.query('UPDATE usuarios SET diseno_preferido=$1 WHERE username=$2', [dis, u]);
  const ctx = await b.newContext({ viewport: vp, timezoneId: TZ, hasTouch: vp.width < 800 }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/${dis}/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 });
  return { ctx, p, err };
};

(async () => {
  const suf = String(Date.now() % 1000000); const h = hoy(); const man = sumar(h, 1);
  await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('odo1')");
  const pacs = []; const turnos = [];
  const pac = async (nombre, nac) => { const id = (await q1('INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento) VALUES (1,$1,$2,$3,$4) RETURNING id', [nombre, `Midia${suf}`, `UMD${suf}${pacs.length}`, nac || null])).id; pacs.push(id); return id; };
  const turno = async (p, f, hr) => turnos.push((await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,1,$2,$3,30,'confirmado','Control') RETURNING id", [p, f, hr])).id);
  const ana = await pac('Ana', `1985-${h.slice(5)}`); const beto = await pac('Beto'); const ceci = await pac('Ceci');
  await turno(ana, h, '07:05'); await turno(beto, h, '07:10'); await turno(ceci, man, '07:15');
  await db.query("INSERT INTO paciente_alergias (clinica_id, paciente_id, sustancia, severidad) VALUES (1,$1,'Látex','severa')", [ana]);
  await db.query("INSERT INTO laboratorio (clinica_id, paciente_id, odontologo_id, trabajo, pieza, estado, fecha_estimada) VALUES (1,$1,1,'Corona','21','enviado',$2)", [ana, sumar(h, -2)]);
  await db.query("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,1,$2,'09:00',30,'atendido','Consulta')", [beto, sumar(h, -30)]);
  await db.query("INSERT INTO historia_clinica (clinica_id, paciente_id, odontologo_id, fecha, procedimiento, proxima_accion) VALUES (1,$1,1,$2,'Limpieza','Sellar molares inferiores')", [beto, sumar(h, -30)]);
  const plan = (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, cantidad_cuotas, estado) VALUES (1,$1,200000,1,'activo') RETURNING id", [ceci])).id;
  await db.query("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,1,200000,$2,'pendiente')", [plan, sumar(h, -5)]);
  await db.query("INSERT INTO consentimientos (clinica_id, paciente_id, odontologo_id, procedimiento, texto, estado) VALUES (1,$1,1,'Blanqueamiento','Texto','pendiente')", [ceci]);

  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    for (const [dis, vp] of [['moderno', { width: 1366, height: 900 }], ['minimalista', { width: 1280, height: 860 }], ['tecnico', { width: 1366, height: 900 }], ['mecanico', { width: 1440, height: 900 }], ['moderno', { width: 820, height: 1180 }], ['moderno', { width: 390, height: 844 }]]) {
      const tag = `[${dis} ${vp.width}]`;
      const { ctx, p, err } = await login(b, vp, 'odo1', 'clave123', dis);
      await p.waitForSelector('.dova-midia-tabla', { timeout: 15000 });
      const filaAna = p.locator('.dova-midia-tabla tbody tr', { hasText: `Ana Midia${suf}` });
      const txtAna = await filaAna.textContent();
      P(`${tag} Ana: en la fila solo lo más importante (alergia grave y laboratorio) y "+N más"`, /Alergia: Látex/.test(txtAna) && /Laboratorio sin llegar: Corona pieza 21/.test(txtAna) && !/Primera vez/.test(txtAna) && /\+\d+ más/.test(txtAna), txtAna);
      await filaAna.locator('[data-midia-ver]').click();
      const detAna = await p.locator('.dova-midia-det:not([hidden])').first().textContent();
      P(`${tag} "+N más": primera vez y cumpleaños`, /Primera vez/.test(detAna) && /Cumple \d+ años/.test(detAna), detAna);
      await filaAna.locator('[data-midia-ver]').click();
      const filaBeto = p.locator('.dova-midia-tabla tbody tr', { hasText: `Beto Midia${suf}` });
      P(`${tag} Beto: no es primera vez`, !/Primera vez/.test(await filaBeto.textContent()));
      await filaBeto.locator('[data-midia-ver]').click();
      const det = p.locator('.dova-midia-det:not([hidden])');
      P(`${tag} "Ver más": última visita y próximo paso`, /Próximo paso indicado:\s*Sellar molares inferiores/.test(await det.textContent()), await det.textContent());
      const sub = await p.textContent('.dova-midia .dova-inicio-sub');
      P(`${tag} Una sola línea de resumen (sin recuadros)`, /con alerta médica/.test(sub) && /sin el trabajo de laboratorio/.test(sub) && await p.locator('.dova-ext-kpi').count() === 0, sub);
      P(`${tag} Botón "Iniciar consulta" en los turnos de hoy`, await filaAna.locator('[data-ir-consulta]').count() === 1);
      P(`${tag} Laboratorio por llegar: la corona atrasada`, /Corona · pieza 21[\s\S]*Atrasado/.test(await p.locator('.dova-midia-labs').textContent()));
      P(`${tag} Saludo sin el título ("Buenas …, Carmen")`, /^Buen[ao]s? (días|tardes|noches), (?!Dra)/.test((await p.textContent('.dova-view-title')).trim()));
      P(`${tag} Pendientes: filas cerradas hasta tocarlas`, await p.locator('.dova-mis-pendientes .dova-atender-panel:not([hidden])').count() === 0);
      if (vp.width === 1366 && dis === 'moderno') await p.screenshot({ path: `${DIR}/midia-hoy.png`, fullPage: true });
      P(`${tag} Sin desborde horizontal (hoy)`, await sinDesborde(p));
      await p.click('[data-midia-dia="1"]');
      await p.waitForSelector('.dova-midia-tabla tbody tr >> text=Ceci', { timeout: 10000 });
      const filaCeci = p.locator('.dova-midia-tabla tbody tr', { hasText: `Ceci Midia${suf}` });
      const txtCeci = await filaCeci.textContent();
      P(`${tag} Mañana: Ceci con pagos atrasados (sin monto) y consentimiento por firmar`, /Pagos atrasados/.test(txtCeci) && !/Gs\./.test(txtCeci) && /Falta firmar: Blanqueamiento/.test(txtCeci), txtCeci);
      P(`${tag} Mañana: sin botón de consulta y Ana no aparece`, await filaCeci.locator('[data-ir-consulta]').count() === 0 && await p.locator('.dova-midia-tabla tbody tr', { hasText: `Ana Midia${suf}` }).count() === 0);
      if (vp.width === 390) await p.screenshot({ path: `${DIR}/midia-celular.png`, fullPage: true });
      P(`${tag} Sin desborde horizontal (mañana)`, await sinDesborde(p));
      await p.click('[data-midia-dia="0"]'); await p.waitForSelector(`.dova-midia-tabla tbody tr >> text=Ana Midia${suf}`, { timeout: 10000 });
      await filaAna.locator('[data-ir-paciente]').click(); await p.waitForTimeout(1200);
      P(`${tag} Tocar el nombre abre la ficha`, (await p.evaluate(() => location.hash)).startsWith(`#paciente/${ana}`));
      P(`${tag} Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    for (const [u, c] of [['admin', 'admin'], ['recep1', 'clave123']]) {
      await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE username=$1", [u]);
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, u, c);
      await p.waitForSelector('[data-para-atender] .dova-atender-fila', { timeout: 15000 }); await p.waitForTimeout(800);
      const nums = await p.$$eval('[data-para-atender] .dova-atender-n', (xs) => xs.map((x) => Number(x.textContent.replace(/\D/g, ''))));
      P(`[${u}] Para atender: solo filas con algo pendiente`, nums.length > 0 && nums.every((n) => n > 0), nums);
      P(`[${u}] Sin recuadros de números`, await p.locator('.dova-ext-kpi, .dova-cards-grid').count() === 0);
      await p.locator('[data-para-atender] .dova-atender-fila').first().click(); await p.waitForTimeout(1500);
      P(`[${u}] Tocar una fila lleva a esa sección`, !(await p.evaluate(() => location.hash)).startsWith('#dashboard'), await p.evaluate(() => location.hash));
      P(`[${u}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
  } finally {
    await b.close();
    const c = await db.connect();
    try { await c.query('BEGIN'); await c.query("SET LOCAL dova.borrando_paciente='on'"); await c.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); console.error('limpieza', e.message); } finally { c.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
