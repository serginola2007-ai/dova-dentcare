// Mensajes automáticos (API): turno liberado → lista de espera, controles
// periódicos con enlace para reservar, y encuesta después de la atención.
// WhatsApp "falso" en el puerto 4600 (mismo servidor de prueba que recordatorios).
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok, headers = {}) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: body === undefined || body === null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_e) { /* texto */ }
  return { s: r.status, j, t };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const firmar = (cuerpo) => `sha256=${crypto.createHmac('sha256', 'secreto-app-prueba').update(cuerpo).digest('hex')}`;
const CRON = { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { recibidos.push(JSON.parse(b || '{}')); n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.MSG${n}` }] })); }); });
const para = (tel) => recibidos.filter((x) => x.to === `595${tel.slice(1)}`);
const enlaceDe = (m) => m.template.components[0].parameters[3].text;

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','sinperm')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const S = (await req('POST', '/auth/login', { username: 'sinperm', password: 'Clave1234!' })).j.accessToken;
  const suf = String(Date.now() % 1000000); const h = hoy();
  const cfgAntes = await q1('SELECT lista_espera_auto, controles_auto, encuesta_auto, mensajes_hora, resena_url FROM clinicas WHERE id=1');
  const webAntes = await q1('SELECT reservas_activas FROM web_config WHERE clinica_id=1');
  await db.query('UPDATE web_config SET reservas_activas=true WHERE clinica_id=1');
  await db.query('UPDATE clinicas SET lista_espera_auto=false, controles_auto=false, encuesta_auto=false, mensajes_hora=10, resena_url=NULL WHERE id=1');
  const odo = (await q1("INSERT INTO odontologos (clinica_id, nombre) VALUES (1,$1) RETURNING id", [`Dr. Mensajes ${suf}`])).id;
  const tel = (k) => `09${k}${suf}`.slice(0, 10);
  const pac = async (nombre, k, wa = true) => (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono, acepta_whatsapp) VALUES (1,$1,'Mensaje',$2,$3,$4) RETURNING id", [nombre, `MS${suf}${k}`, tel(k), wa])).id;
  const pT = await pac('Titular', 71); const pA = await pac('Alba', 72); const pB = await pac('Bruno', 73); const pC = await pac('Ceci', 74, false);
  const ids = { turnos: [] };
  try {
    // ---------- Configuración ----------
    P('Configurar sin permiso: 403', (await req('PUT', '/mensajes/config', { encuesta: true }, R)).s === 403);
    P('Enlace de reseña que no es de Google: 400', (await req('PUT', '/mensajes/config', { resenaUrl: 'https://otro-sitio.com/x' }, A)).s === 400);
    P('Hora fuera de rango: 400', (await req('PUT', '/mensajes/config', { hora: 6 }, A)).s === 400);
    let r = await req('PUT', '/mensajes/config', { listaEspera: true, resenaUrl: 'https://g.page/r/prueba-dentcare/review' }, A);
    P('Guardar: lista de espera automática y enlace de reseña', r.s === 200 && r.j.listaEspera === true && /g\.page/.test(r.j.resenaUrl) && /Se liberó un turno/.test(r.j.ejemplos.oferta), r.j);

    // ---------- 1. Turno liberado ----------
    const fecha = sumar(h, 3);
    const tT = (await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'10:00',30,'reservado','Limpieza') RETURNING id", [pT, odo, fecha])).id; ids.turnos.push(tT);
    for (const [p, prio] of [[pB, 'media'], [pA, 'alta'], [pC, 'alta']]) await db.query("INSERT INTO lista_espera (clinica_id, paciente_id, odontologo_id, prioridad, estado) VALUES (1,$1,$2,$3,'esperando')", [p, odo, prio]);
    r = await req('PATCH', `/agenda/${tT}/estado`, { estado: 'cancelado' }, R);
    await espera(1500);
    const oferta = await q1('SELECT * FROM ofertas_turno WHERE turno_origen_id=$1', [tT]);
    P('Al cancelar un turno se crea la oferta del horario', r.s === 200 && oferta && oferta.estado === 'abierta', { r: r.s, oferta });
    const mA = para(tel(72)); const mB = para(tel(73)); const mC = para(tel(74));
    P('…y se ofrece por WhatsApp a la lista de espera (plantilla turno_liberado con enlace)', mA.length === 1 && mB.length === 1 && mA[0].template.name === 'turno_liberado' && /tomar-turno\.html#t=/.test(enlaceDe(mA[0])), { mA: mA.length, mB: mB.length });
    P('…nunca a quien no acepta WhatsApp', mC.length === 0);
    P('…y avisa a la recepción', !!(await q1("SELECT 1 x FROM notificaciones n JOIN usuarios u ON u.id=n.usuario_id WHERE u.username='recep1' AND n.titulo LIKE 'Se liberó un turno%' AND n.creado_en > now() - interval '1 minute'")));
    r = await req('GET', '/mensajes/ofertas', null, R);
    const o = r.j.ofertas.find((x) => x.id === oferta.id);
    P('Lista de espera → Turnos liberados: muestra la oferta, sus candidatos en orden de prioridad y a quién se ofreció', r.s === 200 && o && o.candidatos[0].nombre.startsWith('Alba') && o.candidatos.find((c) => c.nombre.startsWith('Alba')).enviado && /no acepta/i.test(o.candidatos.find((c) => c.nombre.startsWith('Ceci')).noEnviable), o);
    P('Sin permiso: 403', (await req('GET', '/mensajes/ofertas', null, S)).s === 403);
    // Página pública
    const tokA = enlaceDe(mA[0]).split('#t=')[1]; const tokB = enlaceDe(mB[0]).split('#t=')[1];
    r = await req('GET', `/web/publico/aviso/${tokA}`);
    P('Tomar turno: la página muestra el horario disponible', r.s === 200 && r.j.tipo === 'oferta' && r.j.disponible && r.j.hora === '10:00' && r.j.nombre === 'Alba', r.j);
    P('…sin datos de otros pacientes', !/Titular|Bruno|MS\d/.test(r.t));
    const [x1, x2] = await Promise.all([req('POST', `/web/publico/aviso/${tokA}/tomar`), req('POST', `/web/publico/aviso/${tokB}/tomar`)]);
    const gano = [x1, x2].filter((x) => x.s === 201); const perdio = [x1, x2].filter((x) => x.s === 409);
    P('Dos lo toman a la vez: uno solo se lo queda, el otro recibe "otra persona ya lo tomó"', gano.length === 1 && perdio.length === 1 && /otra persona/.test(perdio[0].j.error.message), [x1.s, x2.s, perdio[0] && perdio[0].j]);
    const nuevo = await q1("SELECT t.*, to_char(t.hora_inicio,'HH24:MI') h FROM turnos t WHERE t.id=(SELECT turno_nuevo_id FROM ofertas_turno WHERE id=$1)", [oferta.id]);
    if (nuevo) ids.turnos.push(nuevo.id);
    P('…queda el turno en la agenda, confirmado, mismo horario y profesional', nuevo && nuevo.estado === 'confirmado' && nuevo.h === '10:00' && nuevo.odontologo_id === odo && [pA, pB].includes(nuevo.paciente_id), nuevo);
    P('…la persona sale de la lista de espera (asignado)', (await q1("SELECT estado FROM lista_espera WHERE paciente_id=$1", [nuevo.paciente_id])).estado === 'asignado');
    P('…con su enlace a "Mi turno"', gano[0] && gano[0].j.token && (await req('GET', `/web/publico/turno/${gano[0].j.token}`)).s === 200);
    P('Enlace inventado: 404', (await req('GET', '/web/publico/aviso/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).s === 404);
    P('Usar el enlace de una oferta para reservar un control: 400', (await req('POST', `/web/publico/aviso/${tokA}/reservar`, { fecha, hora: '11:00' })).s === 400);
    // Turno muy próximo: no se ofrece
    const tP = (await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'23:59',30,'reservado','Control') RETURNING id", [pT, odo, sumar(h, -1)])).id; ids.turnos.push(tP);
    await req('PATCH', `/agenda/${tP}/estado`, { estado: 'cancelado' }, R); await espera(800);
    P('Un turno ya pasado no se ofrece', !(await q1('SELECT 1 x FROM ofertas_turno WHERE turno_origen_id=$1', [tP])));

    // ---------- 2. Controles periódicos ----------
    const tipo = (await q1('SELECT id, nombre FROM recall_tipos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1'));
    const pR = await pac('Rita', 75);
    const rec = (await q1("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, estado, odontologo_id) VALUES (1,$1,$2,$3,'activo',$4) RETURNING id", [pR, tipo.id, sumar(h, -5), odo])).id;
    await req('PUT', '/mensajes/config', { controles: true, hora: 8 }, A);
    const antes = recibidos.length;
    r = await req('POST', '/recordatorios/cron', {}, null, CRON);
    const mR = para(tel(75));
    P('Control vencido: el disparo programado le manda el enlace para reservar', r.s === 200 && r.j.mensajes && mR.length === 1 && mR[0].template.name === 'control_periodico' && /reservar\.html#c=/.test(enlaceDe(mR[0])), { cron: r.j && r.j.mensajes, mR: mR.length, total: recibidos.length - antes });
    r = await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('…no se lo repite en la segunda pasada', para(tel(75)).length === 1);
    const tokR = enlaceDe(mR[0]).split('#c=')[1];
    r = await req('GET', `/web/publico/aviso/${tokR}`);
    P('El enlace identifica al paciente y su control (sin pedir datos)', r.s === 200 && r.j.tipo === 'control' && r.j.nombre === 'Rita' && r.j.control === tipo.nombre && r.j.odontologoId === odo, r.j);
    const libres = (await req('GET', `/web/publico/disponibilidad?odontologoId=${odo}&fecha=${sumar(h, 4)}`)).j.horarios;
    r = await req('POST', `/web/publico/aviso/${tokR}/reservar`, { odontologoId: odo, fecha: sumar(h, 4), hora: libres[0] });
    const tR = await q1("SELECT id, estado, origen FROM turnos WHERE paciente_id=$1 AND fecha=$2", [pR, sumar(h, 4)]);
    if (tR) ids.turnos.push(tR.id);
    P('Reserva el control con un toque: turno en la agenda y el control queda agendado', r.s === 201 && tR && tR.origen === 'web' && (await q1('SELECT turno_id FROM paciente_recalls WHERE id=$1', [rec])).turno_id === tR.id, { r, tR });
    P('Horario inválido: 400', (await req('POST', `/web/publico/aviso/${tokR}/reservar`, { fecha: 'mañana', hora: '10' })).s === 400);
    // A mano (sin automático)
    const pR2 = await pac('Raúl', 76);
    const rec2 = (await q1("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, estado) VALUES (1,$1,$2,$3,'activo') RETURNING id", [pR2, tipo.id, sumar(h, 20)])).id;
    r = await req('POST', `/mensajes/controles/${rec2}/enlace`, null, R);
    P('A mano: wa.me con el mensaje y el enlace para reservar', r.s === 200 && /^https:\/\/wa\.me\/595\d+\?text=/.test(r.j.url) && /reservar\.html%23c%3D/.test(r.j.url), r.j);
    P('…otra vez el mismo día: 409', (await req('POST', `/mensajes/controles/${rec2}/enlace`, null, R)).s === 409);
    P('Sin permiso: 403', (await req('POST', `/mensajes/controles/${rec2}/enlace`, null, S)).s === 403);

    // ---------- 3. Encuesta ----------
    const pE = await pac('Ema', 77); const pE2 = await pac('Eli', 78);
    for (const p of [pE, pE2]) ids.turnos.push((await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, motivo) VALUES (1,$1,$2,$3,'09:00',30,'atendido','Control') RETURNING id", [p, odo, sumar(h, -1)])).id);
    await req('PUT', '/mensajes/config', { encuesta: true }, A);
    await req('POST', '/recordatorios/cron', {}, null, CRON);
    const mE = para(tel(77)); const mE2 = para(tel(78));
    P('Encuesta: al día siguiente de atenderse le llega el enlace', mE.length === 1 && mE[0].template.name === 'encuesta_atencion' && /encuesta\.html#t=/.test(enlaceDe(mE[0])), mE.length);
    const tokE = enlaceDe(mE[0]).split('#t=')[1]; const tokE2 = enlaceDe(mE2[0]).split('#t=')[1];
    P('Puntaje fuera de rango: 400', (await req('POST', `/web/publico/aviso/${tokE}/encuesta`, { nps: 11 })).s === 400);
    r = await req('POST', `/web/publico/aviso/${tokE}/encuesta`, { nps: 10, comentario: 'Excelente' });
    P('Responde 10: se guarda y se le ofrece la reseña de Google', r.s === 200 && /g\.page/.test(r.j.resenaUrl) && !!(await q1("SELECT 1 x FROM encuestas_satisfaccion WHERE paciente_id=$1 AND nps=10 AND canal='web'", [pE])), r.j);
    P('…no se puede responder dos veces', (await req('POST', `/web/publico/aviso/${tokE}/encuesta`, { nps: 3 })).s === 409);
    r = await req('POST', `/web/publico/aviso/${tokE2}/encuesta`, { nps: 4, comentario: 'Esperé mucho' });
    P('Responde 4: sin reseña, y la clínica recibe el aviso para llamarlo', r.s === 200 && r.j.resenaUrl === null && !!(await q1("SELECT 1 x FROM notificaciones WHERE titulo LIKE 'Eli Mensaje puso 4/10%'")), r.j);
    await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('No se repite la encuesta', para(tel(77)).length === 1 && para(tel(78)).length === 1);

    // ---------- Webhook ----------
    const prov = (await q1("SELECT proveedor_id FROM avisos_envios WHERE tipo='encuesta' AND paciente_id=$1", [pE])).proveedor_id;
    const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: prov, status: 'delivered' }] } }] }] });
    r = await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
    P('Webhook: el mensaje pasa a "entregado"', r.s === 200 && (await q1('SELECT estado FROM avisos_envios WHERE proveedor_id=$1', [prov])).estado !== 'enviado');
    const resp = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: `595${tel(75).slice(1)}`, text: { body: 'Gracias!' } }] } }] }] });
    r = await req('POST', '/whatsapp/webhook', resp, null, { 'x-hub-signature-256': firmar(resp) });
    P('Si responde por WhatsApp, queda como respuesta del mensaje', r.s === 200 && !!(await q1("SELECT 1 x FROM avisos_envios WHERE paciente_id=$1 AND respuesta='Gracias!'", [pR])));
  } finally {
    await db.query('UPDATE clinicas SET lista_espera_auto=$1, controles_auto=$2, encuesta_auto=$3, mensajes_hora=$4, resena_url=$5 WHERE id=1', [cfgAntes.lista_espera_auto, cfgAntes.controles_auto, cfgAntes.encuesta_auto, cfgAntes.mensajes_hora, cfgAntes.resena_url]);
    await db.query('UPDATE web_config SET reservas_activas=$1 WHERE clinica_id=1', [webAntes.reservas_activas]);
    await db.query("DELETE FROM ofertas_turno WHERE odontologo_id=$1", [odo]);
    await db.query('DELETE FROM turnos WHERE odontologo_id=$1', [odo]);
    await db.query("DELETE FROM pacientes WHERE ci LIKE $1", [`MS${suf}%`]);
    await db.query('DELETE FROM odontologos WHERE id=$1', [odo]).catch(() => {});
  }
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
