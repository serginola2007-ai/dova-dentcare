const express = require('express');
const controller = require('./clinica.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();

// Público: para pintar branding en la pantalla de login antes de autenticar.
router.get('/branding-publico', controller.brandingPublico);

router.get('/', authMiddleware, resolverClinicaMiddleware, controller.obtenerActual);
// Mi plan: qué módulos incluye el plan de la clínica (lo ve cualquier usuario del sistema).
router.get('/plan', authMiddleware, resolverClinicaMiddleware, controller.plan);
router.put('/', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), controller.actualizar);

// Política de seguridad de la clínica: bloqueo de pantalla por inactividad y
// verificación en dos pasos obligatoria para administradores.
router.get('/seguridad', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), controller.obtenerSeguridad);
router.put('/seguridad', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), controller.actualizarSeguridad);

// Puesta en marcha: qué falta configurar para empezar a usar DOVA.
const puesta = require('./puesta-en-marcha');
router.get('/puesta-en-marcha', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), async (req, res, next) => {
  try { res.json(await puesta.estado(req.clinicaId)); } catch (e) { next(e); }
});
router.put('/puesta-en-marcha', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), async (req, res, next) => {
  try {
    if (typeof (req.body || {}).oculta !== 'boolean') return next(new (require('../../middlewares/error.middleware').ApiError)(400, 'Falta "oculta" (verdadero o falso)'));
    return res.json(await puesta.ocultar(req.clinicaId, req.body.oculta));
  } catch (e) { return next(e); }
});

module.exports = router;
