// Verificación en dos pasos, sesiones abiertas, bloqueo de pantalla y política
// de la clínica (API). Corre contra un servidor de prueba (ver README.md).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'; process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'y';
const { Pool } = require('pg');
const totp = require('../../src/utils/totp');
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarPaso = async () => { const p = totp.pasoActual(); while (totp.pasoActual() === p) await dormir(500); };

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1'); UPDATE clinicas SET exigir_2fa_admin=false, bloqueo_inactividad_min=15 WHERE id=1");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const rolAdmin = (await q1("SELECT id FROM roles WHERE clinica_id=1 AND codigo='admin'")).id;
  const user = `dosp${suf}`; const clave = 'Segura2026dos';
  const u = (await req('POST', '/usuarios', { nombre: 'Prueba Dos Pasos', username: user, password: clave, rolId: rolAdmin }, A)).j;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [u.id]);

  // ---------- Sesiones ----------
  let r = await req('POST', '/auth/login', { username: user, password: clave });
  const T1 = r.j.accessToken; const C1 = r.cookie;
  const pl = JSON.parse(Buffer.from(T1.split('.')[1], 'base64url').toString());
  P('El token de acceso lleva el id de la sesión', !!pl.sid && r.j.usuario.tiene2fa === false, pl);
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
  r = await req('POST', '/auth/bloquear', null, T1);
  P('Bloquear la pantalla', r.s === 200);
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
  let T3 = r.j.accessToken; let C3 = r.cookie;
  P('…el token nuevo funciona', (await req('GET', '/pacientes?limite=1', null, T3)).s === 200);
  P('…la cookie vieja quedó rotada', (await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C1 })).s === 401);
  await db.query('DELETE FROM login_intentos');
  await req('POST', '/auth/bloquear', null, T3);
  for (let i = 0; i < 4; i += 1) await req('POST', '/auth/desbloquear', { clave: `mal${i}` }, null, { cookie: C3 });
  r = await req('POST', '/auth/desbloquear', { clave: 'mal5' }, null, { cookie: C3 });
  P('5 contraseñas incorrectas al desbloquear: se cierra la sesión', r.s === 401, r);
  P('…ni la contraseña correcta la reabre', (await req('POST', '/auth/desbloquear', { clave }, null, { cookie: C3 })).s === 401);
  P('…se avisa a los administradores', !!(await q1("SELECT 1 x FROM notificaciones WHERE tipo='seguridad' AND titulo LIKE 'Pantalla bloqueada%' AND creado_en > now() - interval '1 minute'")));
  await db.query('DELETE FROM login_intentos');

  // ---------- Alta de la verificación en dos pasos ----------
  r = await req('POST', '/auth/login', { username: user, password: clave });
  let T = r.j.accessToken;
  P('Activar sin la contraseña: 400', (await req('POST', '/auth/2fa/iniciar', { clave: 'otra' }, T)).s === 400);
  r = await req('POST', '/auth/2fa/iniciar', { clave }, T);
  P('Iniciar: devuelve QR (SVG) y clave para cargar a mano', r.s === 200 && /^<svg/.test(r.j.qrSvg) && /^otpauth:\/\/totp\//.test(r.j.uri) && r.j.secreto.replace(/ /g, '').length === 32, r);
  const secreto = r.j.secreto.replace(/ /g, '');
  const fila = await q1('SELECT totp_pendiente FROM usuarios WHERE id=$1', [u.id]);
  P('El secreto se guarda cifrado, no en claro', /^v1:/.test(fila.totp_pendiente) && !fila.totp_pendiente.includes(secreto), fila);
  P('Confirmar con un código incorrecto: 400', (await req('POST', '/auth/2fa/confirmar', { codigo: '000000' }, T)).s === 400);
  const p0 = totp.pasoActual();
  r = await req('POST', '/auth/2fa/confirmar', { codigo: totp.codigoEnPaso(secreto, p0) }, T);
  P('Confirmar con el código de la app: activa y entrega 10 códigos de recuperación', r.s === 200 && r.j.codigos.length === 10 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.j.codigos[0]), r);
  const recup = r.j.codigos;
  r = await req('GET', '/auth/2fa', null, T);
  P('Estado: activo con 10 códigos', r.j.activo && r.j.codigosRestantes === 10, r);
  const filaAct = await q1('SELECT totp_recuperacion FROM usuarios WHERE id=$1', [u.id]);
  P('Los códigos de recuperación se guardan solo como hash', !filaAct.totp_recuperacion.some((h) => recup.some((c) => h.includes(c.replace('-', '')))));
  r = await req('GET', '/usuarios?pageSize=500', null, A);
  const enLista = r.j.items.find((x) => x.id === u.id);
  P('La lista de usuarios muestra el 2FA sin exponer secretos', enLista.totp_activo === true && !JSON.stringify(r.j).includes('totp_secreto') && !JSON.stringify(r.j).includes('v1:'), enLista);

  // ---------- Ingreso en dos pasos ----------
  r = await req('POST', '/auth/login', { username: user, password: clave });
  P('Con 2FA, la contraseña sola no abre sesión', r.s === 200 && r.j.requiere2fa === true && r.j.desafio && !r.j.accessToken && !r.cookie, r);
  let desafio = r.j.desafio;
  P('El desafío no sirve como token de acceso', (await req('GET', '/pacientes?limite=1', null, desafio)).s === 401);
  P('Un token de acceso no sirve como desafío', (await req('POST', '/auth/login/2fa', { desafio: T, codigo: '123456' })).s === 401);
  P('Desafío alterado: 401', (await req('POST', '/auth/login/2fa', { desafio: `${desafio.slice(0, -3)}abc`, codigo: '123456' })).s === 401);
  r = await req('POST', '/auth/login/2fa', { desafio, codigo: totp.codigoEnPaso(secreto, p0) });
  P('El mismo código de la activación no se puede reusar', r.s === 401, r);
  r = await req('POST', '/auth/login/2fa', { desafio, codigo: totp.codigoEnPaso(secreto, p0 + 1) });
  P('Código correcto: abre sesión con cookie', r.s === 200 && r.j.accessToken && r.cookie && r.j.usuario.tiene2fa === true, r);
  P('…el token funciona', (await req('GET', '/pacientes?limite=1', null, r.j.accessToken)).s === 200);
  P('El desafío ya usado no sirve otra vez', (await req('POST', '/auth/login/2fa', { desafio, codigo: totp.codigoEnPaso(secreto, p0 + 1) })).s === 401);
  desafio = (await req('POST', '/auth/login', { username: user, password: clave })).j.desafio;
  P('El mismo código no sirve dos veces (repetición)', (await req('POST', '/auth/login/2fa', { desafio, codigo: totp.codigoEnPaso(secreto, p0 + 1) })).s === 401);
  r = await req('POST', '/auth/login/2fa', { desafio, codigo: recup[0].toLowerCase() });
  P('Código de recuperación: entra y avisa cuántos quedan', r.s === 200 && r.j.usuario.codigosRecuperacionRestantes === 9, r);
  T = r.j.accessToken;
  desafio = (await req('POST', '/auth/login', { username: user, password: clave })).j.desafio;
  P('Un código de recuperación se gasta', (await req('POST', '/auth/login/2fa', { desafio, codigo: recup[0] })).s === 401);
  P('…se avisa al usuario y a los admins del uso del código', !!(await q1("SELECT 1 x FROM notificaciones WHERE usuario_id=$1 AND titulo LIKE 'Ingreso con código de recuperación%'", [u.id])));
  await db.query('DELETE FROM login_intentos');
  desafio = (await req('POST', '/auth/login', { username: user, password: clave })).j.desafio;
  for (let i = 0; i < 5; i += 1) await req('POST', '/auth/login/2fa', { desafio, codigo: String(100000 + i) });
  r = await req('POST', '/auth/login/2fa', { desafio, codigo: totp.codigoEnPaso(secreto, totp.pasoActual()) });
  P('5 códigos incorrectos: el segundo paso se bloquea (aunque después venga el correcto)', r.s === 429, r);
  P('…queda en el historial y se avisa', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='login_2fa_bloqueado' AND usuario_id=$1", [u.id])) && !!(await q1("SELECT 1 x FROM notificaciones WHERE usuario_id=$1 AND titulo LIKE 'Segundo paso fallido%'", [u.id])));
  await db.query('DELETE FROM login_intentos');

  // ---------- Política de la clínica ----------
  P('Política de seguridad sin permiso: 403', (await req('GET', '/clinica/seguridad', null, R)).s === 403);
  r = await req('GET', '/clinica/seguridad', null, A);
  P('Política: muestra bloqueo y admins con 2FA', r.s === 200 && r.j.bloqueoMin === 15 && r.j.admins >= 2, r);
  P('Minutos de bloqueo inválidos: 400', (await req('PUT', '/clinica/seguridad', { bloqueoMin: 7 }, A)).s === 400);
  r = await req('PUT', '/clinica/seguridad', { exigir2faAdmin: true }, A);
  P('Exigir 2FA sin tenerla uno mismo: 409', r.s === 409, r);
  r = await req('PUT', '/clinica/seguridad', { exigir2faAdmin: true, bloqueoMin: 10 }, T);
  P('Un admin con 2FA la puede exigir', r.s === 200 && r.j.exigir2faAdmin === true && r.j.bloqueoMin === 10, r);
  r = await req('GET', '/pacientes?limite=1', null, A);
  P('Admin sin 2FA: la API le pide activarla (403)', r.s === 403 && r.j.error.details.codigo === 'DEBE_ACTIVAR_2FA', r);
  P('…pero puede empezar a activarla', (await req('GET', '/auth/2fa', null, A)).s === 200);
  P('…y ver la política (minutos de bloqueo)', (await req('GET', '/auth/politica', null, A)).j.bloqueoMin === 10);
  r = await req('POST', '/auth/login', { username: 'admin', password: 'admin' });
  P('…al ingresar se le avisa que la tiene que activar', r.j.usuario && r.j.usuario.debeActivar2fa === true, r.j && r.j.usuario);
  P('Recepción no está alcanzada por la exigencia', (await req('GET', '/pacientes?limite=1', null, R)).s === 200);
  P('Con la exigencia, un admin no puede desactivar la suya', (await req('POST', '/auth/2fa/desactivar', { clave, codigo: recup[1] }, T)).s === 409);
  r = await req('PUT', '/clinica/seguridad', { exigir2faAdmin: false, bloqueoMin: 15 }, T);
  P('Dejar de exigirla (admin)', r.s === 200 && r.j.exigir2faAdmin === false);
  P('…el admin sin 2FA vuelve a operar', (await req('GET', '/pacientes?limite=1', null, A)).s === 200);

  // ---------- Reinicio por un administrador ----------
  P('Sin permiso de usuarios no se puede reiniciar: 403', (await req('POST', `/usuarios/${u.id}/reiniciar-2fa`, null, R)).s === 403);
  const ajeno = await q1('SELECT id FROM usuarios WHERE clinica_id<>1 LIMIT 1');
  P('Usuario de otra clínica: 404', (await req('POST', `/usuarios/${ajeno.id}/reiniciar-2fa`, null, A)).s === 404);
  r = await req('POST', `/usuarios/${u.id}/reiniciar-2fa`, null, A);
  P('Admin reinicia la 2FA de otra persona', r.s === 200, r);
  P('…se cierran sus sesiones', (await req('GET', '/pacientes?limite=1', null, T)).s === 401);
  r = await req('POST', '/auth/login', { username: user, password: clave });
  P('…y vuelve a entrar solo con la contraseña', r.s === 200 && !!r.j.accessToken && !r.j.requiere2fa, r);
  T = r.j.accessToken;
  P('…queda en el historial', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='reiniciar_2fa_usuario' AND entidad_id=$1", [String(u.id)])));

  // ---------- Desactivar la propia ----------
  await esperarPaso();
  r = await req('POST', '/auth/2fa/iniciar', { clave }, T);
  const s2 = r.j.secreto.replace(/ /g, '');
  const p1 = totp.pasoActual();
  r = await req('POST', '/auth/2fa/confirmar', { codigo: totp.codigoEnPaso(s2, p1) }, T);
  const rec2 = r.j.codigos;
  P('Desactivar sin la contraseña: 400', (await req('POST', '/auth/2fa/desactivar', { clave: 'x', codigo: rec2[0] }, T)).s === 400);
  P('Desactivar sin código válido: 400', (await req('POST', '/auth/2fa/desactivar', { clave, codigo: '111111' }, T)).s === 400);
  r = await req('POST', '/auth/2fa/codigos', { clave, codigo: rec2[0] }, T);
  P('Generar códigos nuevos (con contraseña y código)', r.s === 200 && r.j.codigos.length === 10);
  P('…los códigos viejos dejan de valer', (await req('POST', '/auth/2fa/desactivar', { clave, codigo: rec2[1] }, T)).s === 400);
  r = await req('POST', '/auth/2fa/desactivar', { clave, codigo: totp.codigoEnPaso(s2, p1 + 1) }, T);
  P('Desactivar con contraseña y código', r.s === 200, r);
  P('…se avisa a los administradores', !!(await q1("SELECT 1 x FROM notificaciones WHERE titulo LIKE 'Verificación en dos pasos desactivada%' AND creado_en > now() - interval '2 minutes'")));
  P('Ningún pedido devolvió un 500', !(await q1("SELECT 1 x FROM auditoria WHERE resultado='error' AND creado_en > now() - interval '5 minutes'")));

  await db.query('UPDATE clinicas SET exigir_2fa_admin=false, bloqueo_inactividad_min=15 WHERE id=1');
  await db.query('UPDATE usuarios SET activo=false, eliminado_en=now() WHERE id=$1', [u.id]);
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
