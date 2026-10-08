// Vincular usuarios a odontólogos desde Usuarios (API).
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const req = async (m, url, body, tok, extra = {}) => { const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null), r }; };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const rolOdo = (await q1("SELECT id FROM roles WHERE clinica_id=1 AND codigo='odontologo'")).id;
  const odo = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1, $1) RETURNING id", [`Dra. Vinculo ${suf}`])).id;
  const odo2 = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1, $1) RETURNING id", [`Dr. Otro ${suf}`])).id;
  const odoB = (await q1('SELECT id FROM odontologos WHERE clinica_id<>1 LIMIT 1')).id;
  // Alta con odontólogo
  let r = await req('POST', '/usuarios', { nombre: 'Vinculo Uno', username: `vin${suf}a`, password: 'Inicial2026x', rolId: rolOdo, odontologoId: odo }, A);
  const u1 = r.j; P('Alta de usuario ya vinculado a un odontólogo', r.s === 201 && (await q1('SELECT odontologo_id FROM usuarios WHERE id=$1', [u1.id])).odontologo_id === odo, r);
  r = await req('GET', '/usuarios?pageSize=200', null, A);
  P('El listado muestra el nombre del odontólogo', r.s === 200 && r.j.items.some((u) => u.id === u1.id && u.odontologo_nombre === `Dra. Vinculo ${suf}`), r.s);
  // Segundo usuario: no puede tomar el mismo odontólogo
  r = await req('POST', '/usuarios', { nombre: 'Vinculo Dos', username: `vin${suf}b`, password: 'Inicial2026x', rolId: rolOdo }, A);
  const u2 = r.j;
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: odo }, A);
  P('Un odontólogo no se vincula a dos usuarios activos (409 con el nombre de quien lo tiene)', r.s === 409 && /Vinculo Uno/.test(r.j.error.message), r);
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: odo2 }, A);
  P('Vincular un odontólogo libre', r.s === 200 && r.j.odontologo_id === odo2, r);
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: odoB }, A);
  P('Odontólogo de otra clínica: 400', r.s === 400, r);
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: odo }, R);
  P('Sin permiso de usuarios: 403', r.s === 403, r.s);
  P('Queda en la auditoría con antes y después', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='actualizar_usuario' AND entidad_id=$1 AND detalle->'despues' ? 'odontologo_id'", [String(u2.id)])));
  // Al instante: el servidor usa el vínculo de la base, no el del token
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [u2.id]);
  const lg = await req('POST', '/auth/login', { username: `vin${suf}b`, password: 'Inicial2026x' });
  const T2 = lg.j.accessToken; const ck = (lg.r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('dova_rt='));
  P('Al entrar, la sesión trae su odontólogo', lg.j.usuario.odontologoId === odo2, lg.j.usuario);
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: null }, A);
  P('Quitar el vínculo', r.s === 200 && r.j.odontologo_id === null, r);
  await new Promise((ok) => setTimeout(ok, 300));
  r = await req('POST', '/auth/refresh', null, null, { cookie: ck, 'x-dova-csrf': '1' });
  P('La renovación de sesión informa el cambio (sin volver a entrar)', r.s === 200 && r.j.odontologoId === null, r.j);
  P('…y su sesión sigue abierta (no se lo echa)', (await req('GET', '/pacientes?limite=1', null, T2)).s === 200);
  // Reactivar a alguien cuyo odontólogo tomó otro usuario
  await req('PUT', `/usuarios/${u1.id}`, { activo: false }, A);
  r = await req('PUT', `/usuarios/${u2.id}`, { odontologoId: odo }, A);
  P('Con el usuario anterior dado de baja, el odontólogo se puede vincular a otro', r.s === 200 && r.j.odontologo_id === odo, r);
  r = await req('PUT', `/usuarios/${u1.id}`, { activo: true }, A);
  P('Reactivar al anterior con el odontólogo ya tomado: 409', r.s === 409, r);
  r = await req('GET', '/usuarios?pageSize=-5', null, A);
  P('Tamaño de página inválido no da error', r.s === 200, r.s);
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
