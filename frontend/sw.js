/* DOVA — service worker.
   Hace que DOVA se pueda instalar como app (celular, tablet y compu) y que
   abra aunque no haya internet, mostrando la última versión guardada.
   Reglas:
   - La API (/api/…) NUNCA se guarda: los datos de pacientes siempre vienen
     frescos del servidor y no quedan en el dispositivo.
   - Pantallas, scripts y estilos: primero la red (siempre la versión
     nueva); si no hay conexión, la copia guardada.
   - Lo que viene de otros sitios (fuentes de Google) no se intercepta. */
const VERSION = 'dova-v65';
const PRECARGA = [
  '/mecanico/',
  '/app/styles/base.css',
  '/app/styles/componentes.css',
  '/app/styles/tema-mecanico.css',
  '/app/styles/sobrio.css',
  '/app/core/pre-carga.js',
  '/app/core/config.js',
  '/app/components/ayudantes.js',
  '/app/core/api.js',
  '/app/core/tiempo-real.js',
  '/app/core/iconos.js',
  '/app/core/comandos.js',
  '/app/core/pantallas.js',
  '/app/pages/ingreso.js',
  '/app/pages/configuracion.js',
  '/app/pages/inicio.js',
  '/app/pages/pacientes.js',
  '/app/pages/ficha-paciente.js',
  '/app/pages/consulta-paneles.js',
  '/app/pages/ayuda-tecnica.js',
  '/app/pages/usuarios.js',
  '/app/components/buscador-global.js',
  '/app/pages/vistas.js',
  '/app/components/kit.js',
  '/app/components/turnos.js',
  '/app/components/seccion-base.js',
  '/app/pages/ficha.js',
  '/app/pages/seguimiento.js',
  '/app/pages/clinica-operaciones.js',
  '/app/pages/finanzas.js',
  '/app/pages/estadisticas.js',
  '/app/pages/reportes-auditoria.js',
  '/app/pages/inicio-extras.js',
  '/app/pages/agenda.js',
  '/app/pages/caja.js',
  '/app/pages/ficha-operativa.js',
  '/app/pages/inventario.js',
  '/app/pages/catalogo.js',
  '/app/pages/facturacion.js',
  '/app/pages/pagina-web.js',
  '/app/pages/clinica.js',
  '/app/components/importar-pacientes.js',
  '/app/components/visor.js',
  '/app/components/mi-dia.js',
  '/app/pages/informes.js',
  '/app/pages/presupuestos.js',
  '/app/components/accesos-rapidos.js',
  '/app/pages/plataforma.js',
  '/app/pages/ortodoncia.js',
  '/app/pages/avisos.js',
  '/app/core/pwa.js',
  '/app/components/seguridad-cuenta.js',
  '/app/core/bloqueo.js',
  '/app/core/ventanas.js',
  '/app/core/router.js',
  '/app/core/escritorio.js',
  '/app/core/arranque.js',
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
        return (await caches.match('/mecanico/')) || new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return Response.error();
    }
  })());
});

// Avisos push: el servidor manda solo un título genérico y la ruta (sin datos de pacientes).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'DOVA', {
    body: d.cuerpo || 'Abrí DOVA para ver el detalle.',
    icon: '/iconos/icono-192.png', badge: '/iconos/icono-192.png',
    tag: 'dova-aviso', renotify: true, data: { ruta: d.ruta || '' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ruta = (e.notification.data && e.notification.data.ruta) || '';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (abiertas.length) { const c = abiertas[0]; await c.focus(); c.postMessage({ tipo: 'dova-ir', ruta }); return; }
    await self.clients.openWindow('/?app=1');
  })());
});
