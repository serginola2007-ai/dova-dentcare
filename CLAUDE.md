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
  src/db/migrations 0001…0051 — SOLO se agregan nuevas, nunca se editan las viejas
  src/db/seed.js    roles, permisos, admin (nunca deja admin/admin en producción)
  scripts/          migrar.js, verificar-sintaxis.js, crear-usuario-app.sql
  tests/seguridad/  pruebas de seguridad (ver SECURITY-TESTS.md)
frontend/           JavaScript puro, sin build
  moderno/ minimalista/ tecnico/ mecanico/   4 diseños: cada uno es index.html + skin.css (mecanico: colores de la clínica, para todos, más shared/mecanico.js)
  shared/           TODO el código común (app.js = SPA, views.js, ext/*.js, seguridad.js, bloqueo.js, base.css, sobrio.css, iconos.js)
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
  - el refresh token va en la cookie HttpOnly `dova_rt` (Path `/api/auth`), cookie de navegador sin `Max-Age`;
  - la sesión vale solo en la pestaña donde se inició (`sessionStorage` `dova_pestana`): al abrir DOVA siempre se pide la contraseña;
  - el portal usa la cookie `dova_portal`;
  - los endpoints con cookie exigen la cabecera `X-DOVA-CSRF: 1`;
  - nunca guardar tokens en `localStorage`;
  - cada login es una fila de `sesiones`; el token de acceso lleva `sid` y el middleware corta al instante una sesión cerrada (401) o bloqueada (423);
  - **sin verificación en dos pasos** (decisión de la clínica; columnas `totp_*` sin uso);
  - usuario y contraseña se aceptan solo como texto plano (sin listas, objetos ni caracteres de control);
  - bloqueo de pantalla por inactividad (`shared/bloqueo.js`, minutos en `clinicas.bloqueo_inactividad_min`);
  - avisos de seguridad a los admins con `utils/alertas.js`.
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

## Recordatorios por WhatsApp

- Módulo `backend/src/modules/recordatorios/`.
- Proveedor en `utils/whatsapp.js`: API oficial de Meta, se activa con variables `WHATSAPP_*`.
- Webhook firmado: `/api/whatsapp/webhook`.
- Disparo externo: `POST /api/recordatorios/cron` con `X-DOVA-CRON`.
- Configuración paso a paso: `docs/WHATSAPP.md`.
- Número de cada odontólogo: `odontologos.whatsapp_numero/whatsapp_phone_id/whatsapp_envia`. Permiso `recordatorios.propios` = solo sus turnos.
- Pruebas con WhatsApp falso: `backend/tests/recordatorios.test.js`, `backend/tests/ui-recordatorios.js`.

## Avisos de cobro y reserva online
- Módulo `backend/src/modules/cobranza/`: avisos de cuotas y presupuestos (`cobranza_envios`, etapa única por la base), enlace privado `web/mi-pago.html#t=` (`cobranza_enlaces`, solo el hash). Corre junto con el cron de recordatorios.
- Reserva online: `calcularLibres` en `web.service.js` usa `odontologos.horarios` (o el horario de la clínica) y la cantidad de sillones activos.
- Pruebas: `tests/cobranza.test.js`, `tests/ui-cobranza.js`, `tests/reserva-horarios.test.js`.

## Consentimientos
- Firma en tablet (`modoFirma` en `shared/ext/ext-operativo.js`). Huella SHA-256 en `extras.service.js`.
- Disparadores en la base impiden modificar o borrar firmados (para borrar un paciente de prueba: `SET dova.borrando_paciente='on'`).

## Copias de seguridad
- `.github/workflows/copias.yml` (diaria, cifrada) y `scripts/restaurar-copia.sh`. Guía: `docs/COPIAS.md`.

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

- SIFEN (factura electrónica) y cobro online: necesitan contratos externos.
