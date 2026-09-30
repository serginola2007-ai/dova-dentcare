const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./clinica.repository');

async function obtener(clinicaId) {
  const clinica = await repo.findById(clinicaId);
  if (!clinica) throw new ApiError(404, 'Clínica no encontrada');
  return clinica;
}

async function obtenerBrandingPublico(slug) {
  const clinica = await repo.findBySlug(slug);
  if (!clinica) throw new ApiError(404, 'Clínica no encontrada');
  return {
    nombre: clinica.nombre,
    logoUrl: clinica.logo_url,
    faviconUrl: clinica.favicon_url,
    colorPrimario: clinica.color_primario,
    colorSecundario: clinica.color_secundario,
  };
}

const CAMPOS_EDITABLES = [
  'nombre', 'logo_url', 'favicon_url', 'color_primario', 'color_secundario',
  'direccion', 'telefono', 'whatsapp', 'email', 'sitio_web', 'instagram',
  'facebook', 'horario_atencion', 'ruc', 'moneda',
];

async function actualizar(clinicaId, campos) {
  const filtrados = {};
  for (const key of CAMPOS_EDITABLES) {
    if (campos[key] !== undefined) filtrados[key] = campos[key];
  }
  return repo.update(clinicaId, filtrados);
}

module.exports = { obtener, obtenerBrandingPublico, actualizar };
