// Ayuda para las pruebas de pantallas: abre la misma pestaña en "modo ventana"
// (la pantalla de una sección sola, sin el escritorio de ventanas), para probar
// el contenido de las secciones con DovaApp.navegar como antes.
async function enVentana(p) {
  const u = new URL(p.url());
  await p.goto(`${u.origin}${u.pathname}?ventana=1`);
  await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 });
  await p.waitForTimeout(600);
}
module.exports = { enVentana };
