const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || (process.env.DOVA_URL || 'http://localhost:4500')) + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const req = async (m, url, body, { tok, form, raw } = {}) => {
  const h = {}; if (tok) h.authorization = `Bearer ${tok}`; if (body && !form) h['content-type'] = 'application/json';
  const r = await fetch(B + url, { method: m, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  if (raw) return r; return { s: r.status, j: await r.json().catch(() => null) };
};
const login = async (u, p) => (await req('POST', '/auth/login', { username: u, password: p })).j.accessToken;
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','odo1','recep1','asis1')");
  const toks = { admin: await login('admin', 'admin'), recep1: await login('recep1', 'clave123'), odo1: await login('odo1', 'clave123'), asis1: await login('asis1', 'clave123') };
  const perms = {};
  for (const u of Object.keys(toks)) perms[u] = (await db.query("SELECT p.codigo FROM usuarios u JOIN rol_permisos rp ON rp.rol_id=u.rol_id JOIN permisos p ON p.id=rp.permiso_id WHERE u.username=$1", [u])).rows.map((r) => r.codigo);
  const pid = (await q1('SELECT id FROM pacientes WHERE activo ORDER BY id LIMIT 1')).id;
  const hc = (await q1('SELECT id FROM historia_clinica ORDER BY id LIMIT 1')).id;
  const pago = (await q1("SELECT id FROM pagos ORDER BY id DESC LIMIT 1")).id;
  const ins = (await q1('SELECT id FROM insumos ORDER BY id LIMIT 1')).id;
  // [método, ruta, permisos que alcanzan (cualquiera), cuerpo]
  const MATRIZ = [
    ['GET', '/reportes/centro/cobros', ['reportes.view']],
    ['GET', '/kpis/auditoria', ['auditoria.view']],
    ['GET', `/comprobantes/historia-clinica/${pid}`, ['historia_clinica.view', 'pacientes.clinical.view']],
    ['GET', `/comprobantes/consulta/${hc}`, ['historia_clinica.view', 'pacientes.clinical.view']],
    ['GET', `/comprobantes/estado-cuenta/${pid}`, ['pagos.view', 'cuenta_corriente.view']],
    ['GET', `/historia-clinica/paciente/${pid}`, null],
    ['GET', '/seguimiento/bandeja', ['seguimiento.view', 'seguimiento.manage', 'recalls.view']],
    ['GET', '/inventario/vencimientos', ['inventario.view']],
    ['PUT', `/inventario/insumos/${ins}`, ['inventario.manage'], { nombre: 'Prueba de permisos' }],
    ['POST', `/pagos/${pago}/anular`, ['pagos.anular'], { motivo: '' }],
    ['GET', '/usuarios', ['usuarios.manage']],
    ['GET', '/caja/estado', ['caja.view', 'caja.manage']],
  ];
  for (const [m, ruta, req1, body] of MATRIZ) {
    for (const u of Object.keys(toks)) {
      const r = await req(m, ruta, body, { tok: toks[u] });
      if (!req1) { P(`${u} ${m} ${ruta} responde sin 500`, r.s < 500, r.s); continue; }
      const debe = req1.some((p) => perms[u].includes(p));
      // Con permiso: cualquier cosa menos 401/403 (400 por motivo vacío vale). Sin permiso: 403.
      P(`${u} ${m} ${ruta} → ${debe ? 'permitido' : '403'}`, debe ? ![401, 403].includes(r.s) && r.s < 500 : r.s === 403, r.s);
    }
  }
  // Sin sesión y con token adulterado
  for (const ruta of ['/pacientes', '/reportes/centro', '/seguimiento/bandeja', `/comprobantes/estado-cuenta/${pid}`, '/kpis/auditoria']) {
    let r = await req('GET', ruta, null, {});
    P(`Sin token ${ruta}: 401`, r.s === 401, r.s);
    const partes = toks.asis1.split('.'); const pl = JSON.parse(Buffer.from(partes[1], 'base64url').toString()); pl.permisos = ['usuarios.manage', 'auditoria.view', 'reportes.view'];
    const falso = [partes[0], Buffer.from(JSON.stringify(pl)).toString('base64url'), partes[2]].join('.');
    r = await req('GET', ruta, null, { tok: falso });
    P(`Token adulterado ${ruta}: 401`, r.s === 401, r.s);
  }
  // Inyección en parámetros: nunca 500
  for (const ruta of ["/busqueda?q=' OR 1=1 --", "/reportes/centro/cobros?odontologoId=1;DROP TABLE pagos", "/kpis/auditoria?q=%27%3B--&usuarioId=abc", "/seguimiento/bandeja?tipo=x'--&meses=-5", "/reportes/centro/cobros?desde=2026-13-45"]) {
    const r = await req('GET', ruta, null, { tok: toks.admin });
    P(`Parámetros maliciosos sin error 500: ${ruta}`, r.s < 500, r);
  }
  P('La tabla pagos sigue existiendo', !!(await q1('SELECT count(*) FROM pagos')));
  // Accesos denegados quedan auditados
  const den = await q1("SELECT count(*)::int n FROM auditoria WHERE accion='acceso_denegado' AND creado_en > now() - interval '5 minutes'");
  P('Los accesos denegados quedan en la auditoría', den.n > 0, den);
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); await db.end(); process.exit(ok === res.length ? 0 : 1);
})().catch(async (e) => { console.error(e); process.exit(1); });
