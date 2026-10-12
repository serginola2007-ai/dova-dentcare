/* Convierte a texto un dato que llega del pedido. Un objeto o una lista
   (que ninguna pantalla manda) se rechaza: antes terminaba guardado como
   "[object Object]". */
const { ApiError } = require('../middlewares/error.middleware');

function str(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') throw new ApiError(400, 'Algún dato tiene un formato inválido');
  return String(v);
}

module.exports = { str };
