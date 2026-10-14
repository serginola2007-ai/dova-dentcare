// Informes por período y sección Presupuestos (C.I. obligatoria y tratamientos).
// Requiere DATABASE_URL (dova_sim), DOVA_URL y DOVA_TZ.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1','asis1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const AS = (await req('POST', '/auth/login', { username: 'asis1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const pacs = [];
  try {
    // ---------------- Informes ----------------
    P('Informes sin permiso de reportes (asistente): 403', (await req('GET', '/reportes/informes/periodo?tipo=mes', undefined, AS)).s === 403);
    P('Tipo inválido: 400', (await req('GET', '/reportes/informes/periodo?tipo=quincena', undefined, A)).s === 400);
    P('Fecha inválida: 400', (await req('GET', '/reportes/informes/periodo?tipo=dia&fecha=2026-02-30', undefined, A)).s === 400);
    P('Fecha con texto raro: 400', (await req('GET', `/reportes/informes/periodo?tipo=dia&fecha=${encodeURIComponent("2026-01-01'--")}`, undefined, A)).s === 400);
    let r = await req('GET', '/reportes/informes/periodo?tipo=semana&fecha=2026-10-14', undefined, A);
    P('Semana: de lunes a domingo', r.s === 200 && r.j.desde === '2026-10-12' && r.j.hasta === '2026-10-18' && r.j.serie.length === 7, r.j && { d: r.j.desde, h: r.j.hasta });
    r = await req('GET', '/reportes/informes/periodo?tipo=mes&fecha=2024-02-10', undefined, A);
    P('Mes bisiesto: 1 al 29 de febrero, comparado con enero', r.s === 200 && r.j.desde === '2024-02-01' && r.j.hasta === '2024-02-29' && r.j.anterior.desde === '2024-01-01' && r.j.anterior.hasta === '2024-01-31' && r.j.serie.length === 29, r.j && { d: r.j.desde, h: r.j.hasta, a: r.j.anterior });
    r = await req('GET', '/reportes/informes/periodo?tipo=anio&fecha=2025-07-01', undefined, A);
    P('Año: 12 meses, comparado con el anterior', r.s === 200 && r.j.serie.length === 12 && r.j.anterior.desde === '2024-01-01' && r.j.anterior.hasta === '2024-12-31');
    r = await req('GET', '/reportes/informes/periodo?tipo=mes', undefined, A);
    const h = hoy();
    P('Mes en curso: se compara con el mismo tramo del mes anterior', r.s === 200 && r.j.enCurso === true && Number(r.j.anterior.hasta.slice(8)) <= Number(h.slice(8)), r.j && r.j.anterior);

    // Cuentas exactas en un día aislado.
    const dia = '2031-03-05';
    const pa = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Informe',$1,$2) RETURNING id", [`Dia${suf}`, `INF${suf}`])).id; pacs.push(pa);
    await db.query("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,1,$2,'08:00',30,'atendido','Limpieza'),(1,$1,1,$2,'09:00',30,'no_asistio','Control'),(1,$1,1,$2,'10:00',30,'cancelado','Control')", [pa, dia]);
    await db.query("INSERT INTO pagos (clinica_id, paciente_id, monto, metodo, estado, fecha) VALUES (1,$1,150000,'efectivo','pagado',($2::date + time '12:00') AT TIME ZONE 'America/Asuncion'),(1,$1,50000,'transferencia','pagado',($2::date + time '13:00') AT TIME ZONE 'America/Asuncion'),(1,$1,99000,'efectivo','anulado',($2::date + time '14:00') AT TIME ZONE 'America/Asuncion')", [pa, dia]);
    r = await req('GET', `/reportes/informes/periodo?tipo=dia&fecha=${dia}`, undefined, A);
    const a = r.j && r.j.actual;
    P('Día: 1 atendido, 1 ausencia, 1 cancelado, 50 % de asistencia', a && a.atendidos === 1 && a.ausencias === 1 && a.cancelados === 1 && a.turnos === 2 && a.asistencia === 50, a);
    P('Día: cobrado 200.000 (sin el anulado) en 2 cobros, por método', a && a.cobrado === 200000 && a.cobros === 2 && r.j.metodos.length === 2 && r.j.metodos[0].total === 150000, { a, m: r.j && r.j.metodos });
    P('Día: tratamientos más realizados', r.j.tratamientos.some((t) => t.nombre === 'Limpieza' && t.cantidad >= 1), r.j.tratamientos);
    P('Día anterior sin datos: comparación en cero', r.j.previo.cobrado === 0 && r.j.anterior.desde === '2031-03-04');

    // ---------------- Presupuestos ----------------
    const sinCi = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido) VALUES (1,'Sin','Cedula' || $1) RETURNING id", [suf])).id; pacs.push(sinCi);
    const otro = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Otro','Ci' || $1, $2) RETURNING id", [suf, `OC${suf}`])).id; pacs.push(otro);
    const trat = (await q1('SELECT id, precio FROM tratamientos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1')).id;
    const otraClinica = await q1('SELECT id FROM clinicas WHERE id<>1 ORDER BY id LIMIT 1');
    const tratAjeno = otraClinica ? await q1('INSERT INTO tratamientos (clinica_id, nombre, precio) VALUES ($1, $2, 1000) RETURNING id', [otraClinica.id, `Ajeno${suf}`]) : null;
    const item = { tratamientoId: trat, descripcion: 'Tratamiento', cantidad: 1, precioUnitario: 100000 };
    P('Sin C.I. del paciente: no se guarda (400)', (r = await req('POST', '/presupuestos', { pacienteId: sinCi, items: [item] }, R)).s === 400 && /C\.I\./.test(r.j.error.message), r.j);
    P('Sin tratamientos: no se guarda (400)', (await req('POST', '/presupuestos', { pacienteId: otro, items: [] }, R)).s === 400);
    P('Con una C.I. mal escrita: 400', (await req('POST', '/presupuestos', { pacienteId: sinCi, pacienteCi: '<b>', items: [item] }, R)).s === 400);
    P('Con la C.I. de otro paciente: 409', (await req('POST', '/presupuestos', { pacienteId: sinCi, pacienteCi: `OC${suf}`, items: [item] }, R)).s === 409);
    P('Tratamiento de otra clínica: 400', !tratAjeno || (await req('POST', '/presupuestos', { pacienteId: otro, items: [{ ...item, tratamientoId: tratAjeno.id }] }, R)).s === 400);
    P('Odontólogo inexistente: 400', (await req('POST', '/presupuestos', { pacienteId: otro, odontologoId: 999999, items: [item] }, R)).s === 400);
    P('Nada se guardó todavía (ni la C.I.)', !(await q1('SELECT 1 x FROM presupuestos WHERE paciente_id=$1', [sinCi])) && !(await q1('SELECT ci FROM pacientes WHERE id=$1', [sinCi])).ci);
    r = await req('POST', '/presupuestos', { pacienteId: sinCi, pacienteCi: ` CI${suf} `, items: [item] }, R);
    P('Cargando la C.I. en el mismo paso: se guarda (201)', r.s === 201 && Number(r.j.total) === 100000, r.j);
    P('…y la C.I. queda en la ficha (sin espacios), con su registro en el historial', (await q1('SELECT ci FROM pacientes WHERE id=$1', [sinCi])).ci === `CI${suf}` && !!(await q1("SELECT 1 x FROM auditoria WHERE accion='cargar_ci' AND entidad_id=$1", [String(sinCi)])));
    const presId = r.j.id;

    // Lista
    P('Lista sin permiso (asistente): 403', (await req('GET', '/presupuestos', undefined, AS)).s === 403);
    r = await req('GET', `/presupuestos?q=CI${suf}`, undefined, R);
    P('Buscar por C.I.: lo encuentra', r.s === 200 && r.j.items.length === 1 && r.j.items[0].id === presId && r.j.items[0].paciente_ci === `CI${suf}`, r.j);
    r = await req('GET', `/presupuestos?q=${presId}`, undefined, R);
    P('Buscar por número', r.s === 200 && r.j.items.some((x) => x.id === presId));
    P('Filtro de estado inválido: 400', (await req('GET', '/presupuestos?estado=pagado', undefined, R)).s === 400);
    P('Fecha inválida: 400', (await req('GET', '/presupuestos?desde=ayer', undefined, R)).s === 400);
    r = await req('GET', '/presupuestos?q=%25', undefined, R);
    P('Un "%" en la búsqueda no trae todo', r.s === 200 && r.j.items.length < 100);
    r = await req('GET', '/presupuestos?estado=borrador&limite=5', undefined, R);
    P('Filtro por estado y límite', r.s === 200 && r.j.items.length <= 5 && r.j.items.every((x) => x.estado === 'borrador') && Array.isArray(r.j.resumenAnio));
  } finally {
    const c = await db.connect();
    try { await c.query('BEGIN'); await c.query("SET LOCAL dova.borrando_paciente='on'"); await c.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]); await c.query(`DELETE FROM tratamientos WHERE nombre = $1`, [`Ajeno${suf}`]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); console.error('limpieza', e.message); } finally { c.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
