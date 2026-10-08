// Eliminar usuarios (API).
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const req = async (m, url, body, tok) => { const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const admin = await q1("SELECT id FROM usuarios WHERE username='admin' AND clinica_id=1");
  const suf = String(Date.now() % 1000000);
  const rolOdo = (await q1("SELECT id FROM roles WHERE clinica_id=1 AND codigo='odontologo'")).id;
  const odo = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1, $1) RETURNING id", [`Dra. Borrar ${suf}`])).id;
  // 1) Creado por error, nunca usado → se borra por completo
  let r = await req('POST', '/usuarios', { nombre: 'Error Tipeo', username: `err${suf}`, password: 'Inicial2026x', rolId: rolOdo, odontologoId: odo }, A);
  const u1 = r.j.id;
  r = await req('DELETE', `/usuarios/${u1}`, null, A);
  P('Usuario sin uso: se borra por completo', r.s === 200 && r.j.modo === 'borrado' && !(await q1('SELECT 1 x FROM usuarios WHERE id=$1', [u1])), r);
  P('…y el odontólogo queda libre para otro usuario', (await req('POST', '/usuarios', { nombre: 'Bien Escrito', username: `bien${suf}`, password: 'Inicial2026x', rolId: rolOdo, odontologoId: odo }, A)).s === 201);
  P('…y el nombre de usuario se puede volver a usar', (await req('POST', '/usuarios', { nombre: 'Error Tipeo', username: `err${suf}`, password: 'Inicial2026x', rolId: rolOdo }, A)).s === 201);
  // 2) Usuario que ya trabajó → baja definitiva, historial intacto
  const u2 = (await q1('SELECT id FROM usuarios WHERE username=$1', [`bien${suf}`])).id;
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE id=$1', [u2]);
  const T2 = (await req('POST', '/auth/login', { username: `bien${suf}`, password: 'Inicial2026x' })).j.accessToken;
  const pac = await q1('SELECT id FROM pacientes WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1');
  const nota = (await q1("INSERT INTO paciente_notas (paciente_id, usuario_id, texto) VALUES ($1,$2,'Nota de prueba') RETURNING id", [pac.id, u2]).catch(async () => null));
  r = await req('DELETE', `/usuarios/${u2}`, null, A);
  const fila = await q1('SELECT activo, eliminado_en, username, odontologo_id FROM usuarios WHERE id=$1', [u2]);
  P('Usuario con actividad: queda eliminado (no se borra el registro)', r.s === 200 && r.j.modo === 'baja' && fila && !fila.activo && fila.eliminado_en && fila.odontologo_id === null, { r, fila });
  P('…su historial conserva el autor', !nota || (await q1('SELECT usuario_id FROM paciente_notas WHERE id=$1', [nota.id])).usuario_id === u2);
  P('…su sesión abierta deja de valer al instante', (await req('GET', '/pacientes?limite=1', null, T2)).s === 401);
  P('…no puede volver a entrar', (await req('POST', '/auth/login', { username: `bien${suf}`, password: 'Inicial2026x' })).s === 401);
  r = await req('GET', '/usuarios?pageSize=500&incluirInactivos=true', null, A);
  P('…no aparece en la lista de usuarios (ni con inactivos)', !r.j.items.some((u) => u.id === u2), r.s);
  P('…queda libre su nombre de usuario', (await req('POST', '/usuarios', { nombre: 'Otra Persona', username: `bien${suf}`, password: 'Inicial2026x', rolId: rolOdo, odontologoId: odo }, A)).s === 201);
  P('…no se puede reactivar ni editar', (await req('PUT', `/usuarios/${u2}`, { activo: true }, A)).s === 404);
  P('…eliminarlo de nuevo: 404', (await req('DELETE', `/usuarios/${u2}`, null, A)).s === 404);
  P('Queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='eliminar_usuario' AND entidad_id=$1 AND detalle->>'modo'='baja'", [String(u2)])));
  // 3) Protecciones
  P('No te podés eliminar a vos mismo', (await req('DELETE', `/usuarios/${admin.id}`, null, A)).s === 403);
  const prot = await q1('SELECT id FROM usuarios WHERE clinica_id=1 AND es_admin_protegido LIMIT 1');
  if (prot && prot.id !== admin.id) P('El administrador protegido no se elimina', (await req('DELETE', `/usuarios/${prot.id}`, null, A)).s === 403);
  const otro = (await q1("SELECT id FROM usuarios WHERE username=$1", [`err${suf}`])).id;
  P('Sin permiso de usuarios: 403', (await req('DELETE', `/usuarios/${otro}`, null, R)).s === 403);
  const ajeno = await q1('SELECT id FROM usuarios WHERE clinica_id<>1 LIMIT 1');
  P('Usuario de otra clínica: 404', (await req('DELETE', `/usuarios/${ajeno.id}`, null, A)).s === 404);
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
