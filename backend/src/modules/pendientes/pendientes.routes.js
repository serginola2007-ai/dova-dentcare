const express = require('express');
const controller = require('./pendientes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Cada usuario ve su propio trabajo pendiente (si es odontólogo) o el de
// toda la clínica (si tiene permiso clínico amplio y no es un odontólogo
// puntual). Requiere al menos un permiso clínico base para entrar.
router.get('/', requirePermiso('pacientes.clinical.view', 'historia_clinica.view'), controller.obtener);

module.exports = router;
