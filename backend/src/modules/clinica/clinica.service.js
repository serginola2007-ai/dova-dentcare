const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./clinica.repository');

async function obtener(clinicaId) {
  const clinica = await repo.findById(clinicaId);
  if (!clinica) throw new ApiError(404, 'Clínica no encontrada');
  return clinica;
}

async function planDe(clinicaId) {
  const { query } = require('../../config/db');
  const r = await query('SELECT plan, modulos_extra, modulos_quitar, mensualidad FROM clinicas WHERE id=$1', [clinicaId]);
  if (!r.rowCount) throw new ApiError(404, 'Clínica no encontrada');
  return require('../../config/planes').detallePlan(r.rows[0]);
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

const LARGOS = { nombre: 150, color_primario: 20, color_secundario: 20, telefono: 40, whatsapp: 40, email: 150, ruc: 40, moneda: 10 };
async function actualizar(clinicaId, campos, actor) {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) throw new ApiError(400, 'Datos inválidos');
  const filtrados = {};
  for (const key of CAMPOS_EDITABLES) {
    const v = campos[key];
    if (v === undefined) continue;
    // Solo texto: una lista o un objeto se guardaba como '{"x"}' (QA).
    if (v !== null && typeof v !== 'string') throw new ApiError(400, `El dato "${key}" tiene un formato inválido`);
    const t = v === null ? null : v.trim();
    if (t && t.length > (LARGOS[key] || 2000)) throw new ApiError(400, `El dato "${key}" es demasiado largo`);
    if (key === 'nombre' && !t) throw new ApiError(400, 'El nombre de la clínica es obligatorio');
    if ((key === 'color_primario' || key === 'color_secundario') && t && !/^#[0-9a-fA-F]{6}$/.test(t)) throw new ApiError(400, 'El color tiene que tener la forma #RRGGBB');
    if (key === 'email' && t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw new ApiError(400, 'El email no es válido');
    filtrados[key] = t || null;
  }
  const antes = await repo.findById(clinicaId);
  const actualizada = await repo.update(clinicaId, filtrados);
  if (actor) {
    const cambios = Object.keys(filtrados).filter((k) => (antes ? antes[k] : null) !== filtrados[k]);
    if (cambios.length) {
      await require('../../utils/auditoria').registrar({
        clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'editar', modulo: 'clinica', entidadId: clinicaId,
        detalle: { antes: Object.fromEntries(cambios.map((k) => [k, antes ? antes[k] : null])), despues: Object.fromEntries(cambios.map((k) => [k, filtrados[k]])) },
      });
    }
  }
  // Opcional: los mismos datos de contacto en la página web de la clínica.
  if (campos.actualizarWeb === true) {
    const { query } = require('../../config/db');
    const w = ['direccion', 'telefono', 'whatsapp', 'email', 'instagram', 'facebook'].filter((k) => filtrados[k] !== undefined);
    if (w.length) await query(`UPDATE web_config SET ${w.map((k, i) => `${k}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE clinica_id=$1`, [clinicaId, ...w.map((k) => filtrados[k])]);
  }
  return actualizada;
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

module.exports = {
  planDe, obtener, obtenerBrandingPublico, actualizar, obtenerSeguridad, actualizarSeguridad };
