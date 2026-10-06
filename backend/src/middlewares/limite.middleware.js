/* Límite de pedidos por IP (o por usuario) con ventana deslizante en memoria.
   Protege contra fuerza bruta, relleno de credenciales, enumeración y abuso
   automatizado. Con un solo servidor (Render) alcanza; con varios habría que
   moverlo a un almacenamiento compartido. */
const { ApiError } = require('./error.middleware');

function limitar({ nombre, max, ventanaSeg, clave = (req) => req.ip, mensaje }) {
  const marcas = new Map();
  setInterval(() => { const corte = Date.now() - ventanaSeg * 1000; for (const [k, l] of marcas) { const f = l.filter((t) => t > corte); if (f.length) marcas.set(k, f); else marcas.delete(k); } }, Math.max(10, ventanaSeg) * 1000).unref();
  return (req, res, next) => {
    const k = `${nombre}|${clave(req) || 'anon'}`;
    const ahora = Date.now(); const corte = ahora - ventanaSeg * 1000;
    const l = (marcas.get(k) || []).filter((t) => t > corte);
    if (l.length >= max) {
      const espera = Math.max(1, Math.ceil((l[0] + ventanaSeg * 1000 - ahora) / 1000));
      res.set('Retry-After', String(espera));
      return next(new ApiError(429, mensaje || `Demasiados pedidos seguidos. Esperá ${espera} segundo${espera === 1 ? '' : 's'} y volvé a intentar.`));
    }
    l.push(ahora); marcas.set(k, l);
    if (marcas.size > 50000) marcas.clear();
    return next();
  };
}

// Usuario autenticado (si el token es válido se usa su id; si no, la IP).
const porUsuario = (req) => {
  try {
    const [, tok] = String(req.headers.authorization || '').split(' ');
    if (!tok) return req.ip;
    const pl = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
    return `u${pl.sub}`;
  } catch (_e) { return req.ip; }
};

module.exports = { limitar, porUsuario };
