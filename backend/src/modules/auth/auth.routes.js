const express = require('express');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
// Cambio de la contraseña propia (cualquier usuario logueado).
router.post('/cambiar-clave', require('../../middlewares/auth.middleware').authMiddleware, controller.cambiarClave);
// Cerrar sesión en todos los dispositivos (la propia persona).
router.post('/logout-todas', require('../../middlewares/auth.middleware').authMiddleware, controller.logoutTodas);

module.exports = router;
