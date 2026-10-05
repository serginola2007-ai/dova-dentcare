const service = require('./extras.service');

// Fotos clínicas
async function listarFotos(req, res, next) {
  try { res.json(await service.listarFotos(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
}
async function crearFoto(req, res, next) {
  try { res.status(201).json(await service.crearFoto(req.clinicaId, req.body || {}, req.file, req.usuario)); } catch (e) { next(e); }
}
async function actualizarFoto(req, res, next) {
  try { res.json(await service.actualizarFoto(req.clinicaId, Number(req.params.id), req.body || {}, req.usuario)); } catch (e) { next(e); }
}
async function archivoFoto(req, res, next) {
  try { enviarArchivo(res, await service.archivo(req.clinicaId, 'fotos_clinicas', Number(req.params.id)), req.query.descargar); } catch (e) { next(e); }
}
async function archivoEstudio(req, res, next) {
  try { enviarArchivo(res, await service.archivo(req.clinicaId, 'estudios', Number(req.params.id)), req.query.descargar); } catch (e) { next(e); }
}
async function actualizarEstudio(req, res, next) {
  try { res.json(await service.actualizarEstudio(req.clinicaId, Number(req.params.id), req.body || {}, req.usuario)); } catch (e) { next(e); }
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'application/dicom': 'dcm' };
function enviarArchivo(res, a, descargar) {
  const nombre = (a.nombre || `archivo.${EXT[a.mime] || 'bin'}`).replace(/[^\w.\- ]/g, '_');
  res.set({
    'Content-Type': a.mime,
    'Content-Length': a.datos.length,
    'Cache-Control': 'private, max-age=600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${descargar || a.mime === 'application/dicom' ? 'attachment' : 'inline'}; filename="${nombre}"`,
  });
  res.end(a.datos);
}
async function eliminarFoto(req, res, next) {
  try { res.json(await service.eliminarFoto(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}

// Estudios
async function listarEstudios(req, res, next) {
  try { res.json(await service.listarEstudios(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
}
async function crearEstudio(req, res, next) {
  try { res.status(201).json(await service.crearEstudio(req.clinicaId, req.body || {}, req.file, req.usuario)); } catch (e) { next(e); }
}
async function eliminarEstudio(req, res, next) {
  try { res.json(await service.eliminarEstudio(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}

// Consentimientos
async function listarConsentimientos(req, res, next) {
  try { res.json(await service.listarConsentimientos(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
}
async function plantillasConsentimiento(req, res, next) {
  try { res.json(await service.plantillasConsentimiento()); } catch (e) { next(e); }
}
async function crearConsentimiento(req, res, next) {
  try { res.status(201).json(await service.crearConsentimiento(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function firmarConsentimiento(req, res, next) {
  try { res.json(await service.firmarConsentimiento(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); }
}
async function anularConsentimiento(req, res, next) {
  try { res.json(await service.anularConsentimiento(req.clinicaId, Number(req.params.id), req.usuario)); } catch (e) { next(e); }
}

// Recetas
async function listarRecetas(req, res, next) {
  try { res.json(await service.listarRecetas(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
}
async function obtenerReceta(req, res, next) {
  try { res.json(await service.obtenerReceta(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); }
}
async function anularReceta(req, res, next) {
  try { res.json(await service.anularReceta(req.clinicaId, Number(req.params.id), req.body || {}, req.usuario)); } catch (e) { next(e); }
}
async function crearReceta(req, res, next) {
  try { res.status(201).json(await service.crearReceta(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}

// Lista de espera
async function listarListaEspera(req, res, next) {
  try { res.json(await service.listarListaEspera(req.clinicaId, { estado: req.query.estado })); } catch (e) { next(e); }
}
async function crearListaEspera(req, res, next) {
  try { res.status(201).json(await service.crearListaEspera(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function actualizarEstadoListaEspera(req, res, next) {
  try { res.json(await service.actualizarEstadoListaEspera(req.clinicaId, Number(req.params.id), req.body.estado, req.usuario)); } catch (e) { next(e); }
}

// Laboratorio
async function listarLaboratorio(req, res, next) {
  try {
    res.json(await service.listarLaboratorio(req.clinicaId, {
      pacienteId: req.query.pacienteId ? Number(req.query.pacienteId) : undefined,
      estado: req.query.estado,
    }));
  } catch (e) { next(e); }
}
async function crearLaboratorio(req, res, next) {
  try { res.status(201).json(await service.crearLaboratorio(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function actualizarLaboratorio(req, res, next) {
  try { res.json(await service.actualizarLaboratorio(req.clinicaId, Number(req.params.id), req.body, req.usuario)); } catch (e) { next(e); }
}

// WhatsApp
async function listarPlantillasWhatsapp(req, res, next) {
  try { res.json(await service.listarPlantillasWhatsapp()); } catch (e) { next(e); }
}
async function prepararMensajeWhatsapp(req, res, next) {
  try { res.json(await service.prepararMensajeWhatsapp(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); }
}
async function listarHistorialWhatsapp(req, res, next) {
  try {
    res.json(await service.listarHistorialWhatsapp(req.clinicaId, {
      pacienteId: req.query.pacienteId ? Number(req.query.pacienteId) : undefined,
    }));
  } catch (e) { next(e); }
}

module.exports = {
  listarFotos, crearFoto, eliminarFoto, actualizarFoto, archivoFoto,
  listarEstudios, crearEstudio, eliminarEstudio, actualizarEstudio, archivoEstudio,
  listarConsentimientos, plantillasConsentimiento, crearConsentimiento, firmarConsentimiento, anularConsentimiento,
  listarRecetas, obtenerReceta, crearReceta, anularReceta,
  listarListaEspera, crearListaEspera, actualizarEstadoListaEspera,
  listarLaboratorio, crearLaboratorio, actualizarLaboratorio,
  listarPlantillasWhatsapp, prepararMensajeWhatsapp, listarHistorialWhatsapp,
};
