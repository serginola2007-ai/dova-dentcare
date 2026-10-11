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
  const r = await query(`SELECT c.bloqueo_inactividad_min, c.exigir_2fa_admin,
      (SELECT count(*)::int FROM usuarios u JOIN roles ro ON ro.id=u.rol_id WHERE u.clinica_id=c.id AND u.activo AND u.eliminado_en IS NULL AND ro.codigo='admin') AS admins,
      (SELECT count(*)::int FROM usuarios u JOIN roles ro ON ro.id=u.rol_id WHERE u.clinica_id=c.id AND u.activo AND u.eliminado_en IS NULL AND ro.codigo='admin' AND u.totp_activo) AS admins_con_2fa
    FROM clinicas c WHERE c.id=$1`, [clinicaId]);
  const c = r.rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  return { bloqueoMin: c.bloqueo_inactividad_min, exigir2faAdmin: c.exigir_2fa_admin, admins: c.admins, adminsCon2fa: c.admins_con_2fa, opcionesBloqueo: MINUTOS_BLOQUEO };
}
async function actualizarSeguridad(clinicaId, datos, actor) {
  const { query } = require('../../config/db');
  const auditoria = require('../../utils/auditoria');
  const antes = await obtenerSeguridad(clinicaId);
  const cambios = {};
  if (datos.bloqueoMin !== undefined) {
    const m = Number(datos.bloqueoMin);
    if (!MINUTOS_BLOQUEO.includes(m)) throw new ApiError(400, `El bloqueo por inactividad tiene que ser uno de: ${MINUTOS_BLOQUEO.join(', ')} minutos (0 = nunca).`);
    cambios.bloqueo_inactividad_min = m;
  }
  if (datos.exigir2faAdmin !== undefined) {
    if (typeof datos.exigir2faAdmin !== 'boolean') throw new ApiError(400, 'exigir2faAdmin tiene que ser verdadero o falso.');
    if (datos.exigir2faAdmin && !antes.exigir2faAdmin) {
      if (actor.rolCodigo !== 'admin') throw new ApiError(403, 'Solo un administrador puede exigir la verificación en dos pasos.');
      const yo = await query('SELECT totp_activo FROM usuarios WHERE id=$1', [actor.id]);
      if (!yo.rows[0] || !yo.rows[0].totp_activo) throw new ApiError(409, 'Activá primero tu propia verificación en dos pasos (Configuración → Seguridad).');
    }
    if (!datos.exigir2faAdmin && antes.exigir2faAdmin && actor.rolCodigo !== 'admin') throw new ApiError(403, 'Solo un administrador puede dejar de exigir la verificación en dos pasos.');
    cambios.exigir_2fa_admin = datos.exigir2faAdmin;
  }
  const cols = Object.keys(cambios);
  if (cols.length) {
    await query(`UPDATE clinicas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE id=$1`, [clinicaId, ...cols.map((c) => cambios[c])]);
    require('../../middlewares/auth.middleware').olvidarUsuario();
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'politica_seguridad', modulo: 'seguridad', detalle: { antes: { bloqueoMin: antes.bloqueoMin, exigir2faAdmin: antes.exigir2faAdmin }, despues: cambios } });
  }
  return obtenerSeguridad(clinicaId);
}

module.exports = { obtener, obtenerBrandingPublico, actualizar, obtenerSeguridad, actualizarSeguridad };
