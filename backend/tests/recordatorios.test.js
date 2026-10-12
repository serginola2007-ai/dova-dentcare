// Recordatorios de turnos por WhatsApp (API), con un WhatsApp "falso" que
// imita a Meta en el puerto 4600. El servidor de prueba tiene que arrancar con
// WHATSAPP_API_URL=http://localhost:4600/v21.0, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_APP_SECRET=secreto-app-prueba, WHATSAPP_VERIFY_TOKEN=verificar-prueba-dova,
// CRON_SECRET=cron-secreto-de-prueba-0123456789 y DOVA_TZ (el mismo que se pasa acá).
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
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

// ---- WhatsApp falso ----
const recibidos = []; let falla = new Set(); let n = 0;
const meta = http.createServer((rq, rs) => {
  let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => {
    const j = JSON.parse(b || '{}'); recibidos.push({ url: rq.url, auth: rq.headers.authorization, cuerpo: j });
    if (falla.has(j.to)) { rs.writeHead(400, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ error: { message: '(#131026) Message undeliverable' } })); return; }
    n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.PRUEBA${n}` }] }));
  });
});

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  await db.query("DELETE FROM pacientes WHERE apellido='Recordatorio' AND ci LIKE 'RC%'");
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','sinperm')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const S = (await req('POST', '/auth/login', { username: 'sinperm', password: 'Clave1234!' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const manana = sumar(hoy(), 1);
  const odo = (await q1('SELECT id FROM odontologos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1')).id;
  const pac = async (nombre, tel, extra = {}) => (await q1(`INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono, acepta_recordatorios, acepta_whatsapp)
      VALUES (1,$1,'Recordatorio',$2,$3,$4,$5) RETURNING id`, [nombre, `RC${suf}${nombre.slice(0, 3)}`, tel, extra.recordatorios !== false, extra.whatsapp !== false])).id;
  const turno = async (pid, hora, fecha = manana, extra = {}) => (await q1(`INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, confirmacion, motivo, sala)
      VALUES (1,$1,$2,$3,$4,30,$5,$6,'Control',$7) RETURNING id`, [pid, odo, fecha, hora, extra.estado || 'reservado', extra.confirmacion || 'sin_confirmar', `R${suf}${hora}`])).id;
  // Sin superposiciones con otros turnos de prueba: horarios de madrugada, consultorio propio.
  const p1 = await pac('Ana', `0981${suf}`.slice(0, 10)); const t1 = await turno(p1, '05:00');
  const p2 = await pac('Beto', `0982${suf}`.slice(0, 10)); const t2 = await turno(p2, '05:30');
  const p3 = await pac('Caro', `0983${suf}`.slice(0, 10), { recordatorios: false }); const t3 = await turno(p3, '06:00');
  const p4 = await pac('Dani', `0984${suf}`.slice(0, 10)); const t4 = await turno(p4, '06:30', manana, { estado: 'confirmado', confirmacion: 'confirmado' });
  const p5 = await pac('Eli', 'sin-numero'); const t5 = await turno(p5, '07:00');
  const p6 = await pac('Fede', `0986${suf}`.slice(0, 10)); const t6 = await turno(p6, '07:30');

  // ---------- Configuración ----------
  let r = await req('GET', '/recordatorios/config', null, R);
  P('Estado: WhatsApp Business conectado y ejemplo del mensaje con enlace', r.s === 200 && r.j.whatsappConectado === true && /mi-turno\.html#t=/.test(r.j.ejemplo), r.j);
  P('Configurar sin permiso: 403', (await req('PUT', '/recordatorios/config', { automatico: true }, S)).s === 403);
  P('Hora fuera de rango: 400', (await req('PUT', '/recordatorios/config', { hora: 23 }, A)).s === 400);
  P('Anticipación inválida: 400', (await req('PUT', '/recordatorios/config', { dias: 7 }, A)).s === 400);
  r = await req('PUT', '/recordatorios/config', { automatico: false, hora: 6, dias: 1 }, A);
  P('Guardar configuración', r.s === 200 && r.j.automatico === false && r.j.hora === 6, r.j);

  // ---------- Listado ----------
  r = await req('GET', `/recordatorios/turnos?fecha=${manana}`, null, R);
  const fila = (id) => r.j.turnos.find((t) => t.id === id);
  P('Listado del día: turnos con su estado de envío', r.s === 200 && fila(t1) && !fila(t1).envio && !fila(t1).noEnviable, r.j && r.j.turnos && r.j.turnos.length);
  P('…marca a quien no acepta recordatorios', /no acepta/.test(fila(t3).noEnviable || ''));
  P('…y a quien no tiene un celular válido', /celular/.test(fila(t5).noEnviable || ''));
  P('Listado sin permiso: 403', (await req('GET', `/recordatorios/turnos?fecha=${manana}`, null, S)).s === 403);

  // ---------- Envío por la API ----------
  P('Enviar sin permiso: 403', (await req('POST', `/recordatorios/turnos/${t1}/enviar`, null, S)).s === 403);
  const ajeno = await q1('SELECT id FROM turnos WHERE clinica_id<>1 LIMIT 1');
  if (ajeno) P('Turno de otra clínica: 404', (await req('POST', `/recordatorios/turnos/${ajeno.id}/enviar`, null, R)).s === 404);
  r = await req('POST', `/recordatorios/turnos/${t1}/enviar`, null, R);
  const ult = recibidos[recibidos.length - 1];
  P('Enviar: llega a WhatsApp como plantilla con 5 valores', r.s === 200 && ult && ult.cuerpo.type === 'template' && ult.cuerpo.template.name === 'recordatorio_turno' && ult.cuerpo.template.components[0].parameters.length === 5, { r: r.j, ult });
  P('…al número normalizado de Paraguay, con el token y el id del número', ult.cuerpo.to.startsWith('595') && ult.auth === 'Bearer token-de-prueba' && ult.url === '/v21.0/123456/messages', ult);
  const enlace = ult.cuerpo.template.components[0].parameters[4].text;
  P('…el quinto valor es el enlace privado del turno', /^http:\/\/localhost:4500\/web\/mi-turno\.html#t=[\w-]{20,}$/.test(enlace), enlace);
  let e = await q1("SELECT * FROM recordatorios_envios WHERE turno_id=$1", [t1]);
  P('Queda registrado como enviado, con el id de Meta', e && e.estado === 'enviado' && /^wamid\./.test(e.proveedor_id), e);
  P('…y en el historial de comunicaciones del paciente (sin el enlace)', !!(await q1("SELECT 1 x FROM comunicaciones WHERE referencia_tipo='turno' AND referencia_id=$1 AND contenido LIKE '%(enlace privado)%'", [t1])));
  P('…y el turno pasa a "recordatorio enviado"', (await q1('SELECT confirmacion FROM turnos WHERE id=$1', [t1])).confirmacion === 'recordatorio_enviado');
  r = await req('GET', `/recordatorios/turnos?fecha=${manana}`, null, R);
  P('El listado muestra el recordatorio como enviado', (r.j.turnos.find((t) => t.id === t1).envio || {}).estado === 'enviado', r.j.turnos.find((t) => t.id === t1));
  P('No se manda dos veces el mismo recordatorio: 409', (await req('POST', `/recordatorios/turnos/${t1}/enviar`, null, R)).s === 409);
  P('A quien no acepta recordatorios no se le manda: 409', (await req('POST', `/recordatorios/turnos/${t3}/enviar`, null, R)).s === 409);
  P('La base no guarda el enlace, solo su huella', !(await q1('SELECT 1 x FROM turno_enlaces WHERE token_hash=$1', [enlace.split('#t=')[1]])) && !!(await q1('SELECT 1 x FROM turno_enlaces WHERE turno_id=$1', [t1])));

  // ---------- El paciente usa el enlace ----------
  const token = enlace.split('#t=')[1];
  r = await req('GET', `/web/publico/turno/${token}`);
  P('El enlace muestra el turno al paciente', r.s === 200 && r.j.nombre === 'Ana' && r.j.fecha === manana && r.j.vigente, r.j);
  P('Un enlace inventado no muestra nada: 404', (await req('GET', `/web/publico/turno/${token.slice(0, -4)}abcd`)).s === 404);
  r = await req('POST', `/web/publico/turno/${token}/confirmar`);
  P('Confirmar con el enlace: el turno queda confirmado', r.s === 200 && r.j.confirmado === true && (await q1('SELECT confirmacion FROM turnos WHERE id=$1', [t1])).confirmacion === 'confirmado', r.j);
  P('…y el recordatorio figura como respondido', (await q1('SELECT estado, respuesta FROM recordatorios_envios WHERE turno_id=$1', [t1])).estado === 'respondido');

  // ---------- Webhook de Meta ----------
  P('Verificación del webhook con token incorrecto: 403', (await fetch(`${B}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=123`)).status === 403);
  const ver = await fetch(`${B}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificar-prueba-dova&hub.challenge=987654`);
  P('Verificación con el token correcto: devuelve el desafío', ver.status === 200 && (await ver.text()) === '987654');
  r = await req('POST', `/recordatorios/turnos/${t2}/enviar`, null, R);
  const wamid2 = (await q1('SELECT proveedor_id FROM recordatorios_envios WHERE turno_id=$1', [t2])).proveedor_id;
  const aviso = (statuses, messages) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...(statuses ? { statuses } : {}), ...(messages ? { messages } : {}) } }] }] });
  let cuerpo = aviso([{ id: wamid2, status: 'delivered', recipient_id: '595' }]);
  P('Aviso sin firma: 401', (await req('POST', '/whatsapp/webhook', cuerpo)).s === 401);
  P('Aviso con firma falsa: 401', (await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo + 'x') })).s === 401);
  P('Aviso firmado de "entregado": se registra', (await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) })).s === 200 && (await q1('SELECT estado FROM recordatorios_envios WHERE turno_id=$1', [t2])).estado === 'entregado');
  cuerpo = aviso([{ id: wamid2, status: 'read' }]);
  await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
  cuerpo = aviso([{ id: wamid2, status: 'delivered' }]);
  await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
  P('"Leído" no retrocede a "entregado" si los avisos llegan desordenados', (await q1('SELECT estado FROM recordatorios_envios WHERE turno_id=$1', [t2])).estado === 'leido');
  const tel2 = (await q1('SELECT telefono FROM recordatorios_envios WHERE turno_id=$1', [t2])).telefono;
  cuerpo = aviso(null, [{ from: tel2, id: 'wamid.in1', type: 'text', text: { body: 'No puedo ir, quiero reprogramar' } }]);
  await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
  P('Responde "no puedo, quiero reprogramar": el turno queda "pide reprogramar"', (await q1('SELECT confirmacion FROM turnos WHERE id=$1', [t2])).confirmacion === 'pide_reprogramar');
  P('…y la recepción recibe el aviso', !!(await q1("SELECT 1 x FROM notificaciones WHERE tipo='recordatorio' AND titulo LIKE 'Beto%reprogramar%'")));
  r = await req('POST', `/recordatorios/turnos/${t6}/enviar`, null, R);
  const tel6 = (await q1('SELECT telefono FROM recordatorios_envios WHERE turno_id=$1', [t6])).telefono;
  cuerpo = aviso(null, [{ from: tel6, id: 'wamid.in2', type: 'button', button: { text: 'Sí, confirmo' } }]);
  await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
  P('Responde "Sí, confirmo": el turno queda confirmado', (await q1('SELECT confirmacion, estado FROM turnos WHERE id=$1', [t6])).confirmacion === 'confirmado');
  cuerpo = aviso(null, [{ from: '595999000111', id: 'wamid.in3', type: 'text', text: { body: 'SI' } }]);
  P('Un mensaje de un número sin recordatorio no toca ningún turno', (await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) })).j.procesados === 0);

  // ---------- Fallas ----------
  const p7 = await pac('Gabi', `0987${suf}`.slice(0, 10)); const t7 = await turno(p7, '08:00');
  const tel7 = `595${`0987${suf}`.slice(1, 10)}`;
  falla = new Set([tel7]);
  r = await req('POST', `/recordatorios/turnos/${t7}/enviar`, null, R);
  e = await q1('SELECT estado, error FROM recordatorios_envios WHERE turno_id=$1', [t7]);
  P('Si WhatsApp rechaza el mensaje: error claro y queda "no se pudo enviar"', r.s === 502 && e.estado === 'fallo' && /rechaz/i.test(e.error), { r: r.j, e });
  falla = new Set();
  r = await req('POST', `/recordatorios/turnos/${t7}/enviar`, null, R);
  P('Reintentar después de una falla', r.s === 200 && (await q1('SELECT estado FROM recordatorios_envios WHERE turno_id=$1', [t7])).estado === 'enviado');

  // ---------- A mano (WhatsApp de la recepción) ----------
  const p8 = await pac('Hugo', `0988${suf}`.slice(0, 10)); const t8 = await turno(p8, '08:30');
  r = await req('POST', `/recordatorios/turnos/${t8}/enlace`, null, R);
  P('A mano: devuelve el wa.me con el mensaje y el enlace del turno', r.s === 200 && /^https:\/\/wa\.me\/595\d+\?text=/.test(r.j.url) && /mi-turno\.html%23t%3D/.test(r.j.url), r.j);
  P('…queda registrado como enviado a mano', (await q1('SELECT canal, estado FROM recordatorios_envios WHERE turno_id=$1', [t8])).canal === 'whatsapp_manual');

  // ---------- Automático ----------
  const p9 = await pac('Ines', `0989${suf}`.slice(0, 10)); const t9 = await turno(p9, '09:00');
  P('Disparo programado sin la clave: 404', (await req('POST', '/recordatorios/cron', {})).s === 404);
  P('…con una clave incorrecta: 404', (await req('POST', '/recordatorios/cron', {}, null, { 'x-dova-cron': 'cron-secreto-de-prueba-012345678X' })).s === 404);
  r = await req('POST', '/recordatorios/cron', {}, null, { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' });
  P('Con el envío automático apagado no manda nada', r.s === 200 && r.j.enviados === 0 && !(await q1('SELECT 1 x FROM recordatorios_envios WHERE turno_id=$1', [t9])), r.j);
  await req('PUT', '/recordatorios/config', { automatico: true, hora: 6, dias: 1 }, A);
  const antes = recibidos.length;
  r = await req('POST', '/recordatorios/cron', {}, null, { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' });
  const enviadosAhora = recibidos.slice(antes).map((x) => x.cuerpo.to);
  P('Automático: manda los pendientes del día siguiente', r.s === 200 && r.j.enviados >= 1 && !!(await q1("SELECT 1 x FROM recordatorios_envios WHERE turno_id=$1 AND automatico AND estado='enviado'", [t9])), r.j);
  P('…no a quien no acepta, ni a turnos ya confirmados, ni a quien no tiene celular', !(await q1('SELECT 1 x FROM recordatorios_envios WHERE turno_id = ANY($1::int[])', [[t3, t4, t5]])));
  P('…ni repite los que ya se mandaron', !enviadosAhora.some((to) => to === tel2 || to === tel6 || to === tel7));
  r = await req('POST', '/recordatorios/cron', {}, null, { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' });
  P('Una segunda pasada no manda nada', r.j.enviados === 0, r.j);
  await req('PUT', '/recordatorios/config', { automatico: false, hora: 10, dias: 1 }, A);

  // Limpieza
  await db.query('DELETE FROM turnos WHERE id = ANY($1::int[])', [[t1, t2, t3, t4, t5, t6, t7, t8, t9]]);
  await db.query("DELETE FROM pacientes WHERE ci LIKE $1", [`RC${suf}%`]);
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
