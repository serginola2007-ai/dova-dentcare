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
  // Recordatorios de turnos y avisos de cobro por WhatsApp: se revisa cada 10 minutos si toca
  // mandarlos (además del disparo externo por /api/recordatorios/cron).
  if (process.env.RECORDATORIOS_AUTOMATICOS !== 'false') {
    const rec = require('./modules/recordatorios/recordatorios.service');
    const cob = require('./modules/cobranza/cobranza.service');
    const correr = () => {
      rec.ejecutarAutomaticos().then((r) => { if (r.enviados || r.fallidos) console.log(`[recordatorios] enviados ${r.enviados}, fallidos ${r.fallidos}`); }).catch((e) => console.error('[recordatorios]', e.message))
        .then(() => cob.ejecutarAutomaticos()).then((r) => { if (r && (r.enviados || r.fallidos)) console.log(`[cobranza] enviados ${r.enviados}, fallidos ${r.fallidos}`); }).catch((e) => console.error('[cobranza]', e.message))
        .then(() => require('./modules/mensajes/mensajes.service').ejecutarAutomaticos()).then((r) => { if (r && (r.enviados || r.fallidos)) console.log(`[mensajes] enviados ${r.enviados}, fallidos ${r.fallidos}`); }).catch((e) => console.error('[mensajes]', e.message));
    };
    setTimeout(correr, 60 * 1000).unref();
    setInterval(correr, 10 * 60 * 1000).unref();
  }
});
// Las conexiones de tiempo real quedan abiertas: que el servidor no las corte.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
