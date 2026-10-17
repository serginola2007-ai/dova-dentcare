/* DOVA — servidor web (Express).
   Se arma en este orden, y el orden importa:
     1. seguridad   cabeceras, CORS, compresión, cuerpo JSON y registro de pedidos  (arranque/seguridad.js)
     2. límites     frenos contra fuerza bruta y abuso                              (arranque/limites.js)
     3. API         todas las rutas /api, módulo por módulo                         (rutas.js)
     4. pantallas   el frontend de DOVA y la página web de la clínica               (arranque/frontend.js)
     5. errores     404 y respuestas de error prolijas                              (middlewares/error.middleware.js)
   El servidor se enciende en server.js. */
const express = require('express');
const { aplicarSeguridad } = require('./arranque/seguridad');
const { aplicarLimites } = require('./arranque/limites');
const { montarRutas } = require('./rutas');
const { servirFrontend } = require('./arranque/frontend');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

aplicarSeguridad(app);
aplicarLimites(app);
montarRutas(app);
servirFrontend(app);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
