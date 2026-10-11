/* Avisos de seguridad para los administradores de la clínica (campanita).
   Se disparan ante hechos que merecen una mirada humana: cuentas bloqueadas
   por intentos fallidos, un token de sesión robado y reutilizado, cambios en
   la verificación en dos pasos, alguien que falla el segundo paso con la
   contraseña correcta. Un mismo aviso no se repite más de una vez cada
   10 minutos. Nunca interrumpen el flujo que los dispara. */
const { query } = require('../config/db');

const recientes = new Map();
const REPETIR_MS = 10 * 60 * 1000;

async function alertarAdmins(clinicaId, { clave, titulo, mensaje, alUsuario = null }) {
  try {
    if (!clinicaId) return;
    const k = `${clinicaId}|${clave || titulo}`;
    const t = recientes.get(k);
    if (t && Date.now() - t < REPETIR_MS) return;
    recientes.set(k, Date.now());
    if (recientes.size > 5000) recientes.clear();
    const notif = require('../modules/notificaciones/notificaciones.service');
    const admins = await query(
      `SELECT u.id FROM usuarios u JOIN roles r ON r.id=u.rol_id
       WHERE u.clinica_id=$1 AND u.activo AND u.eliminado_en IS NULL AND r.codigo='admin'`, [Number(clinicaId)]);
    const destino = new Set(admins.rows.map((r) => r.id));
    if (alUsuario) destino.add(Number(alUsuario));
    for (const id of destino) {
      await notif.notificar(clinicaId, id, { tipo: 'seguridad', titulo: String(titulo).slice(0, 150), mensaje: String(mensaje || '').slice(0, 500), entidad: 'seguridad', ruta: 'configuracion' });
    }
  } catch (e) {
    console.error('[alertas] no se pudo avisar:', e.message);
  }
}

module.exports = { alertarAdmins };
