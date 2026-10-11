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

const MINUTOS_BLOQUEO = [0, 5, 10, 15, 30, 60, 120];
async function obtenerSeguridad(clinicaId) {
  const { query } = require('../../config/db');
  const r = await query('SELECT bloqueo_inactividad_min FROM clinicas WHERE id=$1', [clinicaId]);
  const c = r.rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  return { bloqueoMin: c.bloqueo_inactividad_min, opcionesBloqueo: MINUTOS_BLOQUEO };
}
async function actualizarSeguridad(clinicaId, datos, actor) {
  const { query } = require('../../config/db');
  const auditoria = require('../../utils/auditoria');
  const antes = await obtenerSeguridad(clinicaId);
  if (datos.bloqueoMin !== undefined) {
    const m = Number(datos.bloqueoMin);
    if (!MINUTOS_BLOQUEO.includes(m)) throw new ApiError(400, `El bloqueo por inactividad tiene que ser uno de: ${MINUTOS_BLOQUEO.join(', ')} minutos (0 = nunca).`);
    await query('UPDATE clinicas SET bloqueo_inactividad_min=$2, actualizado_en=now() WHERE id=$1', [clinicaId, m]);
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'politica_seguridad', modulo: 'seguridad', detalle: { antes: { bloqueoMin: antes.bloqueoMin }, despues: { bloqueoMin: m } } });
  }
  return obtenerSeguridad(clinicaId);
}

module.exports = { obtener, obtenerBrandingPublico, actualizar, obtenerSeguridad, actualizarSeguridad };
