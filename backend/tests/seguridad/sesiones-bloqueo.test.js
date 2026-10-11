// Sesiones abiertas, bloqueo de pantalla y política de la clínica (API).
// Corre contra un servidor de prueba (ver README.md).
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const cookieDe = (r) => { const c = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).find((x) => x.startsWith('dova_rt=')); return c ? c.split(';')[0] : null; };
const req = async (m, url, body, tok, { cookie, csrf = true } = {}) => {
  const h = { 'content-type': 'application/json' };
  if (tok) h.authorization = `Bearer ${tok}`;
  if (cookie) h.cookie = cookie;
  if (csrf) h['x-dova-csrf'] = '1';
  const r = await fetch(B + url, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null), cookie: cookieDe(r) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1'); UPDATE clinicas SET bloqueo_inactividad_min=15 WHERE id=1");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const rolRecep = (await q1("SELECT id FROM roles WHERE clinica_id=1 AND codigo='recepcion'")).id;
  const user = `sesb${suf}`; const clave = 'Segura2026ses';
  const u = (await req('POST', '/usuarios', { nombre: 'Prueba Sesiones', username: user, password: clave, rolId: rolRecep }, A)).j;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [u.id]);

  // ---------- Sesiones ----------
  let r = await req('POST', '/auth/login', { username: user, password: clave });
  const T1 = r.j.accessToken; const C1 = r.cookie;
  const pl = JSON.parse(Buffer.from(T1.split('.')[1], 'base64url').toString());
  P('El token de acceso lleva el id de la sesión', !!pl.sid, pl);
  P('El ingreso ya no ofrece segundo paso', !('requiere2fa' in r.j) && (await req('POST', '/auth/login/2fa', { desafio: 'x', codigo: '1' })).s === 404);
  r = await req('POST', '/auth/login', { username: user, password: clave });
  const T2 = r.j.accessToken;
  r = await req('GET', '/auth/sesiones', null, T1);
  P('Mis sesiones: lista las dos, marca la actual y el dispositivo', r.s === 200 && r.j.length >= 2 && r.j.filter((s) => s.actual).length === 1 && r.j.every((s) => s.dispositivo), r);
  const otra = r.j.find((s) => !s.actual);
  P('Cerrar la sesión de otro usuario: 404', (await req('POST', `/auth/sesiones/${otra.id}/cerrar`, null, R)).s === 404);
  r = await req('POST', `/auth/sesiones/${otra.id}/cerrar`, null, T1);
  P('Cerrar una sesión propia de otro dispositivo', r.s === 200 && r.j.actual === false, r);
  P('…su token de acceso deja de valer al instante (no a los 15 min)', (await req('GET', '/pacientes?limite=1', null, T2)).s === 401);
  P('…la sesión actual sigue', (await req('GET', '/pacientes?limite=1', null, T1)).s === 200);
  P('Queda en el historial', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='cerrar_sesion_dispositivo' AND usuario_id=$1", [u.id])));

  // ---------- Bloqueo de pantalla ----------
  P('Bloquear la pantalla', (await req('POST', '/auth/bloquear', null, T1)).s === 200);
  r = await req('GET', '/pacientes?limite=1', null, T1);
  P('Con la pantalla bloqueada, la API responde 423', r.s === 423 && r.j.error.details.codigo === 'SESION_BLOQUEADA', r);
  r = await req('POST', '/auth/refresh', {}, null, { cookie: C1 });
  P('…y la renovación de sesión también (no se puede esquivar recargando)', r.s === 423 && r.j.error.details.username === user, r);
  P('Desbloquear sin la cabecera anti-CSRF: 403', (await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C1, csrf: false })).s === 403);
  P('Desbloquear sin cookie: 401', (await req('POST', '/auth/desbloquear', { clave })).s === 401);
  r = await req('POST', '/auth/desbloquear', { clave: 'mal' }, null, { cookie: C1 });
  P('Contraseña incorrecta: 400 con intentos restantes', r.s === 400 && /quedan/.test(r.j.error.message), r);
  r = await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C1 });
  P('Contraseña correcta: desbloquea con tokens nuevos', r.s === 200 && r.j.accessToken && r.cookie && !('refreshToken' in r.j), r);
  const T3 = r.j.accessToken; const C3 = r.cookie;
  P('…el token nuevo funciona', (await req('GET', '/pacientes?limite=1', null, T3)).s === 200);
  P('…la cookie vieja quedó rotada', (await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C1 })).s === 401);
  await db.query('DELETE FROM login_intentos');
  await req('POST', '/auth/bloquear', null, T3);
  for (let i = 0; i < 4; i += 1) await req('POST', '/auth/desbloquear', { clave: `mal${i}` }, null, { cookie: C3 });
  r = await req('POST', '/auth/desbloquear', { clave: 'mal5' }, null, { cookie: C3 });
  P('5 contraseñas incorrectas al desbloquear: se cierra la sesión', r.s === 401, r);
  r = await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C3 });
  P('…ni la contraseña correcta la reabre', r.s === 401 || r.s === 429, r);
  P('…se avisa a los administradores', !!(await q1("SELECT 1 x FROM notificaciones WHERE tipo='seguridad' AND titulo LIKE 'Pantalla bloqueada%' AND creado_en > now() - interval '1 minute'")));
  await db.query('DELETE FROM login_intentos');

  // ---------- Avisos ante ataques ----------
  for (let i = 0; i < 5; i += 1) await req('POST', '/auth/login', { username: user, password: `incorrecta${i}` });
  r = await req('POST', '/auth/login', { username: user, password: clave });
  P('5 contraseñas mal: el ingreso se bloquea aunque después venga la correcta', r.s === 429, r);
  P('…y se avisa a los administradores', !!(await q1("SELECT 1 x FROM notificaciones WHERE tipo='seguridad' AND titulo LIKE 'Ingreso bloqueado%' AND creado_en > now() - interval '1 minute'")));
  await db.query('DELETE FROM login_intentos');

  // ---------- Política ----------
  P('Política sin permiso: 403', (await req('GET', '/clinica/seguridad', null, R)).s === 403);
  r = await req('GET', '/clinica/seguridad', null, A);
  P('Política: muestra los minutos de bloqueo', r.s === 200 && r.j.bloqueoMin === 15 && !('exigir2faAdmin' in r.j), r);
  P('Minutos inválidos: 400', (await req('PUT', '/clinica/seguridad', { bloqueoMin: 7 }, A)).s === 400);
  r = await req('PUT', '/clinica/seguridad', { bloqueoMin: 30 }, A);
  P('Guardar 30 minutos', r.s === 200 && r.j.bloqueoMin === 30);
  P('Cada usuario ve la política', (await req('GET', '/auth/politica', null, R)).j.bloqueoMin === 30);
  P('Recepción no puede cambiarla: 403', (await req('PUT', '/clinica/seguridad', { bloqueoMin: 0 }, R)).s === 403);
  await req('PUT', '/clinica/seguridad', { bloqueoMin: 15 }, A);

  await db.query('UPDATE usuarios SET activo=false, eliminado_en=now() WHERE id=$1', [u.id]);
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
