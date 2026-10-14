// Resumen del día al dueño, indicaciones después del tratamiento y archivo de
// pendientes viejos (API). WhatsApp "falso" en el puerto 4600; los correos van
// al archivo MAIL_ARCHIVO del servidor de prueba (/tmp/dova-mails.jsonl).
const http = require('http');
const fs = require('fs');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok, headers = {}) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const CRON = { 'x-dova-cron': 'cron-secreto-de-prueba-0123456789' };
const MAILS = process.env.MAIL_ARCHIVO || '/tmp/dova-mails.jsonl';
const mails = () => { try { return fs.readFileSync(MAILS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_e) { return []; } };
const recibidos = []; let n = 0;
const meta = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { recibidos.push(JSON.parse(b || '{}')); n += 1; rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ messages: [{ id: `wamid.RES${n}` }] })); }); });

(async () => {
  await new Promise((ok) => meta.listen(4600, ok));
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','asis1')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const AS = (await req('POST', '/auth/login', { username: 'asis1', password: 'clave123' })).j.accessToken;
  const suf = String(Date.now() % 1000000); const h = hoy();
  const antes = await q1('SELECT resumen_activo, resumen_hora, resumen_correos, resumen_whatsapp, indicaciones_auto, controles_auto, encuesta_auto, lista_espera_auto FROM clinicas WHERE id=1');
  await db.query('UPDATE clinicas SET controles_auto=false, encuesta_auto=false, lista_espera_auto=false, indicaciones_auto=false, resumen_activo=false WHERE id=1');
  await db.query('DELETE FROM resumenes_diarios WHERE clinica_id=1');
  const pacs = []; const trats = [];
  const tel = (k) => `09${k}${suf}`.slice(0, 10);
  const pac = async (nombre, k, wa = true) => { const id = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono, acepta_whatsapp) VALUES (1,$1,'Indic',$2,$3,$4) RETURNING id", [nombre, `RI${suf}${k}`, tel(k), wa])).id; pacs.push(id); return id; };
  try {
    // ================= Resumen del día =================
    P('Resumen: configurar sin permiso (recepción): 403', (await req('GET', '/resumen/config', undefined, R)).s === 403 && (await req('PUT', '/resumen/config', { activo: true }, R)).s === 403);
    P('Hora fuera de rango: 400', (await req('PUT', '/resumen/config', { hora: 25 }, A)).s === 400);
    P('Correo inválido: 400', (await req('PUT', '/resumen/config', { correos: ['no-es-correo'] }, A)).s === 400);
    P('Más de 3 correos: 400', (await req('PUT', '/resumen/config', { correos: ['a@a.com', 'b@b.com', 'c@c.com', 'd@d.com'] }, A)).s === 400);
    P('Celular inválido: 400', (await req('PUT', '/resumen/config', { whatsapp: '12' }, A)).s === 400);
    await req('PUT', '/resumen/config', { correos: [], whatsapp: null }, A);
    P('Activar sin destinos: 400', (await req('PUT', '/resumen/config', { activo: true }, A)).s === 400);
    let r = await req('PUT', '/resumen/config', { activo: true, hora: 12, correos: [`Dueno${suf}@Ejemplo.com `], whatsapp: '0981 555 444' }, A);
    P('Guardar: activo, a las 12, correo (en minúsculas) y celular normalizado', r.s === 200 && r.j.activo && r.j.hora === 12 && r.j.correos[0] === `dueno${suf}@ejemplo.com` && r.j.whatsapp === '595981555444', r.j);
    P('…queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='config_resumen_diario' AND clinica_id=1 ORDER BY id DESC LIMIT 1")));
    r = await req('GET', '/resumen/vista', undefined, A);
    P('Vista previa con los datos del día', r.s === 200 && /Resumen del día/.test(r.j.texto) && /Cobrado: Gs\./.test(r.j.texto) && /Mañana: \d+ turno/.test(r.j.texto), r.j && r.j.texto);
    P('Vista previa con fecha inválida: 400', (await req('GET', '/resumen/vista?fecha=ayer', undefined, A)).s === 400);
    const m0 = mails().length; const w0 = recibidos.length;
    r = await req('POST', '/recordatorios/cron', {}, null, CRON);
    const mNuevos = mails().slice(m0); const wNuevos = recibidos.slice(w0).filter((x) => x.template && x.template.name === 'resumen_diario');
    P('El disparo programado manda el resumen por correo', r.s === 200 && mNuevos.some((x) => x.to === `dueno${suf}@ejemplo.com` && /Resumen del día/.test(x.subject) && /Cobrado/.test(x.text)), { cron: r.j && r.j.resumen, mails: mNuevos.map((x) => x.subject) });
    P('…y por WhatsApp (plantilla resumen_diario, 8 datos, sin saltos de línea)', wNuevos.length === 1 && wNuevos[0].to === '595981555444' && wNuevos[0].template.components[0].parameters.length === 8 && wNuevos[0].template.components[0].parameters.every((p) => !/\n/.test(p.text)), wNuevos);
    const fila = await q1('SELECT estado, canales FROM resumenes_diarios WHERE clinica_id=1 AND fecha=$1', [h]);
    P('Queda registrado como enviado', fila && fila.estado === 'enviado' && /correo/.test(fila.canales) && /whatsapp/.test(fila.canales), fila);
    const m1 = mails().length; const w1 = recibidos.length;
    await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('Un solo resumen por día (el segundo disparo no repite)', mails().length === m1 && recibidos.slice(w1).filter((x) => x.template && x.template.name === 'resumen_diario').length === 0);
    r = await req('POST', '/resumen/enviar', {}, A);
    P('"Mandar ahora" lo vuelve a mandar', r.s === 200 && r.j.canales.length === 2, r.j);
    P('"Mandar ahora" sin permiso: 403', (await req('POST', '/resumen/enviar', {}, R)).s === 403);

    // ================= Indicaciones después del tratamiento =================
    P('Indicaciones de más de 2000 letras: 400', (await req('POST', '/tratamientos', { nombre: `Trat ${suf}`, precio: 1000, indicaciones: 'x'.repeat(2001) }, A)).s === 400);
    r = await req('POST', '/tratamientos', { nombre: `Extracción prueba ${suf}`, precio: 100000, indicaciones: 'Morder la gasa 1 hora.\r\nNo hacer buches hoy.' }, A);
    const trat = r.j.id; trats.push(trat);
    P('Tratamiento con indicaciones (saltos de línea normalizados)', r.s === 201 && r.j.indicaciones === 'Morder la gasa 1 hora.\nNo hacer buches hoy.', r.j);
    const sinInd = (await req('POST', '/tratamientos', { nombre: `Sin indicaciones ${suf}`, precio: 1000 }, A)).j.id; trats.push(sinInd);
    const pI = await pac('Irene', 81); const pN = await pac('Nora', 82, false);
    const turno = async (p, t) => (await q1("INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, estado, tratamiento_id, motivo) VALUES (1,$1,1,$2,'08:00',30,'atendido',$3,'x') RETURNING id", [p, h, t])).id;
    const tI = await turno(pI, trat); const tN = await turno(pN, trat); const tS = await turno(pI, sinInd);
    r = await req('PUT', '/mensajes/config', { indicaciones: true }, A);
    P('Activar indicaciones automáticas', r.s === 200 && r.j.indicaciones === true && r.j.tratamientosConIndicaciones >= 1 && /cuidados/.test(r.j.ejemplos.indicaciones), r.j && { i: r.j.indicaciones, n: r.j.tratamientosConIndicaciones });
    const w2 = recibidos.length;
    await req('POST', '/recordatorios/cron', {}, null, CRON);
    const ind = recibidos.slice(w2).filter((x) => x.template && x.template.name === 'indicaciones_tratamiento');
    const aIrene = ind.filter((x) => x.to === `595${tel(81).slice(1)}`);
    P('Al terminar la atención le llegan las indicaciones (con enlace privado)', aIrene.length === 1 && /indicaciones\.html#t=/.test(aIrene[0].template.components[0].parameters[3].text), ind.map((x) => x.to));
    P('…no a quien no acepta WhatsApp', !ind.some((x) => x.to === `595${tel(82).slice(1)}`));
    const token = aIrene.length ? aIrene[0].template.components[0].parameters[3].text.split('#t=')[1] : '';
    r = await req('GET', `/web/publico/aviso/${token}`);
    P('La página del enlace muestra las indicaciones', r.s === 200 && r.j.tipo === 'indicaciones' && /Morder la gasa/.test(r.j.indicaciones) && r.j.nombre === 'Irene', r.j);
    const w3 = recibidos.length;
    await req('POST', '/recordatorios/cron', {}, null, CRON);
    P('No se manda dos veces', recibidos.slice(w3).filter((x) => x.template && x.template.name === 'indicaciones_tratamiento' && x.to === `595${tel(81).slice(1)}`).length === 0);
    r = await req('GET', `/mensajes/indicaciones/${tI}`, undefined, R);
    P('Desde el turno: se ve que ya se mandaron', r.s === 200 && r.j.disponible && r.j.enviado && r.j.enviado.canal === 'whatsapp_api', r.j);
    r = await req('POST', `/mensajes/indicaciones/${tI}/enviar`, {}, R);
    P('A mano: enlace de WhatsApp con el texto completo', r.s === 200 && /^https:\/\/wa\.me\/595/.test(r.j.url) && /Morder%20la%20gasa/.test(r.j.url), r.j);
    P('A mano, tratamiento sin indicaciones: 409', (await req('POST', `/mensajes/indicaciones/${tS}/enviar`, {}, R)).s === 409);
    P('A mano, paciente que no acepta WhatsApp: 409', (await req('POST', `/mensajes/indicaciones/${tN}/enviar`, {}, R)).s === 409);
    P('Turno de otra clínica o inexistente: 404', (await req('POST', '/mensajes/indicaciones/99999999/enviar', {}, R)).s === 404);
    P('Sin permiso (asistente): 403', (await req('POST', `/mensajes/indicaciones/${tI}/enviar`, {}, AS)).s === 403);

    // ================= Archivar pendientes viejos =================
    const pV = await pac('Vieja', 91); const pR = await pac('Reciente', 92);
    const tipoR = (await q1('SELECT id FROM recall_tipos WHERE clinica_id=1 ORDER BY id LIMIT 1')).id;
    const recV = (await q1("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, intervalo_meses, estado) VALUES (1,$1,$2,current_date - interval '8 months',6,'activo') RETURNING id", [pV, tipoR])).id;
    const recR = (await q1("INSERT INTO paciente_recalls (clinica_id, paciente_id, recall_tipo_id, proxima_fecha, intervalo_meses, estado) VALUES (1,$1,$2,current_date - interval '2 months',6,'activo') RETURNING id", [pR, tipoR])).id;
    const ctlV = (await q1("INSERT INTO controles_programados (clinica_id, paciente_id, titulo, fecha_programada) VALUES (1,$1,'Control implante',current_date - interval '7 months') RETURNING id", [pV])).id;
    r = await req('GET', '/seguimiento/archivar?meses=6', undefined, R);
    P('Cuántos se archivarían (más de 6 meses)', r.s === 200 && r.j.recalls >= 1 && r.j.controles >= 1, r.j);
    P('Meses inválidos: 400', (await req('GET', '/seguimiento/archivar?meses=5', undefined, R)).s === 400);
    P('Tipo inválido: 400', (await req('POST', '/seguimiento/archivar', { tipo: 'pacientes', meses: 6 }, R)).s === 400);
    P('Sin permiso (asistente): 403', (await req('POST', '/seguimiento/archivar', { tipo: 'recalls', meses: 6 }, AS)).s === 403);
    const panel0 = (await req('GET', '/seguimiento/panel', undefined, R)).j;
    r = await req('POST', '/seguimiento/archivar', { tipo: 'recalls', meses: 6 }, R);
    P('Archivar controles periódicos de más de 6 meses', r.s === 200 && r.j.archivados >= 1 && (await q1('SELECT estado FROM paciente_recalls WHERE id=$1', [recV])).estado === 'archivado', r.j);
    P('…el de hace 2 meses sigue activo', (await q1('SELECT estado FROM paciente_recalls WHERE id=$1', [recR])).estado === 'activo');
    const panel1 = (await req('GET', '/seguimiento/panel', undefined, R)).j;
    P('Inicio/Seguimiento ya no los cuentan', panel1.recallsVencidos === panel0.recallsVencidos - r.j.archivados, { antes: panel0.recallsVencidos, despues: panel1.recallsVencidos, arch: r.j.archivados });
    P('…ni la lista de controles periódicos', !(await req('GET', '/recalls/lista?vista=vencidos', undefined, R)).j.some((x) => x.id === recV));
    P('Queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='archivar_pendientes' ORDER BY id DESC LIMIT 1")));
    r = await req('POST', '/seguimiento/archivar', { tipo: 'controles', meses: 6 }, R);
    P('Archivar controles después de un tratamiento', r.s === 200 && (await q1('SELECT estado FROM controles_programados WHERE id=$1', [ctlV])).estado === 'archivado', r.j);
    r = await req('GET', '/seguimiento/archivados?tipo=recalls', undefined, R);
    P('Lista de archivados', r.s === 200 && r.j.items.some((x) => x.id === recV) && r.j.total >= 1);
    P('Restaurar con ids inválidos: 400', (await req('POST', '/seguimiento/archivados/restaurar', { tipo: 'recalls', ids: ['x'] }, R)).s === 400);
    r = await req('POST', '/seguimiento/archivados/restaurar', { tipo: 'recalls', ids: [recV] }, R);
    P('Restaurar uno: vuelve a activo', r.s === 200 && r.j.restaurados === 1 && (await q1('SELECT estado FROM paciente_recalls WHERE id=$1', [recV])).estado === 'activo');
  } finally {
    // Todo lo archivado por la prueba vuelve a su estado; configuración como estaba.
    await db.query("UPDATE paciente_recalls SET estado='activo' WHERE clinica_id=1 AND estado='archivado'");
    await db.query("UPDATE controles_programados SET estado='pendiente' WHERE clinica_id=1 AND estado='archivado'");
    await db.query('UPDATE clinicas SET resumen_activo=$1, resumen_hora=$2, resumen_correos=$3, resumen_whatsapp=$4, indicaciones_auto=$5, controles_auto=$6, encuesta_auto=$7, lista_espera_auto=$8 WHERE id=1',
      [antes.resumen_activo, antes.resumen_hora, antes.resumen_correos, antes.resumen_whatsapp, antes.indicaciones_auto, antes.controles_auto, antes.encuesta_auto, antes.lista_espera_auto]);
    const c = await db.connect();
    try { await c.query('BEGIN'); await c.query("SET LOCAL dova.borrando_paciente='on'"); await c.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]); await c.query('DELETE FROM tratamientos WHERE id = ANY($1::int[])', [trats]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); console.error('limpieza', e.message); } finally { c.release(); }
  }
  meta.close(); await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
