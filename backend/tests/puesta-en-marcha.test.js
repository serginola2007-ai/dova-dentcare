/* global document, window, DovaApp */
// Puesta en marcha (lista en Inicio) y Datos de la clínica (Configuración): API y pantallas.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500'; const B = `${URL0}/api`;
const DIR = process.env.CAPTURAS || require('os').tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const item = (r, id) => r.j.items.find((i) => i.id === id);

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false, diseno_preferido='moderno' WHERE username IN ('adminb','recep1')");
  const cb = (await q1("SELECT id FROM clinicas WHERE slug='clinica-b'")).id;
  const antes = await q1('SELECT nombre, direccion, telefono, horario_atencion, email, config FROM clinicas WHERE id=$1', [cb]);
  await db.query("UPDATE clinicas SET direccion=NULL, telefono=NULL, horario_atencion=NULL, config = config - 'puesta_en_marcha_oculta' WHERE id=$1", [cb]);
  const AB = (await req('POST', '/auth/login', { username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  try {
    P('Sin permiso de configurar la clínica: 403', (await req('GET', '/clinica/puesta-en-marcha', undefined, R)).s === 403 && (await req('PUT', '/clinica/puesta-en-marcha', { oculta: true }, R)).s === 403);
    let r = await req('GET', '/clinica/puesta-en-marcha', undefined, AB);
    P('Lista con 7 pasos obligatorios y WhatsApp opcional', r.s === 200 && r.j.total === 7 && r.j.items.length === 8 && item(r, 'whatsapp').opcional === true, r.j);
    P('Datos de la clínica: dice qué falta', item(r, 'datos').ok === false && /dirección, teléfono, horario/.test(item(r, 'datos').detalle), item(r, 'datos'));
    const sill = Number((await q1('SELECT count(*) n FROM sillones WHERE clinica_id=$1 AND activo', [cb])).n);
    P('Sillones: se calcula con los datos reales', item(r, 'sillones').ok === sill > 0, item(r, 'sillones'));
    const listos = r.j.listos;
    // Guardar datos de la clínica
    P('Datos de la clínica sin permiso: 403', (await req('PUT', '/clinica', { telefono: '1' }, R)).s === 403);
    P('Datos inválidos (lista en vez de texto): 400', (await req('PUT', '/clinica', { direccion: ['x'] }, AB)).s === 400);
    P('Nombre vacío: 400', (await req('PUT', '/clinica', { nombre: '  ' }, AB)).s === 400);
    r = await req('PUT', '/clinica', { direccion: 'Ruta 2 km 10, Luque', telefono: '021 555 000', horario_atencion: 'Lunes a viernes de 8 a 18', actualizarWeb: true }, AB);
    P('Guarda dirección, teléfono y horario', r.s === 200 && r.j.direccion === 'Ruta 2 km 10, Luque' && r.j.horario_atencion === 'Lunes a viernes de 8 a 18', r.j);
    const aud = await q1("SELECT detalle FROM auditoria WHERE clinica_id=$1 AND modulo='clinica' AND accion='editar' ORDER BY id DESC LIMIT 1", [cb]);
    P('…queda en el historial con el antes y el después', aud && aud.detalle.despues.telefono === '021 555 000' && aud.detalle.antes.telefono === null, aud);
    const web = await q1('SELECT direccion, telefono FROM web_config WHERE clinica_id=$1', [cb]);
    if (web) P('…y se copia a la página web (si se pidió)', web.direccion === 'Ruta 2 km 10, Luque' && web.telefono === '021 555 000', web);
    r = await req('GET', '/clinica/puesta-en-marcha', undefined, AB);
    P('La lista se actualiza sola: datos de la clínica listo', item(r, 'datos').ok === true && r.j.listos === listos + 1, { listos: r.j.listos, antes: listos });
    P('Ocultar con un valor que no es verdadero/falso: 400', (await req('PUT', '/clinica/puesta-en-marcha', { oculta: 'si' }, AB)).s === 400);
    r = await req('PUT', '/clinica/puesta-en-marcha', { oculta: true }, AB);
    P('Ocultar: queda oculta', r.s === 200 && r.j.oculta === true);
    r = await req('PUT', '/clinica/puesta-en-marcha', { oculta: false }, AB);
    P('Volver a mostrar', r.j.oculta === false);
    // Pantallas
    await db.query("UPDATE clinicas SET horario_atencion=NULL WHERE id=$1", [cb]);
    await db.query('DELETE FROM login_intentos');
    const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    for (const [nombre, vp] of [['escritorio', { width: 1366, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
      const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const err = [];
      p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4/.test(m.text())) err.push(m.text()); });
      await p.goto(`${URL0}/moderno/index.html`);
      await p.fill('#login-username', 'adminb'); await p.fill('#login-password', 'Clave1234!');
      await p.route('**/api/auth/login', async (route) => { const d = JSON.parse(route.request().postData()); d.clinicaSlug = 'clinica-b'; await route.continue({ postData: JSON.stringify(d) }); });
      await p.click('#form-login button[type=submit]');
      await p.waitForSelector('#shell-root:not([style*="display: none"])'); await p.waitForSelector('.dova-puesta', { timeout: 10000 });
      const t = await p.textContent('.dova-puesta');
      P(`[${nombre}] Inicio muestra la puesta en marcha con lo que falta`, /Puesta en marcha: \d de 7 listos/.test(t) && /Falta: horario/.test(t), t.slice(0, 200));
      P(`[${nombre}] Sin desborde`, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
      await p.screenshot({ path: `${DIR}/puesta-${nombre}.png` });
      if (nombre === 'escritorio') {
        await p.locator('.dova-puesta [data-puesta-ir="datos"]').click();
        const cfg = p.frameLocator('.dova-ventana[data-ventana-ruta="configuracion"] iframe');
        await cfg.locator('#cfg-clinica [data-cfg-clinica]').waitFor({ timeout: 15000 });
        P('"Ir" abre Configuración → Datos de la clínica en una ventana', await p.locator('.dova-ventana[data-ventana-ruta="configuracion"].activa').count() === 1);
        await cfg.locator('#cc-horario_atencion').fill('Lunes a sábado de 8 a 19'); await cfg.locator('#cfg-clinica button.dova-btn-primary').click(); await p.waitForTimeout(1200);
        P('Guardar desde la pantalla', (await q1('SELECT horario_atencion FROM clinicas WHERE id=$1', [cb])).horario_atencion === 'Lunes a sábado de 8 a 19');
        await p.screenshot({ path: `${DIR}/cfg-clinica.png` });
        await p.evaluate(() => DovaApp.navegar('dashboard')); await p.waitForTimeout(2000);
        P('Al volver a Inicio, datos de la clínica figura como listo', await p.locator('.dova-puesta li.ok', { hasText: 'Datos de la clínica' }).count() === 1);
        await p.click('[data-ocultar-puesta]'); await p.waitForTimeout(800);
        P('"Ocultar" la saca de Inicio', await p.locator('.dova-puesta').count() === 0 && (await q1('SELECT config FROM clinicas WHERE id=$1', [cb])).config.puesta_en_marcha_oculta === true);
        await db.query("UPDATE clinicas SET horario_atencion=NULL, config = config - 'puesta_en_marcha_oculta' WHERE id=$1", [cb]);
      }
      P(`[${nombre}] Sin errores de consola`, err.length === 0, err);
      await ctx.close();
    }
    await b.close();
  } finally {
    await db.query('UPDATE clinicas SET nombre=$2, direccion=$3, telefono=$4, horario_atencion=$5, email=$6, config=$7 WHERE id=$1', [cb, antes.nombre, antes.direccion, antes.telefono, antes.horario_atencion, antes.email, antes.config]);
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
