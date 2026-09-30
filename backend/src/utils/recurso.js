/* Generador de recursos CRUD de DOVA.

   Muchas funciones clínicas nuevas (alergias, implantes, biopsias, equipos,
   aseguradoras…) son "registros con campos" que necesitan exactamente lo
   mismo: listar/filtrar, ver, crear, editar y borrar, siempre
   - dentro de la clínica del usuario (multi-clínica),
   - con permisos RBAC en el backend,
   - validando CADA campo contra una lista blanca (nunca se arma SQL con
     nombres de columna que vengan del cliente),
   - dejando rastro en la auditoría.

   En vez de copiar 4 archivos por entidad, cada recurso se declara con su
   lista de campos y reglas, y este módulo arma el router. La lógica clínica
   específica (índices periodontales, recalls, interacciones, KPIs…) vive en
   sus propios servicios y se engancha con los hooks antesDeGuardar /
   despuesDeGuardar.

   Entrada: camelCase (como el resto de la API). Salida: filas snake_case
   (como el resto de la API). */
const express = require('express');
const { query, conCandado } = require('../config/db');
const { ApiError } = require('../middlewares/error.middleware');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../middlewares/clinica.middleware');
const { requirePermiso } = require('../middlewares/rbac.middleware');
const auditoria = require('./auditoria');

const PIEZAS_VALIDAS = new Set([
  ...[1, 2, 3, 4].flatMap((c) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${c}${n}`)),
  ...[5, 6, 7, 8].flatMap((c) => [1, 2, 3, 4, 5].map((n) => `${c}${n}`)),
]);

function aSnake(s) { return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()); }

function convertir(nombre, def, valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') {
    if (def.requerido) throw new ApiError(400, `El campo ${nombre} es obligatorio`);
    return def.tipo === 'bool' ? false : (def.tipo === 'json' ? {} : null);
  }
  switch (def.tipo) {
    case 'texto': {
      const s = String(valor).trim();
      if (def.requerido && !s) throw new ApiError(400, `El campo ${nombre} es obligatorio`);
      if (def.max && s.length > def.max) throw new ApiError(400, `El campo ${nombre} admite hasta ${def.max} caracteres`);
      return s;
    }
    case 'entero': case 'numero': {
      const n = Number(valor);
      if (!Number.isFinite(n)) throw new ApiError(400, `El campo ${nombre} debe ser numérico`);
      if (def.tipo === 'entero' && !Number.isInteger(n)) throw new ApiError(400, `El campo ${nombre} debe ser un número entero`);
      if (def.min !== undefined && n < def.min) throw new ApiError(400, `El campo ${nombre} debe ser ≥ ${def.min}`);
      if (def.maxNum !== undefined && n > def.maxNum) throw new ApiError(400, `El campo ${nombre} debe ser ≤ ${def.maxNum}`);
      return n;
    }
    case 'fecha': {
      const s = String(valor).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ApiError(400, `El campo ${nombre} debe ser una fecha AAAA-MM-DD`);
      return s;
    }
    case 'fechahora': {
      const d = new Date(valor);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, `El campo ${nombre} debe ser fecha y hora válidas`);
      return d.toISOString();
    }
    case 'hora': {
      const s = String(valor);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) throw new ApiError(400, `El campo ${nombre} debe ser una hora HH:MM`);
      return s;
    }
    case 'bool':
      return valor === true || valor === 'true' || valor === 1 || valor === '1' || valor === 'on';
    case 'enum':
      if (!def.valores.includes(String(valor))) throw new ApiError(400, `Valor inválido para ${nombre}: "${valor}". Opciones: ${def.valores.join(', ')}`);
      return String(valor);
    case 'pieza': {
      const s = String(valor).trim();
      if (!PIEZAS_VALIDAS.has(s)) throw new ApiError(400, `Pieza inválida: "${s}" (usar notación FDI, ej. 16, 21, 55)`);
      return s;
    }
    case 'json':
      if (typeof valor === 'string') {
        try { return JSON.parse(valor); } catch (_e) { throw new ApiError(400, `El campo ${nombre} debe ser JSON válido`); }
      }
      if (typeof valor !== 'object') throw new ApiError(400, `El campo ${nombre} debe ser un objeto`);
      return valor;
    case 'id': {
      const n = Number(valor);
      if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `El campo ${nombre} debe ser un identificador válido`);
      return n;
    }
    default:
      throw new Error(`Tipo de campo desconocido: ${def.tipo}`);
  }
}

// Tablas referenciables por los campos tipo "id": se verifica que el id
// pertenezca a la MISMA clínica (impide mezclar datos entre clínicas).
async function verificarReferencia(clinicaId, tabla, id, nombre) {
  const r = await query(`SELECT 1 FROM ${tabla} WHERE id=$1 AND clinica_id=$2`, [id, clinicaId]);
  if (!r.rowCount) throw new ApiError(400, `${nombre}: el registro ${id} no existe en esta clínica`);
}

/**
 * @param {object} cfg
 *  tabla, modulo (auditoría), campos {nombreCamel: {tipo, requerido, max, valores, ref, soloCrear}},
 *  porPaciente (bool), permisos {ver:[], editar:[], borrar:[]}, orden,
 *  filtros {query: {col, tipo}}, creadoPor (col), actualizadoEn (bool), borrado ('fisico'|'logico:<col>'|false),
 *  joinPaciente (bool), selectExtra (sql), joins (sql, usa alias t), antesDeGuardar(datos, ctx), despuesDeGuardar(fila, ctx), transformarFila(fila),
 *  antesDeListar(clinicaId) (ej. marcar vencidos), candado(datos, ctx) → clave para serializar altas simultáneas (ej. paciente+sustancia)
 */
function crearRecurso(cfg) {
  const router = express.Router();
  router.use(authMiddleware, resolverClinicaMiddleware);
  const permisos = cfg.permisos;
  const campos = { ...cfg.campos };
  if (cfg.porPaciente) campos.pacienteId = { tipo: 'id', requerido: true, ref: 'pacientes', soloCrear: true };

  async function normalizar(body, { creando, clinicaId }) {
    const salida = {};
    for (const [nombre, def] of Object.entries(campos)) {
      const col = def.col || aSnake(nombre);
      let crudo = body[nombre];
      if (crudo === undefined) crudo = body[col];
      if (!creando && def.soloCrear) continue;
      if (crudo === undefined) {
        if (creando && def.requerido) throw new ApiError(400, `El campo ${nombre} es obligatorio`);
        if (creando && def.defecto !== undefined) salida[col] = typeof def.defecto === 'function' ? def.defecto() : def.defecto;
        continue;
      }
      const v = convertir(nombre, def, crudo);
      if (def.ref && v !== null && v !== undefined) await verificarReferencia(clinicaId, def.ref, v, nombre);
      salida[col] = v;
    }
    return salida;
  }

  function selectBase() {
    return `SELECT t.*${cfg.joinPaciente ? ", p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.telefono AS paciente_telefono, p.whatsapp AS paciente_whatsapp" : ''}${cfg.selectExtra ? ', ' + cfg.selectExtra : ''}
      FROM ${cfg.tabla} t
      ${cfg.joinPaciente ? 'JOIN pacientes p ON p.id = t.paciente_id' : ''}
      ${cfg.joins || ''}`;
  }

  async function obtener(clinicaId, id) {
    const r = await query(`${selectBase()} WHERE t.clinica_id=$1 AND t.id=$2`, [clinicaId, id]);
    const fila = r.rows[0];
    return fila && cfg.transformarFila ? cfg.transformarFila(fila) : fila;
  }

  const tr = (fila) => (cfg.transformarFila ? cfg.transformarFila(fila) : fila);

  router.get('/', requirePermiso(...permisos.ver), async (req, res, next) => {
    try {
      if (cfg.antesDeListar) await cfg.antesDeListar(req.clinicaId);
      const cond = ['t.clinica_id=$1'];
      const params = [req.clinicaId];
      if (cfg.porPaciente && req.query.pacienteId) { params.push(Number(req.query.pacienteId)); cond.push(`t.paciente_id=$${params.length}`); }
      for (const [q, f] of Object.entries(cfg.filtros || {})) {
        if (req.query[q] === undefined || req.query[q] === '') continue;
        const v = convertir(q, { tipo: f.tipo || 'texto', valores: f.valores }, req.query[q]);
        params.push(v);
        cond.push(`t.${f.col} ${f.op || '='} $${params.length}`);
      }
      if (cfg.borrado && cfg.borrado.startsWith('logico:') && req.query.incluirInactivos !== 'true') {
        cond.push(`t.${cfg.borrado.split(':')[1]} = true`);
      }
      const limite = Math.min(Number(req.query.limite) || 500, 2000);
      const r = await query(`${selectBase()} WHERE ${cond.join(' AND ')} ORDER BY ${cfg.orden || 't.id DESC'} LIMIT ${limite}`, params);
      res.json(r.rows.map(tr));
    } catch (e) { next(e); }
  });

  router.get('/:id', requirePermiso(...permisos.ver), async (req, res, next) => {
    try {
      const fila = await obtener(req.clinicaId, Number(req.params.id));
      if (!fila) throw new ApiError(404, 'Registro no encontrado');
      res.json(fila);
    } catch (e) { next(e); }
  });

  router.post('/', requirePermiso(...permisos.editar), async (req, res, next) => {
    try {
      const ctx = { clinicaId: req.clinicaId, usuario: req.usuario, creando: true, body: req.body };
      const datos = await normalizar(req.body || {}, ctx);
      // Con cfg.candado(datos, ctx) → clave, la verificación de antesDeGuardar
      // y el INSERT se hacen bajo candado (evita duplicados simultáneos).
      const insertar = async () => {
        if (cfg.antesDeGuardar) await cfg.antesDeGuardar(datos, ctx);
        datos.clinica_id = req.clinicaId;
        if (cfg.creadoPor) datos[cfg.creadoPor] = req.usuario.id;
        const cols = Object.keys(datos);
        const vals = cols.map((c) => (datos[c] !== null && typeof datos[c] === 'object' ? JSON.stringify(datos[c]) : datos[c]));
        return query(
          `INSERT INTO ${cfg.tabla} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
          vals
        );
      };
      const clave = cfg.candado && cfg.candado(datos, ctx);
      const r = clave ? await conCandado(`${cfg.tabla}:${req.clinicaId}:${clave}`, insertar) : await insertar();
      const fila = await obtener(req.clinicaId, r.rows[0].id);
      if (cfg.despuesDeGuardar) await cfg.despuesDeGuardar(fila, ctx);
      await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'crear', modulo: cfg.modulo, entidadId: fila.id, detalle: { tabla: cfg.tabla, pacienteId: fila.paciente_id } });
      res.status(201).json(await obtener(req.clinicaId, fila.id));
    } catch (e) { next(e); }
  });

  router.put('/:id', requirePermiso(...permisos.editar), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const previo = await obtener(req.clinicaId, id);
      if (!previo) throw new ApiError(404, 'Registro no encontrado');
      const ctx = { clinicaId: req.clinicaId, usuario: req.usuario, creando: false, previo, body: req.body };
      const datos = await normalizar(req.body || {}, ctx);
      if (cfg.antesDeGuardar) await cfg.antesDeGuardar(datos, ctx);
      if (cfg.actualizadoEn) datos.actualizado_en = new Date().toISOString();
      const cols = Object.keys(datos);
      if (cols.length) {
        const vals = cols.map((c) => (datos[c] !== null && typeof datos[c] === 'object' ? JSON.stringify(datos[c]) : datos[c]));
        await query(
          `UPDATE ${cfg.tabla} SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(', ')} WHERE id=$${cols.length + 1} AND clinica_id=$${cols.length + 2}`,
          [...vals, id, req.clinicaId]
        );
      }
      const fila = await obtener(req.clinicaId, id);
      if (cfg.despuesDeGuardar) await cfg.despuesDeGuardar(fila, ctx);
      const cambios = {};
      for (const c of cols) if (c !== 'actualizado_en' && JSON.stringify(previo[c]) !== JSON.stringify(fila[c])) cambios[c] = { antes: previo[c], despues: fila[c] };
      await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'editar', modulo: cfg.modulo, entidadId: id, detalle: { tabla: cfg.tabla, cambios } });
      res.json(await obtener(req.clinicaId, id));
    } catch (e) { next(e); }
  });

  if (cfg.borrado) {
    router.delete('/:id', requirePermiso(...(permisos.borrar || permisos.editar)), async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const previo = await obtener(req.clinicaId, id);
        if (!previo) throw new ApiError(404, 'Registro no encontrado');
        if (cfg.antesDeBorrar) await cfg.antesDeBorrar(previo, { clinicaId: req.clinicaId, usuario: req.usuario });
        if (cfg.borrado === 'fisico') {
          await query(`DELETE FROM ${cfg.tabla} WHERE id=$1 AND clinica_id=$2`, [id, req.clinicaId]);
        } else {
          const col = cfg.borrado.split(':')[1];
          await query(`UPDATE ${cfg.tabla} SET ${col}=false WHERE id=$1 AND clinica_id=$2`, [id, req.clinicaId]);
        }
        await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'borrar', modulo: cfg.modulo, entidadId: id, detalle: { tabla: cfg.tabla, registro: previo } });
        res.status(204).end();
      } catch (e) { next(e); }
    });
  }

  router.obtener = obtener;
  return router;
}

// Suma meses a una fecha AAAA-MM-DD (ajustando fin de mes: 31/01 + 1 m = 28/02).
function sumarMeses(fechaIso, meses) {
  const [y, m, d] = String(fechaIso).slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimoDia));
  return base.toISOString().slice(0, 10);
}

function hoyIso() {
  // Fecha local de la clínica (Paraguay, UTC-3/-4): evita que después de las
  // 21 h "hoy" ya sea mañana por usar UTC.
  const tz = process.env.DOVA_TZ || 'America/Asuncion';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

module.exports = { crearRecurso, convertir, sumarMeses, hoyIso, PIEZAS_VALIDAS, verificarReferencia };
