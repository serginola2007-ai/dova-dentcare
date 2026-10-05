/* Notas internas del paciente: avisos para el equipo (no son historia
   clínica). Ej.: "prefiere turnos a la tarde", "llamar al hijo para avisar".
   No se editan: se agregan o se quitan (quitar queda en la auditoría y la
   nota se conserva marcada como eliminada). */
const express = require('express');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const auditoria = require('../../utils/auditoria');

const router = express.Router({ mergeParams: true });
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

async function paciente(req) {
  const p = (await query('SELECT id FROM pacientes WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.id)])).rows[0];
  if (!p) throw new ApiError(404, 'Paciente no encontrado');
  return p;
}

router.get('/:id/notas', requirePermiso('pacientes.view'), h(async (req) => {
  await paciente(req);
  return (await query(`SELECT id, texto, importante, usuario_id, usuario_nombre, creado_en FROM paciente_notas
                        WHERE clinica_id=$1 AND paciente_id=$2 AND eliminada_en IS NULL ORDER BY importante DESC, creado_en DESC LIMIT 200`,
  [req.clinicaId, Number(req.params.id)])).rows;
}));

router.post('/:id/notas', requirePermiso('pacientes.edit', 'historia_clinica.edit', 'pacientes.clinical.edit'), h(async (req) => {
  const p = await paciente(req);
  const texto = String((req.body || {}).texto || '').trim().slice(0, 2000);
  if (texto.length < 2) throw new ApiError(400, 'Escribí la nota');
  const r = (await query(`INSERT INTO paciente_notas (clinica_id, paciente_id, texto, importante, usuario_id, usuario_nombre)
                           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, texto, importante, usuario_id, usuario_nombre, creado_en`,
  [req.clinicaId, p.id, texto, !!(req.body || {}).importante, req.usuario.id, req.usuario.nombre])).rows[0];
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'crear_nota_interna', modulo: 'pacientes', entidadId: r.id, detalle: { pacienteId: p.id, importante: r.importante } });
  return r;
}));

// Quitar: el autor, o quien puede eliminar pacientes (admin).
router.delete('/:id/notas/:notaId', requirePermiso('pacientes.edit', 'historia_clinica.edit', 'pacientes.clinical.edit', 'pacientes.delete'), h(async (req) => {
  const p = await paciente(req);
  const n = (await query('SELECT * FROM paciente_notas WHERE clinica_id=$1 AND paciente_id=$2 AND id=$3 AND eliminada_en IS NULL', [req.clinicaId, p.id, Number(req.params.notaId)])).rows[0];
  if (!n) throw new ApiError(404, 'Nota no encontrada');
  if (n.usuario_id !== req.usuario.id && !(req.usuario.permisos || []).includes('pacientes.delete')) throw new ApiError(403, 'Solo quien escribió la nota (o el administrador) puede quitarla');
  await query('UPDATE paciente_notas SET eliminada_en=now(), eliminada_por=$2 WHERE id=$1', [n.id, req.usuario.id]);
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'eliminar_nota_interna', modulo: 'pacientes', entidadId: n.id, detalle: { pacienteId: p.id, texto: n.texto } });
  return { ok: true };
}));

module.exports = router;
