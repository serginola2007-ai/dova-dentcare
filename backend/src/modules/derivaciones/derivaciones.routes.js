const express = require('express');
const controller = require('./derivaciones.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { crearUploadMemoria, MIME_ESTUDIOS } = require('../../utils/upload');

const uploadAdjunto = crearUploadMemoria(MIME_ESTUDIOS, 25);

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/', requirePermiso('derivaciones.manage', 'pacientes.clinical.view'), controller.listar);
router.get('/:id', requirePermiso('derivaciones.manage', 'pacientes.clinical.view'), controller.obtener);
router.get('/:id/archivo', requirePermiso('derivaciones.manage', 'pacientes.clinical.view'), controller.archivo);
router.post('/', requirePermiso('derivaciones.manage'), uploadAdjunto.single('archivo'), controller.crear);
router.patch('/:id/estado', requirePermiso('derivaciones.manage'), controller.cambiarEstado);

module.exports = router;
