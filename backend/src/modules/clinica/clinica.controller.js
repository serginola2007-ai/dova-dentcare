const service = require('./clinica.service');

async function obtenerActual(req, res, next) {
  try {
    const clinica = await service.obtener(req.clinicaId);
    res.json(clinica);
  } catch (err) { next(err); }
}

async function brandingPublico(req, res, next) {
  try {
    const slug = req.query.slug || process.env.DOVA_CLINICA_POR_DEFECTO || 'dentcarerc';
    const branding = await service.obtenerBrandingPublico(slug);
    res.json(branding);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const clinica = await service.actualizar(req.clinicaId, req.body, req.usuario);
    res.json(clinica);
  } catch (err) { next(err); }
}

async function obtenerSeguridad(req, res, next) {
  try { res.json(await service.obtenerSeguridad(req.clinicaId)); } catch (err) { next(err); }
}
async function actualizarSeguridad(req, res, next) {
  try { res.json(await service.actualizarSeguridad(req.clinicaId, req.body || {}, req.usuario)); } catch (err) { next(err); }
}

async function plan(req, res, next) {
  try { res.json(await service.planDe(req.clinicaId)); } catch (err) { next(err); }
}

module.exports = { plan, obtenerActual, brandingPublico, actualizar, obtenerSeguridad, actualizarSeguridad };
