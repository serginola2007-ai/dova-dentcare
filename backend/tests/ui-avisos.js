/* global window, DovaApp */
// Pantallas (Playwright): Resumen del día (Configuración), indicaciones después del
// tratamiento (Tratamientos y detalle del turno) y archivar pendientes viejos
// (Seguimiento). Requiere DATABASE_URL, DOVA_URL, DOVA_TZ.
const os = require('os');
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
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) e.push(m.text()); }); return e; };
const login = async (b, vp, u, c) => {
  await db.query('DELETE FROM login_intentos'); await db.query("UPDATE usuarios SET diseno_preferido='mecanico', debe_cambiar_clave=false WHERE username=$1", [u]);
  const ctx = await b.newContext({ viewport: vp, timezoneId: TZ }); const p = await ctx.newPage(); const err = errores(p);
  await p.goto(`${URL0}/mecanico/index.html`); await p.fill('#login-username', u); await p.fill('#login-password', c); await p.click('#form-login button[type=submit]');
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(600);
  await enVentana(p);
  return { ctx, p, err };
};

(async () => {
  const suf = String(Date.now() % 1000000); const h = hoy();
  const antes = await q1('SELECT resumen_activo, resumen_hora, resumen_correos, resumen_whatsapp FROM clinicas WHERE id=1');
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,'Indira',$1,$2,'0981 222 333') RETURNING id", [`Avisos${suf}`, `AV${suf}`])).id;
  const trat = (await q1('INSERT INTO tratamientos (clinica_id, nombre, precio) VALUES (1,$1,50000) RETURNING id', [`Extracción UI ${suf}`])).id;
  const turno = (await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, tratamiento_id, motivo) VALUES (1,$1,1,$2,'07:00',30,'atendido',$3,'x') RETURNING id", [pac, h, trat])).id;
  const tipoR = (await q1('SELECT id FROM recall_tipos WHERE clinica_id=1 ORDER BY id LIMIT 1')).id;
  const rec = (await q1("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, intervalo_meses, estado) VALUES (1,$1,$2,current_date - interval '13 months',6,'activo') RETURNING id", [pac, tipoR])).id;
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const { ctx, p, err } = await login(b, { width: 1366, height: 900 }, 'admin', 'admin');
    // ---------- Resumen del día ----------
    await p.evaluate(() => DovaApp.navegar('configuracion'));
    await p.waitForSelector('#cfg-resumen [data-cfg-resumen]', { timeout: 15000 });
    P('Configuración → Resumen del día', /Resumen del día/.test(await p.textContent('#cfg-resumen')));
    await p.check('#cfg-resumen [name=activo]'); await p.fill('#res-wa', '0981 777 888'); await p.fill('#res-c0', `jefa${suf}@ejemplo.com`); await p.selectOption('#res-hora', '21');
    await p.click('#cfg-resumen button.dova-btn-primary'); await p.waitForTimeout(1200);
    const c = await q1('SELECT resumen_activo, resumen_hora, resumen_correos, resumen_whatsapp FROM clinicas WHERE id=1');
    P('…guarda activo, 21 h, correo y celular', c.resumen_activo && c.resumen_hora === 21 && c.resumen_correos[0] === `jefa${suf}@ejemplo.com` && c.resumen_whatsapp === '595981777888', c);
    await p.click('#cfg-resumen [data-res-ver]'); await p.waitForSelector('.dova-res-texto', { timeout: 10000 });
    P('"Ver el de hoy" muestra el resumen', /Cobrado: Gs\./.test(await p.textContent('.dova-res-texto')));
    await p.screenshot({ path: `${DIR}/resumen-dia.png` });
    await p.click('.dova-modal-box [data-cerrar-modal]');
    P('Mensajes automáticos incluye las indicaciones después del tratamiento', /Indicaciones después del tratamiento/.test(await p.textContent('#cfg-mensajes')));

    // ---------- Indicaciones en el tratamiento ----------
    await p.evaluate(() => { window.DovaSubPendiente = 'trat'; return DovaApp.navegar('catalogo'); });
    await p.waitForSelector('.dova-tabla', { timeout: 15000 });
    const fila = p.locator('.dova-tabla tbody tr', { hasText: `Extracción UI ${suf}` });
    await fila.locator('button', { hasText: /Editar/ }).first().click();
    await p.waitForSelector('textarea[name="indicaciones"]');
    await p.waitForSelector('.dova-indic-sugeridas', { timeout: 5000 });
    P('Editar tratamiento: campo de indicaciones con textos sugeridos', await p.locator('.dova-indic-sugeridas option').count() >= 6);
    await p.selectOption('.dova-indic-sugeridas', { label: 'Extracción' });
    P('Elegir "Extracción" completa el texto', /gasa/.test(await p.inputValue('textarea[name="indicaciones"]')));
    await p.click('.dova-modal-box button.dova-btn-primary, .dova-modal-box [type=submit]'); await p.waitForTimeout(1200);
    P('…y se guarda en el tratamiento', /gasa/.test((await q1('SELECT indicaciones FROM tratamientos WHERE id=$1', [trat])).indicaciones || ''));
    P('La lista marca que tiene indicaciones', /Cargadas/.test(await p.locator('.dova-tabla tbody tr', { hasText: `Extracción UI ${suf}` }).textContent()));

    // ---------- Detalle del turno: mandar indicaciones ----------
    await p.evaluate(() => { window.DovaSubPendiente = 'dia'; return DovaApp.navegar('agenda'); });
    await p.waitForSelector('[data-turno]', { timeout: 15000 });
    await p.locator('[data-turno]', { hasText: `Avisos${suf}` }).first().click();
    await p.waitForSelector('.dova-indic-turno [data-indic-enviar]', { timeout: 10000 });
    P('Turno atendido: botón "Mandar por mi WhatsApp" las indicaciones', /Indicaciones para después/.test(await p.textContent('.dova-indic-turno')));
    await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' })); // sin internet en las pruebas
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null), p.click('.dova-indic-turno [data-indic-enviar]')]);
    const url = popup ? popup.url() : '';
    P('…abre WhatsApp con el texto completo', /wa\.me\/595981222333/.test(url) && /gasa/.test(decodeURIComponent(url)), url.slice(0, 120));
    if (popup) await popup.close();
    P('…y queda registrado', !!(await q1("SELECT 1 x FROM avisos_envios WHERE tipo='indicaciones' AND referencia_id=$1 AND canal='whatsapp_manual'", [turno])));
    await p.click('.dova-modal-box [data-cerrar-modal], .dova-modal-box .dova-btn-primary').catch(() => {});

    // ---------- Archivar pendientes viejos ----------
    await p.evaluate(() => { window.DovaSubPendiente = 'recalls'; return DovaApp.navegar('seguimiento'); });
    await p.waitForSelector('.dova-archivo', { timeout: 15000 });
    P('Seguimiento → Controles periódicos: aviso de atrasados hace más de 6 meses', /atrasados hace más de 6 meses/.test(await p.textContent('.dova-archivo')));
    await p.selectOption('[data-arch-meses]', '12'); await p.waitForTimeout(800);
    P('Cambiar a 12 meses actualiza la cantidad', /más de 12 meses/.test(await p.textContent('.dova-archivo')));
    await p.click('[data-arch-ok]');
    P('Archivar pide confirmación (un segundo toque)', /Tocá de nuevo/.test(await p.textContent('[data-arch-ok]')));
    await p.click('[data-arch-ok]'); await p.waitForTimeout(1500);
    P('…archiva los de más de 12 meses (sin borrar)', (await q1('SELECT estado FROM paciente_recalls WHERE id=$1', [rec])).estado === 'archivado');
    await p.waitForSelector('[data-arch-ver]', { timeout: 10000 });
    await p.click('[data-arch-ver]'); await p.waitForSelector('.dova-modal-box [data-rest]');
    P('"Ver archivados" los lista', await p.locator('.dova-modal-box tbody tr').count() >= 1);
    await p.screenshot({ path: `${DIR}/archivados.png` });
    await p.click('.dova-modal-box [data-rest-todos]'); await p.waitForTimeout(1500);
    P('"Restaurar todos" los devuelve a la lista', (await q1('SELECT estado FROM paciente_recalls WHERE id=$1', [rec])).estado === 'activo');
    P('Sin errores de consola', err.length === 0, err);
    await ctx.close();
  } finally {
    await b.close();
    await db.query("UPDATE paciente_recalls SET estado='activo' WHERE clinica_id=1 AND estado='archivado'");
    await db.query('UPDATE clinicas SET resumen_activo=$1, resumen_hora=$2, resumen_correos=$3, resumen_whatsapp=$4 WHERE id=1', [antes.resumen_activo, antes.resumen_hora, antes.resumen_correos, antes.resumen_whatsapp]);
    const cl = await db.connect();
    try { await cl.query('BEGIN'); await cl.query("SET LOCAL dova.borrando_paciente='on'"); await cl.query('DELETE FROM pacientes WHERE id=$1', [pac]); await cl.query('DELETE FROM tratamientos WHERE id=$1', [trat]); await cl.query('COMMIT'); } catch (e) { await cl.query('ROLLBACK'); console.error(e.message); } finally { cl.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
