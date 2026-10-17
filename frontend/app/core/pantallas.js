/* DOVA — registro de pantallas (objeto global DovaPantallas).

   Cada archivo de app/pages/ registra sus pantallas acá, así el router no tiene que
   conocerlas una por una. Para agregar una pantalla nueva alcanza con:

     DovaPantallas.registrar('mi-seccion', {
       permiso: 'mi_seccion.ver',            // opcional si la ruta ya está en el MENU del router
       dibujar: async (contenedor, { navegar, params }) => {
         contenedor.innerHTML = '<h2 class="dova-view-title">Mi sección</h2>…';
       },
     });

   - contenedor: el elemento donde se dibuja la pantalla (vacío al llamar).
   - navegar(ruta, params): para ir a otra pantalla.
   - params: lo que viene después de la ruta en la dirección (#ruta/params).
   - permiso: texto o lista (alcanza con tener uno). El de la entrada del MENU tiene prioridad.
   Si la pantalla falla al dibujarse, el router muestra el error en lugar de romper todo. */
const DovaPantallas = (() => {
  const pantallas = new Map();

  function registrar(ruta, { dibujar, permiso = null } = {}) {
    if (typeof ruta !== 'string' || !ruta) throw new Error('DovaPantallas.registrar: falta la ruta');
    if (typeof dibujar !== 'function') throw new Error(`DovaPantallas.registrar('${ruta}'): falta la función dibujar`);
    if (pantallas.has(ruta)) console.warn(`[DOVA] La pantalla "${ruta}" se registró dos veces; queda la última.`);
    pantallas.set(ruta, { ruta, dibujar, permiso });
  }

  const obtener = (ruta) => pantallas.get(ruta) || null;
  const existe = (ruta) => pantallas.has(ruta);
  const rutas = () => Array.from(pantallas.keys());

  return { registrar, obtener, existe, rutas };
})();
window.DovaPantallas = DovaPantallas;
