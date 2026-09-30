const fs = require('fs');
const service = require('./helpdesk.service');
const { ApiError } = require('../../middlewares/error.middleware');

async function listar(req, res, next) {
  try { res.json(await service.listar(req.clinicaId, req.usuario, req.query)); } catch (e) { next(e); }
}
async function obtener(req, res, next) {
  try { res.json(await service.obtener(req.clinicaId, req.params.id, req.usuario)); } catch (e) { next(e); }
}
async function crear(req, res, next) {
  try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function cambiarEstado(req, res, next) {
  try { res.json(await service.cambiarEstado(req.clinicaId, req.params.id, req.body.estado, req.body.resolucion, req.usuario)); } catch (e) { next(e); }
}
async function asignar(req, res, next) {
  try { res.json(await service.asignar(req.clinicaId, req.params.id, req.body.asignadoId, req.usuario)); } catch (e) { next(e); }
}
async function agregarMensaje(req, res, next) {
  try { res.status(201).json(await service.agregarMensaje(req.clinicaId, req.params.id, req.body.contenido, req.usuario)); } catch (e) { next(e); }
}
async function agregarAdjunto(req, res, next) {
  try {
    if (!req.file) throw new ApiError(400, 'No se recibió ningún archivo');
    const adjunto = await service.agregarAdjunto(req.clinicaId, req.params.id, req.body.mensajeId || null, req.usuario, req.file);
    res.status(201).json(adjunto);
  } catch (e) { next(e); }
}
async function descargarAdjunto(req, res, next) {
  try {
    const adjunto = await service.obtenerAdjuntoParaDescarga(req.clinicaId, req.params.adjuntoId, req.usuario);
    res.download(adjunto.storage_path, adjunto.nombre_original);
  } catch (e) { next(e); }
}
async function metricas(req, res, next) {
  try { res.json(await service.metricas(req.clinicaId)); } catch (e) { next(e); }
}
async function ejecutarLimpieza(req, res, next) {
  try { res.json(await service.ejecutarLimpiezaRetencion()); } catch (e) { next(e); }
}

module.exports = {
  listar, obtener, crear, cambiarEstado, asignar, agregarMensaje,
  agregarAdjunto, descargarAdjunto, metricas, ejecutarLimpieza,
};
