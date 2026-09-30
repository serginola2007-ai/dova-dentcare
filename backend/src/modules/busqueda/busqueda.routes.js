const express = require('express');
const controller = require('./busqueda.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Sin requirePermiso fijo: cada categoría se filtra internamente según los
// permisos reales del usuario (ver busqueda.service.js). Cualquier usuario
// autenticado puede buscar; solo ve resultados de lo que ya puede ver.
router.get('/', controller.buscar);

module.exports = router;
