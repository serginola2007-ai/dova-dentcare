/* DOVA — service worker.
   Hace que DOVA se pueda instalar como app (celular, tablet y compu) y que
   abra aunque no haya internet, mostrando la última versión guardada.
   Reglas:
   - La API (/api/…) NUNCA se guarda: los datos de pacientes siempre vienen
     frescos del servidor y no quedan en el dispositivo.
   - Pantallas, scripts y estilos: primero la red (siempre la versión
     nueva); si no hay conexión, la copia guardada.
   - Lo que viene de otros sitios (fuentes de Google) no se intercepta. */
const VERSION = 'dova-v26';
const PRECARGA = [
  '/moderno/', '/minimalista/', '/tecnico/',
  '/shared/base.css', '/shared/ext/ext.css', '/shared/config.js', '/shared/api.js', '/shared/tiempo-real.js', '/shared/comandos.js', '/shared/pre-diseno.js', '/shared/arranque.js', '/shared/views.js', '/shared/app.js', '/shared/pwa.js',
  '/shared/ext/ext-core.js', '/shared/ext/ext-ficha.js', '/shared/ext/ext-secciones.js', '/shared/ext/ext-operativo.js', '/shared/ext/ext-facturacion.js', '/shared/ext/ext-web.js', '/shared/ext/ext-clinica.js',
  '/moderno/skin.css', '/minimalista/skin.css', '/tecnico/skin.css',
  '/manifest.webmanifest', '/iconos/icono-192.png', '/iconos/icono-512.png',
];

const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DOVA — sin conexión</title><style>body{font-family:system-ui,sans-serif;background:#F7F3EC;color:#2B2420;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}
button{margin-top:16px;padding:10px 18px;border:0;border-radius:8px;background:#C1673F;color:#fff;font:inherit;cursor:pointer}</style></head>
<body><div><h1>Sin conexión</h1><p>DOVA necesita internet para mostrar y guardar los datos de la clínica.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(PRECARGA.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Datos: siempre de la red, nunca guardados.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
  if (url.origin !== location.origin) return;
  // Pantallas y archivos: red primero, copia guardada si no hay internet.
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok && r.type === 'basic') { const c = await caches.open(VERSION); c.put(req, r.clone()); }
      return r;
    } catch (_err) {
      const guardado = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (guardado) return guardado;
      if (req.mode === 'navigate') {
        const tema = (url.pathname.match(/^\/(moderno|minimalista|tecnico)\//) || [])[1] || 'moderno';
        return (await caches.match(`/${tema}/`)) || new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return Response.error();
    }
  })());
});
