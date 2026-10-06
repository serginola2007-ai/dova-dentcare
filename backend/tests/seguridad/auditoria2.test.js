// Auditoría de seguridad 2: autenticación (token vencido, adulterado, usuario
// desactivado), asignación masiva, escalada de privilegios, validación de
// importes, archivos (ajenos y path traversal), exportaciones sin permiso y
// tiempo real (SSE) sin sesión o de otra clínica.
// Requiere: DATABASE_URL (base de prueba), DOVA_URL y JWT_SECRET (el mismo del servidor de prueba).
const { Pool, types } = require('pg');
const jwt = require('jsonwebtoken');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, { tok, form, raw } = {}) => {
  const h = {}; if (tok) h.authorization = `Bearer ${tok}`; if (body && !form) h['content-type'] = 'application/json';
  const r = await fetch(B + url, { method: m, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  if (raw) return r; return { s: r.status, j: await r.json().catch(() => null) };
};
const login = async (u, p, extra = {}) => (await req('POST', '/auth/login', { username: u, password: p, ...extra })).j.accessToken;
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

// Escucha el canal de tiempo real durante "ms" milisegundos y devuelve lo recibido.
async function escuchar(tok, ms, alAbrir) {
  const ctrl = new AbortController(); let texto = ''; let estado = 0; let cerrado = false;
  try {
    const r = await fetch(`${B}/eventos`, { headers: tok ? { authorization: `Bearer ${tok}`, accept: 'text/event-stream' } : { accept: 'text/event-stream' }, signal: ctrl.signal });
    estado = r.status;
    if (r.status !== 200) return { estado, texto: await r.text(), cerrado: true };
    const lector = r.body.getReader(); const dec = new TextDecoder();
    const fin = setTimeout(() => ctrl.abort(), ms);
    if (alAbrir) setTimeout(alAbrir, 300);
    for (;;) { const { value, done } = await lector.read(); if (done) { cerrado = true; break; } texto += dec.decode(value); }
    clearTimeout(fin);
  } catch (_e) { /* abortado por tiempo */ }
  return { estado, texto, cerrado };
}

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','odo1')");
  const A = await login('admin', 'admin'); const R = await login('recep1', 'clave123'); const SP = await login('sinperm', 'Clave1234!');
  const TB = await login('adminb', 'Clave1234!', { clinicaSlug: 'clinica-b' });
  P('Sesiones de prueba', A && R && SP && TB);
  const admin = await q1("SELECT id, token_version FROM usuarios WHERE username='admin' AND clinica_id=1");
  const recep = await q1("SELECT id, rol_id, password_hash FROM usuarios WHERE username='recep1' AND clinica_id=1");
  const adminB = await q1("SELECT id, clinica_id FROM usuarios WHERE username='adminb'");
  const rolAdmin = (await q1("SELECT id FROM roles WHERE codigo='admin' AND clinica_id=1")).id;
  const rolRecep = (await q1("SELECT id FROM roles WHERE codigo='recepcion' AND clinica_id=1")).id;
  const pac = await q1("SELECT id FROM pacientes WHERE clinica_id=1 AND activo AND apellido LIKE 'ZZMARCADOR%' ORDER BY id LIMIT 1");
  const otroPac = await q1('SELECT id FROM pacientes WHERE clinica_id=1 AND activo AND id<>$1 ORDER BY id LIMIT 1', [pac.id]);
  const suf = String(Date.now() % 1000000);

  // ================= 1. Autenticación
  P('Sin token: 401', (await req('GET', '/pacientes')).s === 401);
  P('Token basura: 401', (await req('GET', '/pacientes', null, { tok: 'abc.def.ghi' })).s === 401);
  const secreto = process.env.JWT_SECRET;
  if (secreto) {
    const base = { sub: admin.id, clinicaId: 1, rolCodigo: 'admin', nombre: 'Admin', tv: Number(admin.token_version) || 0, permisos: ['pacientes.view'] };
    const vencido = jwt.sign({ ...base, iat: Math.floor(Date.now() / 1000) - 3600 }, secreto, { expiresIn: '1s', algorithm: 'HS256', jwtid: `t${suf}a` });
    P('Token vencido: 401', (await req('GET', '/pacientes', null, { tok: vencido })).s === 401);
    const otraClinica = jwt.sign({ ...base, clinicaId: adminB.clinica_id }, secreto, { expiresIn: '5m', algorithm: 'HS256', jwtid: `t${suf}b` });
    P('Token bien firmado pero con la clínica cambiada: 401', (await req('GET', '/pacientes', null, { tok: otraClinica })).s === 401);
    const versionVieja = jwt.sign({ ...base, tv: (Number(admin.token_version) || 0) - 1 }, secreto, { expiresIn: '5m', algorithm: 'HS256', jwtid: `t${suf}c` });
    P('Token de una versión de sesión anterior (tras cambio de clave/rol): 401', (await req('GET', '/pacientes', null, { tok: versionVieja })).s === 401);
    const otraFirma = jwt.sign(base, 'otra-clave-cualquiera-0123456789abcdef', { expiresIn: '5m', algorithm: 'HS256' });
    P('Token firmado con otra clave: 401', (await req('GET', '/pacientes', null, { tok: otraFirma })).s === 401);
    const hs512 = jwt.sign(base, secreto, { expiresIn: '5m', algorithm: 'HS512' });
    P('Token con otro algoritmo (HS512): 401', (await req('GET', '/pacientes', null, { tok: hs512 })).s === 401);
  } else console.log('(sin JWT_SECRET: se omiten las pruebas de token vencido/adulterado)');
  // Usuario desactivado
  let r = await req('POST', '/usuarios', { nombre: 'Baja Prueba', username: `baja${suf}`, password: 'Inicial2026x', rolId: rolRecep }, { tok: A });
  const uBaja = r.j;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [uBaja.id]);
  const lb = await req('POST', '/auth/login', { username: `baja${suf}`, password: 'Inicial2026x' }, { raw: true });
  const tokBaja = (await lb.json()).accessToken; const ckBaja = (lb.headers.getSetCookie() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('dova_rt='));
  P('El usuario nuevo entra', (await req('GET', '/pacientes', null, { tok: tokBaja })).s === 200);
  r = await req('PUT', `/usuarios/${uBaja.id}`, { activo: false }, { tok: A });
  P('El admin lo desactiva', r.s === 200, r);
  P('Usuario desactivado: su token deja de valer al instante (401)', (await req('GET', '/pacientes', null, { tok: tokBaja })).s === 401);
  r = await fetch(`${B}/auth/refresh`, { method: 'POST', headers: { cookie: ckBaja, 'x-dova-csrf': '1' } });
  P('Usuario desactivado: no puede renovar la sesión (401)', r.status === 401, r.status);
  P('Usuario desactivado: no puede iniciar sesión', (await req('POST', '/auth/login', { username: `baja${suf}`, password: 'Inicial2026x' })).s === 401);

  // ================= 2. Asignación masiva (mass assignment)
  r = await req('POST', '/pacientes', { nombre: 'Masivo', apellido: `Prueba${suf}`, ci: `MA${suf}`, clinicaId: adminB.clinica_id, clinica_id: adminB.clinica_id, id: 1, web_verificado: true, webVerificado: true, creado_por: 999999 }, { tok: R });
  const pm = r.j && r.j.id && await q1('SELECT * FROM pacientes WHERE id=$1', [r.j.id]);
  P('Alta de paciente con clinicaId/clinica_id/id ajenos: queda en la clínica propia, con id nuevo', r.s === 201 && pm && pm.clinica_id === 1 && pm.id !== 1, { s: r.s, pm: pm && { id: pm.id, c: pm.clinica_id } });
  r = await req('PUT', `/pacientes/${pm.id}`, { nombre: 'Masivo2', clinicaId: adminB.clinica_id, clinica_id: adminB.clinica_id }, { tok: R });
  P('Editar paciente mandando clinica_id ajena: sigue en la clínica propia', r.s === 200 && (await q1('SELECT clinica_id FROM pacientes WHERE id=$1', [pm.id])).clinica_id === 1, r.s);
  r = await req('PUT', `/usuarios/${recep.id}`, { nombre: 'Recepción Uno', clinicaId: adminB.clinica_id, clinica_id: adminB.clinica_id, es_admin_protegido: true, esAdminProtegido: true, permisos: ['usuarios.manage'], token_version: 0, password_hash: 'x', passwordHash: 'x', activo: true }, { tok: A });
  const ru = await q1('SELECT clinica_id, es_admin_protegido, password_hash FROM usuarios WHERE id=$1', [recep.id]);
  P('Editar usuario con clinica_id, es_admin_protegido, permisos y password_hash en el cuerpo: se ignoran', r.s === 200 && ru.clinica_id === 1 && !ru.es_admin_protegido && ru.password_hash === recep.password_hash, { s: r.s, ru: { c: ru.clinica_id, p: ru.es_admin_protegido } });
  r = await req('PATCH', '/usuarios/me/preferencias', { disenoPreferido: 'moderno', rolId: rolAdmin, rol_id: rolAdmin }, { tok: R });
  P('Preferencias propias con rolId admin en el cuerpo: el rol no cambia', (await q1('SELECT rol_id FROM usuarios WHERE id=$1', [recep.id])).rol_id === recep.rol_id, r);
  const odoB = await q1('SELECT id FROM odontologos WHERE clinica_id<>1 ORDER BY id LIMIT 1');
  if (odoB) {
    r = await req('PUT', `/usuarios/${recep.id}`, { odontologoId: odoB.id }, { tok: A });
    P('Vincular a un usuario un profesional de OTRA clínica: 400', r.s === 400 && (await q1('SELECT odontologo_id FROM usuarios WHERE id=$1', [recep.id])).odontologo_id !== odoB.id, r);
  }

  // ================= 3. Escalada de privilegios
  r = await req('POST', '/usuarios', { nombre: 'Escala', username: `esc${suf}`, password: 'Inicial2026x', rolId: rolAdmin }, { tok: R });
  P('Recepción no puede crear usuarios (ni administradores): 403', r.s === 403, r.s);
  r = await req('PUT', `/usuarios/roles/${rolRecep}/permisos`, { codigos: ['usuarios.manage', 'roles.manage'] }, { tok: R });
  P('Recepción no puede darse permisos a su rol: 403', r.s === 403, r.s);
  r = await req('PUT', `/usuarios/${adminB.id}`, { nombre: 'Tomado' }, { tok: A });
  P('El admin de la Clínica A no puede editar al admin de la Clínica B: 404', r.s === 404, r.s);
  r = await req('POST', `/usuarios/${adminB.id}/password`, { password: 'Tomada2026xx' }, { tok: A });
  P('…ni blanquearle la contraseña: 404', r.s === 404, r.s);
  r = await req('POST', `/usuarios/${adminB.id}/cerrar-sesiones`, null, { tok: A });
  P('…ni cerrarle las sesiones: 404', r.s === 404, r.s);

  // ================= 4. Importes y estados (pagos, caja, presupuestos, planes de pago)
  for (const [v, n] of [[0, 'cero'], [-5000, 'negativo'], ['abc', 'texto'], ['1e400', 'notación exponencial'], ['Infinity', 'Infinity'], [1e15, 'desmesurado'], [true, 'booleano'], [{ a: 1 }, 'objeto'], ['100abc', 'número con basura']]) {
    r = await req('POST', '/pagos', { pacienteId: pac.id, monto: v, metodo: 'efectivo' }, { tok: A });
    P(`Cobro con monto ${n}: 400`, r.s === 400, r);
  }
  r = await req('POST', '/pagos', { pacienteId: pac.id, monto: 1000, metodo: 'efectivo', estado: 'anulado', usuario_id: 999999, usuarioId: 999999, clinica_id: adminB.clinica_id, clinicaId: adminB.clinica_id }, { tok: A });
  const pg = r.j && r.j.id && await q1('SELECT estado, usuario_id, clinica_id FROM pagos WHERE id=$1', [r.j.id]);
  P('Cobro con estado/usuario/clínica en el cuerpo: los pone el servidor', r.s === 201 && pg && pg.estado === 'pagado' && pg.usuario_id === admin.id && pg.clinica_id === 1, { s: r.s, pg });
  r = await req('POST', '/planes-pago', { pacienteId: pac.id, total: 300000, cantidadCuotas: 3 }, { tok: A });
  const plan = r.j; const cuota = plan && plan.id && await q1('SELECT id, monto FROM cuotas WHERE plan_pago_id=$1 ORDER BY numero LIMIT 1', [plan.id]);
  P('Plan de pago de prueba', !!cuota, r);
  if (cuota) {
    r = await req('POST', '/pagos', { pacienteId: pac.id, cuotaId: cuota.id, monto: 1, metodo: 'efectivo' }, { tok: A });
    P('Cobrar 1 Gs. aplicado a una cuota mayor: 400 (no se marca pagada)', r.s === 400 && (await q1('SELECT estado FROM cuotas WHERE id=$1', [cuota.id])).estado !== 'pagada', r);
    r = await req('POST', '/pagos', { pacienteId: otroPac.id, cuotaId: cuota.id, monto: Number(cuota.monto), metodo: 'efectivo' }, { tok: A });
    P('Cobrar a un paciente aplicando la cuota de OTRO paciente: 400', r.s === 400 && (await q1('SELECT estado FROM cuotas WHERE id=$1', [cuota.id])).estado !== 'pagada', r);
  }
  for (const [d, n] of [[{ cantidadCuotas: 2.5 }, 'cuotas fraccionarias'], [{ cantidadCuotas: 0 }, 'cero cuotas'], [{ total: 'Infinity' }, 'total Infinity'], [{ total: -1 }, 'total negativo'], [{ entrega: 999999999 }, 'entrega mayor al total']]) {
    r = await req('POST', '/planes-pago', { pacienteId: pac.id, total: 300000, cantidadCuotas: 3, ...d }, { tok: A });
    P(`Plan de pago con ${n}: 400`, r.s === 400, r);
  }
  for (const [d, n] of [[150, 'mayor a 100%'], [-1, 'negativo'], ['abc', 'texto']]) {
    r = await req('POST', '/presupuestos', { pacienteId: pac.id, descuento: d, items: [{ descripcion: 'Limpieza', cantidad: 1, precioUnitario: 100000 }] }, { tok: A });
    P(`Presupuesto con descuento ${n}: 400`, r.s === 400, r);
  }
  r = await req('POST', '/presupuestos', { pacienteId: pac.id, items: [{ descripcion: 'Limpieza', cantidad: 'Infinity', precioUnitario: 100000 }] }, { tok: A });
  P('Presupuesto con cantidad Infinity: 400', r.s === 400, r);
  r = await req('POST', '/presupuestos', { pacienteId: pac.id, total: 1, estado: 'aceptado', items: [{ descripcion: 'Limpieza', cantidad: 2, precioUnitario: 100000 }] }, { tok: A });
  const pr = r.j && r.j.id && await q1('SELECT total, estado FROM presupuestos WHERE id=$1', [r.j.id]);
  P('Presupuesto con total y estado en el cuerpo: el total lo calcula el servidor y nace en borrador', r.s === 201 && pr && Number(pr.total) === 200000 && pr.estado === 'borrador', { s: r.s, pr });
  if (pr) {
    r = await req('PATCH', `/presupuestos/${r.j.id}/estado`, { estado: 'pagado' }, { tok: A });
    P('Estado de presupuesto inexistente ("pagado"): 400', r.s === 400, r);
    const idPr = (await q1('SELECT max(id) id FROM presupuestos WHERE paciente_id=$1', [pac.id])).id;
    await req('PATCH', `/presupuestos/${idPr}/estado`, { estado: 'enviado' }, { tok: A });
    await req('PATCH', `/presupuestos/${idPr}/estado`, { estado: 'rechazado' }, { tok: A });
    r = await req('PATCH', `/presupuestos/${idPr}/estado`, { estado: 'aceptado' }, { tok: A });
    P('Un presupuesto rechazado no puede pasar a aceptado: 409', r.s === 409, r);
  }
  const caja = (await req('GET', '/caja/estado', null, { tok: A })).j;
  if (!caja.abierta) await req('POST', '/caja/abrir', { montoInicial: 0 }, { tok: A });
  for (const [v, n] of [['abc', 'texto'], [0, 'cero'], [-100, 'negativo'], ['Infinity', 'Infinity']]) {
    r = await req('POST', '/caja/movimiento', { tipo: 'egreso', concepto: 'Prueba', monto: v }, { tok: A });
    P(`Movimiento de caja con monto ${n}: 400`, r.s === 400, r);
  }
  r = await req('POST', '/caja/movimiento', { tipo: 'robo', concepto: 'Prueba', monto: 100 }, { tok: A });
  P('Movimiento de caja con tipo inventado: 400', r.s === 400, r);
  r = await req('POST', '/caja/movimiento', { tipo: 'ingreso', concepto: 'Prueba', monto: 100 }, { tok: R });
  const rolR = await q1("SELECT 1 x FROM rol_permisos rp JOIN permisos p ON p.id=rp.permiso_id WHERE rp.rol_id=$1 AND p.codigo='caja.manage'", [rolRecep]).catch(() => null);
  if (!rolR) P('Sin permiso de caja no se registran movimientos: 403', r.s === 403, r.s);
  r = await req('POST', '/facturacion', { pacienteId: pac.id, items: [{ descripcion: 'X', cantidad: 1, precioUnitario: -1000 }] }, { tok: A });
  P('Factura con precio negativo: 400', r.s === 400, r);

  // ================= 5. Archivos
  const fotoA = await q1('SELECT id FROM fotos_clinicas WHERE clinica_id=1 AND archivo IS NOT NULL ORDER BY id DESC LIMIT 1');
  if (fotoA) {
    r = await req('GET', `/clinico/fotos/${fotoA.id}/archivo`, null, { tok: TB, raw: true });
    P('Foto clínica de otra clínica: 404', r.status === 404, r.status);
    r = await req('GET', `/clinico/fotos/${fotoA.id}/archivo`, null, { tok: SP, raw: true });
    P('Foto clínica sin permiso clínico: 403', r.status === 403, r.status);
  }
  for (const ruta of ['/etc/passwd', '../../../../../../etc/passwd', '/proc/self/environ']) {
    const f = await q1("INSERT INTO fotos_clinicas (clinica_id, paciente_id, categoria, storage_path, fecha) VALUES (1,$1,'otra',$2,CURRENT_DATE) RETURNING id", [pac.id, ruta]).catch((e) => ({ error: e.message }));
    if (f.error) { P('Fila de prueba con ruta manipulada', false, f.error); continue; }
    r = await req('GET', `/clinico/fotos/${f.id}/archivo`, null, { tok: A, raw: true });
    const t = await r.text();
    P(`Ruta de archivo manipulada en la base (${ruta}): no se lee fuera de la carpeta de subidas`, r.status === 404 && !t.includes('root:') && !t.includes('JWT_SECRET') && !t.includes('DATABASE_URL'), { s: r.status, t: t.slice(0, 80) });
    await db.query('DELETE FROM fotos_clinicas WHERE id=$1', [f.id]);
  }
  for (const u of ['/clinico/fotos/..%2F..%2F..%2Fetc%2Fpasswd/archivo', '/clinico/estudios/..%2F..%2Fetc%2Fpasswd/archivo', '/helpdesk/adjuntos/..%2F..%2Fetc%2Fpasswd/descargar', '/clinico/fotos/1%20OR%201=1/archivo']) {
    r = await req('GET', u, null, { tok: A, raw: true });
    const t = await r.text();
    P(`Path traversal / inyección en el ID (${u.split('/')[2]}): rechazado`, r.status >= 400 && r.status < 500 && !t.includes('root:'), { s: r.status, t: t.slice(0, 80) });
  }
  const fd = new FormData(); fd.append('pacienteId', String(pac.id)); fd.append('categoria', 'otra');
  fd.append('archivo', new Blob(['#!/bin/sh\necho hola'], { type: 'image/png' }), '../../../../tmp/evil.png');
  r = await req('POST', '/clinico/fotos', null, { tok: A, form: fd });
  P('Subir un archivo que dice ser PNG pero no lo es (nombre con ../): 400', r.s === 400, r);

  // ================= 6. Exportaciones
  r = await req('GET', `/kpis/exportar-paciente/${pac.id}`, null, { tok: SP, raw: true });
  P('Exportar datos de un paciente sin permiso: 403', r.status === 403, r.status);
  r = await req('GET', `/kpis/exportar-paciente/${pac.id}`, null, { tok: TB, raw: true });
  P('Exportar un paciente de OTRA clínica: 404', r.status === 404, r.status);
  for (const u of [`/reportes/centro/cobros?desde=2025-01-01&hasta=2027-12-31&formato=xlsx`, `/reportes/centro/pacientes_nuevos?desde=2025-01-01&hasta=2027-12-31&formato=csv`, `/reportes/centro/saldos_pendientes?formato=pdf`]) {
    r = await req('GET', u, null, { tok: SP, raw: true });
    P(`Exportar reporte sin permiso (${u.split('?')[0].split('/').pop()} ${u.split('formato=')[1]}): 403`, r.status === 403, r.status);
  }
  r = await req('GET', '/reportes/centro/cobros?desde=2025-01-01&hasta=2027-12-31&formato=csv', null, { tok: TB, raw: true });
  const csvB = await r.text();
  const marca = (await q1("SELECT apellido FROM pacientes WHERE apellido LIKE 'ZZMARCADOR%' AND clinica_id=1 ORDER BY id DESC LIMIT 1")).apellido;
  P('Exportación de la Clínica B no trae datos de la A', r.status === 200 ? !csvB.includes(marca) : r.status === 403, r.status);

  // ================= 7. Tiempo real (SSE)
  let e = await escuchar(null, 1000);
  P('Tiempo real sin sesión: 401', e.estado === 401, e.estado);
  e = await escuchar('abc.def.ghi', 1000);
  P('Tiempo real con token inválido: 401', e.estado === 401, e.estado);
  const [ea, eb] = await Promise.all([
    escuchar(A, 3500),
    escuchar(TB, 3500, async () => { await req('POST', '/pacientes', { nombre: 'Evento', apellido: `SSE${suf}`, ci: `SS${suf}` }, { tok: A }); }),
  ]);
  P('Tiempo real: la Clínica A recibe el aviso de su cambio (control)', ea.estado === 200 && /pacientes/.test(ea.texto), ea.texto.slice(0, 200));
  P('Tiempo real: la Clínica B NO recibe avisos de la Clínica A', eb.estado === 200 && !/pacientes/.test(eb.texto), eb.texto.slice(0, 200));
  P('Tiempo real: los avisos no traen datos personales (solo tabla/acción/id)', !ea.texto.includes(`SSE${suf}`) && !ea.texto.includes(`SS${suf}`), ea.texto.slice(0, 200));
  const tokS = await login('recep1', 'clave123');
  const cierre = escuchar(tokS, 4000);
  await new Promise((ok) => setTimeout(ok, 500));
  await req('POST', '/auth/logout', null, { tok: tokS });
  const ec = await cierre;
  P('Tiempo real: al cerrar sesión se corta la conexión abierta', ec.cerrado, ec);

  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length} OK`);
  process.exit(ok === res.length ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
