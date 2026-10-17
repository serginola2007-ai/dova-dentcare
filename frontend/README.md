# DOVA — frontend

Guía corta para entender y mantener el front. JavaScript puro, sin compilación:
lo que está en estas carpetas es exactamente lo que recibe el navegador.

## Cómo está armado (en una línea)

`mecanico/index.html` carga los archivos de `app/` en orden. Cada pantalla vive en su propio
archivo de `app/pages/` y **se registra sola** con `DovaPantallas.registrar(...)`. El router
(`app/core/router.js`) arma el menú según los permisos y, al navegar, busca la pantalla registrada
para esa ruta y la dibuja.

## Carpetas

```
frontend/
  mecanico/index.html       Entrada de la app del personal (el único diseño). Orden de carga de todo.
  app/
    core/                   El motor. No dibuja pantallas de negocio.
      config.js             URL de la API (la genera el servidor).
      pre-carga.js          Modo claro/oscuro y tamaño de letra antes de pintar.
      api.js                Conexión con el servidor (objeto DOVA): sesión, permisos, pedidos.
      pantallas.js          Registro de pantallas (objeto DovaPantallas).
      router.js             Menú, permisos por ruta y navegación (objeto DovaApp).
      ventanas.js           Escritorio con ventanas (objeto DovaVentanas).
      escritorio.js         Lo propio del diseño: tira de íconos, parámetros, barra de estado, barra del celular.
      tiempo-real.js        Conexión en vivo y campanita.
      comandos.js           Centro de comandos (Ctrl+K).
      bloqueo.js            Bloqueo de pantalla por inactividad.
      iconos.js             Íconos lineales: DovaIcono('nombre', tamaño).
      pwa.js                Instalar como app y avisos push.
      arranque.js           Arranca todo (va último).
    components/             Piezas reutilizables (no son una sección del menú).
      ayudantes.js          DovaAyudantes: esc, fmtGs, fmtFecha, hoyPy, toast, manejarError, abrirModal.
      kit.js                DovaExt: formularios declarativos, tabla CRUD, pestañas, modales, gráficos.
      turnos.js             DovaTurnos: buscador de paciente, formulario de turno, confirmar, colores.
      seccion-base.js       DovaSeccionBase: enlaces a pacientes e indicadores para secciones con pestañas.
      buscador-global.js, visor.js, importar-pacientes.js, mi-dia.js, accesos-rapidos.js, seguridad-cuenta.js
    pages/                  Una pantalla (o un grupo chico de pantallas) por archivo.
      ingreso.js            Ingreso y cambio de contraseña.
      inicio.js             Inicio (turnos de hoy, para atender, mi día).
      pacientes.js          Lista de pacientes.
      ficha-paciente.js     Base de la ficha. Le suman pestañas: ficha.js, ficha-operativa.js, clinica.js.
      agenda.js, caja.js, inventario.js, catalogo.js, presupuestos.js, facturacion.js, informes.js
      seguimiento.js, clinica-operaciones.js, finanzas.js, estadisticas.js, reportes-auditoria.js
      ortodoncia.js, pagina-web.js, plataforma.js, usuarios.js, ayuda-tecnica.js, configuracion.js
      consulta-paneles.js   Paneles del modo consulta (los usa clinica.js).
      inicio-extras.js      Lo que se suma a Inicio, Configuración y la consulta.
      avisos.js             Resumen del día, indicaciones, archivo de pendientes.
      vistas.js             Nombre viejo "Vistas" (compatibilidad) + registro de las pantallas base.
    styles/
      base.css              Variables y estilos base.
      componentes.css       Estilos de las pantallas y componentes.
      tema-mecanico.css     El diseño: paletas clara y oscura, barras, ventanas, celular, letra grande.
      sobrio.css            Reglas de estilo sobrio (se carga último).
  web/                      Página pública de la clínica y portal del paciente (aparte).
  sw.js                     Service worker (app instalable, apertura sin internet).
```

## Cómo es un archivo de pantalla

Todos siguen el mismo molde:

```js
/* DOVA — Caja (Movimientos → Caja). Qué hace, en una o dos líneas. */
const DovaCaja = (() => {
  const X = DovaExt;                                  // kit de componentes
  const { esc, fmtGs, toast, puede } = X;             // solo lo que se usa
  const { opcionesMetodos } = DovaTurnos;             // piezas de otros módulos

  async function caja(contenedor, navegar) { … }      // dibuja la pantalla

  return { caja };                                    // lo que otros archivos pueden usar
})();
window.DovaCaja = DovaCaja;

DovaPantallas.registrar('caja', { dibujar: (contenedor, { navegar }) => DovaCaja.caja(contenedor, navegar) });
```

## Cómo agregar una pantalla nueva

1. Crear `app/pages/mi-seccion.js` con el molde de arriba y su `DovaPantallas.registrar('mi-seccion', …)`.
2. Agregar el `<script>` en `mecanico/index.html` (en el bloque de pantallas, antes de `core/ventanas.js`)
   y la ruta en `PRECARGA` de `sw.js`. Subir `VERSION` en `sw.js`.
3. Agregar la entrada en el `MENU` de `core/router.js` (grupo, ruta, texto, permiso y, si tiene, pestañas).
4. Escribir la prueba de pantalla en `backend/tests/ui-mi-seccion.js`.

## Reglas para que siga siendo fácil de mantener

1. **Nombres en español y claros:** `idFactura`, `totalCobrado`, `abrirModalTurno()`. Nada de `x`, `tmp2`.
   Los textos que ve el usuario, en español rioplatense y sin jerga.
2. **Una pantalla, un archivo.** Si un archivo pasa de ~1.000 líneas, partirlo.
3. **No repetir ayudantes:** escapar texto, formatos de Gs. y fechas, avisos y modales salen de
   `DovaAyudantes` (o de `DovaExt`, que los reexporta).
4. **El servidor manda.** La pantalla oculta lo que el usuario no puede hacer, pero el backend
   vuelve a validar todo.
5. **Seguridad:** nada de `<script>` en línea ni `onclick=`; todo texto externo pasa por `esc()`
   antes de ir a `innerHTML`; nunca tokens ni datos de pacientes en `localStorage`.
6. **Colores con variables** (`var(--ink)`, `var(--white)`, `var(--mec-…)`), nunca un hex fijo:
   si no, se rompe el modo oscuro.
7. **Sin emojis.** Íconos con `DovaIcono('nombre')`.

## Pruebas

Las pantallas se prueban con Playwright contra un servidor local (`backend/tests/ui-*.js`):
recorren cada pantalla como una persona y fallan si hay errores de consola o desbordes.

Antes de subir cambios, desde `backend/`: `npm run lint:front` (tiene que dar 0 problemas). Marca
variables sin definir (un error de tipeo que rompería una pantalla) y variables que sobran.
Si se crea un objeto global nuevo (`window.DovaAlgo`), sumarlo a la lista de `frontend/eslint.config.js`.
