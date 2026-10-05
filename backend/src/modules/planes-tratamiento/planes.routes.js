const express = require('express');
const controller = require('./planes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/paciente/:pacienteId', requirePermiso('planes_tratamiento.view'), controller.listarPorPaciente);
router.get('/insumos-disponibles', requirePermiso('planes_tratamiento.manage'), controller.listarInsumosParaConsumo);
router.get('/:id', requirePermiso('planes_tratamiento.view'), controller.obtener);
router.post('/', requirePermiso('planes_tratamiento.manage'), controller.crear);
router.put('/:id', requirePermiso('planes_tratamiento.manage'), controller.actualizar);
router.post('/:id/sesiones', requirePermiso('planes_tratamiento.manage'), controller.registrarSesion);
router.post('/:id/completar', requirePermiso('planes_tratamiento.manage'), controller.completar);
router.post('/:id/cancelar', requirePermiso('planes_tratamiento.manage'), controller.cancelar);

// Etapas de tratamiento (checklist)
router.post('/:id/etapas', requirePermiso('planes_tratamiento.manage'), controller.crearEtapa);
router.post('/:id/etapas/aplicar-plantilla', requirePermiso('planes_tratamiento.manage'), controller.aplicarEtapas);
router.patch('/:id/etapas/:etapaId', requirePermiso('planes_tratamiento.manage'), controller.actualizarEtapa);
router.post('/:id/etapas/:etapaId/completar', requirePermiso('planes_tratamiento.manage'), controller.completarEtapa);
router.post('/:id/etapas/:etapaId/reabrir', requirePermiso('planes_tratamiento.manage'), controller.reabrirEtapa);

// Fase 5 — Integración inventario ↔ procedimientos
router.post('/:id/etapas/:etapaId/materiales', requirePermiso('planes_tratamiento.manage'), controller.registrarMaterialEtapa);
router.post('/:id/sesiones/:sesionId/materiales', requirePermiso('planes_tratamiento.manage'), controller.registrarMaterialSesion);

// Fase 5 — Integración tratamientos ↔ presupuesto
router.post('/:id/generar-presupuesto', requirePermiso('presupuestos.manage'), controller.generarPresupuesto);

module.exports = router;
