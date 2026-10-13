/* WhatsApp Business (API oficial de Meta, "Cloud API").
   Se activa con variables de entorno; si faltan, DOVA sigue funcionando y los
   recordatorios se mandan a mano desde la pantalla (enlace wa.me).
     WHATSAPP_TOKEN            token permanente del usuario del sistema
     WHATSAPP_PHONE_NUMBER_ID  id del número que envía
     WHATSAPP_PLANTILLA        nombre de la plantilla aprobada (recordatorio_turno)
     WHATSAPP_IDIOMA           idioma de la plantilla (es)
     WHATSAPP_APP_SECRET       secreto de la app: firma de los avisos que manda Meta
     WHATSAPP_VERIFY_TOKEN     texto para verificar el webhook al configurarlo
     WHATSAPP_PLANTILLA_PAGO, WHATSAPP_PLANTILLA_PRESUPUESTO  plantillas de los avisos de cobro
   Los mensajes que inicia la clínica tienen que usar una plantilla aprobada
   por Meta (ver docs/WHATSAPP.md). */
const crypto = require('crypto');

const cfg = () => ({
  token: process.env.WHATSAPP_TOKEN || '',
  numeroId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  plantilla: process.env.WHATSAPP_PLANTILLA || 'recordatorio_turno',
  idioma: process.env.WHATSAPP_IDIOMA || 'es',
  base: (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0').replace(/\/$/, ''),
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  // Plantillas de los avisos de cobro ({{1}} nombre, {{2}} clínica, {{3}} detalle, {{4}} enlace).
  plantillaPago: process.env.WHATSAPP_PLANTILLA_PAGO || 'aviso_pago',
  plantillaPresupuesto: process.env.WHATSAPP_PLANTILLA_PRESUPUESTO || 'seguimiento_presupuesto',
});

function configurado() { const c = cfg(); return !!(c.token && c.numeroId); }

/* Envía la plantilla con sus valores ({{1}}, {{2}}…). Devuelve el id del
   mensaje que da Meta (sirve para seguir si se entregó y se leyó). */
async function enviarPlantilla(telefono, valores, { numeroId, plantilla } = {}) {
  const c = cfg();
  if (!configurado()) throw new Error('WhatsApp no está configurado');
  // Número que envía: el del odontólogo (si está conectado) o el de la clínica.
  const desde = numeroId && /^\d{5,30}$/.test(String(numeroId)) ? String(numeroId) : c.numeroId;
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${c.base}/${encodeURIComponent(desde)}/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'template',
        template: { name: plantilla || c.plantilla, language: { code: c.idioma }, components: [{ type: 'body', parameters: valores.map((v) => ({ type: 'text', text: String(v).slice(0, 1000) })) }] },
      }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (datos.error && (datos.error.error_user_msg || datos.error.message)) || `HTTP ${r.status}`;
      throw new Error(`WhatsApp rechazó el mensaje: ${String(msg).slice(0, 300)}`);
    }
    return (datos.messages && datos.messages[0] && datos.messages[0].id) || null;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('WhatsApp no respondió a tiempo');
    throw e;
  } finally { clearTimeout(corte); }
}

// Firma de Meta: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(cuerpo crudo, app secret).
function firmaValida(cuerpoCrudo, firma) {
  const c = cfg();
  if (!c.appSecret || !cuerpoCrudo || typeof firma !== 'string' || !firma.startsWith('sha256=')) return false;
  const esperado = Buffer.from(`sha256=${crypto.createHmac('sha256', c.appSecret).update(cuerpoCrudo).digest('hex')}`);
  const recibido = Buffer.from(firma);
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

function tokenVerificacionValido(t) {
  const c = cfg();
  if (!c.verifyToken || typeof t !== 'string') return false;
  const a = Buffer.from(c.verifyToken); const b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { configurado, enviarPlantilla, firmaValida, tokenVerificacionValido, cfg };
