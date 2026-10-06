const express = require('express');
const controller = require('./extras.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { crearUploadMemoria, MIME_IMAGENES, MIME_ESTUDIOS } = require('../../utils/upload');

// Los archivos se guardan en la base (ver migración 0030).
const uploadFotos = crearUploadMemoria(MIME_IMAGENES, 10);
const uploadEstudios = crearUploadMemoria([...MIME_ESTUDIOS, 'application/octet-stream'], 25);
const VER_CLINICO = ['fotos_clinicas.manage', 'estudios.manage', 'pacientes.clinical.view', 'historia_clinica.view'];

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);

// Fotos clínicas
router.get('/fotos/paciente/:pacienteId', requirePermiso('fotos_clinicas.manage', 'pacientes.clinical.view', 'historia_clinica.view'), controller.listarFotos);
router.get('/fotos/:id/archivo', requirePermiso(...VER_CLINICO), controller.archivoFoto);
router.post('/fotos', requirePermiso('fotos_clinicas.manage'), uploadFotos.single('archivo'), controller.crearFoto);
router.patch('/fotos/:id', requirePermiso('fotos_clinicas.manage'), controller.actualizarFoto);
router.delete('/fotos/:id', requirePermiso('fotos_clinicas.manage'), controller.eliminarFoto);

// Estudios
router.get('/estudios/paciente/:pacienteId', requirePermiso('estudios.manage', 'pacientes.clinical.view', 'historia_clinica.view'), controller.listarEstudios);
router.get('/estudios/:id/archivo', requirePermiso(...VER_CLINICO), controller.archivoEstudio);
router.post('/estudios', requirePermiso('estudios.manage'), uploadEstudios.single('archivo'), controller.crearEstudio);
router.patch('/estudios/:id', requirePermiso('estudios.manage'), controller.actualizarEstudio);
router.delete('/estudios/:id', requirePermiso('estudios.manage'), controller.eliminarEstudio);
// Compartir (o dejar de compartir) un estudio con el paciente en su cuenta web.
router.post('/estudios/:id/compartir', requirePermiso('estudios.manage'), async (req, res, next) => {
  try {
    const { query } = require('../../config/db');
    const visible = req.body && req.body.visible === true;
    const e = (await query(`UPDATE estudios SET visible_paciente=$3, compartido_por=CASE WHEN $3 THEN $4::int END, compartido_en=CASE WHEN $3 THEN now() END
                            WHERE clinica_id=$1 AND id=$2 AND (archivo IS NOT NULL OR storage_path IS NOT NULL) RETURNING id, paciente_id, visible_paciente`, [req.clinicaId, Number(req.params.id), visible, req.usuario.id])).rows[0];
    if (!e) { const { ApiError } = require('../../middlewares/error.middleware'); throw new ApiError(404, 'Estudio no encontrado o sin archivo'); }
    await require('../../utils/auditoria').registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: visible ? 'compartir_estudio_paciente' : 'dejar_de_compartir_estudio', modulo: 'pacientes', entidadId: e.id, detalle: { pacienteId: e.paciente_id } });
    res.json(e);
  } catch (er) { next(er); }
});

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
router.post('/recetas/:id/anular', requirePermiso('recetas.manage'), controller.anularReceta);

// Lista de espera
router.get('/lista-espera', requirePermiso('lista_espera.manage', 'agenda.view'), controller.listarListaEspera);
router.post('/lista-espera', requirePermiso('lista_espera.manage'), controller.crearListaEspera);
router.patch('/lista-espera/:id/estado', requirePermiso('lista_espera.manage'), controller.actualizarEstadoListaEspera);

// Laboratorio
router.get('/laboratorio', requirePermiso('laboratorio.manage'), controller.listarLaboratorio);
router.post('/laboratorio', requirePermiso('laboratorio.manage'), controller.crearLaboratorio);
router.patch('/laboratorio/:id', requirePermiso('laboratorio.manage'), controller.actualizarLaboratorio);
router.use('/', require('./laboratorio.archivos'));

// WhatsApp (solo prepara mensajes, nunca los envía automáticamente)
router.get('/whatsapp/plantillas', requirePermiso('whatsapp.send'), controller.listarPlantillasWhatsapp);
router.post('/whatsapp/preparar', requirePermiso('whatsapp.send'), controller.prepararMensajeWhatsapp);
router.get('/whatsapp/historial', requirePermiso('whatsapp.send', 'seguimiento.view'), controller.listarHistorialWhatsapp);

module.exports = router;
