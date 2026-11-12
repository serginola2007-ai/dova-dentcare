// Avisos de cobro y "Mi pago" para atenciones sin pagar (0063 + 0064). Requiere DATABASE_URL y DOVA_URL.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin'");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const suf = String(Date.now() % 1000000); const pacs = [];
  try {
    const nuevoPac = async (n, tel = `0981${suf.padStart(6, '0')}`) => { const id = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono, acepta_whatsapp) VALUES (1,$1,'Aviso',$2,$3,true) RETURNING id", [n, `8${suf}${pacs.length}`, tel])).id; pacs.push(id); return id; };
    const atencion = async (pac, dias, monto = 150000) => (await q1(`INSERT INTO ajustes_cuenta (clinica_id, paciente_id, tipo, monto, motivo, fecha)
        VALUES (1,$1,'atencion',$2,'Atención del 01/11: Limpieza dental', current_date - $3::int) RETURNING id`, [pac, monto, dias])).id;
    const lista = async () => (await req('GET', '/cobranza/pendientes', undefined, A)).j;
    const fila = (l, pac) => (l.atenciones || []).find((x) => x.pacienteId === pac);

    const p1 = await nuevoPac('Vieja');
    const a1 = await atencion(p1, 10);
    let l = await lista();
    let f = fila(l, p1);
    P('Atención de hace 10 días: aparece y toca avisar', f && f.id === a1 && f.monto === 150000 && f.toca === true && f.etapa === 1, f);
    P('Cuenta en "para avisar hoy"', l.tocanHoy >= 1);

    const p2 = await nuevoPac('Reciente', `0982${suf.padStart(6, '0')}`);
    await atencion(p2, 0);
    f = fila(await lista(), p2);
    P('Atención de hoy: aparece pero todavía no toca', f && f.toca === false && /Se avisa en/.test(f.motivo), f);
    P('Solo hoy: la reciente no está', !fila((await req('GET', '/cobranza/pendientes?soloHoy=1', undefined, A)).j, p2));

    // Aviso a mano por WhatsApp
    let r = await req('POST', `/cobranza/atencion/${a1}/enlace`, {}, A);
    const texto = r.s === 200 ? decodeURIComponent(r.j.url.split('?text=')[1]) : '';
    P('Mandar por mi WhatsApp: mensaje armado con el monto y el enlace', r.s === 200 && /Gs\. 150\.000/.test(texto) && /mi-pago\.html#t=/.test(texto), r);
    P('Queda registrado el aviso (tipo atención)', (await q1("SELECT count(*)::int n FROM cobranza_envios WHERE tipo='atencion' AND referencia_id=$1", [a1])).n === 1);
    r = await req('POST', `/cobranza/atencion/${a1}/enlace`, {}, A);
    P('Dos avisos el mismo día → 409', r.s === 409, r);

    // Mi pago con el enlace
    const token = (texto.match(/#t=([\w-]+)/) || [])[1];
    r = await req('GET', `/web/publico/pago/${token}`);
    P('Mi pago muestra la atención pendiente', r.s === 200 && r.j.atenciones && r.j.atenciones.pendiente === 150000 && r.j.atenciones.lista.length === 1, r.j);

    // Pago a cuenta: deja de figurar
    await db.query("INSERT INTO pagos (clinica_id, paciente_id, monto, metodo, estado, fecha) VALUES (1,$1,150000,'efectivo','pagado', now())", [p1]);
    P('Pagada: ya no figura en los avisos', !fila(await lista(), p1));
    r = await req('GET', `/web/publico/pago/${token}`);
    P('Pagada: Mi pago sin atenciones', r.s === 200 && r.j.atenciones === null, r.j);
    r = await req('POST', `/cobranza/atencion/${a1}/enlace`, {}, A);
    P('Pagada: avisar → 404', r.s === 404, r);

    // Una atención nueva reinicia el ciclo
    const a3 = await atencion(p1, 9, 200000);
    f = fila(await lista(), p1);
    P('Atención nueva: ciclo nuevo (etapa 1, sin avisos)', f && f.id === a3 && f.etapa === 1 && f.avisos.length === 0 && f.monto === 200000, f);
    r = await req('POST', `/cobranza/atencion/${a1}/enlace`, {}, A);
    P('La atención vieja ya no se puede avisar', r.s === 404, r);

    // Validaciones
    P('Tipo inválido → 400', (await req('POST', '/cobranza/otra/1/enlace', {}, A)).s === 400);
    const otraClin = await q1("SELECT a.id FROM ajustes_cuenta a WHERE a.clinica_id<>1 LIMIT 1");
    if (otraClin) P('Atención de otra clínica → 404', (await req('POST', `/cobranza/atencion/${otraClin.id}/enlace`, {}, A)).s === 404);
    P('Id con basura → 400', (await req('POST', '/cobranza/atencion/abc/enlace', {}, A)).s === 400);
    const sinTel = await nuevoPac('SinTel', '12');
    const a4 = await atencion(sinTel, 10);
    r = await req('POST', `/cobranza/atencion/${a4}/enlace`, {}, A);
    P('Sin celular válido → 409 con el motivo', r.s === 409 && /celular/.test(r.j.error.message), r);
    const cfg = (await req('GET', '/cobranza/config', undefined, A)).j;
    P('La configuración muestra el ejemplo del mensaje', /pendiente el pago de tu atención/.test(cfg.ejemplos.atencion || ''), cfg.ejemplos);
  } finally {
    const cn = await db.connect();
    try {
      await cn.query('BEGIN'); await cn.query("SET LOCAL dova.borrando_paciente='on'");
      await cn.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]);
      await cn.query('COMMIT');
    } catch (e) { await cn.query('ROLLBACK'); console.log('limpieza:', e.message); } finally { cn.release(); }
    await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
