/* Límite de pedidos (fuerza bruta, relleno de credenciales, enumeración y
   abuso automatizado).

   El conteo vive en un "almacén" con una interfaz mínima:
       contar(clave, ventanaSeg) -> Promise<{ cuenta, esperaSeg }>
   - memoria  : ventana deslizante en el proceso (un solo servidor; Render hoy).
   - postgres : ventana fija en una tabla UNLOGGED (migración 0041); sirve con
                varias instancias sin infraestructura extra.
   - Redis    : basta con escribir otro almacén con la misma interfaz
                (INCR + EXPIRE) y elegirlo en crearAlmacen().
   Solo los límites marcados "compartido" (login, renovación, contraseña,
   portal) usan el almacén configurado; los de alto volumen siguen en memoria
   para no sumar una escritura en la base a cada pedido. */
const jwt = require('jsonwebtoken');
const { ApiError } = require('./error.middleware');
const seg = require('../config/seguridad');

function almacenMemoria() {
  const marcas = new Map();
  setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of marcas) { const f = v.l.filter((t) => t > ahora - v.ventana); if (f.length) v.l = f; else marcas.delete(k); }
  }, 30000).unref();
  return {
    nombre: 'memoria',
    async contar(clave, ventanaSeg) {
      const ahora = Date.now(); const ventana = ventanaSeg * 1000;
      const v = marcas.get(clave) || { l: [], ventana };
      v.l = v.l.filter((t) => t > ahora - ventana);
      v.l.push(ahora); marcas.set(clave, v);
      if (marcas.size > 50000) { marcas.clear(); }
      return { cuenta: v.l.length, esperaSeg: Math.max(1, Math.ceil((v.l[0] + ventana - ahora) / 1000)) };
    },
  };
}

function almacenPostgres() {
  const { query } = require('../config/db');
  let ultimaLimpieza = 0;
  return {
    nombre: 'postgres',
    async contar(clave, ventanaSeg) {
      const r = (await query(
        `INSERT INTO limites_pedidos (clave, inicio, cuenta) VALUES ($1, now(), 1)
         ON CONFLICT (clave) DO UPDATE SET
           cuenta = CASE WHEN limites_pedidos.inicio < now() - make_interval(secs => $2) THEN 1 ELSE limites_pedidos.cuenta + 1 END,
           inicio = CASE WHEN limites_pedidos.inicio < now() - make_interval(secs => $2) THEN now() ELSE limites_pedidos.inicio END
         RETURNING cuenta, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (inicio + make_interval(secs => $2) - now()))))::int AS espera`,
        [clave.slice(0, 200), ventanaSeg],
      )).rows[0];
      if (Date.now() - ultimaLimpieza > 600000) {
        ultimaLimpieza = Date.now();
        query("DELETE FROM limites_pedidos WHERE inicio < now() - interval '1 day'").catch(() => {});
      }
      return { cuenta: r.cuenta, esperaSeg: r.espera };
    },
  };
}

const memoria = almacenMemoria();
let compartido = memoria;
function crearAlmacen() {
  if (seg.limites.almacenPedido !== seg.limites.almacen) {
    console.warn(`[seguridad] RATE_LIMIT_STORE="${seg.limites.almacenPedido}" no está disponible; se usa "${seg.limites.almacen}".`);
  }
  compartido = seg.limites.almacen === 'postgres' ? almacenPostgres() : memoria;
}
crearAlmacen();

function limitar({ nombre, max, ventanaSeg, clave = (req) => req.ip, mensaje, compartido: usarCompartido = false }) {
  return async (req, res, next) => {
    const almacen = usarCompartido ? compartido : memoria;
    let r;
    try {
      r = await almacen.contar(`${nombre}|${clave(req) || 'anon'}`, ventanaSeg);
    } catch (e) {
      // Si el almacén compartido falla se cuenta en memoria (nunca queda sin límite).
      console.error(`[seguridad] almacén de límites "${almacen.nombre}" falló:`, e.message);
      r = await memoria.contar(`${nombre}|${clave(req) || 'anon'}`, ventanaSeg);
    }
    if (r.cuenta > max) {
      res.set('Retry-After', String(r.esperaSeg));
      return next(new ApiError(429, mensaje || `Demasiados pedidos seguidos. Esperá ${r.esperaSeg} segundo${r.esperaSeg === 1 ? '' : 's'} y volvé a intentar.`));
    }
    return next();
  };
}

// Usuario autenticado: solo si la firma del token es válida (un token
// inventado no permite repartir pedidos entre "usuarios" falsos); si no, la IP.
const porUsuario = (req) => {
  try {
    const [esq, tok] = String(req.headers.authorization || '').split(' ');
    if (esq !== 'Bearer' || !tok) return req.ip;
    const pl = jwt.verify(tok, require('../config/env').jwtSecret, { algorithms: ['HS256'] });
    return `u${pl.sub}`;
  } catch (_e) { return req.ip; }
};

module.exports = { limitar, porUsuario, almacenMemoria, almacenPostgres };
