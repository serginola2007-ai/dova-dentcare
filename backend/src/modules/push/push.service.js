/* Avisos push (Web Push, VAPID). Sin VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no se ofrece.
   Por privacidad, el aviso lleva un título genérico y la ruta: el detalle (nombres de pacientes, montos)
   se ve al abrir DOVA, no en la pantalla bloqueada. */
const webpush = require('web-push');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');

const PUB = () => process.env.VAPID_PUBLIC_KEY || '';
const PRIV = () => process.env.VAPID_PRIVATE_KEY || '';
const habilitado = () => !!(PUB() && PRIV());

let enviador = (sub, payload) => webpush.sendNotification(sub, payload, {
  TTL: 60 * 60 * 12,
  vapidDetails: { subject: process.env.VAPID_SUBJECT || process.env.PUBLIC_URL || 'mailto:soporte@dova.app', publicKey: PUB(), privateKey: PRIV() },
  timeout: 8000,
});
function setEnviador(fn) { enviador = fn; } // para pruebas

function validar(s) {
  const ok = s && typeof s.endpoint === 'string' && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  if (!ok) throw new ApiError(400, 'Suscripción inválida');
  let u; try { u = new URL(s.endpoint); } catch (_e) { throw new ApiError(400, 'Suscripción inválida'); }
  if (u.protocol !== 'https:' || s.endpoint.length > 1000 || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) throw new ApiError(400, 'Suscripción inválida');
}

async function guardar(clinicaId, usuarioId, sub, dispositivo) {
  validar(sub);
  await query(
    `INSERT INTO push_suscripciones (clinica_id, usuario_id, endpoint, p256dh, auth, dispositivo) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (endpoint) DO UPDATE SET clinica_id=$1, usuario_id=$2, p256dh=$4, auth=$5, dispositivo=$6`,
    [clinicaId, usuarioId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(dispositivo || '').slice(0, 200) || null]
  );
}

async function quitar(clinicaId, usuarioId, endpoint) {
  await query('DELETE FROM push_suscripciones WHERE clinica_id=$1 AND usuario_id=$2 AND endpoint=$3', [clinicaId, usuarioId, String(endpoint || '')]);
}

async function estado(clinicaId, usuarioId, endpoint) {
  const r = await query('SELECT endpoint FROM push_suscripciones WHERE clinica_id=$1 AND usuario_id=$2', [clinicaId, usuarioId]);
  return { habilitado: habilitado(), clavePublica: habilitado() ? PUB() : null, dispositivos: r.rows.length, esteDispositivo: !!endpoint && r.rows.some((x) => x.endpoint === endpoint) };
}

/** Manda el aviso a todos los dispositivos del usuario. Nunca lanza: no debe tumbar el flujo que lo origina. */
async function enviar(clinicaId, usuarioId, { titulo, ruta, tipo }) {
  if (!habilitado()) return { enviados: 0 };
  let enviados = 0;
  try {
    const r = await query('SELECT id, endpoint, p256dh, auth FROM push_suscripciones WHERE clinica_id=$1 AND usuario_id=$2', [clinicaId, usuarioId]);
    const payload = JSON.stringify({ titulo: tipo === 'prueba' ? String(titulo).slice(0, 100) : 'Tenés un aviso nuevo en DOVA', cuerpo: 'Abrí DOVA para ver el detalle.', ruta: ruta || null, tipo: tipo || null });
    await Promise.all(r.rows.map(async (s) => {
      try {
        await enviador({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        enviados += 1;
        await query('UPDATE push_suscripciones SET ultimo_envio=now() WHERE id=$1', [s.id]);
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) await query('DELETE FROM push_suscripciones WHERE id=$1', [s.id]);
        else console.error('[push] no se pudo enviar', err && (err.statusCode || err.message));
      }
    }));
  } catch (err) { console.error('[push] error', err.message); }
  return { enviados };
}

module.exports = { habilitado, guardar, quitar, estado, enviar, setEnviador };
