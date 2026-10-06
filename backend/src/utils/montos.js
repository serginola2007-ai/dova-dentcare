/* Validación de importes que llegan del navegador. El servidor nunca confía en
   un número del cliente: tiene que ser finito, no negativo (o mayor a cero),
   con como mucho 2 decimales y por debajo de un tope razonable (evita
   "Infinity", "1e400", "abc", notación rara o desbordes de la columna). */
const { ApiError } = require('../middlewares/error.middleware');

const TOPE = 100000000000; // 100.000 millones de guaraníes

function monto(valor, { campo = 'El monto', cero = false, max = TOPE } = {}) {
  if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean' || typeof valor === 'object') {
    throw new ApiError(400, `${campo}: escribí un importe`);
  }
  if (typeof valor === 'string' && !/^\s*-?\d+(\.\d+)?\s*$/.test(valor)) throw new ApiError(400, `${campo}: el importe no es válido`);
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ApiError(400, `${campo}: el importe no es válido`);
  if (cero ? n < 0 : n <= 0) throw new ApiError(400, `${campo} ${cero ? 'no puede ser negativo' : 'debe ser mayor a cero'}`);
  if (n > max) throw new ApiError(400, `${campo} es demasiado grande`);
  return Math.round(n * 100) / 100;
}

function entero(valor, { campo = 'El valor', min = 0, max = 1000000 } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, `${campo} tiene que ser un número entero entre ${min} y ${max}`);
  return n;
}

module.exports = { monto, entero, TOPE };
