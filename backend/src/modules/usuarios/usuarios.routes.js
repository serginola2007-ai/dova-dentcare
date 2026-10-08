const express = require('express');
const controller = require('./usuarios.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Catálogo de permisos (solo lectura, útil para armar la UI de administración)
router.get('/permisos', requirePermiso('usuarios.manage', 'roles.manage'), controller.listarPermisos);

// Roles
router.get('/roles', requirePermiso('usuarios.manage', 'roles.manage'), controller.listarRoles);
router.get('/roles/:id', requirePermiso('usuarios.manage', 'roles.manage'), controller.detalleRol);
router.post('/roles', requirePermiso('roles.manage'), controller.crearRol);
router.put('/roles/:id/permisos', requirePermiso('roles.manage'), controller.actualizarPermisosRol);

// Preferencia de diseño propia (self-service): cualquier usuario logueado
// puede leer/cambiar SU PROPIA preferencia, sin permiso especial. Va antes
// de las rutas /:id para que "me" no sea interpretado como un id.
router.patch('/me/preferencias', controller.actualizarMiDisenoPreferido);

// Usuarios
router.get('/', requirePermiso('usuarios.manage'), controller.listar);
router.get('/:id', requirePermiso('usuarios.manage'), controller.obtener);
router.post('/', requirePermiso('usuarios.manage'), controller.crear);
router.put('/:id', requirePermiso('usuarios.manage'), controller.actualizar);
router.post('/:id/password', requirePermiso('usuarios.manage'), controller.cambiarPassword);
router.delete('/:id', requirePermiso('usuarios.manage'), controller.eliminar);
// Cerrar todas las sesiones abiertas de una persona (por ejemplo, si perdió el celular).
router.post('/:id/cerrar-sesiones', requirePermiso('usuarios.manage'), controller.cerrarSesiones);

// Permisos personalizados (overrides) por usuario
router.put('/:id/permisos', requirePermiso('usuarios.manage'), controller.setOverride);
router.delete('/:id/permisos/:codigoPermiso', requirePermiso('usuarios.manage'), controller.quitarOverride);

module.exports = router;
