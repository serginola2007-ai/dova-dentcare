const express = require('express');
const controller = require('./comprobantes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/pago/:id', requirePermiso('pagos.view'), controller.pago);
router.get('/presupuesto/:id', requirePermiso('presupuestos.view'), controller.presupuesto);
router.get('/consentimiento/:id', requirePermiso('consentimientos.manage', 'pacientes.clinical.view'), controller.consentimiento);
const docs = require('./documentos');
const enviar = (fn) => async (req, res, next) => { try { await fn(req.clinicaId, req.params.id, res, req.usuario); } catch (e) { next(e); } };
router.get('/historia-clinica/:id', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), enviar(docs.historiaClinica));
router.get('/consulta/:id', requirePermiso('historia_clinica.view', 'pacientes.clinical.view'), enviar(docs.consulta));
router.get('/derivacion/:id', requirePermiso('derivaciones.manage', 'pacientes.clinical.view'), enviar(docs.derivacion));
router.get('/estado-cuenta/:id', requirePermiso('pagos.view', 'cuenta_corriente.view'), enviar(docs.estadoCuenta));
router.get('/receta/:id', requirePermiso('recetas.manage', 'pacientes.clinical.view', 'historia_clinica.view'), controller.receta);
router.get('/plan-tratamiento/:id', requirePermiso('planes_tratamiento.view'), controller.planTratamiento);

module.exports = router;
