/* Envío de emails (códigos de la cuenta del paciente, avisos de pagos).
   Opción recomendada (funciona en el plan gratis de Render, que BLOQUEA el
   SMTP): Brevo, por su API web. Variables:
     BREVO_API_KEY  la clave de API de brevo.com (gratis, 300 emails por día)
     MAIL_REMITENTE el email remitente, verificado en Brevo (ej. dentcarerc@gmail.com)
     MAIL_NOMBRE    nombre que ve el paciente (opcional, ej. DentCare)
   Alternativa con servidor pago: SMTP con
     SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE (true para 465)
   Ejemplo con Gmail: SMTP_HOST=smtp.gmail.com, SMTP_USER=la cuenta, SMTP_PASS=una
   "contraseña de aplicación" (no la contraseña normal).
   Para pruebas: MAIL_TRANSPORTE=archivo y MAIL_ARCHIVO=/ruta/emails.jsonl
   guarda cada email en un archivo en vez de mandarlo. */
const fs = require('fs');

let transporte = null;
function modo() {
  if (process.env.MAIL_TRANSPORTE === 'archivo' && process.env.MAIL_ARCHIVO) return 'archivo';
  if (process.env.BREVO_API_KEY && (process.env.MAIL_REMITENTE || process.env.SMTP_FROM)) return 'brevo';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return null;
}
const configurado = () => !!modo();

function obtenerTransporte() {
  if (transporte) return transporte;
  const nodemailer = require('nodemailer');
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return transporte;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Plantilla simple con los colores de la clínica.
function html(titulo, parrafos, clinica) {
  return `<div style="background:#F7EEE1;padding:24px;font-family:Arial,sans-serif;color:#2B241E">
    <div style="max-width:520px;margin:0 auto;background:#FBF6EE;border-radius:16px;padding:28px">
      <p style="margin:0 0 4px;font-family:Georgia,serif;font-style:italic;color:#8F4F32">${esc(clinica || 'dentcarerc')}</p>
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 16px">${esc(titulo)}</h1>
      ${parrafos.join('')}
      <p style="margin-top:24px;font-size:12px;color:#5B5148">Este mensaje lo envió la página web de ${esc(clinica || 'la clínica')}. Si no lo pediste, ignoralo.</p>
    </div></div>`;
}

async function enviar({ para, asunto, texto, htmlCuerpo }) {
  const m = modo();
  if (!m) throw Object.assign(new Error('El envío de emails no está configurado'), { codigo: 'SIN_CORREO' });
  const msg = { from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-responder@dova.local', to: para, subject: asunto, text: texto, html: htmlCuerpo };
  if (m === 'archivo') { fs.appendFileSync(process.env.MAIL_ARCHIVO, JSON.stringify({ ...msg, fecha: new Date().toISOString() }) + '\n'); return { ok: true }; }
  if (m === 'brevo') {
    const r = await fetch(process.env.BREVO_URL || 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_REMITENTE || process.env.SMTP_FROM, name: process.env.MAIL_NOMBRE || 'DentCare' },
        to: [{ email: para }], subject: asunto, textContent: texto, htmlContent: htmlCuerpo || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { ok: true };
  }
  await obtenerTransporte().sendMail(msg);
  return { ok: true };
}

module.exports = { configurado, enviar, html, esc };
