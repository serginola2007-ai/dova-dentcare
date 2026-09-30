/* Job de limpieza mensual de adjuntos de Helpdesk vencidos por retención.
   Este script NO corre solo: este entorno de desarrollo no tiene un
   proceso permanente de servidor. Para producción, programarlo así:

     Linux (crontab -e), primer día de cada mes a las 03:00:
       0 3 1 * * cd /ruta/al/backend && node src/jobs/limpiezaRetencionAdjuntos.js >> logs/retencion.log 2>&1

   O con un scheduler de la plataforma de hosting (Render Cron Jobs,
   Railway Cron, etc.) apuntando a este mismo comando.

   El job es idempotente: correrlo de más no duplica ni rompe nada,
   solo no encuentra adjuntos vencidos para procesar. */
require('dotenv').config();
const { pool } = require('../config/db');
const helpdeskService = require('../modules/helpdesk/helpdesk.service');

async function run() {
  console.log(`[retencion] Iniciando limpieza — ${new Date().toISOString()}`);
  const resultado = await helpdeskService.ejecutarLimpiezaRetencion();
  console.log(`[retencion] Revisados: ${resultado.revisados}, eliminados: ${resultado.eliminados}`);
  await pool.end();
}

run().catch((err) => {
  console.error('[retencion] Error fatal en el job', err);
  process.exitCode = 1;
});
