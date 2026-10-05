/* Tiempo real para las pantallas de DOVA (Server-Sent Events).
   - La base avisa por LISTEN/NOTIFY (canal "dova_cambios", ver migración 0028)
     cada vez que cambia una tabla importante.
   - Este módulo mantiene UNA conexión dedicada escuchando ese canal y reenvía
     el aviso al instante a cada pantalla abierta de la misma clínica.
   - Los avisos de "notificaciones" van solo al usuario destinatario.
   - El aviso no lleva datos: la pantalla vuelve a pedir lo suyo con sus permisos.
   Funciona en el plan gratis de Render (es una conexión HTTP común). */
const { Client } = require('pg');

const clientes = new Set(); // { res, clinicaId, usuarioId }
let pg = null; let reintento = null; let activo = false;

function enviar(c, evento, datos) {
  try { c.res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`); } catch (_e) { /* la conexión se cerró */ }
}

function repartir(msg) {
  let d;
  try { d = JSON.parse(msg.payload); } catch (_e) { return; }
  for (const c of clientes) {
    if (d.c && Number(d.c) !== Number(c.clinicaId)) continue;
    if (d.t === 'notificaciones' && Number(d.u) !== Number(c.usuarioId)) continue;
    enviar(c, 'cambio', { t: d.t });
  }
}

async function conectar() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === 'test') return;
  activo = true;
  const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  const ssl = process.env.PGSSL === 'true' || (!esLocal && process.env.NODE_ENV === 'production');
  const cli = new Client({ connectionString: process.env.DATABASE_URL, ssl: ssl ? { rejectUnauthorized: false } : false });
  const caer = (e) => {
    if (pg !== cli) return;
    console.error('[tiempo real] conexión perdida:', e && e.message);
    pg = null; try { cli.end(); } catch (_e) { /* */ }
    // Las pantallas reciben "reconectado" para ponerse al día con lo que se perdió.
    for (const c of clientes) enviar(c, 'cambio', { t: '*' });
    clearTimeout(reintento); reintento = setTimeout(conectar, 3000);
  };
  cli.on('error', caer);
  cli.on('end', () => caer(new Error('cerrada')));
  cli.on('notification', repartir);
  try {
    await cli.connect();
    await cli.query('LISTEN dova_cambios');
    pg = cli;
  } catch (e) {
    console.error('[tiempo real] no se pudo escuchar la base:', e.message);
    clearTimeout(reintento); reintento = setTimeout(conectar, 5000);
  }
}

// GET /api/eventos (con authMiddleware delante).
function suscribir(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const c = { res, clinicaId: req.clinicaId || req.usuario.clinicaId, usuarioId: req.usuario.id };
  clientes.add(c);
  enviar(c, 'listo', { escuchando: !!pg });
  // Latido: mantiene viva la conexión a través de proxies (Render corta las inactivas).
  const latido = setInterval(() => { try { res.write(': latido\n\n'); } catch (_e) { /* */ } }, 25000);
  // La conexión dura lo que el token: al vencer, la pantalla se reconecta con uno nuevo.
  const vence = Math.max(5000, ((req.tokenExp || 0) * 1000) - Date.now());
  const corte = setTimeout(() => { enviar(c, 'renovar', {}); res.end(); }, Math.min(vence, 30 * 60 * 1000));
  req.on('close', () => { clearInterval(latido); clearTimeout(corte); clientes.delete(c); });
}

module.exports = { conectar, suscribir, _clientes: clientes, estaActivo: () => activo && !!pg };
