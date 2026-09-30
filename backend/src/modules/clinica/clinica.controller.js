const service = require('./clinica.service');

async function obtenerActual(req, res, next) {
  try {
    const clinica = await service.obtener(req.clinicaId);
    res.json(clinica);
  } catch (err) { next(err); }
}

async function brandingPublico(req, res, next) {
  try {
    const slug = req.query.slug || 'dentcarerc';
    const branding = await service.obtenerBrandingPublico(slug);
    res.json(branding);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const clinica = await service.actualizar(req.clinicaId, req.body);
    res.json(clinica);
  } catch (err) { next(err); }
}

module.exports = { obtenerActual, brandingPublico, actualizar };
