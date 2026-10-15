// Planes por clínica y panel del dueño de la plataforma.
// Requiere DATABASE_URL (dova_sim) y DOVA_URL.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 500)); };
const req = async (m, url, body, tok) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const login = async (u, p, slug) => { await db.query('DELETE FROM login_intentos'); return req('POST', '/auth/login', { username: u, password: p, ...(slug ? { clinicaSlug: slug } : {}) }); };
const SLUG = `prueba-plan-${Date.now() % 100000000}`;

(async () => {
  await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1') AND clinica_id=1");
  await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}', activa=true, suspendida_motivo=NULL, mensualidad=0 WHERE id=1");
  try {
    const A = (await login('admin', 'admin')).j.accessToken;
    const R = (await login('recep1', 'clave123')).j.accessToken;
    // 1) Solo el proveedor entra al panel
    P('el proveedor ve las clínicas', (await req('GET', '/plataforma/clinicas', undefined, A)).s === 200);
    P('recepción no entra al panel', (await req('GET', '/plataforma/clinicas', undefined, R)).s === 403);
    P('sin sesión no entra', (await req('GET', '/plataforma/clinicas')).s === 401);
    const cat = (await req('GET', '/plataforma/catalogo', undefined, A)).j;
    P('catálogo con 4 planes', cat && cat.planes.length === 4 && cat.modulos.length >= 10, cat);
    // 2) Alta de clínica
    P('alta con código inválido', (await req('POST', '/plataforma/clinicas', { nombre: 'X', slug: 'Mal Codigo' }, A)).s === 400);
    P('alta con plan inválido', (await req('POST', '/plataforma/clinicas', { nombre: 'X', slug: SLUG, plan: 'oro' }, A)).s === 400);
    const alta = await req('POST', '/plataforma/clinicas', { nombre: 'Clínica de Prueba', slug: SLUG, plan: 'esencial', mensualidad: 300000 }, A);
    P('alta de clínica', alta.s === 200 && alta.j.claveTemporal, alta);
    P('código repetido', (await req('POST', '/plataforma/clinicas', { nombre: 'Otra', slug: SLUG }, A)).s === 409);
    const id = alta.j.id;
    const L = await login('admin', alta.j.claveTemporal, SLUG);
    P('la clínica nueva entra con su código', L.s === 200 && L.j.accessToken, L);
    await db.query("UPDATE usuarios SET debe_cambiar_clave=false WHERE clinica_id=$1", [id]);
    const T = L.j.accessToken;
    P('el admin de otra clínica no entra al panel', (await req('GET', '/plataforma/clinicas', undefined, T)).s === 403);
    P('la clave de una clínica no abre otra', (await login('admin', alta.j.claveTemporal)).s === 401);
    const plan = (await req('GET', '/clinica/plan', undefined, T)).j;
    const mod = (k) => plan.modulos.find((m) => m.clave === k);
    P('Esencial: sin facturación ni ortodoncia', plan.plan === 'esencial' && !mod('facturacion').incluido && !mod('ortodoncia').incluido, plan);
    P('Esencial: la API de facturación se cierra', (await req('GET', '/facturacion/config', undefined, T)).s === 403);
    // 3) Cambio de plan y módulos extra
    P('plan inválido al editar', (await req('PUT', `/plataforma/clinicas/${id}`, { plan: 'oro' }, A)).s === 400);
    P('módulo desconocido', (await req('PUT', `/plataforma/clinicas/${id}`, { modulosExtra: ['nada'] }, A)).s === 400);
    P('sin cambios', (await req('PUT', `/plataforma/clinicas/${id}`, {}, A)).s === 400);
    await req('PUT', `/plataforma/clinicas/${id}`, { modulosExtra: ['facturacion'] }, A);
    P('módulo extra abre facturación', (await req('GET', '/facturacion/config', undefined, T)).s !== 403);
    await req('PUT', `/plataforma/clinicas/${id}`, { plan: 'base', modulosExtra: [], modulosQuitar: ['facturacion'] }, A);
    P('módulo quitado cierra facturación aun en Base', (await req('GET', '/facturacion/config', undefined, T)).s === 403);
    await req('PUT', `/plataforma/clinicas/${id}`, { plan: 'base', modulosQuitar: [] }, A);
    P('Base incluye facturación', (await req('GET', '/facturacion/config', undefined, T)).s !== 403);
    // 4) Suspensión (el límite de ingresos por minuto obliga a esperar)
    await new Promise((r) => setTimeout(r, 62000));
    P('no puede suspender su propia clínica', (await req('POST', '/plataforma/clinicas/1/suspender', {}, A)).s === 400);
    P('clínica inexistente', (await req('POST', '/plataforma/clinicas/999999/suspender', {}, A)).s === 404);
    P('suspender', (await req('POST', `/plataforma/clinicas/${id}/suspender`, { motivo: 'Falta de pago' }, A)).s === 200);
    const susp = await req('GET', '/clinica/plan', undefined, T);
    P('la sesión abierta se corta', susp.s === 403 && susp.j && susp.j.error.details.codigo === 'CLINICA_SUSPENDIDA', susp);
    const l2 = await login('admin', alta.j.claveTemporal, SLUG);
    P('no puede ingresar suspendida', l2.s === 403 && l2.j.error.details.codigo === 'CLINICA_SUSPENDIDA', l2);
    const l3 = await login('admin', 'claveincorrecta', SLUG);
    P('con clave mala no revela la suspensión', l3.s === 401, l3);
    P('reactivar', (await req('POST', `/plataforma/clinicas/${id}/reactivar`, undefined, A)).s === 200);
    P('vuelve a entrar', (await login('admin', alta.j.claveTemporal, SLUG)).s === 200);
    // 5) Pagos
    P('pago con período inválido', (await req('POST', `/plataforma/clinicas/${id}/pagos`, { periodo: '2026-13', monto: 1 }, A)).s === 400);
    P('pago con monto inválido', (await req('POST', `/plataforma/clinicas/${id}/pagos`, { periodo: '2026-10', monto: -5 }, A)).s === 400);
    const pg = await req('POST', `/plataforma/clinicas/${id}/pagos`, { periodo: '2026-10', monto: 300000, nota: 'Transferencia' }, A);
    P('registrar pago', pg.s === 200, pg);
    P('mes repetido', (await req('POST', `/plataforma/clinicas/${id}/pagos`, { periodo: '2026-10', monto: 300000 }, A)).s === 409);
    const lp = (await req('GET', `/plataforma/clinicas/${id}/pagos`, undefined, A)).j;
    P('lista de pagos', Array.isArray(lp) && lp[0].periodo === '2026-10' && lp[0].monto === 300000, lp);
    const fila = (await req('GET', '/plataforma/clinicas', undefined, A)).j.find((c) => c.id === id);
    P('el panel muestra el último mes pagado', fila && fila.ultimoPeriodoPagado === '2026-10' && fila.mesesAtraso >= 0, fila);
    P('borrar pago de otra clínica', (await req('DELETE', `/plataforma/clinicas/1/pagos/${pg.j.id}`, undefined, A)).s === 404);
    P('borrar pago', (await req('DELETE', `/plataforma/clinicas/${id}/pagos/${pg.j.id}`, undefined, A)).s === 200);
    // 6) La clínica principal (premium) no pierde nada
    const mio = (await req('GET', '/clinica/plan', undefined, A)).j;
    P('la clínica principal sigue en Premium', mio.plan === 'premium' && mio.modulos.every((m) => m.incluido), mio);
    const aud = await db.query("SELECT count(*)::int n FROM auditoria WHERE modulo='plataforma'");
    P('queda auditado', aud.rows[0].n >= 5, aud.rows);
  } catch (e) { P('error inesperado', false, e.stack || e.message); }
  finally {
    await db.query("UPDATE clinicas SET activa=false, suspendida_motivo='prueba' WHERE slug=$1", [SLUG]);
    await db.query("UPDATE clinicas SET plan='premium', modulos_extra='{}', modulos_quitar='{}', activa=true WHERE id=1");
    await db.end();
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})();
