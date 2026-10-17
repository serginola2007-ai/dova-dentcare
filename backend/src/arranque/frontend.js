/* Pantallas de DOVA servidas por este mismo servidor (un solo servicio, una sola dirección, sin CORS).
   Si la carpeta frontend/ no está (por ejemplo si el front se publica aparte), no se sirve nada. */
const express = require('express');
const path = require('path');
const fs = require('fs');

function servirFrontend(app) {
  const carpetaFrontend = process.env.FRONTEND_DIR || path.join(__dirname, '..', '..', '..', 'frontend');
  if (fs.existsSync(path.join(carpetaFrontend, 'mecanico', 'index.html'))) {
    // Mismo origen: la API está en /api del propio servidor.
    app.get('/app/core/config.js', (req, res) => {
      res.type('application/javascript').set('Cache-Control', 'no-cache').send('window.DOVA_API_BASE = "/api";\n');
    });
    // Página web de la clínica: /web/ (con WEB_EN_INICIO=true también es la página de inicio).
    app.get('/', (req, res) => res.redirect(302, process.env.WEB_EN_INICIO === 'true' ? '/web/' : '/mecanico/'));
    app.get(/^\/web$/, (req, res) => res.redirect(301, '/web/'));
    // DOVA tiene un solo diseño: los enlaces viejos a los otros diseños llevan al actual (el # se conserva en el navegador).
    app.get(/^\/(moderno|minimalista|tecnico)(\/.*)?$/, (req, res) => res.redirect(301, '/mecanico/'));
    app.get(/^\/mecanico$/, (req, res) => res.redirect(301, '/mecanico/'));
    app.use(express.static(carpetaFrontend, {
      index: 'index.html',
      setHeaders: (res, archivo) => {
        // El HTML se revalida siempre (así una actualización llega enseguida);
        // el resto se cachea poco para no servir versiones viejas.
        // El service worker y el manifiesto de la app se revalidan siempre.
        const siempreFresco = archivo.endsWith('.html') || archivo.endsWith('sw.js') || archivo.endsWith('.webmanifest');
        res.setHeader('Cache-Control', siempreFresco ? 'no-cache' : 'public, max-age=300');
        if (archivo.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
      },
    }));
  }
}

module.exports = { servirFrontend };
