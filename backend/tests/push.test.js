// Avisos push: suscripción por dispositivo, privacidad del aviso y limpieza de dispositivos caídos.
const { Pool } = require('pg');
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'x'; process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'x';
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const sub = (n) => ({ endpoint: `https://push.ejemplo.test/send/${n}`, keys: { p256dh: 'BPkey'.padEnd(87, 'a'), auth: 'authkey123456789012' } });

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1') AND clinica_id=1");
  const suf = String(Date.now() % 1000000);
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const uid = async (u) => (await db.query("SELECT id FROM usuarios WHERE username=$1 AND clinica_id=1", [u])).rows[0].id;
  const ua = await uid('admin'); const ur = await uid('recep1');
  P('sin sesión no se accede', (await req('GET', '/push')).s === 401 && (await req('POST', '/push/suscripcion', { suscripcion: sub(1) })).s === 401);
  const e = await req('GET', '/push', undefined, A);
  P('estado: indica si el servidor tiene los avisos habilitados', e.s === 200 && typeof e.j.habilitado === 'boolean', e);
  if (e.j.habilitado) P('si está habilitado entrega la clave pública (nunca la privada)', !!e.j.clavePublica && !Object.keys(e.j).some((k) => /priv/i.test(k)), e.j);
  P('suscripción inválida (sin claves): 400', (await req('POST', '/push/suscripcion', { suscripcion: { endpoint: 'https://a.test/x' } }, A)).s === 400);
  P('endpoint que no es https: 400', (await req('POST', '/push/suscripcion', { suscripcion: { ...sub(2), endpoint: 'http://a.test/x' } }, A)).s === 400);
  P('endpoint que no es URL: 400', (await req('POST', '/push/suscripcion', { suscripcion: { ...sub(2), endpoint: 'no-es-url' } }, A)).s === 400);
  const ep = `https://push.ejemplo.test/send/${suf}`;
  P('se registra el dispositivo', (await req('POST', '/push/suscripcion', { suscripcion: { ...sub(suf), endpoint: ep } }, A)).s === 201);
  P('registrar el mismo dispositivo otra vez no duplica', (await req('POST', '/push/suscripcion', { suscripcion: { ...sub(suf), endpoint: ep } }, A)).s === 201 && (await db.query('SELECT 1 FROM push_suscripciones WHERE endpoint=$1', [ep])).rowCount === 1);
  P('el estado reconoce este dispositivo', (await req('GET', `/push?endpoint=${encodeURIComponent(ep)}`, undefined, A)).j.esteDispositivo === true);
  // Dispositivo compartido: pasa al último usuario que lo activa, no se duplica ni se manda al anterior.
  await req('POST', '/push/suscripcion', { suscripcion: { ...sub(suf), endpoint: ep } }, R);
  const dueno = (await db.query('SELECT usuario_id FROM push_suscripciones WHERE endpoint=$1', [ep])).rows[0].usuario_id;
  P('dispositivo compartido: queda a nombre de quien lo activó último', dueno === ur, dueno);
  P('el usuario anterior ya no lo ve como suyo', (await req('GET', `/push?endpoint=${encodeURIComponent(ep)}`, undefined, A)).j.esteDispositivo === false);
  P('un usuario no puede dar de baja el dispositivo de otro', (await req('POST', '/push/baja', { endpoint: ep }, A)).s === 200 && (await db.query('SELECT 1 FROM push_suscripciones WHERE endpoint=$1', [ep])).rowCount === 1);
  P('la baja propia lo quita', (await req('POST', '/push/baja', { endpoint: ep }, R)).s === 200 && (await db.query('SELECT 1 FROM push_suscripciones WHERE endpoint=$1', [ep])).rowCount === 0);

  // Envío (con un enviador simulado: no sale a internet)
  const svc = require('../src/modules/push/push.service');
  const enviados = [];
  svc.setEnviador(async (s, payload) => { if (s.endpoint.endsWith('/caido')) { const x = new Error('gone'); x.statusCode = 410; throw x; } enviados.push({ s, payload: JSON.parse(payload) }); });
  const epOk = `https://push.ejemplo.test/send/ok${suf}`; const epCaido = `https://push.ejemplo.test/send/${suf}/caido`;
  await svc.guardar(1, ua, { ...sub(1), endpoint: epOk }, 'test'); await svc.guardar(1, ua, { ...sub(1), endpoint: epCaido }, 'test');
  await svc.guardar(1, ur, { ...sub(1), endpoint: `https://push.ejemplo.test/send/otro${suf}` }, 'test');
  const r = await svc.enviar(1, ua, { titulo: 'Paciente nuevo en la web: Juan Pérez', ruta: 'paciente/9', tipo: 'registro_web' });
  P('llega a los dispositivos del usuario y a ningún otro', enviados.length === 1 && enviados[0].s.endpoint === epOk && r.enviados === 1, { enviados, r });
  P('el aviso no lleva nombres de pacientes (pantalla bloqueada)', !JSON.stringify(enviados[0].payload).includes('Juan') && enviados[0].payload.ruta === 'paciente/9', enviados[0]);
  P('un dispositivo dado de baja por el navegador (410) se elimina solo', (await db.query('SELECT 1 FROM push_suscripciones WHERE endpoint=$1', [epCaido])).rowCount === 0);
  svc.setEnviador(async () => { throw new Error('red caída'); });
  let lanzo = false; try { await svc.enviar(1, ua, { titulo: 'x' }); } catch (_e) { lanzo = true; }
  P('si falla el envío no tumba el flujo que lo origina', !lanzo);
  // La notificación interna dispara el aviso.
  enviados.length = 0; svc.setEnviador(async (s, p) => { enviados.push(JSON.parse(p)); });
  await require('../src/modules/notificaciones/notificaciones.service').notificar(1, ua, { tipo: 'prueba_x', titulo: 'Algo pasó', mensaje: 'detalle', ruta: 'agenda' });
  await new Promise((ok) => setTimeout(ok, 300));
  P('una notificación de DOVA genera su aviso push', enviados.length === 1 && enviados[0].ruta === 'agenda', enviados);
  await db.query("DELETE FROM push_suscripciones WHERE endpoint LIKE 'https://push.ejemplo.test/%'");
  const ok = res.filter(Boolean).length;
  console.log(`push.test.js ok=${ok} mal=${res.length - ok} | ${ok}/${res.length}`);
  await db.end(); process.exit(ok === res.length ? 0 : 1);
})().catch((x) => { console.error(x); process.exit(2); });
