// Cobro online (Pagopar) contra una pasarela FALSA local (:4700) que valida las firmas como lo hace Pagopar.
// Requiere el servidor con PAGOPAR_PUBLIC_KEY=pub-prueba PAGOPAR_PRIVATE_KEY=priv-prueba PAGOPAR_API_URL=http://localhost:4700
const crypto = require('crypto');
const http = require('http');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const PUB = 'pub-prueba'; const PRIV = 'priv-prueba';

// ---- Pasarela falsa ----
const pedidos = {}; // hash -> { pedido, monto, pagado, cancelado }
let creados = 0;
const mock = http.createServer((rq, rs) => {
  let b = ''; rq.on('data', (c) => { b += c; });
  rq.on('end', () => {
    const j = JSON.parse(b || '{}'); const out = (o) => { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(o)); };
    if (rq.url === '/api/comercios/2.0/iniciar-transaccion') {
      if (j.token !== sha1(`${PRIV}${j.id_pedido_comercio}${String(parseFloat(j.monto_total))}`) || j.public_key !== PUB) return out({ respuesta: false, resultado: 'Token no coincide.' });
      if (!j.comprador || !j.comprador.email || !j.comprador.nombre || !j.comprador.documento) return out({ respuesta: false, resultado: 'Faltan datos del comprador.' });
      creados += 1; const hash = `HASH${creados}${crypto.randomBytes(4).toString('hex')}`;
      pedidos[hash] = { pedido: j.id_pedido_comercio, monto: j.monto_total, pagado: false, cancelado: false };
      return out({ respuesta: true, resultado: [{ data: hash, pedido: String(creados) }] });
    }
    if (rq.url === '/api/pedidos/1.1/traer') {
      if (j.token !== sha1(`${PRIV}CONSULTA`) || j.token_publico !== PUB) return out({ respuesta: false, resultado: 'Token no coincide.' });
      const p = pedidos[j.hash_pedido]; if (!p) return out({ respuesta: false, resultado: 'Pedido no existe' });
      return out({ respuesta: true, resultado: [{ pagado: p.pagado, cancelado: p.cancelado, monto: `${p.monto}.00`, forma_pago: 'Tarjeta de crédito', hash_pedido: j.hash_pedido }] });
    }
    rs.statusCode = 404; return out({});
  });
});
const aviso = (hash, token) => req('POST', '/cobro-online/aviso/pagopar', { respuesta: true, resultado: [{ pagado: true, hash_pedido: hash, token: token === undefined ? sha1(`${PRIV}${hash}`) : token }] });
const hashDe = (url) => decodeURIComponent(url.split('/').pop());

(async () => {
  await new Promise((r) => mock.listen(4700, r));
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}', cobro_online_activo=false WHERE id=1");
  const suf = String(Date.now() % 1000000); const hoy = new Date().toISOString().slice(0, 10);
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const pac = async (n, extra = {}) => (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, email) VALUES (1,$1,$2,$3,$4) RETURNING id", [n, `Online${suf}`, `CO${suf}${n}`, extra.email === undefined ? `${n.toLowerCase()}@ejemplo.com` : extra.email])).id;
  const cuota = async (pid, monto = 300000) => {
    const pl = (await q1("INSERT INTO planes_pago (clinica_id, paciente_id, total, entrega, cantidad_cuotas, fecha_inicio, estado) VALUES (1,$1,$2,0,1,$3,'activo') RETURNING id", [pid, monto, hoy])).id;
    return (await q1("INSERT INTO cuotas (plan_pago_id, numero, monto, vencimiento, estado) VALUES ($1,1,$2,$3,'pendiente') RETURNING id", [pl, monto, hoy])).id;
  };
  const enlace = async (pid) => { const t = crypto.randomBytes(24).toString('base64url'); await db.query("INSERT INTO cobranza_enlaces (clinica_id, paciente_id, token_hash, expira_en) VALUES (1,$1,$2, now() + interval '1 day')", [pid, crypto.createHash('sha256').update(t).digest('hex')]); return t; };
  const cajaAbierta = await q1("SELECT id FROM cajas WHERE clinica_id=1 AND estado='abierta' LIMIT 1").catch(() => null);
  void cajaAbierta;
  try {
    // 1) Permisos y estado
    P('recepción no entra al cobro online', (await req('GET', '/cobro-online/estado', undefined, R)).s === 403);
    const e0 = (await req('GET', '/cobro-online/estado', undefined, A)).j;
    P('estado: pasarela conectada, todavía apagado', e0.configurado === true && e0.activo === false && e0.incluidoEnPlan === true, e0);
    const ana = await pac('Ana'); const cu1 = await cuota(ana); const t1 = await enlace(ana);
    let m = (await req('GET', `/web/publico/pago/${t1}`)).j;
    P('Mi pago: con el cobro online apagado no se ofrece', m.pagoOnline === false, m);
    P('no se puede iniciar si está apagado', (await req('POST', `/web/publico/pago/${t1}/online`, { cuotaId: cu1 })).s === 409);
    P('encender', (await req('PUT', '/cobro-online/estado', { activo: true }, A)).j.activo === true);
    m = (await req('GET', `/web/publico/pago/${t1}`)).j;
    P('Mi pago: ahora ofrece "Pagar ahora"', m.pagoOnline === true);

    // 2) Iniciar el cobro
    P('sin cuota: 400', (await req('POST', `/web/publico/pago/${t1}/online`, {})).s === 400);
    const otra = await pac('Otro'); const cuOtra = await cuota(otra);
    P('cuota de otro paciente: 404', (await req('POST', `/web/publico/pago/${t1}/online`, { cuotaId: cuOtra })).s === 404);
    const ini = await req('POST', `/web/publico/pago/${t1}/online`, { cuotaId: cu1 });
    P('crea el cobro y devuelve el enlace de la pasarela', ini.s === 200 && /pagopar\.com\/pagos\/HASH/.test(ini.j.url), ini);
    const h1 = hashDe(ini.j.url);
    P('la pasarela recibió el monto exacto de la cuota', pedidos[h1] && pedidos[h1].monto === 300000, pedidos[h1]);
    const ini2 = await req('POST', `/web/publico/pago/${t1}/online`, { cuotaId: cu1 });
    P('pedirlo de nuevo reutiliza el mismo cobro', ini2.j && ini2.j.url === ini.j.url && creados === 1, { creados });
    const sinMail = await pac('Sinmail', { email: '' }); const cuSM = await cuota(sinMail); const tSM = await enlace(sinMail);
    await db.query('UPDATE clinicas SET email=$1 WHERE id=1', ['clinica@ejemplo.com']);
    P('paciente sin correo: se usa el de la clínica', (await req('POST', `/web/publico/pago/${tSM}/online`, { cuotaId: cuSM })).s === 200);

    // 3) Aviso de la pasarela
    P('aviso con firma falsa: 401', (await aviso(h1, 'firma-falsa')).s === 401);
    P('aviso sin cuerpo válido: 401', (await req('POST', '/cobro-online/aviso/pagopar', { x: 1 })).s === 401);
    P('aviso de un pedido que no es de DOVA: 200 sin efecto', (await aviso('HASH-AJENO')).s === 200);
    let av = await aviso(h1);
    P('aviso firmado pero la pasarela dice "no pagado": no registra nada', av.s === 200 && (await q1('SELECT estado FROM cobros_online WHERE hash_proveedor=$1', [h1])).estado === 'creado' && (await q1('SELECT estado FROM cuotas WHERE id=$1', [cu1])).estado !== 'pagada');
    pedidos[h1].pagado = true;
    av = await aviso(h1);
    const co1 = await q1('SELECT * FROM cobros_online WHERE hash_proveedor=$1', [h1]);
    P('pagado en la pasarela: queda pagado y con su pago', av.s === 200 && co1.estado === 'pagado' && co1.pago_id, co1);
    P('la cuota quedó pagada', (await q1('SELECT estado FROM cuotas WHERE id=$1', [cu1])).estado === 'pagada');
    const pg = await q1('SELECT monto, paciente_id, concepto FROM pagos WHERE id=$1', [co1.pago_id]);
    P('el pago es del paciente, por el monto y dice que fue online', Number(pg.monto) === 300000 && pg.paciente_id === ana && /Pago online/.test(pg.concepto), pg);
    await aviso(h1); await aviso(h1);
    P('avisos repetidos no duplican el pago', Number((await q1('SELECT count(*) n FROM pagos WHERE cuota_id=$1', [cu1])).n) === 1);
    P('Mi pago ya no muestra la cuota pagada', !(await req('GET', `/web/publico/pago/${t1}`)).j.cuotas.some((c) => c.id === cu1));
    P('auditado', Number((await q1("SELECT count(*) n FROM auditoria WHERE accion='cobro_online_pagado' AND entidad_id=$1", [String(co1.id)])).n) === 1);

    // 4) Monto distinto → revisar (no se registra)
    const bea = await pac('Bea'); const cuB = await cuota(bea); const tB = await enlace(bea);
    const hB = hashDe((await req('POST', `/web/publico/pago/${tB}/online`, { cuotaId: cuB })).j.url);
    pedidos[hB].pagado = true; pedidos[hB].monto = 250000;
    await aviso(hB);
    const coB = await q1('SELECT estado, ultimo_error FROM cobros_online WHERE hash_proveedor=$1', [hB]);
    P('monto distinto: queda para revisar y la cuota sigue pendiente', coB.estado === 'revisar' && /250000/.test(coB.ultimo_error) && (await q1('SELECT estado FROM cuotas WHERE id=$1', [cuB])).estado !== 'pagada', coB);

    // 5) Cuota ya pagada a mano cuando llega el pago online → revisar
    const cai = await pac('Cai'); const cuC = await cuota(cai); const tC = await enlace(cai);
    const hC = hashDe((await req('POST', `/web/publico/pago/${tC}/online`, { cuotaId: cuC })).j.url);
    await db.query("UPDATE cuotas SET estado='pagada', pagado_en=now() WHERE id=$1", [cuC]);
    await db.query("INSERT INTO pagos (clinica_id, paciente_id, cuota_id, monto, metodo, fecha) VALUES (1,$1,$2,300000,'efectivo',now())", [cai, cuC]).catch(() => {});
    pedidos[hC].pagado = true;
    await aviso(hC);
    const coC = await q1('SELECT estado FROM cobros_online WHERE hash_proveedor=$1', [hC]);
    P('cuota ya pagada a mano: el cobro queda para revisar', coC.estado === 'revisar', coC);
    P('no se puede iniciar el cobro de una cuota ya pagada', (await req('POST', `/web/publico/pago/${tC}/online`, { cuotaId: cuC })).s === 409);

    // 6) Aviso perdido: "Volver a consultar" desde el panel
    const dan = await pac('Dan'); const cuD = await cuota(dan); const tD = await enlace(dan);
    const hD = hashDe((await req('POST', `/web/publico/pago/${tD}/online`, { cuotaId: cuD })).j.url);
    pedidos[hD].pagado = true;
    const lista = (await req('GET', '/cobro-online', undefined, A)).j;
    const filaD = lista.find((x) => x.paciente.includes('Dan'));
    P('el panel lista los cobros (los de revisar primero)', Array.isArray(lista) && lista[0].estado === 'revisar' && filaD && filaD.estado === 'creado', lista.slice(0, 2));
    const rq = await req('POST', `/cobro-online/${filaD.id}/reconsultar`, undefined, A);
    P('volver a consultar registra el pago que no avisó', rq.s === 200 && rq.j.estado === 'pagado' && (await q1('SELECT estado FROM cuotas WHERE id=$1', [cuD])).estado === 'pagada', rq);
    P('volver a consultar un cobro ajeno: 404', (await req('POST', '/cobro-online/999999/reconsultar', undefined, A)).s === 404);

    // 7) Cancelado en la pasarela
    const eli = await pac('Eli'); const cuE = await cuota(eli); const tE = await enlace(eli);
    const hE = hashDe((await req('POST', `/web/publico/pago/${tE}/online`, { cuotaId: cuE })).j.url);
    pedidos[hE].cancelado = true; await aviso(hE);
    P('cancelado en la pasarela: queda cancelado', (await q1('SELECT estado FROM cobros_online WHERE hash_proveedor=$1', [hE])).estado === 'cancelado');
    const h2 = hashDe((await req('POST', `/web/publico/pago/${tE}/online`, { cuotaId: cuE })).j.url);
    P('después se puede intentar de nuevo con un cobro nuevo', h2 !== hE);

    // 8) Según el plan
    await db.query("UPDATE clinicas SET modulos_quitar='{cobro_online}' WHERE id=1");
    P('si el plan no lo incluye, no se ofrece', (await req('GET', `/web/publico/pago/${t1}`)).j.pagoOnline === false && (await req('POST', `/web/publico/pago/${tE}/online`, { cuotaId: cuE })).s === 409);
    await new Promise((r) => setTimeout(r, 16000)); // el estado de la sesión se guarda 15 s
    P('ni se abre el panel', (await req('GET', '/cobro-online', undefined, A)).s === 403);
    await db.query("UPDATE clinicas SET modulos_quitar='{}' WHERE id=1");

    // 9) Pasarela caída
    await new Promise((r) => mock.close(r));
    const fer = await pac('Fer'); const cuF = await cuota(fer); const tF = await enlace(fer);
    const caida = await req('POST', `/web/publico/pago/${tF}/online`, { cuotaId: cuF });
    P('pasarela caída: error claro y no queda un cobro abierto', caida.s === 502 && !(await q1("SELECT 1 FROM cobros_online WHERE cuota_id=$1 AND estado='creado'", [cuF])), caida);
  } catch (e) { P('error inesperado', false, e.stack || e.message); }
  finally {
    await db.query("UPDATE clinicas SET cobro_online_activo=false, modulos_quitar='{}' WHERE id=1");
    await db.end(); mock.close();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
