/* Importar pacientes desde Excel (.xlsx) o CSV, para empezar a usar DOVA con
   los pacientes que la clínica ya tiene en otra planilla o sistema.
   - GET  /pacientes/importar/plantilla  → planilla modelo (.xlsx)
   - POST /pacientes/importar             → multipart: archivo, modo=revisar|importar, duplicados=saltar|completar
   "revisar" no guarda nada: muestra cómo se leyó cada columna, las filas con
   errores y las cédulas que ya existen. "importar" guarda las filas válidas en
   una sola transacción (si algo falla, no queda nada a medias). */
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const { getClient } = require('../../config/db');
const auditoria = require('../../utils/auditoria');
const { hoyIso } = require('../../utils/recurso');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILAS = 5000;

// Campo de DOVA → nombres de columna que se reconocen (sin tildes, minúsculas).
const COLUMNAS = {
  nombre: ['nombre', 'nombres', 'primer nombre'],
  apellido: ['apellido', 'apellidos'],
  nombreCompleto: ['nombre completo', 'nombre y apellido', 'nombres y apellidos', 'apellido y nombre', 'apellidos y nombres', 'paciente'],
  ci: ['ci', 'c i', 'cedula', 'cedula de identidad', 'documento', 'nro documento', 'numero de documento', 'n documento', 'dni', 'nro ci'],
  telefono: ['telefono', 'tel', 'celular', 'cel', 'movil', 'telefono celular', 'nro telefono', 'contacto'],
  whatsapp: ['whatsapp', 'wsp', 'wpp'],
  email: ['email', 'e mail', 'correo', 'correo electronico', 'mail'],
  fechaNacimiento: ['fecha nacimiento', 'fecha de nacimiento', 'nacimiento', 'f nac', 'fnac', 'fecha nac', 'cumpleanos'],
  sexo: ['sexo', 'genero'],
  direccion: ['direccion', 'domicilio'],
  ciudad: ['ciudad', 'localidad', 'barrio ciudad'],
  ocupacion: ['ocupacion', 'profesion'],
  alergias: ['alergias', 'alergia'],
  medicamentos: ['medicamentos', 'medicacion'],
  antecedentesMedicos: ['antecedentes', 'antecedentes medicos', 'enfermedades'],
  observaciones: ['observaciones', 'observacion', 'notas', 'nota', 'obs', 'comentarios'],
  ruc: ['ruc'],
  razonSocial: ['razon social', 'facturar a'],
};
const ETIQUETAS = {
  nombre: 'Nombre', apellido: 'Apellido', nombreCompleto: 'Nombre completo', ci: 'C.I.', telefono: 'Teléfono', whatsapp: 'WhatsApp', email: 'Email',
  fechaNacimiento: 'Fecha de nacimiento', sexo: 'Sexo', direccion: 'Dirección', ciudad: 'Ciudad', ocupacion: 'Ocupación', alergias: 'Alergias',
  medicamentos: 'Medicamentos', antecedentesMedicos: 'Antecedentes médicos', observaciones: 'Observaciones', ruc: 'RUC', razonSocial: 'Razón social',
};
// Columna de la tabla y largo máximo.
const DESTINO = {
  nombre: ['nombre', 120], apellido: ['apellido', 120], ci: ['ci', 30], telefono: ['telefono', 40], whatsapp: ['whatsapp', 40], email: ['email', 150],
  fechaNacimiento: ['fecha_nacimiento', 10], sexo: ['sexo', 20], direccion: ['direccion', 500], ciudad: ['ciudad', 100], ocupacion: ['ocupacion', 100],
  alergias: ['alergias', 2000], medicamentos: ['medicamentos', 2000], antecedentesMedicos: ['antecedentes_medicos', 4000], observaciones: ['observaciones', 4000],
  ruc: ['ruc', 40], razonSocial: ['razon_social', 200],
};

const normalizar = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Texto limpio: sin caracteres de control, espacios de más ni un largo absurdo.
// eslint-disable-next-line no-control-regex
const limpio = (v) => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();

function detectarColumnas(encabezados) {
  const mapa = {}; const ignoradas = [];
  encabezados.forEach((h, i) => {
    const n = normalizar(h);
    if (!n) return;
    const campo = Object.keys(COLUMNAS).find((k) => COLUMNAS[k].includes(n));
    if (campo && mapa[campo] === undefined) mapa[campo] = i; else ignoradas.push(limpio(h));
  });
  return { mapa, ignoradas };
}

// Valor de una celda de Excel como texto o fecha.
function valorCelda(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.result !== undefined) return valorCelda(v.result); // fórmula: su resultado
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text); // hipervínculo
    if (v.error) return '';
    return '';
  }
  return v;
}

function fechaIso(v) {
  if (v === '' || v === null || v === undefined) return { valor: null };
  const iso = (a, m, d) => {
    const s = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(`${s}T12:00:00Z`);
    return dt.getUTCFullYear() === Number(a) && dt.getUTCMonth() + 1 === Number(m) && dt.getUTCDate() === Number(d) ? s : null;
  };
  let s = null;
  if (v instanceof Date) s = Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  else if (typeof v === 'number' && v > 0 && v < 80000) s = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10); // número de serie de Excel
  else {
    const t = String(v).trim();
    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
    if (m) s = iso(m[1], m[2], m[3]);
    else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
      let a = Number(m[3]);
      if (m[3].length === 2) a += a > Number(hoyIso().slice(2, 4)) ? 1900 : 2000;
      s = iso(a, m[2], m[1]); // día/mes/año (formato de Paraguay)
    }
  }
  if (!s) return { error: `Fecha de nacimiento no reconocida: "${limpio(v instanceof Date ? v.toISOString() : v).slice(0, 30)}" (usá día/mes/año)` };
  if (s > hoyIso()) return { error: 'La fecha de nacimiento es futura' };
  if (s < '1900-01-01') return { error: 'La fecha de nacimiento es anterior a 1900' };
  return { valor: s };
}

// "Pérez Gómez, Juan Carlos" o "Juan Carlos Pérez Gómez".
function partirNombreCompleto(t) {
  const s = limpio(t);
  if (s.includes(',')) { const [ap, ...no] = s.split(','); return { nombre: limpio(no.join(' ')), apellido: limpio(ap) }; }
  const p = s.split(' ').filter(Boolean);
  if (p.length <= 1) return { nombre: p[0] || '', apellido: '' };
  if (p.length === 2) return { nombre: p[0], apellido: p[1] };
  if (p.length === 3) return { nombre: p[0], apellido: `${p[1]} ${p[2]}` };
  const mitad = Math.floor(p.length / 2);
  return { nombre: p.slice(0, mitad).join(' '), apellido: p.slice(mitad).join(' ') };
}

function convertirFila(celdas, mapa) {
  const d = {}; const errores = []; const avisos = [];
  const tomar = (campo) => (mapa[campo] === undefined ? '' : valorCelda(celdas[mapa[campo]]));
  for (const campo of Object.keys(DESTINO)) {
    if (campo === 'fechaNacimiento') continue;
    const v = tomar(campo);
    if (v instanceof Date) d[campo] = v.toISOString().slice(0, 10);
    else if (v !== '') d[campo] = limpio(typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : v);
  }
  if ((!d.nombre || !d.apellido) && mapa.nombreCompleto !== undefined) {
    const nc = partirNombreCompleto(tomar('nombreCompleto'));
    d.nombre = d.nombre || nc.nombre; d.apellido = d.apellido || nc.apellido;
  }
  if (!d.nombre) errores.push('Falta el nombre');
  if (!d.apellido) errores.push('Falta el apellido');
  if (d.ci) {
    d.ci = d.ci.replace(/[.\s]/g, '').toUpperCase();
    if (!/^[0-9A-Z-]{3,20}$/.test(d.ci)) errores.push(`C.I. con caracteres no válidos: "${d.ci.slice(0, 25)}"`);
  }
  if (d.email) {
    d.email = d.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errores.push(`Email inválido: "${d.email.slice(0, 60)}"`);
  }
  if (d.sexo) {
    const s = normalizar(d.sexo);
    if (['m', 'masculino', 'hombre', 'varon', 'h'].includes(s)) d.sexo = 'M';
    else if (['f', 'femenino', 'mujer'].includes(s)) d.sexo = 'F';
    else { avisos.push(`Sexo "${d.sexo.slice(0, 15)}" no reconocido: queda vacío`); delete d.sexo; }
  }
  const f = fechaIso(tomar('fechaNacimiento'));
  if (f.error) errores.push(f.error); else if (f.valor) d.fechaNacimiento = f.valor;
  for (const [campo, [, max]] of Object.entries(DESTINO)) {
    if (d[campo] && d[campo].length > max) {
      if (['nombre', 'apellido', 'ci', 'email'].includes(campo)) errores.push(`${ETIQUETAS[campo]} demasiado largo`);
      else { d[campo] = d[campo].slice(0, max); avisos.push(`${ETIQUETAS[campo]} recortado a ${max} caracteres`); }
    }
  }
  return { datos: d, errores, avisos };
}

// ---- Lectura del archivo ----
function decodificarTexto(buf) {
  let t;
  try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_e) { t = new TextDecoder('windows-1252').decode(buf); } // CSV de Excel en Windows
  return t.replace(/^\uFEFF/, '');
}
function leerCsv(texto) {
  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].map((c) => [c, primera.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = []; let campo = ''; let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') comillas = false; else campo += c;
    } else if (c === '"' && campo === '') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
      if (filas.length > MAX_FILAS + 1) break;
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
async function leerXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (_e) { throw new ApiError(400, 'No se pudo leer el archivo de Excel. Guardalo como .xlsx (o como CSV) y probá de nuevo.'); }
  const hoja = wb.worksheets.find((h) => h.rowCount > 0);
  if (!hoja) return [];
  if (hoja.rowCount > MAX_FILAS + 1) throw new ApiError(400, `El archivo tiene más de ${MAX_FILAS} filas. Dividilo en partes.`);
  const filas = [];
  hoja.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    for (let c = 1; c <= Math.min(row.cellCount, 60); c += 1) vals.push(row.getCell(c).value);
    vals.nro = row.number; // número de fila en Excel, para los mensajes
    filas.push(vals);
  });
  return filas;
}

async function leerArchivo(archivo) {
  if (!archivo || !archivo.buffer || !archivo.buffer.length) throw new ApiError(400, 'Elegí un archivo .xlsx o .csv');
  const nombre = String(archivo.originalname || '').toLowerCase();
  const esZip = archivo.buffer.slice(0, 2).toString('latin1') === 'PK';
  let filas;
  if (esZip || nombre.endsWith('.xlsx')) {
    if (!esZip) throw new ApiError(400, 'El archivo no es un Excel válido (.xlsx)');
    filas = await leerXlsx(archivo.buffer);
  } else if (nombre.endsWith('.xls')) {
    throw new ApiError(400, 'Formato .xls viejo: abrilo en Excel y guardalo como .xlsx o como CSV');
  } else if (nombre.endsWith('.csv') || nombre.endsWith('.txt') || !nombre.includes('.')) {
    if (archivo.buffer.includes(0)) throw new ApiError(400, 'El archivo no parece una planilla de texto (CSV)');
    filas = leerCsv(decodificarTexto(archivo.buffer));
    filas.forEach((f, i) => { f.nro = i + 1; });
  } else throw new ApiError(400, 'Formato no admitido: subí un .xlsx o un .csv');
  // Saltear filas totalmente vacías y quedarse con el encabezado como primera fila.
  filas = filas.filter((f) => f.some((v) => String(valorCelda(v)).trim() !== ''));
  if (filas.length < 2) throw new ApiError(400, 'La planilla no tiene datos: hace falta una fila de encabezados y al menos un paciente');
  if (filas.length - 1 > MAX_FILAS) throw new ApiError(400, `El archivo tiene más de ${MAX_FILAS} pacientes. Dividilo en partes.`);
  return filas;
}

// ---- Análisis (revisar) ----
async function analizar(cliente, clinicaId, filas) {
  const { mapa, ignoradas } = detectarColumnas(filas[0].map((h) => valorCelda(h)));
  const tieneNombre = mapa.nombreCompleto !== undefined || (mapa.nombre !== undefined && mapa.apellido !== undefined);
  if (!tieneNombre) {
    throw new ApiError(400, 'No encontré las columnas de nombre y apellido. La primera fila tiene que tener los títulos (por ejemplo "Nombre", "Apellido", "C.I.", "Teléfono"). Descargá la planilla modelo.');
  }
  const filasOut = []; const vistas = new Map();
  filas.slice(1).forEach((celdas, i) => {
    const r = convertirFila(celdas, mapa);
    r.fila = celdas.nro || i + 2; // número de fila en la planilla
    if (r.datos.ci) {
      if (vistas.has(r.datos.ci)) r.errores.push(`C.I. repetida en la planilla (también en la fila ${vistas.get(r.datos.ci)})`);
      else vistas.set(r.datos.ci, r.fila);
    }
    filasOut.push(r);
  });
  const cis = [...vistas.keys()];
  const existentes = new Map();
  if (cis.length) {
    const q = await cliente.query('SELECT id, ci, nombre, apellido, activo FROM pacientes WHERE clinica_id=$1 AND ci = ANY($2::text[])', [clinicaId, cis]);
    q.rows.forEach((p) => existentes.set(p.ci, p));
  }
  for (const r of filasOut) {
    const ex = r.datos.ci && existentes.get(r.datos.ci);
    if (ex) r.existente = { id: ex.id, nombre: `${ex.nombre} ${ex.apellido}`, activo: ex.activo };
  }
  return {
    columnas: Object.entries(mapa).map(([campo, i]) => ({ campo, etiqueta: ETIQUETAS[campo], columna: limpio(valorCelda(filas[0][i])) })),
    ignoradas,
    filas: filasOut,
  };
}

function resumen(a) {
  const validas = a.filas.filter((r) => !r.errores.length);
  return {
    total: a.filas.length,
    nuevos: validas.filter((r) => !r.existente).length,
    yaExisten: validas.filter((r) => r.existente).length,
    conErrores: a.filas.filter((r) => r.errores.length).length,
    columnas: a.columnas,
    ignoradas: a.ignoradas,
    errores: a.filas.filter((r) => r.errores.length).slice(0, 200).map((r) => ({ fila: r.fila, errores: r.errores })),
    avisos: a.filas.filter((r) => r.avisos.length).slice(0, 200).map((r) => ({ fila: r.fila, avisos: r.avisos })),
    duplicados: a.filas.filter((r) => r.existente && !r.errores.length).slice(0, 200).map((r) => ({ fila: r.fila, ci: r.datos.ci, nombre: `${r.datos.nombre} ${r.datos.apellido}`, existente: r.existente })),
    muestra: validas.slice(0, 15).map((r) => ({ fila: r.fila, ...r.datos, existente: !!r.existente })),
  };
}

// ---- Importar ----
async function importar(cliente, clinicaId, a, duplicados) {
  let creados = 0; let completados = 0; let omitidos = 0;
  for (const r of a.filas) {
    if (r.errores.length) continue;
    const campos = Object.keys(DESTINO).filter((k) => r.datos[k] !== undefined && r.datos[k] !== '');
    if (r.existente) {
      if (duplicados !== 'completar' || !r.existente.activo) { omitidos += 1; continue; }
      // Completar solo lo que está vacío: nunca pisa un dato cargado en DOVA.
      const sets = campos.filter((k) => !['nombre', 'apellido', 'ci'].includes(k)).map((k, i) => `${DESTINO[k][0]} = COALESCE(NULLIF(${DESTINO[k][0]}::text, ''), $${i + 3})${k === 'fechaNacimiento' ? '::date' : ''}`);
      if (!sets.length) { omitidos += 1; continue; }
      const vals = campos.filter((k) => !['nombre', 'apellido', 'ci'].includes(k)).map((k) => r.datos[k]);
      const vacios = campos.filter((k) => !['nombre', 'apellido', 'ci'].includes(k)).map((k) => `NULLIF(${DESTINO[k][0]}::text, '') IS NULL`);
      const u = await cliente.query(`UPDATE pacientes SET ${sets.join(', ')}, actualizado_en=now() WHERE clinica_id=$1 AND id=$2 AND (${vacios.join(' OR ')})`, [clinicaId, r.existente.id, ...vals]);
      if (!u.rowCount) omitidos += 1;
      completados += u.rowCount;
      continue;
    }
    const cols = ['clinica_id', ...campos.map((k) => DESTINO[k][0])];
    const vals = [clinicaId, ...campos.map((k) => r.datos[k])];
    await cliente.query(`INSERT INTO pacientes (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
    creados += 1;
  }
  return { creados, completados, omitidos };
}

const router = express.Router();
const subir = (req, res, next) => multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } }).single('archivo')(req, res, (err) => {
  if (err) return next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa más de 5 MB' : 'No se pudo recibir el archivo'));
  return next();
});

router.get('/importar/plantilla', requirePermiso('pacientes.create'), async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook(); wb.creator = 'DOVA';
    const h = wb.addWorksheet('Pacientes');
    h.columns = [
      { header: 'Nombre', width: 18 }, { header: 'Apellido', width: 20 }, { header: 'C.I.', width: 12 }, { header: 'Teléfono', width: 15 },
      { header: 'Email', width: 26 }, { header: 'Fecha de nacimiento', width: 18 }, { header: 'Sexo', width: 7 }, { header: 'Dirección', width: 28 },
      { header: 'Ciudad', width: 14 }, { header: 'Ocupación', width: 16 }, { header: 'Alergias', width: 18 }, { header: 'Medicamentos', width: 18 },
      { header: 'Antecedentes médicos', width: 22 }, { header: 'Observaciones', width: 26 }, { header: 'RUC', width: 12 }, { header: 'Razón social', width: 22 },
    ];
    h.getRow(1).font = { bold: true };
    h.addRow(['María', 'González Benítez', '1234567', '0981 123 456', 'maria@ejemplo.com', '15/03/1990', 'F', 'Calle 1 N.º 123', 'Luque', 'Docente', 'Penicilina', '', '', 'Ejemplo: borrar esta fila', '', '']);
    h.getColumn(3).numFmt = '@'; h.getColumn(4).numFmt = '@';
    const a = wb.addWorksheet('Cómo llenarla');
    [['Obligatorio: Nombre y Apellido (o una sola columna "Nombre completo").'], ['La C.I. evita duplicados: si ya existe en DOVA, ese paciente no se vuelve a crear.'],
      ['Fechas: día/mes/año (15/03/1990) o con formato de fecha de Excel.'], ['Sexo: M o F.'], ['Se puede subir la planilla tal cual: DOVA reconoce los títulos de columna más comunes.'],
      ['Antes de guardar, DOVA muestra una revisión con los errores para corregirlos.']].forEach((f) => a.addRow(f));
    a.getColumn(1).width = 100;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="DOVA-planilla-pacientes.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (e) { next(e); }
});

const enCurso = new Set();
router.post('/importar', requirePermiso('pacientes.create'), subir, async (req, res, next) => {
  const modo = req.body && req.body.modo === 'importar' ? 'importar' : 'revisar';
  const duplicados = req.body && req.body.duplicados === 'completar' ? 'completar' : 'saltar';
  if (modo === 'importar' && duplicados === 'completar' && !(req.usuario.permisos || []).includes('pacientes.edit')) {
    return next(new ApiError(403, 'Para completar datos de pacientes existentes hace falta el permiso de editar pacientes'));
  }
  if (modo === 'importar' && enCurso.has(req.clinicaId)) return next(new ApiError(409, 'Ya hay una importación en curso en esta clínica. Esperá a que termine.'));
  let cliente; let propio = false;
  try {
    const filas = await leerArchivo(req.file);
    cliente = await getClient();
    if (modo === 'revisar') {
      const a = await analizar(cliente, req.clinicaId, filas);
      return res.json({ modo, ...resumen(a) });
    }
    enCurso.add(req.clinicaId); propio = true;
    await cliente.query('BEGIN');
    // Un solo proceso a la vez por clínica (también entre varias instancias del servidor).
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('dova:importar-pacientes:' || $1::text))", [req.clinicaId]);
    const a = await analizar(cliente, req.clinicaId, filas);
    const r = await importar(cliente, req.clinicaId, a, duplicados);
    await cliente.query('COMMIT');
    await auditoria.registrar({
      clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'importar', modulo: 'pacientes',
      detalle: { archivo: limpio(req.file.originalname || '').slice(0, 120), filas: a.filas.length, ...r, conErrores: a.filas.filter((x) => x.errores.length).length, duplicados },
    });
    return res.json({ modo, ...resumen(a), ...r });
  } catch (e) {
    if (cliente && modo === 'importar') await cliente.query('ROLLBACK').catch(() => {});
    return next(e);
  } finally {
    if (propio) enCurso.delete(req.clinicaId);
    if (cliente) cliente.release();
  }
});

module.exports = router;
module.exports._internos = { detectarColumnas, convertirFila, fechaIso, partirNombreCompleto, leerCsv };
