/* Verificación en dos pasos (TOTP, RFC 6238): el código de 6 dígitos que
   muestran Google Authenticator, Microsoft Authenticator, Authy, etc.
   - El secreto se guarda CIFRADO (AES-256-GCM). La clave sale de
     TOTP_CLAVE_CIFRADO o, si no está, de JWT_REFRESH_SECRET (HKDF). Con la
     base sola no alcanza para generar códigos.
   - Cada código sirve una sola vez (se guarda el último paso usado).
   - Códigos de recuperación: solo se guarda su hash. */
const crypto = require('crypto');
const env = require('../config/env');

const PASO_SEG = 30;
const DIGITOS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = 0; let valor = 0; let out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}
function deBase32(txt) {
  const limpio = String(txt).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let valor = 0; const out = [];
  for (const c of limpio) {
    valor = (valor << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function nuevoSecreto() { return base32(crypto.randomBytes(20)); }

function codigoEnPaso(secretoB32, paso) {
  const clave = deBase32(secretoB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(paso));
  const h = crypto.createHmac('sha1', clave).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const num = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(num % 10 ** DIGITOS).padStart(DIGITOS, '0');
}
function pasoActual(ahoraMs = Date.now()) { return Math.floor(ahoraMs / 1000 / PASO_SEG); }

/* Devuelve el paso que coincidió (para no aceptar el mismo código dos veces)
   o null. Tolera un paso de diferencia de reloj hacia cada lado. */
function verificar(secretoB32, codigo, { ultimoPaso = null, ahoraMs = Date.now() } = {}) {
  const c = String(codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const actual = pasoActual(ahoraMs);
  for (const d of [0, -1, 1]) {
    const p = actual + d;
    if (ultimoPaso !== null && ultimoPaso !== undefined && p <= Number(ultimoPaso)) continue;
    const esperado = codigoEnPaso(secretoB32, p);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(c))) return p;
  }
  return null;
}

function uri({ secreto, cuenta, emisor = 'DOVA' }) {
  const e = encodeURIComponent(emisor);
  return `otpauth://totp/${e}:${encodeURIComponent(cuenta)}?secret=${secreto}&issuer=${e}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEG}`;
}

function qrSvg(texto) {
  const qrcode = require('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

// ---- cifrado del secreto ----
let claveCache = null;
function claveCifrado() {
  if (claveCache) return claveCache;
  const base = process.env.TOTP_CLAVE_CIFRADO || env.jwtRefreshSecret;
  claveCache = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(base)), Buffer.from('dova-totp-sal'), Buffer.from('dova-totp-v1'), 32));
  return claveCache;
}
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', claveCifrado(), iv);
  const ct = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
}
function descifrar(guardado) {
  if (!guardado || !String(guardado).startsWith('v1:')) return null;
  try {
    const b = Buffer.from(String(guardado).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', claveCifrado(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (_e) { return null; }
}

// ---- códigos de recuperación ----
function hashRecuperacion(codigo) {
  const n = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', claveCifrado()).update(`rec:${n}`).digest('hex');
}
function nuevosCodigosRecuperacion(cantidad = 10) {
  const alf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
  const codigos = [];
  for (let i = 0; i < cantidad; i += 1) {
    const b = crypto.randomBytes(8);
    let s = '';
    for (let j = 0; j < 8; j += 1) s += alf[b[j] % alf.length];
    codigos.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return { codigos, hashes: codigos.map(hashRecuperacion) };
}
const pareceRecuperacion = (c) => /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(String(c || '').trim());

module.exports = { nuevoSecreto, verificar, codigoEnPaso, pasoActual, uri, qrSvg, cifrar, descifrar, hashRecuperacion, nuevosCodigosRecuperacion, pareceRecuperacion, PASO_SEG };
