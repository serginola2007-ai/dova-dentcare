require('dotenv').config();
// Mínimo privilegio en la base: si está APP_DATABASE_URL (usuario dova_app, solo
// datos), la aplicación en marcha usa esa conexión. Las migraciones y el seed
// corren aparte con DATABASE_URL / MIGRATION_DATABASE_URL (usuario dueño).
if (process.env.APP_DATABASE_URL) process.env.DATABASE_URL = process.env.APP_DATABASE_URL;
const app = require('./app');
const env = require('./config/env');
const tiempoReal = require('./utils/tiempoReal');

const server = app.listen(env.port, () => {
  console.log(`DOVA backend escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  tiempoReal.conectar();
});
// Las conexiones de tiempo real quedan abiertas: que el servidor no las corte.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
