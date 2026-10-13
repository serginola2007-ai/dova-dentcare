// Reserva online con horarios reales: horario propio de cada odontólogo y
// sillones libres. Requiere DATABASE_URL, DOVA_URL y DOVA_TZ.
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
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dia = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','sinperm')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const S = (await req('POST', '/auth/login', { username: 'sinperm', password: 'Clave1234!' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const web = await q1('SELECT reservas_activas, odontologos_web, dias_adelante FROM web_config WHERE clinica_id=1');
  await db.query('UPDATE web_config SET reservas_activas=true, odontologos_web=NULL WHERE clinica_id=1');
  const odo = (await q1("INSERT INTO odontologos (clinica_id, nombre, especialidad) VALUES (1,$1,'Prueba') RETURNING id", [`Dra. Horario ${suf}`])).id;
  const otros = (await db.query('SELECT id FROM odontologos WHERE clinica_id=1 AND activo AND id<>$1 ORDER BY id LIMIT 3', [odo])).rows.map((x) => x.id);
  // Un martes y un miércoles dentro de la ventana de reservas (lejos, para no chocar con datos de prueba).
  let mar = sumar(hoy(), 18); while (dia(mar) !== 2) mar = sumar(mar, 1);
  const mie = sumar(mar, 1);
  const creados = []; let bloqueo = null; const pacs = [];
  try {
    // ---------- Configurar el horario ----------
    P('Sin permiso: 403', (await req('PUT', `/odontologos/${odo}/horarios`, { horarios: { 2: [['15:00', '17:00']] } }, S)).s === 403);
    P('Formato inválido: 400', (await req('PUT', `/odontologos/${odo}/horarios`, { horarios: { 2: [['25:00', '17:00']] } }, A)).s === 400);
    P('Cierre antes de la apertura: 400', (await req('PUT', `/odontologos/${odo}/horarios`, { horarios: { 2: [['17:00', '15:00']] } }, A)).s === 400);
    P('Ningún día marcado: 400', (await req('PUT', `/odontologos/${odo}/horarios`, { horarios: {} }, A)).s === 400);
    P('Odontólogo inexistente: 404', (await req('PUT', '/odontologos/999999999/horarios', { horarios: { 2: [['15:00', '17:00']] } }, A)).s === 404);
    let r = await req('PUT', `/odontologos/${odo}/horarios`, { horarios: { 2: [['15:00', '17:00']] } }, A);
    P('Guardar: atiende solo los martes de 15 a 17', r.s === 200 && JSON.stringify(r.j.horarios['2']) === JSON.stringify([['15:00', '17:00']]), r.j);
    P('…queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='horario_odontologo' AND entidad_id=$1", [String(odo)])));

    // ---------- Disponibilidad en la web ----------
    r = await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${mar}`);
    P('Martes: solo horarios entre las 15 y las 17', r.s === 200 && r.j.horarios.length > 0 && r.j.horarios.every((h) => h >= '15:00' && h <= '16:30'), r.j);
    const primero = r.j.horarios[0];
    r = await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${mie}`);
    P('Miércoles (no atiende): sin horarios', r.s === 200 && r.j.horarios.length === 0, r.j);
    r = await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}`);
    P('Calendario del mes: solo marca martes', r.s === 200 && Object.keys(r.j.dias).every((f) => dia(f) === 2), r.j.dias);

    // ---------- Sillones ----------
    const nS = Number((await q1('SELECT count(*) n FROM sillones WHERE clinica_id=1 AND activo')).n);
    const enUso = Number((await q1("SELECT count(*) n FROM turnos WHERE clinica_id=1 AND fecha=$1 AND estado NOT IN ('cancelado','no_asistio') AND hora_inicio < '15:30' AND hora_inicio + duracion_minutos * interval '1 minute' > '15:00'", [mar])).n);
    for (let i = 0; i < nS - enUso; i += 1) {
      const p = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Ocupa','Sillon',$1) RETURNING id", [`SL${suf}${i}`])).id; pacs.push(p);
      creados.push((await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'15:00',30,'reservado','Control') RETURNING id", [p, otros[i % otros.length], mar])).id);
    }
    r = await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${mar}`);
    P(`Con los ${nS} sillones ocupados a las 15:00, ese horario no se ofrece (aunque la doctora esté libre)`, r.s === 200 && !r.j.horarios.includes('15:00') && r.j.horarios.includes('15:30'), r.j);
    bloqueo = (await q1("INSERT INTO agenda_bloqueos (clinica_id, sillon_id, fecha, hora_desde, hora_hasta, tipo, motivo) VALUES (1,1,$1,'15:30','16:00','mantenimiento','Prueba sillón') RETURNING id", [mar])).id;
    const enUso2 = Number((await q1("SELECT count(*) n FROM turnos WHERE clinica_id=1 AND fecha=$1 AND estado NOT IN ('cancelado','no_asistio') AND hora_inicio < '16:00' AND hora_inicio + duracion_minutos * interval '1 minute' > '15:30'", [mar])).n);
    r = await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${mar}`);
    P('Un sillón en mantenimiento también resta lugar', r.j.horarios.includes('15:30') === (enUso2 + 1 < nS), { horarios: r.j.horarios, enUso2, nS });

    // ---------- Reservar ----------
    const persona = { nombre: 'Rosa', apellido: `Reserva${suf}`, ci: `RH${suf}`, telefono: '0981 000 111', acepta: true, odontologoId: odo };
    r = await req('POST', '/web/publico/reservar', { ...persona, fecha: mar, hora: '15:00' });
    P('Reservar en un horario sin sillón: 409', r.s === 409, r.j);
    r = await req('POST', '/web/publico/reservar', { ...persona, fecha: mie, hora: '15:00' });
    P('Reservar un día que no atiende: 409', r.s === 409, r.j);
    r = await req('POST', '/web/publico/reservar', { ...persona, fecha: mar, hora: '16:30' });
    const t = await q1("SELECT t.id, t.odontologo_id, to_char(t.hora_inicio,'HH24:MI') h FROM turnos t JOIN pacientes p ON p.id=t.paciente_id WHERE p.ci=$1", [`RH${suf}`]);
    P('Reservar dentro de su horario: queda el turno con ella', r.s === 201 && t && t.odontologo_id === odo && t.h === '16:30', { r, t });
    if (t) creados.push(t.id);
    void primero;

    // ---------- Volver al horario de la clínica ----------
    r = await req('PUT', `/odontologos/${odo}/horarios`, { horarios: null }, A);
    P('"Usar el horario de la clínica": vuelve a tener miércoles', r.s === 200 && r.j.horarios === null && (await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${mie}`)).j.horarios.length > 0);
  } finally {
    if (bloqueo) await db.query('DELETE FROM agenda_bloqueos WHERE id=$1', [bloqueo]);
    await db.query('DELETE FROM turnos WHERE id = ANY($1::int[])', [creados]);
    await db.query("DELETE FROM turnos WHERE paciente_id IN (SELECT id FROM pacientes WHERE ci=$1)", [`RH${suf}`]);
    await db.query("DELETE FROM web_solicitudes WHERE ci=$1", [`RH${suf}`]);
    await db.query("DELETE FROM pacientes WHERE ci=$1 OR id = ANY($2::int[])", [`RH${suf}`, pacs]);
    await db.query('DELETE FROM odontologos WHERE id=$1', [odo]).catch(() => db.query('UPDATE odontologos SET activo=false WHERE id=$1', [odo]));
    await db.query('UPDATE web_config SET reservas_activas=$1, odontologos_web=$2 WHERE clinica_id=1', [web.reservas_activas, web.odontologos_web]);
  }
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
