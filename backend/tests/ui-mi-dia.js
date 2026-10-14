/* global document, window, getComputedStyle */
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
      P(`${tag} Tocar el nombre abre la ficha en una ventana`, await p.locator(`.dova-ventana[data-ventana-ruta="paciente"].activa`).count() === 1);
      P(`${tag} Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    for (const [u, c] of [['admin', 'admin'], ['recep1', 'clave123']]) {
      await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE username=$1", [u]);
      const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, u, c);
      await p.waitForSelector('[data-para-atender] .dova-atender-fila', { timeout: 15000 }); await p.waitForTimeout(800);
      const nums = await p.$$eval('[data-para-atender] .dova-atender-n', (xs) => xs.map((x) => Number(x.textContent.replace(/\D/g, ''))));
      P(`[${u}] Para atender: solo filas con algo pendiente`, nums.length > 0 && nums.every((n) => n > 0), nums);
      P(`[${u}] Con novedades la marca queda de fondo, difuminada (no desaparece)`, await p.locator('[data-inicio-marca]').isVisible() && await p.locator('[data-inicio-marca].atenuada').count() === 1 && Number(await p.$eval('[data-inicio-marca]', (e) => getComputedStyle(e).opacity)) < 0.2);
      await p.waitForTimeout(700);
      P(`[${u}] La marca no tapa los botones`, await p.$eval('[data-para-atender] .dova-atender-fila', (e) => { const r = e.getBoundingClientRect(); const x = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!x && !!x.closest('.dova-atender-fila'); }));
      P(`[${u}] Sin recuadros de números`, await p.locator('.dova-ext-kpi, .dova-cards-grid').count() === 0);
      await p.locator('[data-para-atender] .dova-atender-fila').first().click(); await p.waitForTimeout(1500);
      P(`[${u}] Tocar una fila abre esa sección en una ventana`, await p.locator('.dova-ventana.activa').count() === 1);
      P(`[${u}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    // ---------- Inicio sin nada pendiente: logo y nombre de la clínica ----------
    const vacios = async (page) => {
      const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      await page.route('**/api/reportes/dashboard/alertas', (r) => json(r, { turnosHoy: 0, stockBajo: 0, cuotasVencidas: 0, listaEsperaPendiente: 0, insumosPorVencer: 0, ticketsHelpdeskAbiertos: 0, cajaAbierta: { fecha: h } }));
      await page.route('**/api/seguimiento/panel', (r) => json(r, { recallsVencidos: 0, controlesVencidos: 0, controlesSemana: 0, tratamientosSinTurno: 0, turnosSinConfirmar: 0, cumpleanosHoy: 0 }));
      await page.route('**/api/clinica/puesta-en-marcha', (r) => json(r, { completa: true, oculta: false, listos: 7, total: 7, items: [] }));
      await page.route(/\/api\/pendientes(\?.*)?$/, (r) => json(r, { total: 0 }));
      await page.route('**/api/pendientes/mi-dia**', (r) => json(r, { fecha: h, pacientes: {}, resumen: { pacientes: 0 }, laboratoriosPorLlegar: [] }));
      await page.route('**/api/agenda?**', (r) => json(r, []));
    };
    for (const [u, c, vp] of [['admin', 'admin', { width: 1366, height: 900 }], ['recep1', 'clave123', { width: 1366, height: 900 }], ['odo1', 'clave123', { width: 1366, height: 900 }], ['odo1', 'clave123', { width: 390, height: 844 }], ['admin', 'admin', { width: 390, height: 844 }]]) {
      const tag = `[vacío ${u} ${vp.width}]`;
      await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido='moderno' WHERE username=$1", [u]);
      const ctx = await b.newContext({ viewport: vp, timezoneId: TZ }); const p = await ctx.newPage(); const err = errores(p);
      await vacios(p);
      await p.goto(`${URL0}/moderno/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
      await p.waitForSelector('[data-inicio-marca]:not(.atenuada)', { timeout: 15000 }); await p.waitForTimeout(800);
      const t = (await p.textContent('[data-inicio-marca]')).replace(/\s+/g, '');
      P(`${tag} Aparece el logo y el nombre de la clínica`, t === 'DentCareRC' && await p.locator('[data-inicio-marca] svg').count() === 1, t);
      const caja = await p.locator('[data-inicio-marca]').boundingBox(); const nombre = await p.locator('.dova-inicio-marca-nombre').boundingBox();
      const main = await p.evaluate(() => { const r = document.querySelector('[data-inicio-marca]').parentElement.getBoundingClientRect(); return { x: r.x, w: r.width }; });
      const logo = await p.locator('.dova-inicio-marca-logo svg').boundingBox();
      P(`${tag} Logo más grande que el nombre, nombre debajo, bien a la izquierda`, logo.width > nombre.width && nombre.y > logo.y + logo.height - 1 && caja.x - main.x < main.w * 0.06 && Number(await p.$eval('[data-inicio-marca]', (e) => getComputedStyle(e).opacity)) === 1, { logo, nombre, caja, main });
      P(`${tag} A media altura de la pantalla`, Math.abs((caja.y + caja.height / 2) - vp.height / 2) < vp.height * 0.2, caja);
      P(`${tag} No quedan listas vacías ni "Todo al día"`, await p.locator('[data-para-atender]:visible, .dova-mis-pendientes:visible, .dova-midia-vacio:visible').count() === 0);
      P(`${tag} Sin desborde`, await sinDesborde(p));
      await p.screenshot({ path: `${DIR}/inicio-vacio-${u}-${vp.width}.png` });
      if (u === 'odo1' && vp.width > 800) {
        await p.unroute('**/api/agenda?**');
        await p.click('[data-midia-dia="1"]'); await p.waitForTimeout(1500);
        P(`${tag} Mañana con turnos: la marca se difumina, no desaparece`, (await p.locator('.dova-midia-tabla tbody tr').count()) > 0 && await p.locator('[data-inicio-marca].atenuada').isVisible());
      }
      P(`${tag} Sin errores de consola`, err.length === 0, err);
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
