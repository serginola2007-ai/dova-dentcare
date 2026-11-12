// Cargo automático al atender (migración 0063). Requiere DATABASE_URL y DOVA_URL.
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
  const suf = String(Date.now() % 1000000);
  const pacs = []; const trats = [];
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const cerrarAntes = (await q1('SELECT fecha_bloqueo_contable AS f, cargo_al_atender AS c FROM clinicas WHERE id=1'));
  try {
    await db.query('UPDATE clinicas SET cargo_al_atender=true, fecha_bloqueo_contable=NULL WHERE id=1');
    const odo = (await q1('SELECT id FROM odontologos WHERE clinica_id=1 AND activo ORDER BY id LIMIT 1')).id;
    const tr = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio, categoria) VALUES (1,$1,150000,'General') RETURNING id", [`Consulta prueba ${suf}`])).id; trats.push(tr);
    const trOrto = (await q1("INSERT INTO tratamientos (clinica_id, nombre, precio, categoria) VALUES (1,$1,120000,'Ortodoncia') RETURNING id", [`Control orto ${suf}`])).id; trats.push(trOrto);
    const nuevoPac = async (n) => { const id = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,$1,'Cargo',$2) RETURNING id", [n, `9${suf}${pacs.length}`])).id; pacs.push(id); return id; };
    let hora = 6;
    const turno = async (pac, trat, fecha = hoy) => (await q1('INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, tratamiento_id) VALUES (1,$1,$2,$3,$4,$5) RETURNING id', [pac, odo, fecha, `${String(hora++).padStart(2, '0')}:00`, trat])).id;
    const atender = (id) => req('PATCH', `/agenda/${id}/estado`, { estado: 'atendido' }, A);
    const cargos = async (pac) => (await db.query("SELECT * FROM ajustes_cuenta WHERE paciente_id=$1 AND tipo='atencion'", [pac])).rows;

    // 1. Caso común
    const p1 = await nuevoPac('Uno');
    const t1 = await turno(p1, tr);
    let r = await atender(t1);
    P('Atendido responde con el cargo', r.s === 200 && r.j.cargoAtencion && r.j.cargoAtencion.monto === 150000, r);
    let c = await cargos(p1);
    P('Queda un cargo "atención" atado al turno', c.length === 1 && c[0].turno_id === t1 && Number(c[0].monto) === 150000 && c[0].odontologo_id === odo, c);
    let cc = await req('GET', `/finanzas/cuenta-corriente/${p1}`, undefined, A);
    P('Cuenta corriente: aparece al debe y el paciente debe 150.000', cc.s === 200 && cc.j.saldo === 150000 && cc.j.movimientos.some((m) => m.subtipo === 'atencion' && m.debe === 150000 && /Atención del/.test(m.concepto)), cc.j);
    r = await req('GET', `/pagos/resumen/${p1}`, undefined, A);
    if (r.s === 200) P('Resumen de pagos de la ficha: pendiente 150.000', Number(r.j.pendiente ?? r.j.saldo) === 150000, r.j);

    // 2. No se duplica
    await db.query("UPDATE turnos SET estado='confirmado' WHERE id=$1", [t1]);
    await atender(t1);
    P('Volver a marcar atendido no carga dos veces', (await cargos(p1)).length === 1);

    // 3. Pago y saldo
    await db.query("INSERT INTO pagos (clinica_id, paciente_id, monto, metodo, estado, fecha) VALUES (1,$1,150000,'efectivo','pagado', now())", [p1]);
    cc = await req('GET', `/finanzas/cuenta-corriente/${p1}`, undefined, A);
    P('Con el pago queda en 0', cc.j.saldo === 0, cc.j.saldo);

    // 4. En plan de tratamiento: no se carga
    const p2 = await nuevoPac('Plan');
    await db.query("INSERT INTO planes_tratamiento (clinica_id, paciente_id, nombre, tratamiento_id, precio, estado) VALUES (1,$1,'Plan prueba',$2,500000,'en_proceso')", [p2, tr]);
    r = await atender(await turno(p2, tr));
    P('Trabajo dentro de un plan en curso: no se carga', r.s === 200 && !r.j.cargoAtencion && (await cargos(p2)).length === 0, r.j);

    // 5. En presupuesto aceptado: no se carga
    const p3 = await nuevoPac('Presu');
    const pr = (await q1("INSERT INTO presupuestos (clinica_id, paciente_id, total, estado) VALUES (1,$1,150000,'aceptado') RETURNING id", [p3])).id;
    await db.query("INSERT INTO presupuesto_items (presupuesto_id, tratamiento_id, descripcion, cantidad, precio_unitario) VALUES ($1,$2,'x',1,150000)", [pr, tr]);
    r = await atender(await turno(p3, tr));
    P('Trabajo de un presupuesto aceptado: no se carga', !r.j.cargoAtencion && (await cargos(p3)).length === 0, r.j);

    // 6. Ortodoncia con caso abierto
    const p4 = await nuevoPac('Orto');
    await db.query('INSERT INTO orto_casos (clinica_id, paciente_id, odontologo_id) VALUES (1,$1,$2)', [p4, odo]);
    r = await atender(await turno(p4, trOrto));
    P('Control de ortodoncia con caso abierto: no se carga', !r.j.cargoAtencion && (await cargos(p4)).length === 0, r.j);

    // 7. Sin tratamiento
    const p5 = await nuevoPac('Sin');
    r = await atender(await turno(p5, null));
    P('Turno sin tratamiento: no se carga', r.s === 200 && !r.j.cargoAtencion && (await cargos(p5)).length === 0, r.j);

    // 8. Apagado por la clínica
    r = await req('PUT', '/finanzas/cargo-atencion', { activo: false }, A);
    P('Se puede apagar', r.s === 200 && r.j.activo === false, r);
    P('Valor raro → 400', (await req('PUT', '/finanzas/cargo-atencion', { activo: 'no' }, A)).s === 400);
    const p6 = await nuevoPac('Apagado');
    r = await atender(await turno(p6, tr));
    P('Apagado: no se carga', !r.j.cargoAtencion && (await cargos(p6)).length === 0, r.j);
    await req('PUT', '/finanzas/cargo-atencion', { activo: true }, A);
    P('Estado del interruptor', (await req('GET', '/finanzas/cargo-atencion', undefined, A)).j.activo === true);

    // 9. Período contable cerrado
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    await db.query('UPDATE clinicas SET fecha_bloqueo_contable=$1 WHERE id=1', [ayer]);
    const p7 = await nuevoPac('Cerrado');
    r = await atender(await turno(p7, tr, ayer));
    P('Turno de un período cerrado: no se carga y el turno igual queda atendido', r.s === 200 && r.j.estado === 'atendido' && !r.j.cargoAtencion && (await cargos(p7)).length === 0, r.j);
    await db.query('UPDATE clinicas SET fecha_bloqueo_contable=NULL WHERE id=1');

    // 10. Finalizar desde el flujo de la sala también carga
    const p8 = await nuevoPac('Flujo');
    const t8 = await turno(p8, tr);
    r = await req('POST', `/operaciones/flujo/${t8}/finalizado`, {}, A);
    P('Finalizar la atención en el flujo también carga', r.s === 200 && (await cargos(p8)).length === 1, r);

    // 11. Anular y tipos
    const c8 = (await cargos(p8))[0];
    r = await req('PUT', `/finanzas/ajustes/${c8.id}`, { anulado: true }, A);
    cc = await req('GET', `/finanzas/cuenta-corriente/${p8}`, undefined, A);
    P('Anular el cargo: el saldo vuelve a 0', r.s === 200 && cc.j.saldo === 0, { r, saldo: cc.j.saldo });
    await db.query("UPDATE turnos SET estado='confirmado' WHERE id=$1", [t8]); await atender(t8);
    P('Anulado: no se vuelve a generar', (await cargos(p8)).length === 1);
    r = await req('POST', '/finanzas/ajustes', { pacienteId: p8, tipo: 'atencion', monto: 1000, motivo: 'a mano' }, A);
    P('Un "atención" no se puede cargar a mano', r.s === 400, r);

    // 12. Producción, comisiones y serie
    r = await req('GET', `/finanzas/comisiones?desde=${hoy}&hasta=${hoy}&odontologoId=${odo}`, undefined, A);
    const det = r.s === 200 ? (r.j.odontologos[0] || { detalle: [] }).detalle : [];
    P('Comisiones/producción incluyen la atención', det.some((d) => d.atencionId === c[0].id && d.valor === 150000), r.s);
    r = await req('GET', '/kpis/serie-mensual?meses=3', undefined, A);
    P('Serie mensual: producción del mes incluye atenciones', r.s === 200 && r.j[r.j.length - 1].produccion >= 150000, r.j && r.j[r.j.length - 1]);
    r = await req('GET', `/finanzas/rentabilidad?desde=${hoy}&hasta=${hoy}&odontologoId=${odo}`, undefined, A);
    P('Rentabilidad no se rompe con atenciones', r.s === 200 && r.j.porTratamiento.some((t) => t.tratamientoId === tr), r.j);

  } finally {
    await db.query('UPDATE clinicas SET fecha_bloqueo_contable=$1, cargo_al_atender=$2 WHERE id=1', [cerrarAntes.f, cerrarAntes.c]);
    const cn = await db.connect();
    try {
      await cn.query('BEGIN'); await cn.query("SET LOCAL dova.borrando_paciente='on'");
      await cn.query('DELETE FROM pacientes WHERE id = ANY($1::int[])', [pacs]);
      await cn.query('DELETE FROM tratamientos WHERE id = ANY($1::int[])', [trats]);
      await cn.query('COMMIT');
    } catch (e) { await cn.query('ROLLBACK'); console.log('limpieza:', e.message); } finally { cn.release(); }
    await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
