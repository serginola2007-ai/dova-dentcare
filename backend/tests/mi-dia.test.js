// "Preparar el día" del odontólogo: GET /api/pendientes/mi-dia.
// Requiere DATABASE_URL (dova_sim), DOVA_URL y DOVA_TZ.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 500)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const O1 = (await req('POST', '/auth/login', { username: 'odo1', password: 'clave123' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  // Un día lejano, sin turnos de otras pruebas de odo1.
  let fecha = sumar(hoy(), 61);
  await db.query("UPDATE turnos SET estado='cancelado' WHERE clinica_id=1 AND fecha=$1 AND odontologo_id IN (1,2)", [fecha]);
  const pacs = [];
  const pac = async (nombre, extra = {}) => {
    const p = (await q1('INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento) VALUES (1,$1,$2,$3,$4) RETURNING id', [nombre, `Dia${suf}`, `MD${suf}${pacs.length}`, extra.nac || null])).id;
    pacs.push(p); return p;
  };
  try {
    const nac = `1990-${fecha.slice(5)}`;
    const ana = await pac('Ana', { nac });
    const beto = await pac('Beto');
    const ceci = await pac('Ceci');
    const turno = (p, odo, h) => q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,$4,30,'confirmado','Control') RETURNING id", [p, odo, fecha, h]);
    await turno(ana, 1, '09:00');
    await turno(beto, 1, '10:00');
    await turno(ceci, 2, '09:00');
    // Beto ya vino antes: no es primera vez.
    await db.query("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,1,$2,'09:00',30,'atendido','Consulta')", [beto, sumar(fecha, -100)]);
    await db.query("INSERT INTO historia_clinica (clinica_id, paciente_id, odontologo_id, fecha, procedimiento, proxima_accion) VALUES (1,$1,1,$2,'Endodoncia 36','Colocar corona en pieza 36')", [beto, sumar(fecha, -100)]);
    // Ana: alergia grave, presupuesto sin aceptar, consentimiento sin firmar, laboratorio sin llegar, cuota vencida.
    await db.query("INSERT INTO paciente_alergias (clinica_id, paciente_id, sustancia, severidad) VALUES (1,$1,'Penicilina','anafilaxia')", [ana]);
    await db.query("INSERT INTO presupuestos (clinica_id, paciente_id, odontologo_id, estado, total) VALUES (1,$1,1,'enviado',500000)", [ana]);
    await db.query("INSERT INTO presupuestos (clinica_id, paciente_id, odontologo_id, estado, total) VALUES (1,$1,1,'aceptado',800000)", [ana]);
    await db.query("INSERT INTO consentimientos (clinica_id, paciente_id, odontologo_id, procedimiento, texto, estado) VALUES (1,$1,1,'Extracción','Texto','pendiente')", [ana]);
    await db.query("INSERT INTO laboratorio (clinica_id, paciente_id, odontologo_id, trabajo, pieza, estado, fecha_estimada) VALUES (1,$1,1,'Corona zirconio','36','enviado',$2)", [ana, sumar(fecha, -1)]);
    await db.query("INSERT INTO laboratorio (clinica_id, paciente_id, odontologo_id, trabajo, pieza, estado, fecha_estimada) VALUES (1,$1,1,'Placa miorrelajante',NULL,'recibido',$2)", [beto, sumar(fecha, -3)]);
    const plan = (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, cantidad_cuotas, estado) VALUES (1,$1,300000,2,'activo') RETURNING id", [ana])).id;
    await db.query("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,1,150000,$2,'pendiente'), ($1,2,150000,$3,'pendiente')", [plan, sumar(fecha, -10), sumar(fecha, 20)]);
    await db.query("INSERT INTO planes_tratamiento (clinica_id, paciente_id, odontologo_id, nombre, estado, sesiones_totales, sesiones_realizadas) VALUES (1,$1,1,'Rehabilitación sector posterior','en_proceso',4,1)", [beto]);

    // ---------- Permisos y validación ----------
    P('Sin sesión: 401', (await req('GET', `/pendientes/mi-dia?fecha=${fecha}`)).s === 401);
    P('Recepción (sin permiso clínico): 403', (await req('GET', `/pendientes/mi-dia?fecha=${fecha}`, undefined, R)).s === 403);
    P('Fecha inválida: 400', (await req('GET', '/pendientes/mi-dia?fecha=2026-13-40', undefined, A)).s === 400);
    P('Fecha con texto raro: 400', (await req('GET', `/pendientes/mi-dia?fecha=${encodeURIComponent("2026-01-01' OR 1=1")}`, undefined, A)).s === 400);
    P('Odontólogo inválido: 400', (await req('GET', `/pendientes/mi-dia?fecha=${fecha}&odontologoId=abc`, undefined, A)).s === 400);
    P('Sin fecha: usa hoy', (await req('GET', '/pendientes/mi-dia', undefined, O1)).j.fecha === hoy());

    // ---------- Lo que ve el odontólogo ----------
    let r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}`, undefined, O1);
    const d = r.j || {}; const pa = (d.pacientes || {})[ana] || {}; const pb = (d.pacientes || {})[beto] || {};
    P('Responde 200 con sus 2 pacientes', r.s === 200 && Object.keys(d.pacientes).length === 2, r.j);
    P('No ve al paciente de otro odontólogo', !d.pacientes[ceci]);
    r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}&odontologoId=2`, undefined, O1);
    P('Aunque pida el día de otro, ve solo el suyo', r.s === 200 && !r.j.pacientes[ceci] && !!r.j.pacientes[ana]);
    P('Alerta crítica por alergia grave', (pa.alergias || pa.alertas || []).some((a) => a.nivel === 'critica' && /Penicilina/.test(a.titulo)), pa.alertas);
    P('Ana: primera vez', pa.primeraVez === true);
    P('Beto: no es primera vez', !pb.primeraVez);
    P('Ana: cumple años ese día, con su edad', pa.cumple === true && pa.edad === Number(fecha.slice(0, 4)) - 1990, pa);
    P('Ana: 1 presupuesto sin aceptar', pa.presupuestosSinAceptar === 1, pa);
    P('Ana: consentimiento sin firmar', JSON.stringify(pa.consentimientos) === '["Extracción"]', pa.consentimientos);
    P('Ana: laboratorio que no llegó', pa.laboratorio && pa.laboratorio.length === 1 && pa.laboratorio[0].llego === false && pa.laboratorio[0].pieza === '36', pa.laboratorio);
    P('Beto: laboratorio que ya llegó', pb.laboratorio && pb.laboratorio[0] && pb.laboratorio[0].llego === true, pb.laboratorio);
    P('Ana: pagos atrasados, sin montos para el odontólogo', pa.pagos && pa.pagos.atrasado === true && pa.pagos.cuotasVencidas === 1 && pa.pagos.montoVencido === undefined && pa.pagos.saldo === undefined, pa.pagos);
    P('Beto: última visita con el próximo paso indicado', pb.ultimaVisita && pb.ultimaVisita.proximaAccion === 'Colocar corona en pieza 36' && pb.ultimaVisita.procedimiento === 'Endodoncia 36', pb.ultimaVisita);
    P('Beto: tratamiento en curso con sesiones', pb.planes && pb.planes[0] && pb.planes[0].sesiones === '1/4', pb.planes);
    P('Resumen: 1 crítica, 1 primera vez, 1 con pagos, 1 lab sin llegar, 1 cumpleaños',
      d.resumen.conAlertaCritica === 1 && d.resumen.primeraVez === 1 && d.resumen.conPagosAtrasados === 1 && d.resumen.laboratorioSinLlegar === 1 && d.resumen.cumpleanos === 1, d.resumen);
    P('Laboratorio por llegar: la corona atrasada', (d.laboratoriosPorLlegar || []).some((l) => l.paciente_id === ana && l.atrasado === true && l.trabajo === 'Corona zirconio'), d.laboratoriosPorLlegar);
    P('…y no lista lo que ya llegó', !(d.laboratoriosPorLlegar || []).some((l) => l.paciente_id === beto));

    // ---------- Admin ----------
    r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}&odontologoId=1`, undefined, A);
    const aa = r.j.pacientes[ana] || {};
    P('Admin ve el día de un odontólogo', r.s === 200 && !!aa && !r.j.pacientes[ceci]);
    P('Admin (con permiso de pagos) ve montos: vencido 150.000 y saldo 800.000', aa.pagos && aa.pagos.montoVencido === 150000 && aa.pagos.saldo === 800000, aa.pagos);
    r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}`, undefined, A);
    P('Admin sin elegir odontólogo: toda la clínica', r.s === 200 && !!r.j.pacientes[ceci] && !!r.j.pacientes[ana]);
    r = await req('GET', `/pendientes/mi-dia?fecha=${sumar(fecha, 1)}&odontologoId=1`, undefined, A);
    P('Día sin turnos: vacío, sin error', r.s === 200 && Object.keys(r.j.pacientes).length === 0 && r.j.resumen.pacientes === 0, r.j);
    r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}&odontologoId=999999`, undefined, A);
    P('Odontólogo de otra clínica o inexistente: vacío', r.s === 200 && Object.keys(r.j.pacientes).length === 0);

    // Turno cancelado: deja de aparecer.
    await db.query("UPDATE turnos SET estado='cancelado' WHERE paciente_id=$1 AND fecha=$2", [beto, fecha]);
    r = await req('GET', `/pendientes/mi-dia?fecha=${fecha}`, undefined, O1);
    P('Un turno cancelado no aparece', r.s === 200 && !r.j.pacientes[beto] && !!r.j.pacientes[ana]);
    fecha = null;
  } finally {
    const c = await db.connect();
    try {
      await c.query('BEGIN'); await c.query("SET LOCAL dova.borrando_paciente='on'");
      await c.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); console.error('limpieza', e.message); } finally { c.release(); }
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
