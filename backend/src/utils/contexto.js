/* Datos del pedido actual (IP) disponibles en cualquier parte del código sin
   pasarlos a mano: la auditoría los toma de acá. */
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
const middleware = (req, res, next) => als.run({ ip: req.ip }, next);
const actual = () => als.getStore() || {};
module.exports = { middleware, actual };
