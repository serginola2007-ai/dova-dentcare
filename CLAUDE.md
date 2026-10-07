# DOVA — guía para Claude Code

DOVA es el sistema de gestión odontológica de la clínica **DentCareRC** (Paraguay).
Incluye:
- pantallas del personal: agenda, pacientes, consulta, caja, facturación, inventario, reportes;
- la página web pública de la clínica;
- el portal del paciente.

Dueño: Sergio. Producción: https://dova.onrender.com (Render, despliegue automático desde `main` de `serginola2007-ai/dova-dentcare`).

## Cómo trabajar con Sergio

- Respuestas **breves, directas, en español rioplatense**.
- Entregables completos y listos para usar, no explicaciones a medias.
- Si algo es ambiguo y barato de rehacer, elegir la opción más recomendable y avisar en una línea. Preguntar solo si una decisión es cara o irreversible.
- Al terminar un cambio visible:
  - correr las pruebas que correspondan;
  - commitear y hacer push a `main` (despliega solo);
  - verificar que el deploy quedó en "success";
  - agregar una sección corta en `CORRECCIONES.md`.
- No pedirle que pruebe algo que se puede probar acá.

## Estructura

```
backend/            Node 22 + Express 5 + PostgreSQL (node-pg-migrate)
  src/app.js        middlewares, límites, CSP, rutas, sirve el frontend
  src/config/       env.js, db.js, seguridad.js (sesiones, cookies, límites: todo por env)
  src/modules/*     un módulo por área: *.routes.js / *.service.js / *.repository.js
  src/utils/        auditoria, sesiones, cookies, montos, recurso (CRUD genérico con lista blanca), tiempoReal (SSE)
  src/db/migrations 0001…0041 — SOLO se agregan nuevas, nunca se editan las viejas
  src/db/seed.js    roles, permisos, admin (nunca deja admin/admin en producción)
  scripts/          migrar.js, verificar-sintaxis.js, crear-usuario-app.sql
  tests/seguridad/  pruebas de seguridad (ver SECURITY-TESTS.md)
frontend/           JavaScript puro, sin build
  moderno/ minimalista/ tecnico/   3 diseños: cada uno es index.html + skin.css
  shared/           TODO el código común (app.js = SPA, views.js, ext/*.js, base.css, sobrio.css, iconos.js)
  web/              página pública + portal del paciente
  sw.js             service worker (precache con VERSION)
```

## Comandos (desde `backend/`)

```bash
npm install
npm run migrate:up      # migraciones (usa MIGRATION_DATABASE_URL o DATABASE_URL)
npm run seed            # roles/permisos/admin (es seguro correrlo siempre)
npm run dev             # servidor con recarga (node --watch) → http://localhost:4000/moderno/
npm run lint            # ESLint (tiene que dar 0)
npm run build           # node --check de todos los .js
npm audit               # tiene que dar 0 vulnerabilidades
```

Local: crear `backend/.env` a partir de `backend/.env.example` con un Postgres local. El usuario inicial en desarrollo es `admin` / `admin` y obliga a cambiar la contraseña.

## Reglas del proyecto (no romper)

**Seguridad.** El backend es la autoridad. Detalle en `SECURITY-AUDIT.md`.
- Cada ruta nueva lleva `requirePermiso(...)` y filtra por `req.clinicaId`. Todo ID que llega en el cuerpo se valida contra la clínica, igual que los de la URL.
- SQL siempre parametrizado. Nombres de columnas dinámicos solo desde listas fijas del código.
- Importes con `utils/montos.js`. Estados y totales los calcula el servidor.
- Sesión del personal:
  - el access token vive solo en memoria;
  - el refresh token va en la cookie HttpOnly `dova_rt` (Path `/api/auth`);
  - el portal usa la cookie `dova_portal`;
  - los endpoints con cookie exigen la cabecera `X-DOVA-CSRF: 1`;
  - nunca guardar tokens en `localStorage`.
- CSP `script-src 'self'`: **nada de scripts en línea** ni `onclick=` en el HTML. Todo JS va en archivos.
- Texto de usuario siempre escapado (`esc(...)`) antes de ponerlo en `innerHTML`.
- Base de datos: cambios solo con **migraciones nuevas**, no destructivas. La app puede correr con el usuario restringido `dova_app` (`APP_DATABASE_URL`), así que no hacer DDL en tiempo de ejecución.
- No commitear `backend/.env`, `node_modules` ni `uploads`. No imprimir secretos.

**Interfaz:**
- **Sin emojis.** Íconos solo con `DovaIcono('nombre')` (`shared/iconos.js`, trazo lineal).
- Estilo sobrio (`shared/sobrio.css`, se carga después de cada skin):
  - esquinas de 2px y sin sombras decorativas;
  - indicadores en franja con divisiones, no una tarjeta por número;
  - tablas sin caja alrededor;
  - pestañas subrayadas;
  - no anidar bordes.
- Un cambio visual va en `shared/` para que llegue a los 3 diseños. Lo propio de un diseño va en su `skin.css`.
- Pestañas de una sección: `X.subPestanas(...)` en `shared/ext/*.js`. Si una sección del menú tiene pestañas, el menú de `shared/app.js` las lista en `subs` con los **mismos id y permisos**.
- Al cambiar archivos del frontend, subir `VERSION` en `frontend/sw.js` (`dova-vNN`) y agregar al precache los archivos nuevos.
- Textos en español rioplatense, claros para personal no técnico ("Guardar", "No se pudo…", sin jerga).

## Pruebas

- **Seguridad:** `backend/tests/seguridad/` contra un servidor local en `NODE_ENV=production` con una base de prueba. Pasos y última corrida en `SECURITY-TESTS.md`.
- **Pantallas:** se prueban con Playwright en un navegador real (los 3 diseños, escritorio, tablet y celular), verificando que no haya desbordes ni errores de consola.
- El límite de 10 logins por minuto por cuenta es real: al correr muchas pruebas seguidas, dejar ~1 minuto entre archivos.

## Deploy

- `git push` a `main` → Render despliega solo.
- Verificar con `gh api repos/serginola2007-ai/dova-dentcare/deployments?per_page=1` y el estado del último deploy.
- Variables nuevas de configuración: agregarlas en `render.yaml`/`render-pago.yaml` y documentarlas.
- Commits con autor `Sergio <serginola2007@gmail.com>`.

## Documentos de referencia

- `README.md`: instalación, variables, diseños, deploy.
- `CORRECCIONES.md`: historial de cambios por tanda.
- `SEGURIDAD.md`, `SECURITY-AUDIT.md`, `SECURITY-TESTS.md`: auditorías de seguridad y pruebas.

## Pendiente

- Diseño **"mecánico"**, exclusivo para el rol admin. Inspirado en una app de escritorio clásica (RUNI de UPAP):
  - barra de menú en mayúsculas;
  - tira de íconos a la izquierda;
  - área de trabajo color bordó con un panel "Parámetros activos" (usuario, clínica, caja, fecha y reloj);
  - lista de "Ventanas abiertas recientemente";
  - recuadros con título y letra Tahoma chica.

  Hay que habilitarlo en:
  - `DISENOS_VALIDOS` (backend) y en la restricción de base, con una migración nueva;
  - `TEMAS_VALIDOS` de `shared/app.js` y `shared/pre-diseno.js`;
  - el redirect de `app.js`.

  Validar en el servidor que solo un admin pueda elegirlo.
- Copias de seguridad de la base (plan pago de Render más `pg_dump` propio).
