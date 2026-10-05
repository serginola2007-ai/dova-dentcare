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
