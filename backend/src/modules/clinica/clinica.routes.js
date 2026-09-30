const express = require('express');
const controller = require('./clinica.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();

// Público: para pintar branding en la pantalla de login antes de autenticar.
router.get('/branding-publico', controller.brandingPublico);

router.get('/', authMiddleware, resolverClinicaMiddleware, controller.obtenerActual);
router.put('/', authMiddleware, resolverClinicaMiddleware, requirePermiso('clinica.config.manage'), controller.actualizar);

module.exports = router;
