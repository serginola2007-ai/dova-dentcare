const express = require('express');
const controller = require('./odontologos.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Ver odontólogos activos no es sensible: cualquier usuario autenticado los necesita
// para filtros de agenda, así que no exige un permiso específico más allá de estar logueado.
router.get('/', controller.listar);
router.get('/:id', controller.obtener);
router.post('/', requirePermiso('usuarios.manage'), controller.crear);
router.put('/:id', requirePermiso('usuarios.manage'), controller.actualizar);
router.delete('/:id', requirePermiso('usuarios.manage'), controller.desactivar);

module.exports = router;
