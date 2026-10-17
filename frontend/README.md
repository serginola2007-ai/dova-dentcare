# DOVA — frontend

Guía corta para entender y mantener el front. JavaScript puro, sin compilación:
lo que está en estas carpetas es exactamente lo que recibe el navegador.

## Carpetas

```
frontend/
  mecanico/index.html     Página de entrada de la app del personal (el único diseño).
  app/
    core/                 El motor. No dibuja pantallas.
      config.js           URL de la API (la genera el servidor).
      pre-carga.js        Modo claro/oscuro y tamaño de letra antes de pintar.
      api.js              Conexión con el servidor (objeto DOVA): sesión, permisos, pedidos.
      router.js           Menú, permisos por ruta y navegación (objeto DovaApp).
      ventanas.js         Escritorio con ventanas (objeto DovaVentanas).
      escritorio.js       Lo propio del diseño: tira de íconos, parámetros, barras.
      tiempo-real.js      Conexión en vivo y campanita.
      comandos.js         Centro de comandos (Ctrl+K).
      bloqueo.js          Bloqueo de pantalla por inactividad.
      iconos.js           Íconos lineales: DovaIcono('nombre', tamaño).
      pwa.js              Instalar como app y avisos push.
      arranque.js         Arranca todo (va último).
    components/           Piezas reutilizables.
      kit.js              Kit de pantallas (DovaExt): formularios, tablas CRUD, pestañas, modales.
      visor.js            Visor de radiografías.
      importar-pacientes.js, mi-dia.js, accesos-rapidos.js, seguridad-cuenta.js
    pages/                Pantallas (una sección o un grupo de secciones por archivo).
    styles/
      base.css            Variables y estilos base.
      componentes.css     Estilos de las pantallas y componentes.
      tema-mecanico.css   El diseño: paletas clara y oscura, barras, ventanas, celular.
      sobrio.css          Reglas de estilo sobrio (se carga último).
  web/                    Página pública de la clínica y portal del paciente (aparte).
  sw.js                   Service worker (app instalable, apertura sin internet).
```

## Reglas para que siga siendo fácil de mantener

1. **Nombres en español y claros.** `idFactura`, `totalCobrado`, `abrirModalTurno()`.
   Nada de abreviaturas raras (`x`, `tmp2`). Los textos que ve el usuario, en español rioplatense.
2. **Una pantalla, un lugar.** Si agregás una sección, va en su propio archivo en `pages/`.
3. **El servidor manda.** La pantalla oculta lo que el usuario no puede hacer, pero nunca
   confía en eso: el backend vuelve a validar todo.
4. **Seguridad:**
   - nada de `<script>` en línea ni `onclick=` en el HTML (la política de seguridad lo bloquea);
   - todo texto que viene del usuario o del servidor pasa por `esc()` antes de ir a `innerHTML`;
   - nunca guardar tokens ni datos de pacientes en `localStorage`.
5. **Colores con variables** (`var(--ink)`, `var(--white)`, `var(--mec-…)`), nunca un hex fijo:
   si no, se rompe el modo oscuro.
6. **Sin emojis.** Íconos con `DovaIcono('nombre')`.
7. **Cada cambio en el front sube `VERSION` en `sw.js`** y, si hay archivos nuevos, se agregan a
   `PRECARGA` y al `index.html`.

## Cómo agregar una pantalla nueva

1. Crear `app/pages/mi-seccion.js`.
2. Agregar el `<script>` en `mecanico/index.html` (antes de `core/ventanas.js`) y la ruta en `PRECARGA` de `sw.js`.
3. Agregar la entrada en el `MENU` de `core/router.js` (grupo, ruta, texto, permiso, pestañas).
4. Escribir la prueba de pantalla en `backend/tests/ui-mi-seccion.js`.

## Pruebas

Las pantallas se prueban con Playwright contra un servidor local (ver `backend/tests/ui-*.js`):
recorren cada pantalla como una persona y fallan si hay errores de consola o desbordes.
