/* Cookies de sesión (HttpOnly, SameSite=Strict, ruta restringida, Secure en https)
   y control anti-CSRF para los endpoints que las usan. Sin dependencias. */
const seg = require('../config/seguridad');
const { ApiError } = require('../middlewares/error.middleware');

function leer(req, nombre) {
  const h = String(req.headers.cookie || '');
  for (const parte of h.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch (_e) { return null; }
    }
  }
  return null;
}

function poner(req, res, { nombre, ruta }, valor, maxAgeSeg) {
  const secure = seg.cookies.siempreSecure || req.secure;
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, `Path=${ruta}`, 'HttpOnly', `SameSite=${seg.cookies.sameSite === 'lax' ? 'Lax' : 'Strict'}`, `Max-Age=${Math.max(0, Math.floor(maxAgeSeg))}`];
  if (secure) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}
function borrar(req, res, cfg) { poner(req, res, cfg, '', 0); }

/* CSRF: con cookies SameSite=Strict el navegador ya no las manda desde otros
   sitios; además se exige una cabecera propia (que un formulario o un enlace
   de otro sitio no pueden agregar sin pasar por CORS) y, si viene Origin,
   que sea el propio sitio o uno autorizado. */
function exigirAntiCsrf(req) {
  if (req.get(seg.csrfCabecera) !== '1') throw new ApiError(403, 'Pedido rechazado (falta la verificación anti-CSRF)');
  const origin = req.get('Origin');
  if (origin) {
    const propio = `${req.protocol}://${req.get('host')}`;
    const permitidos = require('../config/env').corsOrigin;
    if (origin !== propio && !permitidos.includes(origin)) throw new ApiError(403, 'Origen no permitido');
  }
}

module.exports = { leer, poner, borrar, exigirAntiCsrf };
