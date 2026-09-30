const express = require('express');
const { crearRecurso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const s = require('./recalls.service');

const VER = ['recalls.view', 'recalls.manage'];
const EDITAR = ['recalls.manage'];
const router = express.Router();

// Tipos de recall (configuración de la clínica)
router.use('/tipos', crearRecurso({
  tabla: 'recall_tipos', modulo: 'recalls', permisos: { ver: [...VER, 'pacientes.clinical.view'], editar: ['recalls.manage', 'clinica.config.manage'] },
  borrado: 'logico:activo', orden: 't.nombre',
  campos: {
    codigo: { tipo: 'texto', requerido: true, max: 40, soloCrear: true },
    nombre: { tipo: 'texto', requerido: true, max: 100 },
    intervaloMeses: { tipo: 'entero', requerido: true, min: 1, maxNum: 60 },
    descripcion: { tipo: 'texto' },
    color: { tipo: 'texto', max: 20 },
    activo: { tipo: 'bool' },
  },
  antesDeGuardar: async (d) => { if (d.codigo) d.codigo = d.codigo.toLowerCase().replace(/[^a-z0-9_]/g, '_'); },
}));

const r = express.Router();
r.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { const out = await fn(req); if (out === undefined) res.status(204).end(); else res.json(out); } catch (e) { next(e); } };

r.get('/lista', requirePermiso(...VER), h((req) => s.lista(req.clinicaId, req.query)));
r.get('/cumplimiento', requirePermiso(...VER, 'kpis.view'), h((req) => s.cumplimiento(req.clinicaId)));
r.get('/paciente/:pacienteId', requirePermiso(...VER, 'pacientes.clinical.view'), h((req) => s.listarPorPaciente(req.clinicaId, Number(req.params.pacienteId))));
r.post('/', requirePermiso(...EDITAR), async (req, res, next) => {
  try { res.status(201).json(await s.asignar(req.clinicaId, { ...req.body, pacienteId: Number(req.body.pacienteId), recallTipoId: Number(req.body.recallTipoId) }, req.usuario)); } catch (e) { next(e); }
});
r.put('/:id', requirePermiso(...EDITAR), h((req) => s.editar(req.clinicaId, Number(req.params.id), req.body, req.usuario)));
r.post('/:id/contacto', requirePermiso(...EDITAR), h((req) => s.registrarContacto(req.clinicaId, Number(req.params.id), req.body, req.usuario)));
r.post('/:id/completar', requirePermiso(...EDITAR), h((req) => s.completar(req.clinicaId, Number(req.params.id), req.body, req.usuario)));
r.post('/:id/estado', requirePermiso(...EDITAR), h((req) => s.cambiarEstado(req.clinicaId, Number(req.params.id), req.body, req.usuario)));
r.delete('/:id', requirePermiso(...EDITAR), h(async (req) => { await s.eliminar(req.clinicaId, Number(req.params.id), req.usuario); }));
router.use('/', r);

module.exports = router;
