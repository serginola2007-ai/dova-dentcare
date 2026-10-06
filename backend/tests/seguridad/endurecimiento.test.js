const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || (process.env.DOVA_URL || 'http://localhost:4500')) + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, { tok, form, raw } = {}) => {
  const h = {}; if (tok) h.authorization = `Bearer ${tok}`; if (body && !form) h['content-type'] = 'application/json';
  const r = await fetch(B + url, { method: m, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  if (raw) return r; return { s: r.status, j: await r.json().catch(() => null) };
};
const login = async (u, p) => (await req('POST', '/auth/login', { username: u, password: p })).j.accessToken;
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
// Pruebas de la auditoría de seguridad (hardening): cada una comprueba una corrección concreta.
const loginR = async (u, p, extra = {}) => req('POST', '/auth/login', { username: u, password: p, ...extra });
const H = async (url, opts = {}) => fetch(B.replace('/api', '') + url, opts);
(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','odo1')");
  const A = await login('admin', 'admin'); const R = await login('recep1', 'clave123');
  const suf = String(Date.now() % 1000000);
  const rolRecep = (await q1("SELECT id FROM roles WHERE codigo='recepcion' AND clinica_id=1")).id;
  const rolAdmin = (await q1("SELECT id FROM roles WHERE codigo='admin' AND clinica_id=1")).id;

  // ---- Contraseñas
  for (const [clave, n] of [['123456', 'corta'], ['clave1234', 'común'], ['abcdefgh', 'sin números'], [`seg${suf}user1`, 'contiene el usuario']]) {
    const r = await req('POST', '/usuarios', { nombre: 'Prueba Clave', username: `seg${suf}user`, password: clave, rolId: rolRecep }, { tok: A });
    P(`Contraseña débil rechazada (${n})`, r.s === 400, r);
  }
  // ---- Contraseña inicial obligatoria también en la API
  let r = await req('POST', '/usuarios', { nombre: 'Nueva Persona', username: `seg${suf}a`, password: 'Inicial2026x', rolId: rolRecep }, { tok: A });
  const ua = r.j; P('Alta de usuario con contraseña fuerte', r.s === 201 && ua.id, r);
  let lr = await loginR(`seg${suf}a`, 'Inicial2026x');
  P('El login avisa que debe cambiar la contraseña', lr.s === 200 && lr.j.usuario.debeCambiarClave === true, lr.j && lr.j.usuario);
  let tokA = lr.j.accessToken;
  r = await req('GET', '/pacientes', null, { tok: tokA });
  P('Con la contraseña inicial la API responde 403 (no alcanza con la pantalla)', r.s === 403 && r.j.error.details && r.j.error.details.codigo === 'DEBE_CAMBIAR_CLAVE', r);
  r = await req('POST', '/auth/cambiar-clave', { actual: 'Inicial2026x', nueva: 'Propia2026zz' }, { tok: tokA });
  P('Cambia la contraseña y recibe una sesión nueva', r.s === 200 && r.j.accessToken && r.j.refreshToken, r);
  const tokA2 = r.j.accessToken;
  P('El token anterior queda invalidado', (await req('GET', '/pacientes', null, { tok: tokA })).s === 401);
  P('El token nuevo funciona', (await req('GET', '/pacientes', null, { tok: tokA2 })).s === 200);

  // ---- Anti-escalada
  r = await req('POST', '/usuarios/roles', { codigo: `gestor${suf}`, nombre: 'Gestor de usuarios' }, { tok: A });
  const rolG = r.j.id;
  await req('PUT', `/usuarios/roles/${rolG}/permisos`, { codigos: ['usuarios.manage', 'roles.manage', 'pacientes.view'] }, { tok: A });
  r = await req('POST', '/usuarios', { nombre: 'Gestor Prueba', username: `seg${suf}g`, password: 'Ventana2026x', rolId: rolG }, { tok: A });
  const ug = r.j;
  let lg = (await loginR(`seg${suf}g`, 'Ventana2026x')).j;
  const tg = (await req('POST', '/auth/cambiar-clave', { actual: 'Ventana2026x', nueva: 'Ventana2027yy' }, { tok: lg.accessToken })).j.accessToken;
  r = await req('PUT', `/usuarios/${ug.id}/permisos`, { codigoPermiso: 'pagos.anular', allow: true }, { tok: tg });
  P('No puede darse permisos a sí mismo', r.s === 403, r);
  r = await req('PUT', `/usuarios/${ua.id}/permisos`, { codigoPermiso: 'pagos.anular', allow: true }, { tok: tg });
  P('No puede dar permisos que él no tiene', r.s === 403, r);
  r = await req('PUT', `/usuarios/${ua.id}`, { rolId: rolAdmin }, { tok: tg });
  P('No puede hacer administrador a otro', r.s === 403, r);
  r = await req('PUT', `/usuarios/${ua.id}`, { rolId: rolRecep === ua.rol_id ? rolRecep : rolRecep }, { tok: tg });
  r = await req('POST', '/usuarios', { nombre: 'Admin Trucho', username: `seg${suf}x`, password: 'Trucho2026x', rolId: rolAdmin }, { tok: tg });
  P('No puede crear administradores', r.s === 403, r);
  r = await req('POST', '/usuarios', { nombre: 'Recep Trucha', username: `seg${suf}y`, password: 'Trucha2026x', rolId: rolRecep }, { tok: tg });
  P('No puede crear usuarios con un rol con más permisos que él', r.s === 403, r);
  r = await req('PUT', `/usuarios/${ug.id}`, { rolId: rolRecep }, { tok: tg });
  P('No puede cambiar su propio rol', r.s === 403, r);
  const adminId = (await q1("SELECT id FROM usuarios WHERE username='admin' AND clinica_id=1")).id;
  r = await req('POST', `/usuarios/${adminId}/password`, { password: 'Robada2026xx' }, { tok: tg });
  P('No puede blanquear la contraseña del administrador', r.s === 403, r);
  r = await req('PUT', `/usuarios/roles/${rolG}/permisos`, { codigos: ['usuarios.manage', 'roles.manage', 'pacientes.view', 'pagos.anular'] }, { tok: tg });
  P('No puede cambiar los permisos de su propio rol', r.s === 403, r);
  r = await req('PUT', `/usuarios/roles/${rolRecep}/permisos`, { codigos: ['pagos.anular'] }, { tok: tg });
  P('No puede agregar a otro rol permisos que no tiene', r.s === 403, r);
  r = await req('PUT', `/usuarios/roles/${rolG}/permisos`, { codigos: ['no.existe'] }, { tok: A });
  P('Permiso inexistente: 400', r.s === 400, r);
  r = await req('PUT', `/usuarios/${ua.id}/permisos`, { codigoPermiso: 'no.existe', allow: true }, { tok: A });
  P('Override con permiso inexistente: 400', r.s === 400, r);
  P('Los cambios de permisos de rol quedan auditados con antes/después', !!(await q1("SELECT id FROM auditoria WHERE accion='actualizar_permisos_rol' AND entidad_id=$1 AND detalle ? 'antes'", [String(rolG)])));

  // ---- Invalidación de sesiones
  const s1 = (await loginR(`seg${suf}a`, 'Propia2026zz')).j; const s2 = (await loginR(`seg${suf}a`, 'Propia2026zz')).j;
  r = await req('POST', `/usuarios/${ua.id}/password`, { password: 'Temporal2026q' }, { tok: A });
  P('El admin blanquea la contraseña', r.s === 200, r);
  P('Todas las sesiones abiertas de esa persona se cierran al instante', (await req('GET', '/pacientes', null, { tok: s1.accessToken })).s === 401 && (await req('GET', '/pacientes', null, { tok: s2.accessToken })).s === 401);
  P('Sus refresh tokens también', (await req('POST', '/auth/refresh', { refreshToken: s1.refreshToken })).s === 401);
  lr = await loginR(`seg${suf}a`, 'Temporal2026q');
  P('La contraseña blanqueada es temporal (pide cambiarla)', lr.j.usuario.debeCambiarClave === true);
  r = await req('POST', `/usuarios/${adminId}/password`, { password: 'Otra2026xxzz' }, { tok: A });
  P('Nadie blanquea su propia contraseña por el atajo de admin', r.s === 403, r);
  // Baja
  const s3 = (await loginR('recep1', 'clave123')).j;
  // logout
  const s4 = (await loginR('recep1', 'clave123')).j;
  r = await req('POST', '/auth/logout', { refreshToken: s4.refreshToken }, { tok: s4.accessToken });
  P('Cerrar sesión invalida el token de acceso al instante', (await req('GET', '/pacientes', null, { tok: s4.accessToken })).s === 401);
  P('…y el refresh token', (await req('POST', '/auth/refresh', { refreshToken: s4.refreshToken })).s === 401);
  P('Las otras sesiones del mismo usuario siguen', (await req('GET', '/pacientes', null, { tok: s3.accessToken })).s === 200);
  // Rotación
  const s5 = (await loginR('recep1', 'clave123')).j;
  r = await req('POST', '/auth/refresh', { refreshToken: s5.refreshToken });
  P('Refresh entrega un refresh token nuevo (rotación)', r.s === 200 && r.j.refreshToken && r.j.refreshToken !== s5.refreshToken, r.s);
  const nuevo = r.j.refreshToken;
  r = await req('POST', '/auth/refresh', { refreshToken: s5.refreshToken });
  P('Dos pestañas a la vez: el viejo sirve 60 s pero sin rotar', r.s === 200 && !r.j.refreshToken && r.j.accessToken, r.s);
  await db.query("UPDATE refresh_tokens SET revocado_en = now() - interval '5 minutes' WHERE token_hash = encode(sha256($1::bytea), 'hex')", [s5.refreshToken]);
  r = await req('POST', '/auth/refresh', { refreshToken: s5.refreshToken });
  P('Reutilizar un refresh viejo se rechaza…', r.s === 401, r.s);
  P('…y cierra todas las sesiones (posible robo)', (await req('POST', '/auth/refresh', { refreshToken: nuevo })).s === 401 && (await req('GET', '/pacientes', null, { tok: s3.accessToken })).s === 401);
  P('…y queda en la auditoría', !!(await q1("SELECT id FROM auditoria WHERE accion='refresh_reutilizado' ORDER BY id DESC LIMIT 1")));

  // ---- Tokens manipulados
  const R2 = await login('recep1', 'clave123');
  const [hh, pp] = R2.split('.');
  const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${pp}.`;
  P('Token con alg "none": 401', (await req('GET', '/pacientes', null, { tok: none })).s === 401);
  const pl = JSON.parse(Buffer.from(pp, 'base64url').toString()); pl.clinicaId = 43;
  P('Token con la clínica cambiada: 401', (await req('GET', '/pacientes', null, { tok: `${hh}.${Buffer.from(JSON.stringify(pl)).toString('base64url')}.${R2.split('.')[2]}` })).s === 401);

  // ---- Datos clínicos y mínimo privilegio
  const pid = (await q1("SELECT id FROM pacientes WHERE alergias IS NOT NULL AND alergias <> '' AND clinica_id=1 AND activo LIMIT 1")).id;
  r = await req('GET', `/pacientes/${pid}`, null, { tok: R2 });
  P('Recepción no recibe alergias ni antecedentes', r.s === 200 && !('alergias' in r.j) && !('antecedentes_medicos' in r.j) && r.j.datosClinicosOcultos === true, Object.keys(r.j || {}));
  const antes = (await q1('SELECT alergias FROM pacientes WHERE id=$1', [pid])).alergias;
  r = await req('PUT', `/pacientes/${pid}`, { alergias: 'BORRADO POR RECEPCION', telefono: '0981 222 333' }, { tok: R2 });
  P('Recepción no puede pisar las alergias (el resto sí se guarda)', r.s === 200 && (await q1('SELECT alergias, telefono FROM pacientes WHERE id=$1', [pid])).alergias === antes, r.s);
  r = await req('GET', `/pacientes/${pid}`, null, { tok: A });
  P('El administrador sí los ve', 'alergias' in r.j);
  r = await req('GET', '/pacientes?q=a', null, { tok: R2 });
  P('Tampoco en el listado', r.j.data.every((p) => !('alergias' in p)));

  // ---- Archivos
  let fd = new FormData(); fd.append('logo', new Blob([Buffer.from('<html><script>alert(1)</script></html>')], { type: 'image/png' }), 'logo.png');
  r = await req('POST', '/facturacion/config/logo', null, { tok: A, form: fd });
  P('Logo de factura disfrazado: 400', r.s === 400, r);
  fd = new FormData(); fd.append('pacienteId', pid); fd.append('categoria', 'inicial'); fd.append('archivo', new Blob([Buffer.from('x')], { type: 'text/html' }), 'x.html');
  r = await req('POST', '/clinico/fotos', null, { tok: A, form: fd });
  P('Tipo de archivo no permitido: 400 (antes 500)', r.s === 400, r);
  fd = new FormData(); fd.append('pacienteId', pid); fd.append('categoria', 'inicial'); fd.append('archivo', new Blob([Buffer.alloc(16 * 1024 * 1024, 1)], { type: 'image/jpeg' }), 'grande.jpg');
  r = await req('POST', '/clinico/fotos', null, { tok: A, form: fd });
  P('Archivo demasiado grande: 413', r.s === 413, r);
  const t = (await req('POST', '/helpdesk', { titulo: 'Prueba adjunto', descripcion: 'x', categoria: 'otro' }, { tok: A })).j;
  fd = new FormData(); fd.append('archivo', new Blob([Buffer.from('<svg onload=alert(1)>')], { type: 'image/png' }), 'x.png');
  r = await req('POST', `/helpdesk/${t.id}/adjuntos`, null, { tok: A, form: fd });
  P('Adjunto de ayuda disfrazado: 400', r.s === 400, r);

  // ---- Errores sin detalles internos
  r = await req('GET', '/kpis/auditoria?limite=-5', null, { tok: A });
  P('Parámetros fuera de rango no rompen (sin 500)', r.s === 200, r.s);
  const erroresTxt = JSON.stringify(r.j || {});
  P('Las respuestas no incluyen SQL ni rutas internas', !/SELECT|node_modules|\/home\//.test(erroresTxt));

  // ---- CORS y cabeceras
  let h = await H('/api/health', { headers: { Origin: 'https://sitio-malicioso.example' } });
  P('CORS: un origen ajeno se rechaza', h.status === 403 && !h.headers.get('access-control-allow-origin'), h.status);
  h = await H('/api/health', { headers: { Origin: (process.env.DOVA_URL || 'http://localhost:4500') } });
  P('CORS: el propio sitio funciona, sin credenciales', h.status === 200 && !h.headers.get('access-control-allow-credentials'));
  h = await H('/moderno/index.html');
  const csp = h.headers.get('content-security-policy') || '';
  const scriptSrc = (csp.match(/script-src ([^;]*)/) || [])[1] || '';
  P('CSP: scripts solo propios (sin unsafe-inline)', scriptSrc.trim() === "'self'", scriptSrc);
  P('CSP: no se puede embeber en otros sitios', /frame-ancestors 'self'/.test(csp));
  P('Cabeceras: nosniff, Referrer-Policy, HSTS y Permissions-Policy', h.headers.get('x-content-type-options') === 'nosniff' && /strict-origin/.test(h.headers.get('referrer-policy') || '') && /max-age=31536000/.test(h.headers.get('strict-transport-security') || '') && /camera=\(\)/.test(h.headers.get('permissions-policy') || ''));
  P('No se expone la tecnología del servidor', !h.headers.get('x-powered-by'));
  const html = await h.text();
  P('Las pantallas no tienen scripts en línea', !/<script>/.test(html));

  // ---- Límites de pedidos
  let ultimo = 0;
  for (let i = 0; i < 12; i++) ultimo = (await loginR(`inexistente${suf}`, 'Cualquiera1')).s;
  P('Login: más de 10 intentos por minuto a la misma cuenta → 429', ultimo === 429, ultimo);
  let codigos = [];
  for (let i = 0; i < 125; i++) codigos.push((await H('/api/web/publico/info')).status);
  P('Página pública: tope de pedidos por minuto → 429', codigos.includes(429), codigos.slice(-3));

  // ---- Auditoría inmutable
  let err = null; try { await db.query('UPDATE auditoria SET accion=$1 WHERE id=(SELECT max(id) FROM auditoria)', ['borrado']); } catch (e) { err = e.message; }
  P('La auditoría no se puede modificar (ni desde la base)', /no se puede modificar/.test(err || ''), err);
  err = null; try { await db.query('DELETE FROM auditoria WHERE id=(SELECT max(id) FROM auditoria)'); } catch (e) { err = e.message; }
  P('…ni borrar', /no se puede modificar/.test(err || ''), err);

  // ---- Registros sin datos sensibles
  await req('GET', `/busqueda?q=MarcadorPrivado${suf}`, null, { tok: A });
  await new Promise((rr) => setTimeout(rr, 300));
  const log = require('fs').readFileSync((process.env.DOVA_LOG || '/tmp/dova-server.log'), 'utf8');
  P('El registro del servidor no guarda lo que se busca', !log.includes(`MarcadorPrivado${suf}`) && log.includes('/api/busqueda?[q]'));

  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); await db.end(); process.exit(ok === res.length ? 0 : 1);
})().catch(async (e) => { console.error(e); process.exit(1); });
