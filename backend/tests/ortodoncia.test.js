// Ortodoncia: tablero de la clínica y cuotas mensuales del tratamiento.
const crypto = require('crypto');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const hoy = new Date().toISOString().slice(0, 10);

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}' WHERE id=1");
  const suf = String(Date.now() % 1000000);
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const R = (await req('POST', '/auth/login', { username: 'recep1', password: 'clave123' })).j.accessToken;
  const AB = (await req('POST', '/auth/login', { username: 'adminb', password: 'Clave1234!', clinicaSlug: 'clinica-b' })).j.accessToken;
  const pac = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Orto',$1,$2) RETURNING id", [`Caso${suf}`, `OR${suf}`])).id;
  try {
    P('el panel lo abre quien tiene el permiso (admin y recepción)', (await req('GET', '/ortodoncia/panel', undefined, A)).s === 200 && (await req('GET', '/ortodoncia/panel', undefined, R)).s === 200);
    const caso = await req('POST', '/especialidades/orto-casos', { pacienteId: pac, fase: 'activa', tipoAparatologia: 'brackets_metalicos', fechaInstalacion: hoy, honorarioTotal: 3000000, entregaInicial: 600000, cuotaMensual: 200000 }, A);
    P('se crea el caso (activa)', caso.s === 201, caso);
    const id = caso.j.id;
    let panel = (await req('GET', '/ortodoncia/panel', undefined, A)).j;
    let fila = panel.casos.find((c) => c.id === id);
    P('el tablero lo muestra, sin cuotas generadas todavía', fila && fila.fase === 'activa' && fila.sinPlanDeCuotas === true && fila.tienePlan === false, fila);
    P('el control mensual quedó programado', fila && /^\d{4}-\d{2}-\d{2}$/.test(fila.proximoControl || ''), fila);
    P('el resumen cuenta el caso y avisa que falta generar cuotas', panel.resumen.activos >= 1 && panel.resumen.sinPlanDeCuotas >= 1, panel.resumen);

    // Cuotas
    P('cantidad inválida (0): 400', (await req('POST', `/ortodoncia/casos/${id}/cuotas`, { cantidad: 0 }, A)).s === 400);
    P('cantidad inválida (61): 400', (await req('POST', `/ortodoncia/casos/${id}/cuotas`, { cantidad: 61 }, A)).s === 400);
    P('fecha inválida: 400', (await req('POST', `/ortodoncia/casos/${id}/cuotas`, { cantidad: 3, primerVencimiento: 'mañana' }, A)).s === 400);
    P('caso de otra clínica: 404 (ver y generar)', (await req('GET', `/ortodoncia/casos/${id}/cuotas`, undefined, AB)).s === 404 && (await req('POST', `/ortodoncia/casos/${id}/cuotas`, { cantidad: 3 }, AB)).s === 404);
    const sinHon = (await req('POST', '/especialidades/orto-casos', { pacienteId: pac, fase: 'diagnostico', tipoAparatologia: 'alineadores' }, A)).j.id;
    P('sin honorario no se generan cuotas: 409', (await req('POST', `/ortodoncia/casos/${sinHon}/cuotas`, { cantidad: 3 }, A)).s === 409);
    const g = await req('POST', `/ortodoncia/casos/${id}/cuotas`, {}, A);
    P('sin cantidad usa honorario ÷ cuota mensual (2.400.000 ÷ 200.000 = 12)', g.s === 200 && g.j.cuotas.length === 12, g);
    P('las cuotas suman exacto el saldo (honorario − entrega)', g.j.cuotas.reduce((s, c) => s + c.monto, 0) === 2400000, g.j.cuotas.map((c) => c.monto));
    P('vencen una por mes', g.j.cuotas[0].numero === 1 && g.j.cuotas[0].vencimiento > hoy && g.j.cuotas[11].vencimiento > g.j.cuotas[0].vencimiento);
    P('una segunda vez: 409', (await req('POST', `/ortodoncia/casos/${id}/cuotas`, { cantidad: 6 }, A)).s === 409);
    const ver = (await req('GET', `/ortodoncia/casos/${id}/cuotas`, undefined, R)).j;
    P('se ven las cuotas', ver.tienePlan && ver.cuotas.length === 12);
    const plan = await q1('SELECT plan_pago_id FROM orto_casos WHERE id=$1', [id]);
    const pp = await q1('SELECT total, entrega, cantidad_cuotas, estado FROM planes_pago WHERE id=$1', [plan.plan_pago_id]);
    P('es un plan de pago normal del paciente', Number(pp.total) === 3000000 && Number(pp.entrega) === 600000 && pp.cantidad_cuotas === 12 && pp.estado === 'activo', pp);

    // Mi pago las ve
    const tok = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO cobranza_enlaces (clinica_id, paciente_id, token_hash, expira_en) VALUES (1,$1,$2, now() + interval '1 day')", [pac, crypto.createHash('sha256').update(tok).digest('hex')]);
    const mp = await req('GET', `/web/publico/pago/${tok}`);
    P('Mi pago del paciente muestra las 12 cuotas', mp.s === 200 && mp.j.cuotas.length === 12, mp.j && mp.j.cuotas && mp.j.cuotas.length);

    // Atrasos
    await db.query("UPDATE cuotas SET vencimiento = CURRENT_DATE - 10 WHERE plan_pago_id=$1 AND numero=1", [plan.plan_pago_id]);
    await db.query("UPDATE paciente_recalls SET proxima_fecha = CURRENT_DATE - 5 WHERE paciente_id=$1 AND recall_tipo_id=(SELECT id FROM recall_tipos WHERE clinica_id=1 AND codigo='control_ortodoncia')", [pac]);
    panel = (await req('GET', '/ortodoncia/panel', undefined, A)).j; fila = panel.casos.find((c) => c.id === id);
    P('cuota vencida: aparece con su monto', fila.cuotasVencidas === 1 && fila.montoVencido === 200000 && panel.resumen.conCuotasVencidas >= 1, fila);
    P('control atrasado: dice cuántos días', fila.controlAtrasado === 5 && panel.resumen.controlesAtrasados >= 1, fila);
    await db.query("UPDATE cuotas SET estado='pagada', pagado_en=now() WHERE plan_pago_id=$1 AND numero=1", [plan.plan_pago_id]);
    fila = (await req('GET', '/ortodoncia/panel', undefined, A)).j.casos.find((c) => c.id === id);
    P('al pagarla deja de figurar como vencida', fila.cuotasVencidas === 0 && fila.cuotasPagadas === 1, fila);
    P('el panel no mezcla clínicas', !(await req('GET', '/ortodoncia/panel', undefined, AB)).j.casos.some((c) => c.id === id));

    // Plan
    await db.query("UPDATE clinicas SET modulos_quitar='{ortodoncia}' WHERE id=1");
    await new Promise((r) => setTimeout(r, 16000)); // el estado de la sesión se guarda 15 s
    P('si el plan no incluye ortodoncia: panel, casos y visitas se cierran', (await req('GET', '/ortodoncia/panel', undefined, A)).s === 403 && (await req('GET', '/especialidades/orto-casos', undefined, A)).s === 403 && (await req('GET', '/especialidades/orto-visitas', undefined, A)).s === 403);
    await db.query("UPDATE clinicas SET modulos_quitar='{}' WHERE id=1");
  } catch (e) { P('error inesperado', false, e.stack || e.message); }
  finally { await db.query("UPDATE clinicas SET modulos_quitar='{}' WHERE id=1"); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
