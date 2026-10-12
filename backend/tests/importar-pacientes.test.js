// Importar pacientes desde Excel/CSV (API): revisión sin guardar, errores por
// fila, duplicados, separación de nombre completo, fechas, CSV de Windows,
// importación en una sola transacción y permisos.
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 400)); };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const login = async (u, c) => (await (await fetch(`${B}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: c }) })).json()).accessToken;
const subir = async (tok, buf, nombre, campos = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  if (buf) fd.append('archivo', new Blob([buf]), nombre);
  const r = await fetch(`${B}/pacientes/importar`, { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: fd });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const xlsx = async (filas) => { const wb = new ExcelJS.Workbook(); const h = wb.addWorksheet('Hoja1'); filas.forEach((f) => h.addRow(f)); return Buffer.from(await wb.xlsx.writeBuffer()); };
const cuenta = async (suf) => Number((await q1('SELECT count(*) n FROM pacientes WHERE clinica_id=1 AND ci LIKE $1', [`9${suf}%`])).n);

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','recep1','sinperm')");
  const A = await login('admin', 'admin'); const R = await login('recep1', 'clave123'); const S = await login('sinperm', 'Clave1234!');
  const suf = String(Date.now() % 100000).padStart(5, '0');
  const ci = (n) => `9${suf}${n}`;
  await db.query("DELETE FROM pacientes WHERE clinica_id=1 AND ci LIKE $1", [`9${suf}%`]);
  // Un paciente que ya existe, con email vacío
  await db.query("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES (1,'Existente','Previo',$1,'0981 000 000')", [ci(1)]);

  // ---- Plantilla y permisos ----
  const pl = await fetch(`${B}/pacientes/importar/plantilla`, { headers: { authorization: `Bearer ${A}` } });
  const plb = Buffer.from(await pl.arrayBuffer());
  P('Planilla modelo: descarga un .xlsx', pl.status === 200 && /spreadsheetml/.test(pl.headers.get('content-type')) && plb.slice(0, 2).toString() === 'PK');
  P('Planilla modelo sin permiso: 403', (await fetch(`${B}/pacientes/importar/plantilla`, { headers: { authorization: `Bearer ${S}` } })).status === 403);
  const buf0 = await xlsx([['Nombre', 'Apellido'], ['A', 'B']]);
  P('Importar sin permiso: 403', (await subir(S, buf0, 'p.xlsx', { modo: 'importar' })).s === 403);
  P('Sin sesión: 401', (await subir(null, buf0, 'p.xlsx')).s === 401);

  // ---- Excel con casos variados ----
  const filas = [
    ['Nombres', 'Apellidos', 'Cédula', 'Celular', 'Correo', 'Fecha de nacimiento', 'Sexo', 'Columna rara', 'Observaciones'],
    ['Ana', 'Pérez', ci(2), '0981 111 222', 'ana@ejemplo.com', new Date(Date.UTC(1990, 2, 15)), 'F', 'x', 'Viene del sistema viejo'],
    ['Beto', 'Gómez', `${ci(3).slice(0, 1)}.${ci(3).slice(1)}`, '0982 333 444', '', '05/07/1985', 'masculino', '', ''],
    ['Caro', '', ci(4), '', '', '', '', '', ''],
    ['Dani', 'Ruiz', ci(5), '', 'no-es-email', '31/02/2000', '', '', ''],
    ['Eli', 'Sosa', ci(2), '', '', '', '', '', ''],
    ['Existente', 'Previo', ci(1), '', 'existente@ejemplo.com', '01/01/1970', 'X', '', 'nota nueva'],
    ['Fede', 'Ayala', ci(6), '', '', 32874, '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Gus', '<img src=x onerror=alert(1)>', ci(7), '', '', '1/2/99', 'M', '', ''],
  ];
  const buf = await xlsx(filas);
  let r = await subir(A, buf, 'pacientes.xlsx', { modo: 'revisar' });
  P('Revisar: reconoce las columnas aunque tengan otros títulos', r.s === 200 && ['nombre', 'apellido', 'ci', 'telefono', 'email', 'fechaNacimiento', 'sexo', 'observaciones'].every((c) => r.j.columnas.some((x) => x.campo === c)) && r.j.ignoradas.includes('Columna rara'), r.j);
  P('…cuenta filas (salteando las vacías), nuevos, existentes y con errores', r.j.total === 8 && r.j.nuevos === 4 && r.j.yaExisten === 1 && r.j.conErrores === 3, { total: r.j.total, nuevos: r.j.nuevos, ya: r.j.yaExisten, err: r.j.conErrores });
  const errFila = (n) => (r.j.errores.find((e) => e.fila === n) || { errores: [] }).errores.join(' | ');
  P('…falta el apellido', /apellido/i.test(errFila(4)), r.j.errores);
  P('…fecha imposible (31/02) y email inválido', /Fecha/.test(errFila(5)) && /Email/.test(errFila(5)), errFila(5));
  P('…C.I. repetida dentro de la planilla', /repetida.*fila 2/.test(errFila(6)), errFila(6));
  P('…la C.I. que ya existe en DOVA se marca', r.j.duplicados.some((d) => d.ci === ci(1) && d.existente.nombre === 'Existente Previo'));
  P('…sexo no reconocido: aviso, no error', r.j.avisos.some((a) => a.fila === 7 && /Sexo/.test(a.avisos[0])));
  const m = (n) => r.j.muestra.find((x) => x.fila === n) || {};
  P('Fechas: de Excel, día/mes/año, número de serie y año de 2 cifras', m(2).fechaNacimiento === '1990-03-15' && m(3).fechaNacimiento === '1985-07-05' && m(8).fechaNacimiento === '1990-01-01' && m(10).fechaNacimiento === '1999-02-01', [m(2), m(3), m(8), m(10)].map((x) => x.fechaNacimiento));
  P('C.I. con puntos se guarda sin puntos; sexo "masculino" → M', m(3).ci === ci(3) && m(3).sexo === 'M', m(3));
  P('Revisar no guarda nada', await cuenta(suf) === 1);

  r = await subir(A, buf, 'pacientes.xlsx', { modo: 'importar' });
  P('Importar: crea los válidos y saltea el existente', r.s === 200 && r.j.creados === 4 && r.j.omitidos === 1 && r.j.completados === 0, r.j);
  P('…quedan en la base', await cuenta(suf) === 5);
  const ana = await q1('SELECT nombre, apellido, telefono, email, fecha_nacimiento::text f, sexo, observaciones FROM pacientes WHERE ci=$1', [ci(2)]);
  P('…con todos sus datos', ana.apellido === 'Pérez' && ana.email === 'ana@ejemplo.com' && ana.f === '1990-03-15' && ana.sexo === 'F' && ana.observaciones === 'Viene del sistema viejo', ana);
  P('…el texto raro se guarda tal cual (la pantalla lo muestra escapado)', (await q1('SELECT apellido FROM pacientes WHERE ci=$1', [ci(7)])).apellido === '<img src=x onerror=alert(1)>');
  P('…el existente no se tocó', (await q1('SELECT email FROM pacientes WHERE ci=$1', [ci(1)])).email === null);
  P('…queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='importar' AND modulo='pacientes' AND creado_en > now() - interval '1 minute'")));
  r = await subir(A, buf, 'pacientes.xlsx', { modo: 'importar' });
  P('Importar dos veces el mismo archivo no duplica', r.j.creados === 0 && await cuenta(suf) === 5, r.j);

  // ---- Completar datos faltantes ----
  P('Recepción (puede crear pacientes) también revisa planillas', (await subir(R, buf, 'pacientes.xlsx', { modo: 'revisar' })).s === 200);
  r = await subir(A, buf, 'pacientes.xlsx', { modo: 'importar', duplicados: 'completar' });
  const ex = await q1('SELECT telefono, email, fecha_nacimiento::text f, observaciones FROM pacientes WHERE ci=$1', [ci(1)]);
  P('Completar: llena solo lo vacío y no pisa lo cargado', r.j.completados === 1 && ex.email === 'existente@ejemplo.com' && ex.f === '1970-01-01' && ex.telefono === '0981 000 000' && ex.observaciones === 'nota nueva', ex);

  r = await subir(A, buf, 'pacientes.xlsx', { modo: 'importar', duplicados: 'completar' });
  P('Completar otra vez: no hay nada que completar', r.j.completados === 0, r.j);

  // ---- CSV de Excel en Windows (punto y coma, acentos en windows-1252, comillas) ----
  const csv = `Nombre completo;C.I.;Teléfono;Dirección\r\n"Benítez Ortiz, José María";${ci(8)};0983 555 666;"Calle ""A"" 123; Luque"\r\nLucía Fernández;${ci(9)};;\r\n`;
  const latin1 = Buffer.from(csv, 'latin1');
  r = await subir(A, latin1, 'export.csv', { modo: 'revisar' });
  const c8 = r.j && r.j.muestra.find((x) => x.ci === ci(8)); const c9 = r.j && r.j.muestra.find((x) => x.ci === ci(9));
  P('CSV de Windows: acentos, punto y coma y comillas', r.s === 200 && c8 && c8.nombre === 'José María' && c8.apellido === 'Benítez Ortiz' && c8.direccion === 'Calle "A" 123; Luque', c8 || r.j);
  P('…nombre completo sin coma: se separa nombre y apellido', c9 && c9.nombre === 'Lucía' && c9.apellido === 'Fernández', c9);
  const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(`Nombre,Apellido,CI\nÑandú,Cáceres,${ci(0)}\n`, 'utf8')]);
  r = await subir(A, bom, 'utf8.csv', { modo: 'revisar' });
  P('CSV UTF-8 con BOM y comas', r.s === 200 && r.j.muestra[0].nombre === 'Ñandú' && r.j.columnas[0].campo === 'nombre', r.j);

  // ---- Archivos inválidos ----
  P('Sin archivo: 400', (await subir(A, null, '', { modo: 'revisar' })).s === 400);
  P('Excel viejo .xls: 400 con explicación', /xlsx/.test(((await subir(A, Buffer.from('\xD0\xCF\x11\xE0', 'latin1'), 'viejo.xls', { modo: 'revisar' })).j || {}).error?.message || ''));
  P('Falso .xlsx (no es zip): 400', (await subir(A, Buffer.from('hola'), 'falso.xlsx', { modo: 'revisar' })).s === 400);
  P('Zip roto que empieza con PK: 400', (await subir(A, Buffer.from('PK\x03\x04basura'), 'roto.xlsx', { modo: 'revisar' })).s === 400);
  P('Sin columnas de nombre: 400 con explicación', /nombre y apellido/.test(((await subir(A, await xlsx([['Telefono', 'Email'], ['1', 'a@b.cc']]), 'x.xlsx', { modo: 'revisar' })).j || {}).error?.message || ''));
  P('Solo encabezados: 400', (await subir(A, await xlsx([['Nombre', 'Apellido']]), 'x.xlsx', { modo: 'revisar' })).s === 400);
  P('Más de 5 MB: 400', (await subir(A, Buffer.alloc(5 * 1024 * 1024 + 10, 65), 'g.csv', { modo: 'revisar' })).s === 400);
  P('Binario disfrazado de CSV: 400', (await subir(A, Buffer.from([0, 1, 2, 3, 65]), 'b.csv', { modo: 'revisar' })).s === 400);
  const muchas = [['Nombre', 'Apellido']]; for (let i = 0; i < 5001; i += 1) muchas.push(['N', `A${i}`]);
  P('Más de 5000 pacientes: 400', (await subir(A, await xlsx(muchas), 'm.xlsx', { modo: 'revisar' })).s === 400);
  P('Nada de esto guardó pacientes de más', await cuenta(suf) === 5);

  await db.query('DELETE FROM pacientes WHERE clinica_id=1 AND ci LIKE $1', [`9${suf}%`]);
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
