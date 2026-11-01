// Odontograma: caras del diente, endodoncia aparte, dentición (permanente / temporal / mixta),
// historial completo y que todo id se valide contra la clínica.
// Uso: DATABASE_URL=… DOVA_URL=http://localhost:4500 [DOVA_USUARIO=admin DOVA_CLAVE=admin] node tests/odontograma.test.js
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  const suf = String(Date.now() % 1000000);
  const usuario = process.env.DOVA_USUARIO || 'admin';
  await db.query('DELETE FROM login_intentos');
  await db.query('UPDATE usuarios SET debe_cambiar_clave=false WHERE username=$1 AND clinica_id=1', [usuario]);
  const A = (await req('POST', '/auth/login', { username: usuario, password: process.env.DOVA_CLAVE || 'admin' })).j.accessToken;
  P('Ingresa el administrador', !!A);
  const anios = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento) VALUES (1,'Odonto',$1,$2,$3) RETURNING id", [`Api${suf}`, `OA${suf}`, anios(35)])).id;
  const chico = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento) VALUES (1,'Chico',$1,$2,$3) RETURNING id", [`Api${suf}`, `OC${suf}`, anios(4)])).id;
  const mixto = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento) VALUES (1,'Mixto',$1,$2,$3) RETURNING id", [`Api${suf}`, `OM${suf}`, anios(9)])).id;
  const otraClinica = (await q1("INSERT INTO clinicas (nombre, slug) VALUES ($1,$2) RETURNING id", [`Otra ${suf}`, `otra-odo-${suf}`])).id;
  const ajeno = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES ($1,'Ajeno',$2,$3) RETURNING id", [otraClinica, `Api${suf}`, `OX${suf}`])).id;
  const odoAjeno = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES ($1,$2) RETURNING id", [otraClinica, `Dr. Ajeno ${suf}`])).id;
  const put = (body, p = pac) => req('PUT', `/odontograma/paciente/${p}`, body, A);

  try {
    // ---- Caras y raíz
    let r = await put({ pieza: '16', superficie: 'oclusal_incisal', estado: 'caries' });
    P('Marca caries en la cara oclusal', r.s === 200 && r.j.superficie === 'oclusal_incisal', r);
    r = await put({ pieza: '16', superficie: 'mesial', estado: 'restauracion', observacion: 'Resina 2024' });
    P('Marca restauración en la cara mesial, con nota', r.s === 200 && r.j.observacion === 'Resina 2024', r);
    r = await put({ pieza: '16', superficie: 'general', estado: 'corona' });
    r = await put({ pieza: '16', superficie: 'raiz', estado: 'endodoncia' });
    P('Corona y endodoncia conviven (la endodoncia va en la raíz)', r.s === 200
      && (await db.query("SELECT superficie FROM odontograma_piezas WHERE paciente_id=$1 AND pieza='16' ORDER BY superficie", [pac])).rows.map((x) => x.superficie).join(',') === 'general,mesial,oclusal_incisal,raiz');
    r = await put({ pieza: '16', superficie: 'mesial', estado: 'corona' });
    P('En una cara no se puede marcar "corona" → 400', r.s === 400, r);
    r = await put({ pieza: '16', superficie: 'raiz', estado: 'caries' });
    P('En la raíz solo endodoncia → 400', r.s === 400, r);
    r = await put({ pieza: '16', superficie: 'palatino', estado: 'caries' });
    P('Cara inexistente → 400', r.s === 400, r);
    r = await put({ pieza: '19', estado: 'caries' });
    P('Pieza inexistente → 400', r.s === 400, r);
    r = await put({ pieza: '55', superficie: 'oclusal_incisal', estado: 'caries' }, chico);
    P('Diente de leche (55) se marca igual', r.s === 200, r);
    r = await put({ pieza: '16', estado: 'caries', observacion: 'x'.repeat(501) });
    P('Nota de más de 500 caracteres → 400', r.s === 400, r);
    r = await put({ pieza: '16', estado: 'caries', odontologoId: odoAjeno });
    P('Odontólogo de otra clínica → 400', r.s === 400, r);

    // ---- Datos + dentición
    r = await req('GET', `/odontograma/paciente/${pac}/datos`, undefined, A);
    P('Datos: piezas y dentición permanente para un adulto', r.s === 200 && r.j.piezas.length >= 4 && r.j.denticion === 'permanente' && r.j.denticionElegida === null, r.j && r.j.denticion);
    r = await req('GET', `/odontograma/paciente/${chico}/datos`, undefined, A);
    P('Dentición automática: 4 años → temporal', r.j.denticion === 'temporal', r.j);
    r = await req('GET', `/odontograma/paciente/${mixto}/datos`, undefined, A);
    P('Dentición automática: 9 años → mixta', r.j.denticion === 'mixta', r.j);
    r = await req('PUT', `/odontograma/paciente/${mixto}/denticion`, { denticion: 'permanente' }, A);
    P('Se puede elegir otra dentición y queda guardada', r.s === 200 && r.j.denticion === 'permanente' && r.j.denticionElegida === 'permanente', r.j);
    r = await req('PUT', `/odontograma/paciente/${mixto}/denticion`, { denticion: '' }, A);
    P('Vacía vuelve a la automática', r.s === 200 && r.j.denticion === 'mixta' && r.j.denticionElegida === null, r.j);
    r = await req('PUT', `/odontograma/paciente/${mixto}/denticion`, { denticion: 'adulta' }, A);
    P('Dentición inválida → 400', r.s === 400, r);

    // ---- Historial
    r = await req('GET', `/odontograma/paciente/${pac}/historial`, undefined, A);
    const h = r.j || [];
    P('Historial: todos los cambios, del más viejo al más nuevo', r.s === 200 && h.length === 4 && h[0].estado === 'caries' && h[3].estado === 'endodoncia'
      && h.every((x, i) => !i || new Date(x.fecha) >= new Date(h[i - 1].fecha)), h.map((x) => x.estado));
    P('…los rechazados no quedan en el historial', !h.some((x) => x.superficie === 'palatino' || x.estado === 'corona' && x.superficie === 'mesial'));
    const aud = await q1("SELECT count(*)::int AS n FROM auditoria WHERE modulo='odontograma' AND entidad_id=$1", [String(pac)]);
    P('Cada cambio queda en la auditoría', aud.n >= 4, aud);

    // ---- Otra clínica: nunca se ve ni se toca
    r = await req('GET', `/odontograma/paciente/${ajeno}/datos`, undefined, A);
    P('Datos de un paciente de otra clínica → 404', r.s === 404, r);
    r = await req('GET', `/odontograma/paciente/${ajeno}/historial`, undefined, A);
    P('Historial de un paciente de otra clínica → 404', r.s === 404, r);
    r = await req('GET', `/odontograma/paciente/${ajeno}`, undefined, A);
    P('Odontograma de un paciente de otra clínica → 404', r.s === 404, r);
    r = await put({ pieza: '11', estado: 'caries' }, ajeno);
    P('Modificar el odontograma de un paciente de otra clínica → 404 y no se guarda nada', r.s === 404
      && (await q1('SELECT count(*)::int AS n FROM odontograma_piezas WHERE paciente_id=$1', [ajeno])).n === 0
      && (await q1('SELECT count(*)::int AS n FROM odontograma_historial WHERE paciente_id=$1', [ajeno])).n === 0, r);
    r = await req('PUT', `/odontograma/paciente/${ajeno}/denticion`, { denticion: 'temporal' }, A);
    P('Cambiar la dentición de un paciente de otra clínica → 404', r.s === 404 && (await q1('SELECT odontograma_denticion FROM pacientes WHERE id=$1', [ajeno])).odontograma_denticion === null, r);
    r = await req('GET', `/odontograma/paciente/${ajeno}/pieza/11/expediente`, undefined, A);
    P('Expediente de una pieza de otra clínica → 404', r.s === 404, r);
    r = await req('GET', `/odontograma/paciente/abc/datos`, undefined, A);
    P('Id de paciente inválido → 400', r.s === 400, r);
    r = await req('GET', `/odontograma/paciente/${pac}/datos`);
    P('Sin sesión → 401', r.s === 401, r);
  } finally {
    await db.query("SET dova.borrando_paciente='on'").catch(() => {});
    await db.query('DELETE FROM odontograma_historial WHERE paciente_id = ANY($1)', [[pac, chico, mixto, ajeno]]).catch(() => {});
    await db.query('DELETE FROM odontograma_piezas WHERE paciente_id = ANY($1)', [[pac, chico, mixto, ajeno]]).catch(() => {});
    await db.query('DELETE FROM pacientes WHERE id = ANY($1)', [[pac, chico, mixto, ajeno]]).catch(() => {});
    await db.query('DELETE FROM odontologos WHERE id=$1', [odoAjeno]).catch(() => {});
    await db.query('DELETE FROM clinicas WHERE id=$1', [otraClinica]).catch(() => {});
    await db.end();
  }
  const ok = res.filter(Boolean).length;
  console.log(`odontograma.test.js ok=${ok} mal=${res.length - ok} | ${ok}/${res.length}`);
  process.exit(ok === res.length ? 0 : 1);
})();
