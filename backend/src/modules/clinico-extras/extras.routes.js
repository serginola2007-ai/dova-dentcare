const express = require('express');
const controller = require('./extras.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { crearUpload, MIME_IMAGENES, MIME_ESTUDIOS } = require('../../utils/upload');

const uploadFotos = crearUpload('fotos-clinicas', MIME_IMAGENES, 10);
const uploadEstudios = crearUpload('estudios', MIME_ESTUDIOS, 25);

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Fotos clínicas
router.get('/fotos/paciente/:pacienteId', requirePermiso('fotos_clinicas.manage', 'pacientes.clinical.view'), controller.listarFotos);
router.post('/fotos', requirePermiso('fotos_clinicas.manage'), uploadFotos.single('archivo'), controller.crearFoto);
router.delete('/fotos/:id', requirePermiso('fotos_clinicas.manage'), controller.eliminarFoto);

// Estudios
router.get('/estudios/paciente/:pacienteId', requirePermiso('estudios.manage', 'pacientes.clinical.view'), controller.listarEstudios);
router.post('/estudios', requirePermiso('estudios.manage'), uploadEstudios.single('archivo'), controller.crearEstudio);
router.delete('/estudios/:id', requirePermiso('estudios.manage'), controller.eliminarEstudio);

// Consentimientos
router.get('/consentimientos/plantillas', requirePermiso('consentimientos.manage'), controller.plantillasConsentimiento);
router.get('/consentimientos/paciente/:pacienteId', requirePermiso('consentimientos.manage', 'pacientes.clinical.view'), controller.listarConsentimientos);
router.post('/consentimientos', requirePermiso('consentimientos.manage'), controller.crearConsentimiento);
router.post('/consentimientos/:id/firmar', requirePermiso('consentimientos.manage'), controller.firmarConsentimiento);
router.post('/consentimientos/:id/anular', requirePermiso('consentimientos.manage'), controller.anularConsentimiento);

// Recetas
router.get('/recetas/paciente/:pacienteId', requirePermiso('recetas.manage', 'pacientes.clinical.view'), controller.listarRecetas);
router.get('/recetas/:id', requirePermiso('recetas.manage', 'pacientes.clinical.view'), controller.obtenerReceta);
router.post('/recetas', requirePermiso('recetas.manage'), controller.crearReceta);

// Lista de espera
router.get('/lista-espera', requirePermiso('lista_espera.manage', 'agenda.view'), controller.listarListaEspera);
router.post('/lista-espera', requirePermiso('lista_espera.manage'), controller.crearListaEspera);
router.patch('/lista-espera/:id/estado', requirePermiso('lista_espera.manage'), controller.actualizarEstadoListaEspera);

// Laboratorio
router.get('/laboratorio', requirePermiso('laboratorio.manage'), controller.listarLaboratorio);
router.post('/laboratorio', requirePermiso('laboratorio.manage'), controller.crearLaboratorio);
router.patch('/laboratorio/:id', requirePermiso('laboratorio.manage'), controller.actualizarLaboratorio);

// WhatsApp (solo prepara mensajes, nunca los envía automáticamente)
router.get('/whatsapp/plantillas', requirePermiso('whatsapp.send'), controller.listarPlantillasWhatsapp);
router.post('/whatsapp/preparar', requirePermiso('whatsapp.send'), controller.prepararMensajeWhatsapp);
router.get('/whatsapp/historial', requirePermiso('whatsapp.send', 'seguimiento.view'), controller.listarHistorialWhatsapp);

module.exports = router;
