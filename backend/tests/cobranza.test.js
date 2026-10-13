// Avisos de cobro por WhatsApp (API) con un WhatsApp "falso" que imita a Meta
// en el puerto 4600. Mismo servidor de prueba que recordatorios.test.js.
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
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex');
const CRON = { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' };

const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => {
  let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => {
    recibidos.push({ url: rq.url, cuerpo: JSON.parse(b || '{}') });
    n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.COBRO${n}` }] }));
  });
});

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','sinperm')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const S = (await req('POST', '/auth/login', { username: 'sinperm', password: 'Clave1234!' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const h = hoy();
  const webAntes = await q1('SELECT pagos_activos FROM web_config WHERE clinica_id=1');
  const cfgAntes = await q1('SELECT cobranza_auto, cobranza_hora, cobranza_dias_antes, cobranza_repetir_dias, cobranza_max_avisos, presupuesto_seguimiento, presupuesto_dias FROM clinicas WHERE id=1');
  await db.query('UPDATE clinicas SET cobranza_auto=false, cobranza_hora=10, cobranza_dias_antes=2, cobranza_repetir_dias=7, cobranza_max_avisos=3, presupuesto_seguimiento=true, presupuesto_dias=3 WHERE id=1');
  const tel1 = `0971${suf}`.slice(0, 10); const tel2 = `0972${suf}`.slice(0, 10);
  const pac = async (nombre, tel, wa = true) => (await q1(`INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono, acepta_whatsapp) VALUES (1,$1,'Cobro',$2,$3,$4) RETURNING id`, [nombre, `CB${suf}${nombre.slice(0, 2)}`, tel, wa])).id;
  const p1 = await pac('Carla', tel1); const p2 = await pac('Dario', tel2, false);
  const plan = async (pid) => (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, entrega, cantidad_cuotas, fecha_inicio, estado) VALUES (1,$1,900000,0,3,$2,'activo') RETURNING id", [pid, sumar(h, -40)])).id;
  const cuota = async (pl, num, venc) => (await q1("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,$2,300000,$3,'pendiente') RETURNING id", [pl, num, venc])).id;
  const pl1 = await plan(p1); const c1 = await cuota(pl1, 1, sumar(h, -10)); const c2 = await cuota(pl1, 2, sumar(h, 2)); const c3 = await cuota(pl1, 3, sumar(h, 40));
  const pl2 = await plan(p2); const c4 = await cuota(pl2, 1, sumar(h, -10));
  const pres = async (pid, dias) => (await q1("INSERT INTO presupuestos (clinica_id, paciente_id, fecha, total, estado, creado_en, actualizado_en) VALUES (1,$1,$2,2500000,'enviado', now() - ($3::int * interval '1 day'), now() - ($3::int * interval '1 day')) RETURNING id", [pid, sumar(h, -dias), dias])).id;
  const pr1 = await pres(p1, 5); const pr2 = await pres(p1, 1);
  await db.query("INSERT INTO presupuesto_items (presupuesto_id, descripcion, pieza, cantidad, precio_unitario) VALUES ($1,'Implante dental','36',1,2500000)", [pr1]);
  try {
    // ---------- Permisos y configuración ----------
    P('Sin permiso: 403', (await req('GET', '/cobranza/pendientes', null, S)).s === 403);
    let r = await req('GET', '/cobranza/config', null, R);
    P('Recepción ve la configuración, con ejemplos de mensaje y enlace', r.s === 200 && /venció el/.test(r.j.ejemplos.cuota) && /mi-pago\.html#t=/.test(r.j.ejemplos.cuota) && /presupuesto/.test(r.j.ejemplos.presupuesto), r.j);
    P('Recepción no cambia la configuración: 403', (await req('PUT', '/cobranza/config', { automatico: true }, R)).s === 403);
    P('Hora fuera de rango: 400', (await req('PUT', '/cobranza/config', { hora: 22 }, A)).s === 400);
    P('Datos que no son sí/no: 400', (await req('PUT', '/cobranza/config', { automatico: 'si' }, A)).s === 400);

    // ---------- Qué toca avisar ----------
    r = await req('GET', '/cobranza/pendientes', null, R);
    const cu = (id) => r.j.cuotas.find((x) => x.id === id); const pr = (id) => r.j.presupuestos.find((x) => x.id === id);
    P('Cuota vencida: toca el aviso 1', cu(c1) && cu(c1).toca && cu(c1).etapa === 1 && cu(c1).diasAtraso === 10, cu(c1));
    P('Cuota que vence en 2 días: toca el aviso previo', cu(c2) && cu(c2).toca && cu(c2).etapa === 0, cu(c2));
    P('Cuota lejana: no aparece', !cu(c3));
    P('Paciente que no acepta WhatsApp: no se le avisa', cu(c4) && !cu(c4).toca && /no acepta/.test(cu(c4).noEnviable), cu(c4));
    P('Presupuesto enviado hace 5 días: toca', pr(pr1) && pr(pr1).toca && pr(pr1).etapa === 1, pr(pr1));
    P('Presupuesto de ayer: todavía no', pr(pr2) && !pr(pr2).toca && /3 días/.test(pr(pr2).motivo), pr(pr2));

    // ---------- Envío por WhatsApp Business ----------
    let ant = recibidos.length;
    r = await req('POST', `/cobranza/cuota/${c1}/enviar`, null, R);
    const msg = recibidos[ant] && recibidos[ant].cuerpo;
    P('Enviar: sale con la plantilla de pago y sus 4 datos', r.s === 200 && msg && msg.template.name === 'aviso_pago' && msg.template.components[0].parameters.length === 4 && /cuota 1 de 3 por Gs\. 300\.000 venció/.test(msg.template.components[0].parameters[2].text), msg || r.j);
    const enlace = msg.template.components[0].parameters[3].text;
    P('…con el enlace privado a "Mi pago"', /\/web\/mi-pago\.html#t=[\w-]{30,}/.test(enlace), enlace);
    P('…queda registrado (etapa 1) y en las comunicaciones del paciente', !!(await q1("SELECT 1 x FROM cobranza_envios WHERE tipo='cuota' AND referencia_id=$1 AND etapa=1 AND estado='enviado' AND proveedor_id IS NOT NULL", [c1])) && !!(await q1("SELECT 1 x FROM comunicaciones WHERE paciente_id=$1 AND motivo='cobranza'", [p1])));
    P('Mandarlo otra vez el mismo día: 409', (await req('POST', `/cobranza/cuota/${c1}/enviar`, null, R)).s === 409);
    P('A quien no acepta WhatsApp: 409', (await req('POST', `/cobranza/cuota/${c4}/enviar`, null, R)).s === 409);
    P('Cuota de otra clínica o inexistente: 404', (await req('POST', '/cobranza/cuota/999999999/enviar', null, R)).s === 404);
    P('Tipo inválido: 400', (await req('POST', `/cobranza/turno/${c1}/enviar`, null, R)).s === 400);
    P('Sin permiso: 403', (await req('POST', `/cobranza/cuota/${c2}/enviar`, null, S)).s === 403);
    // A mano
    r = await req('POST', `/cobranza/presupuesto/${pr1}/enlace`, null, R);
    P('A mano: wa.me con el mensaje del presupuesto y su enlace', r.s === 200 && /^https:\/\/wa\.me\/595\d+\?text=/.test(r.j.url) && /presupuesto/.test(decodeURIComponent(r.j.url)) && /mi-pago\.html%23t%3D/.test(r.j.url), r.j);
    P('…queda como enviado a mano', (await q1("SELECT canal, remitente FROM cobranza_envios WHERE tipo='presupuesto' AND referencia_id=$1", [pr1])).canal === 'whatsapp_manual');

    // ---------- Automático ----------
    await req('PUT', '/cobranza/config', { automatico: true, hora: 8 }, A);
    ant = recibidos.length;
    r = await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('El disparo programado también manda los avisos de cobro que tocan', r.s === 200 && r.j.cobranza && r.j.cobranza.enviados >= 1 && !!(await q1("SELECT 1 x FROM cobranza_envios WHERE tipo='cuota' AND referencia_id=$1 AND etapa=0 AND automatico", [c2])), r.j);
    P('…nunca al que no acepta WhatsApp', !(await q1("SELECT 1 x FROM cobranza_envios WHERE referencia_id=$1 AND tipo='cuota'", [c4])) && !recibidos.slice(ant).some((x) => x.cuerpo.to && x.cuerpo.to.endsWith(tel2.slice(1))));
    P('…ni el presupuesto de ayer', !(await q1("SELECT 1 x FROM cobranza_envios WHERE tipo='presupuesto' AND referencia_id=$1", [pr2])));
    const antes2 = Number((await q1('SELECT count(*) n FROM cobranza_envios WHERE paciente_id=$1', [p1])).n);
    r = await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('Segunda pasada: no le repite nada', r.s === 200 && Number((await q1('SELECT count(*) n FROM cobranza_envios WHERE paciente_id=$1', [p1])).n) === antes2, r.j);
    await req('PUT', '/cobranza/config', { automatico: false }, A);

    // ---------- Página "Mi pago" ----------
    const token = enlace.split('#t=')[1];
    r = await req('GET', `/web/publico/pago/${token}`);
    P('Mi pago: muestra nombre, cuotas pendientes y el presupuesto con su detalle', r.s === 200 && r.j.nombre === 'Carla' && r.j.cuotas.length === 3 && r.j.cuotas[0].vencida && r.j.presupuestos.some((p) => p.id === pr1 && p.items[0].descripcion === 'Implante dental'), r.j);
    P('…no expone apellido ni C.I.', !/Cobro|CB\d/.test(r.t));
    P('Enlace inventado: 404', (await req('GET', '/web/publico/pago/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).s === 404);
    await db.query("UPDATE cobranza_enlaces SET expira_en=now() - interval '1 minute' WHERE paciente_id=$1 AND token_hash=$2", [p1, crypto.createHash('sha256').update(token).digest('hex')]);
    P('Enlace vencido: 404', (await req('GET', `/web/publico/pago/${token}`)).s === 404);
    // Enlace nuevo (el de la cuota 2, mandado por el automático)
    const env2 = recibidos.find((x) => x.cuerpo.to === `595${tel1.slice(1)}` && x.cuerpo.template && /cuota 2 de 3/.test(x.cuerpo.template.components[0].parameters[2].text));
    const token2 = env2.cuerpo.template.components[0].parameters[3].text.split('#t=')[1];
    await db.query('UPDATE web_config SET pagos_activos=true WHERE clinica_id=1');
    const subir = async (tk, campos, archivo) => {
      const fd = new FormData(); for (const [k, v] of Object.entries(campos)) fd.append(k, v);
      if (archivo) fd.append('comprobante', new Blob([archivo]), 'comp.png');
      const x = await fetch(`${B}/web/publico/pago/${tk}/comprobante`, { method: 'POST', body: fd });
      return { s: x.status, j: await x.json().catch(() => null) };
    };
    P('Comprobante sin archivo: 400', (await subir(token2, { metodo: 'transferencia', cuotaId: String(c1) })).s === 400);
    P('Comprobante que no es imagen ni PDF: 400', (await subir(token2, { metodo: 'transferencia', cuotaId: String(c1) }, Buffer.from('<script>alert(1)</script>'))).s === 400);
    P('Comprobante de una cuota ajena: 400', (await subir(token2, { metodo: 'transferencia', cuotaId: String(c4) }, PNG)).s === 400);
    r = await subir(token2, { metodo: 'transferencia', cuotaId: String(c1) }, PNG);
    P('Manda el comprobante de la cuota vencida: queda para revisar', r.s === 201 && !!(await q1("SELECT 1 x FROM web_pagos WHERE cuota_id=$1 AND estado='pendiente' AND monto=300000", [c1])), r);
    P('…dos veces la misma cuota: 409', (await subir(token2, { metodo: 'transferencia', cuotaId: String(c1) }, PNG)).s === 409);
    r = await req('GET', '/cobranza/pendientes', null, R);
    P('Con el comprobante en revisión, no se le sigue avisando', r.j.cuotas.find((x) => x.id === c1).enRevision === true && r.j.cuotas.find((x) => x.id === c1).etapa === null);
    // Responder el presupuesto
    P('Respuesta inválida: 400', (await req('POST', `/web/publico/pago/${token2}/presupuesto/${pr1}`, { respuesta: 'aceptar' })).s === 400);
    const ajeno = (await q1("SELECT id FROM presupuestos WHERE clinica_id=1 AND estado='enviado' AND paciente_id<>$1 LIMIT 1", [p1]));
    if (ajeno) P('Presupuesto de otro paciente: 404', (await req('POST', `/web/publico/pago/${token2}/presupuesto/${ajeno.id}`, { respuesta: 'consulta' })).s === 404);
    r = await req('POST', `/web/publico/pago/${token2}/presupuesto/${pr1}`, { respuesta: 'quiero_empezar', nota: 'Puedo los martes <b>' });
    P('"Quiero empezar": queda registrado y avisa a la recepción', r.s === 200 && !!(await q1("SELECT 1 x FROM comunicaciones WHERE paciente_id=$1 AND resultado='quiero_empezar'", [p1])) && !!(await q1("SELECT 1 x FROM notificaciones n JOIN usuarios u ON u.id=n.usuario_id WHERE u.username='recep1' AND n.titulo LIKE 'Carla Cobro: quiere empezar%'")), r.j);
    P('…el presupuesto no cambia de estado solo (lo cierra la clínica)', (await q1('SELECT estado FROM presupuestos WHERE id=$1', [pr1])).estado === 'enviado');

    // ---------- Webhook ----------
    const prov = (await q1("SELECT proveedor_id FROM cobranza_envios WHERE tipo='cuota' AND referencia_id=$1 AND etapa=0", [c2])).proveedor_id;
    const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: prov, status: 'read' }] } }] }] });
    r = await req('POST', '/whatsapp/webhook', cuerpo, null, { 'x-hub-signature-256': firmar(cuerpo) });
    P('Webhook: el aviso de cobro pasa a "leído"', r.s === 200 && (await q1('SELECT estado FROM cobranza_envios WHERE proveedor_id=$1', [prov])).estado === 'leido', r.t);
    const de = `595${tel1.slice(1)}`;
    const resp = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: de, text: { body: 'Sí, mañana pago' } }] } }] }] });
    r = await req('POST', '/whatsapp/webhook', resp, null, { 'x-hub-signature-256': firmar(resp) });
    P('Si el paciente responde el aviso, queda como respuesta del aviso de cobro (no confirma un turno)', r.s === 200 && !!(await q1("SELECT 1 x FROM cobranza_envios WHERE paciente_id=$1 AND estado='respondido' AND respuesta LIKE 'Sí, mañana%'", [p1])), r.t);
    P('Queda en el historial la configuración', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='config_cobranza' ORDER BY id DESC LIMIT 1")));
  } finally {
    await db.query('UPDATE web_config SET pagos_activos=$1 WHERE clinica_id=1', [webAntes.pagos_activos]);
    await db.query(`UPDATE clinicas SET cobranza_auto=$1, cobranza_hora=$2, cobranza_dias_antes=$3, cobranza_repetir_dias=$4, cobranza_max_avisos=$5, presupuesto_seguimiento=$6, presupuesto_dias=$7 WHERE id=1`,
      [cfgAntes.cobranza_auto, cfgAntes.cobranza_hora, cfgAntes.cobranza_dias_antes, cfgAntes.cobranza_repetir_dias, cfgAntes.cobranza_max_avisos, cfgAntes.presupuesto_seguimiento, cfgAntes.presupuesto_dias]);
    await db.query('DELETE FROM web_pagos WHERE paciente_id = ANY($1::int[])', [[p1, p2]]);
    await db.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [[p1, p2]]);
  }
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); meta.close(); process.exit(1); });
