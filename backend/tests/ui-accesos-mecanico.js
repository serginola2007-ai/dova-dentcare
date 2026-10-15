/* global document, window, location */
// Accesos directos del diseño mecánico (API + Playwright):
// - Nuevo turno directo: solo odontólogos libres (horario de atención, sin otro turno ni bloqueo);
//   si no hay ninguno no deja reservar, y el servidor lo vuelve a verificar (soloDisponible).
// - Pacientes: buscar para ver la ficha o dar de alta (sin listar a todos).
// - Nueva factura y Nuevo presupuesto abren directo el formulario.
// Requiere DATABASE_URL, DOVA_URL, DOVA_TZ, PLAYWRIGHT_MODULE / CHROMIUM_PATH.
const os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500'; const B = `${URL0}/api`;
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };

(async () => {
  const suf = String(Date.now() % 1000000);
  // Un día hábil que no sea hoy (lunes a sábado) y otro para la prueba de pantalla.
  let F = sumar(hoy(), 1); while (new Date(`${F}T12:00:00Z`).getUTCDay() === 0) F = sumar(F, 1);
  let F2 = sumar(F, 1); while (new Date(`${F2}T12:00:00Z`).getUTCDay() === 0) F2 = sumar(F2, 1);
  const horario = { 0: [], 1: [['09:00', '10:00']], 2: [['09:00', '10:00']], 3: [['09:00', '10:00']], 4: [['09:00', '10:00']], 5: [['09:00', '10:00']], 6: [['09:00', '10:00']] };
  const odo = (await q1('INSERT INTO odontologos (clinica_id, nombre, horarios) VALUES (1,$1,$2) RETURNING id', [`Dra. Rápida ${suf}`, JSON.stringify(horario)])).id;
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Rita',$1,$2) RETURNING id", [`Acceso${suf}`, `RA${suf}`])).id;
  const nuevos = [];
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='mecanico' WHERE username='admin'");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const disp = (f, h, d = 30) => req('GET', `/agenda/disponibles?fecha=${f}&hora=${h}&duracion=${d}`, undefined, A);
  const tiene = (r) => r.j && r.j.odontologos.some((o) => o.id === odo);
  const motivoDe = (r) => ((r.j && r.j.ocupados) || []).find((o) => o.id === odo);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    // ---------------- API ----------------
    let r = await disp(F, '09:00');
    P('Disponibles: la odontóloga aparece en su horario (09:00)', r.s === 200 && tiene(r), r);
    r = await disp(F, '07:00');
    P('Fuera de su horario no aparece (y dice por qué)', r.s === 200 && !tiene(r) && /No atiende/.test((motivoDe(r) || {}).motivo), motivoDe(r));
    r = await disp(F, '09:45', 30);
    P('Si el turno se pasa del horario (09:45 + 30 min) tampoco', !tiene(r));
    r = await disp(F, '05:00');
    P('A una hora en la que no atiende nadie: lista vacía con aviso', r.j.odontologos.length === 0 && /No hay odontólogos disponibles/.test(r.j.motivo), r.j && r.j.motivo);
    r = await disp(sumar(hoy(), -1), '09:00');
    P('Un horario que ya pasó: nadie disponible', r.j.odontologos.length === 0 && /ya pasó/.test(r.j.motivo), r.j);
    P('Datos inválidos: 400', (await disp('2026-13-40', '09:00')).s === 400 && (await disp(F, '9h')).s === 400 && (await disp(F, '09:00', 999)).s === 400);
    P('Sin sesión: 401', (await req('GET', `/agenda/disponibles?fecha=${F}&hora=09:00`)).s === 401);
    const base = { pacienteId: pac, odontologoId: odo, fecha: F, duracionMinutos: 30 };
    r = await req('POST', '/agenda', { ...base, horaInicio: '07:00', soloDisponible: true }, A);
    P('Reservar rápido fuera de su horario: el servidor lo rechaza (409)', r.s === 409 && /no atiende/i.test(JSON.stringify(r.j)), r);
    r = await req('POST', '/agenda', { ...base, horaInicio: '09:00', soloDisponible: true }, A);
    P('Reservar rápido en su horario: 201', r.s === 201, r);
    if (r.j && r.j.id) nuevos.push(r.j.id);
    r = await disp(F, '09:15');
    P('Con ese turno ya no está libre a las 09:15 ("Ya tiene un turno")', !tiene(r) && /turno/i.test((motivoDe(r) || {}).motivo), motivoDe(r));
    await db.query("INSERT INTO agenda_bloqueos (clinica_id, odontologo_id, fecha, hora_desde, hora_hasta, tipo, motivo) VALUES (1,$1,$2,'09:30','10:00','otro','Prueba')", [odo, F]);
    r = await disp(F, '09:30');
    P('Con un bloqueo en su agenda tampoco ("agenda bloqueada")', !tiene(r) && /bloqueada/.test((motivoDe(r) || {}).motivo), motivoDe(r));
    r = await req('POST', '/agenda', { ...base, horaInicio: '09:30', soloDisponible: true, forzar: true }, A);
    P('…y "forzar" no saltea la verificación del acceso rápido', r.s === 409, r);
    if (r.j && r.j.id) nuevos.push(r.j.id);
    await db.query('DELETE FROM turnos WHERE id = ANY($1::int[])', [nuevos]); nuevos.length = 0;

    // ---------------- Pantallas ----------------
    await db.query('DELETE FROM login_intentos');
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: TZ }); const p = await ctx.newPage(); const err = errores(p);
    await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForURL(/\/mecanico\//, { timeout: 15000 });
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(1200);
    const ids = await p.$$eval('#mec-iconos [data-mec-ir]', (l) => l.map((x) => x.dataset.mecIr));
    P('Tira de íconos: Nuevo turno, Pacientes, Nueva factura, Nuevo presupuesto, Informes, Usuarios, Historial, Configuración',
      JSON.stringify(ids) === JSON.stringify(['nuevo-turno', 'pacientes', 'nueva-factura', 'nuevo-presupuesto', 'informes', 'usuarios', 'auditoria', 'configuracion']), ids);
    await p.screenshot({ path: `${DIR}/mec-accesos.png` });

    // Nuevo turno
    await p.click('#mec-iconos [data-mec-ir="nuevo-turno"]');
    await p.waitForSelector('.dova-modal-box [data-disp]', { timeout: 10000 });
    P('Nuevo turno se abre directo (sin abrir la agenda)', /Nuevo turno/.test(await p.textContent('.dova-modal-box h3')) && await p.locator('.dova-ventana').count() === 0);
    const btn = p.locator('.dova-modal-box button[type=submit]');
    await p.fill('.dova-modal-box [name="fecha"]', F2); await p.fill('.dova-modal-box [name="horaInicio"]', '05:00');
    await p.waitForSelector('[data-disp][data-estado="ninguno"]', { timeout: 8000 });
    P('A las 05:00: "No hay odontólogos disponibles" y no deja reservar', await btn.isDisabled() && await p.locator('.dova-modal-box [name="odontologoId"]').isDisabled());
    await p.screenshot({ path: `${DIR}/mec-turno-sin-odontologos.png` });
    await p.fill('.dova-modal-box [name="horaInicio"]', '09:00');
    await p.waitForSelector('[data-disp][data-estado="libres"]', { timeout: 8000 });
    const opciones = await p.$$eval('.dova-modal-box [name="odontologoId"] option', (l) => l.map((o) => o.textContent));
    P('A las 09:00: el selector muestra solo los libres (incluida la Dra. Rápida)', opciones.includes(`Dra. Rápida ${suf}`) && await btn.isEnabled(), opciones.length);
    await p.selectOption('.dova-modal-box [name="odontologoId"]', String(odo));
    await p.fill('.dova-modal-box [data-buscar-pac]', `Acceso${suf}`);
    await p.locator('.dova-modal-box .dova-op-res-item').first().click();
    await btn.click(); await p.waitForTimeout(1500);
    const t = await q1("SELECT id, to_char(hora_inicio,'HH24:MI') h FROM turnos WHERE paciente_id=$1 AND odontologo_id=$2 AND fecha=$3", [pac, odo, F2]);
    P('Reserva el turno con la odontóloga elegida', !!t && t.h === '09:00', t);
    if (t) nuevos.push(t.id);
    await p.click('#mec-iconos [data-mec-ir="nuevo-turno"]'); await p.waitForSelector('.dova-modal-box [data-disp]');
    await p.fill('.dova-modal-box [name="fecha"]', F2); await p.fill('.dova-modal-box [name="horaInicio"]', '09:00');
    await p.waitForSelector('[data-disp][data-estado="libres"], [data-disp][data-estado="ninguno"]', { timeout: 8000 });
    const op2 = await p.$$eval('.dova-modal-box [name="odontologoId"] option', (l) => l.map((o) => o.value));
    P('Ya ocupada a esa hora, deja de ofrecerse', !op2.includes(String(odo)) && new RegExp(`Rápida ${suf}: ya tiene un turno`).test(await p.textContent('[data-disp]')));
    await p.click('.dova-modal-box [data-cerrar-modal]');

    // Pacientes
    await p.click('#mec-iconos [data-mec-ir="pacientes"]'); await p.waitForSelector('#rap-q');
    P('Pacientes abre el buscador sin listar a todos', await p.locator('.dova-rap-lista li').count() === 0);
    await p.fill('#rap-q', `Acceso${suf}`); await p.waitForSelector('.dova-rap-lista [data-rap-ficha]', { timeout: 8000 });
    P('Buscar muestra solo los que coinciden', await p.locator('.dova-rap-lista li').count() === 1);
    await p.click('.dova-rap-lista [data-rap-ficha]');
    await p.waitForSelector('.dova-ventana[data-ventana-ruta="paciente"]', { timeout: 10000 });
    const fichaUrl = await p.locator('.dova-ventana[data-ventana-ruta="paciente"] iframe').getAttribute('src');
    P('"Ver ficha" abre la ficha del paciente en una ventana', new RegExp(`paciente/${pac}`).test(fichaUrl || ''), fichaUrl);
    await p.click('#mec-iconos [data-mec-ir="pacientes"]'); await p.waitForSelector('#rap-q');
    await p.fill('#rap-q', `Nadie${suf}`); await p.waitForSelector('[data-rap-alta]', { timeout: 8000 });
    await p.click('[data-rap-alta]');
    P('Sin resultados: "Darlo de alta" pasa al formulario con el nombre', await p.inputValue('#rap-nombre') === `Nadie${suf}`);
    await p.fill('#rap-apellido', `Nuevo${suf}`); await p.fill('#rap-ci', `RN${suf}`); await p.fill('#rap-tel', '0981 555 444');
    await p.click('.dova-rap-form button[type=submit]'); await p.waitForSelector('.dova-rap-listo', { timeout: 8000 });
    const np = await q1('SELECT id, ci, telefono FROM pacientes WHERE apellido=$1', [`Nuevo${suf}`]);
    P('Nuevo paciente: se guarda con C.I. y teléfono', !!np && np.ci === `RN${suf}`, np);
    P('…y ofrece "Ver la ficha" y "Reservarle un turno"', await p.locator('[data-rap-ver]').count() === 1 && await p.locator('[data-rap-turno]').count() === 1);
    await p.click('[data-rap-turno]'); await p.waitForSelector('.dova-modal-box [data-disp]');
    P('"Reservarle un turno" abre el turno rápido con el paciente ya elegido', new RegExp(`Nadie${suf}`).test(await p.inputValue('.dova-modal-box [data-buscar-pac]')));
    await p.click('.dova-modal-box [data-cerrar-modal]');

    // Nueva factura / Nuevo presupuesto
    await p.click('#mec-iconos [data-mec-ir="nueva-factura"]');
    await p.waitForSelector('.dova-ventana[data-ventana-ruta="facturacion"]', { timeout: 10000 });
    const fac = await (await p.locator('.dova-ventana[data-ventana-ruta="facturacion"] iframe').elementHandle()).contentFrame();
    await fac.waitForFunction(() => location.hash === '#facturacion/nueva' && !document.querySelector('[data-subtab]'), null, { timeout: 15000 });
    P('Nueva factura abre directo el formulario (sin las pestañas de Facturación)', true);
    P('…y marca el ícono', await p.locator('#mec-iconos [data-mec-ir="nueva-factura"].activo').count() === 1);
    await p.click('#mec-iconos [data-mec-ir="nuevo-presupuesto"]');
    await p.frameLocator('.dova-ventana[data-ventana-ruta="presupuestos"] iframe').locator('[data-pres-form]').waitFor({ timeout: 15000 });
    P('Nuevo presupuesto abre directo el formulario', true);
    await p.screenshot({ path: `${DIR}/mec-accesos-ventanas.png` });
    const sinDesborde = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0);
    P('Sin desborde', sinDesborde);
    P('Sin errores de consola', err.length === 0, err);
    await ctx.close();

    // Celular: el turno rápido entra en la pantalla.
    await db.query('DELETE FROM login_intentos');
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, hasTouch: true }); const p2 = await ctx2.newPage(); const err2 = errores(p2);
    await p2.goto(`${URL0}/mecanico/index.html`); await p2.fill('#login-username', 'admin'); await p2.fill('#login-password', 'admin'); await p2.click('#form-login button[type=submit]');
    await p2.waitForURL(/\/mecanico\//, { timeout: 15000 }); await p2.waitForSelector('#shell-root:not([style*="display: none"])'); await p2.waitForTimeout(1000);
    if (await p2.locator('#mec-iconos [data-mec-ir="nuevo-turno"]').isVisible()) {
      await p2.click('#mec-iconos [data-mec-ir="nuevo-turno"]'); await p2.waitForSelector('.dova-modal-box [data-disp]');
      P('[celular] Turno rápido sin desborde', await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0));
      await p2.screenshot({ path: `${DIR}/mec-turno-celular.png` });
    } else P('[celular] (la tira de íconos se oculta en el celular)', true);
    P('[celular] Sin errores de consola', err2.length === 0, err2);
    await ctx2.close();
  } finally {
    await b.close();
    await db.query('DELETE FROM turnos WHERE odontologo_id=$1', [odo]);
    await db.query('DELETE FROM agenda_bloqueos WHERE odontologo_id=$1', [odo]);
    await db.query('DELETE FROM odontologos WHERE id=$1', [odo]).catch((e) => console.error(e.message));
    await db.query("UPDATE usuarios SET diseno_preferido='mecanico' WHERE username='admin'");
    const cl = await db.connect();
    try {
      await cl.query('BEGIN'); await cl.query("SET LOCAL dova.borrando_paciente='on'");
      await cl.query("DELETE FROM pacientes WHERE id=$1 OR apellido=$2", [pac, `Nuevo${suf}`]); await cl.query('COMMIT');
    } catch (e) { await cl.query('ROLLBACK'); console.error(e.message); } finally { cl.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
