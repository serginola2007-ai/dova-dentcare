const express = require('express');
const controller = require('./auth.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', controller.login);
// Segundo paso del ingreso (código de la app o de recuperación).
router.post('/login/2fa', controller.login2fa);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
// Desbloquear la pantalla: usa la cookie de la sesión + la contraseña.
router.post('/desbloquear', controller.desbloquear);
// Cambio de la contraseña propia (cualquier usuario logueado).
router.post('/cambiar-clave', authMiddleware, controller.cambiarClave);
// Cerrar sesión en todos los dispositivos (la propia persona).
router.post('/logout-todas', authMiddleware, controller.logoutTodas);
// Verificación en dos pasos de la propia cuenta.
router.get('/2fa', authMiddleware, controller.estado2fa);
router.post('/2fa/iniciar', authMiddleware, controller.iniciar2fa);
router.post('/2fa/confirmar', authMiddleware, controller.confirmar2fa);
router.post('/2fa/desactivar', authMiddleware, controller.desactivar2fa);
router.post('/2fa/codigos', authMiddleware, controller.nuevosCodigos2fa);
// Sesiones abiertas de la propia cuenta.
router.get('/sesiones', authMiddleware, controller.sesiones);
router.post('/sesiones/:id/cerrar', authMiddleware, controller.cerrarSesion);
// Política de la clínica (minutos sin uso hasta bloquear) y bloqueo manual.
router.get('/politica', authMiddleware, controller.politica);
router.post('/bloquear', authMiddleware, controller.bloquear);

module.exports = router;
