/* Ordenar los pendientes viejos: archivar (sin borrar) los controles
   periódicos y los controles después de un tratamiento que están atrasados
   hace más de N meses, para que las listas muestren lo que importa.
   - Archivar cambia el estado a 'archivado': deja de contar en Inicio, en las
     listas y en los mensajes automáticos. No se borra nada.
   - Se pueden ver y restaurar (vuelven a 'activo' / 'pendiente').
   GET  /api/seguimiento/archivar?meses=6           cuántos se archivarían
   POST /api/seguimiento/archivar {tipo, meses}      archivar
   GET  /api/seguimiento/archivados?tipo=…           lista de archivados
   POST /api/seguimiento/archivados/restaurar {tipo, ids | todos} */
const express = require('express');
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const auditoria = require('../../utils/auditoria');

const TIPOS = {
  recalls: { tabla: 'paciente_recalls', fecha: 'proxima_fecha', activo: 'activo', permiso: ['recalls.manage', 'seguimiento.manage'], nombre: 'controles periódicos',
    titulo: '(SELECT rt.nombre FROM recall_tipos rt WHERE rt.id=t.recall_tipo_id)' },
  controles: { tabla: 'controles_programados', fecha: 'fecha_programada', activo: 'pendiente', permiso: ['seguimiento.manage', 'especialidades.edit'], nombre: 'controles después de un tratamiento',
    titulo: 't.titulo' },
};
const MESES = [3, 6, 12, 24];
function tipoDe(t) { const x = TIPOS[t]; if (!x) throw new ApiError(400, 'Tipo inválido (recalls o controles)'); return x; }
function mesesDe(m) {
  const n = m === undefined || m === '' ? 6 : Number(m);
  if (!MESES.includes(n)) throw new ApiError(400, `Meses inválidos (${MESES.join(', ')})`);
  return n;
}
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
const puede = (req, permisos) => permisos.some((p) => req.usuario.permisos.includes(p));

const router = express.Router();
const VER = ['seguimiento.view', 'seguimiento.manage', 'recalls.view', 'recalls.manage'];

router.get('/archivar', requirePermiso(...VER), h(async (req) => {
  const meses = mesesDe(req.query.meses);
  const out = { meses };
  for (const [k, t] of Object.entries(TIPOS)) {
    out[k] = Number((await query(`SELECT count(*) n FROM ${t.tabla} t WHERE t.clinica_id=$1 AND t.estado=$2 AND t.${t.fecha} < (current_date - ($3::int * interval '1 month'))`, [req.clinicaId, t.activo, meses])).rows[0].n);
    out[`${k}Archivados`] = Number((await query(`SELECT count(*) n FROM ${t.tabla} WHERE clinica_id=$1 AND estado='archivado'`, [req.clinicaId])).rows[0].n);
  }
  return out;
}));

router.post('/archivar', requirePermiso('seguimiento.manage', 'recalls.manage'), h(async (req) => {
  const b = req.body || {};
  const t = tipoDe(b.tipo); const meses = mesesDe(b.meses);
  if (!puede(req, t.permiso)) throw new ApiError(403, 'No tenés permiso para archivar estos controles');
  const ids = await conCandado(`archivo:${req.clinicaId}:${b.tipo}`, async () => (await query(`UPDATE ${t.tabla} t SET estado='archivado', actualizado_en=now()
      WHERE t.clinica_id=$1 AND t.estado=$2 AND t.${t.fecha} < (current_date - ($3::int * interval '1 month')) RETURNING t.id`, [req.clinicaId, t.activo, meses])).rows.map((x) => x.id));
  if (ids.length) {
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'archivar_pendientes', modulo: 'seguimiento',
      detalle: { tipo: b.tipo, meses, cantidad: ids.length, ids: ids.slice(0, 2000) } });
  }
  return { archivados: ids.length, mensaje: ids.length ? `Se archivaron ${ids.length} ${t.nombre} atrasados hace más de ${meses} meses. Los podés restaurar cuando quieras.` : 'No había nada para archivar.' };
}));

router.get('/archivados', requirePermiso(...VER), h(async (req) => {
  const t = tipoDe(req.query.tipo);
  const r = await query(`SELECT t.id, t.paciente_id, t.${t.fecha}::text AS fecha, ${t.titulo} AS titulo, t.actualizado_en, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
      FROM ${t.tabla} t JOIN pacientes p ON p.id=t.paciente_id WHERE t.clinica_id=$1 AND t.estado='archivado' ORDER BY t.${t.fecha} DESC, t.id DESC LIMIT 300`, [req.clinicaId]);
  const n = Number((await query(`SELECT count(*) n FROM ${t.tabla} WHERE clinica_id=$1 AND estado='archivado'`, [req.clinicaId])).rows[0].n);
  return { total: n, items: r.rows };
}));

router.post('/archivados/restaurar', requirePermiso('seguimiento.manage', 'recalls.manage'), h(async (req) => {
  const b = req.body || {};
  const t = tipoDe(b.tipo);
  if (!puede(req, t.permiso)) throw new ApiError(403, 'No tenés permiso para restaurar estos controles');
  let ids;
  if (b.todos === true) {
    ids = (await query(`UPDATE ${t.tabla} SET estado=$2, actualizado_en=now() WHERE clinica_id=$1 AND estado='archivado' RETURNING id`, [req.clinicaId, t.activo])).rows.map((x) => x.id);
  } else {
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw new ApiError(400, 'Elegí qué restaurar');
    const lista = b.ids.map(Number);
    if (lista.some((x) => !Number.isInteger(x) || x <= 0)) throw new ApiError(400, 'Identificadores inválidos');
    ids = (await query(`UPDATE ${t.tabla} SET estado=$2, actualizado_en=now() WHERE clinica_id=$1 AND estado='archivado' AND id = ANY($3::int[]) RETURNING id`, [req.clinicaId, t.activo, lista])).rows.map((x) => x.id);
  }
  if (ids.length) {
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'restaurar_archivados', modulo: 'seguimiento', detalle: { tipo: b.tipo, cantidad: ids.length, ids: ids.slice(0, 2000) } });
  }
  return { restaurados: ids.length };
}));

module.exports = { router, TIPOS, MESES };
