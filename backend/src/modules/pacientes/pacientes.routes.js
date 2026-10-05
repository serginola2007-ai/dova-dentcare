const express = require('express');
const controller = require('./pacientes.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const {
  crearPacienteValidators, actualizarPacienteValidators, listarPacientesValidators,
} = require('./pacientes.validators');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

router.get('/', requirePermiso('pacientes.view'), listarPacientesValidators, controller.listar);
router.get('/:id', requirePermiso('pacientes.view'), controller.obtener);
router.post('/', requirePermiso('pacientes.create'), crearPacienteValidators, controller.crear);
router.put('/:id', requirePermiso('pacientes.edit'), actualizarPacienteValidators, controller.actualizar);
router.get('/:id/baja-resumen', requirePermiso('pacientes.delete'), controller.resumenBaja);
router.delete('/:id', requirePermiso('pacientes.delete'), controller.eliminar);
router.post('/:id/restaurar', requirePermiso('pacientes.delete'), controller.restaurar);

module.exports = router;
