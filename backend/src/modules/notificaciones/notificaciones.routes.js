const express = require('express');
const controller = require('./notificaciones.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
router.get('/', controller.listar);
router.get('/contador', controller.contador);
router.post('/:id/leer', controller.marcarLeida);
router.post('/leer-todas', controller.marcarTodasLeidas);
module.exports = router;
