# DOVA — Auditoría y endurecimiento de seguridad (2.ª ronda, octubre 2026)

Continúa la primera auditoría (`SEGURIDAD.md`). Se trabajó sobre el proyecto existente:
- sin rediseño;
- sin quitar funciones;
- sin IA;
- sin cambiar la arquitectura salvo donde la seguridad lo exigía (sesión con cookies).

El backend es la autoridad: cada control de esta lista está en el servidor y tiene una prueba automática que lo ataca (ver `SECURITY-TESTS.md`).

> **Actualización:** la sesión del personal ahora vale solo en la pestaña donde se inició, y la cookie `dova_rt` es de navegador (sin `Max-Age`): al abrir DOVA siempre se pide la contraseña. Ver `CORRECCIONES.md`.

> No se declara que el sistema sea "100 % seguro". Se corrigió lo que se encontró, se probó, y lo que depende de la infraestructura queda marcado como **REQUIERE CONFIGURACIÓN DE INFRAESTRUCTURA**.

Estados posibles:
- **FIXED**: corregido y probado.
- **MITIGATED**: reducido, con riesgo residual explicado.
- **ACCEPTED RISK**: se deja así a propósito.
- **REQUIRES INFRASTRUCTURE CHANGE**: el código está listo; falta configurarlo en Render o en la base.

---

## 1. Inventario de rutas

`backend/tests/seguridad/rutas.json` se genera con `enumerar-rutas.py` leyendo `app.js` y cada `*.routes.js`. Hay **516 rutas**, más `GET /api/eventos` (tiempo real), que se declara en `app.js`.

| Módulo | Rutas | Con permiso (`requirePermiso`) | Solo sesión o pública |
|---|---|---|---|
| auth | 5 | 0 | 5: login, refresh, logout, cambiar-clave, logout-todas |
| clinica | 3 | 1 | 2: `branding-publico` (pública, solo logo y colores) y `GET /clinica` (con sesión) |
| pacientes | 10 | 10 | — |
| odontologos | 5 | 3 | 2 lecturas con sesión (agenda) |
| agenda | 6 | 6 | — |
| tratamientos | 4 | 4 | — |
| planes-tratamiento | 16 | 16 | — |
| historia-clinica | 8 | 8 | — |
| odontograma | 4 | 4 | — |
| presupuestos | 5 | 5 | — |
| caja | 5 | 5 | — |
| planes-pago | 4 | 4 | — |
| pagos | 5 | 5 | — |
| inventario | 10 | 10 | — |
| helpdesk | 10 | 10 | — |
| notificaciones | 4 | 0 | 4: solo las propias del usuario |
| usuarios | 14 | 13 | 1: `me/preferencias` (solo el diseño propio) |
| clinico | 33 | 33 | — |
| reportes | 9 | 9 | — |
| comprobantes | 9 | 9 | — |
| plantillas-clinicas | 5 | 5 | — |
| controles-postoperatorios | 5 | 5 | — |
| derivaciones | 5 | 5 | — |
| pendientes | 1 | 1 | — |
| busqueda | 1 | 0 | 1: con sesión; filtra cada tipo de resultado por los permisos del usuario |
| salud | 33 | 33 | — |
| recalls | 14 | 14 | — |
| periodoncia | 12 | 12 | — |
| especialidades | 59 | 59 | — |
| seguimiento | 30 | 30 | — |
| operaciones | 48 | 48 | — |
| finanzas | 56 | 56 | — |
| kpis | 4 | 4 | — |
| facturacion | 28 | 27 | 1: `DELETE /:id`, que siempre responde 405 |
| web | 46 | 15 | 31: página pública (límite por IP) y cuenta del paciente (cookie propia del portal) |

**Verificación de las rutas:**
- `barrido-rutas.js` recorre todas las rutas:
  - sin sesión responden 401, salvo las públicas;
  - un usuario sin permisos recibe 403 en todas las que piden permiso.
- `idor-clinicas.js` y `inyeccion-fk.js` atacan el aislamiento entre clínicas por URL y por cuerpo.

---

## 2. Hallazgos de esta ronda

### 🔴 CRÍTICAS

#### C1 · El administrador de producción podía seguir con `admin`/`admin`
| | |
|---|---|
| Severidad | CRÍTICA |
| Archivo | `backend/src/db/seed.js` (bloque "4) Usuario admin", líneas ~115-145) |
| Causa | La primera ronda obligaba a cambiar la contraseña inicial, pero una base que ya existía con `admin`/`admin` seguía así. Quien llegara primero fijaba la contraseña y quedaba como administrador. |
| Impacto | Toma total de la clínica: datos clínicos, cobros, usuarios. |
| Solución | El seed nunca deja `admin`/`admin`: <ul><li>**Instalación nueva:** usa `ADMIN_PASSWORD`; si no está, genera una contraseña aleatoria (`Dova-…`, bcrypt 12) y la muestra una sola vez en el registro del deploy.</li><li>**Base existente en producción que todavía tenga `admin`:** la reemplaza de la misma forma, cierra todas sus sesiones (`token_version`, refresh tokens revocados) y deja `debe_cambiar_clave=true`.</li><li>**Contraseña ya cambiada:** no se toca.</li><li>**En desarrollo:** solo exige el cambio.</li></ul> |
| Prueba | Corrida del seed en una base aparte (`dova_seedtest`): instalación nueva, segunda corrida sin cambios y reemplazo en producción. Además, `ui-primer-ingreso` (5/5) y `endurecimiento.test.js` (403 `DEBE_CAMBIAR_CLAVE`). |
| Estado | **FIXED.** Se aplica en el próximo deploy. Ver la sección 5, punto 1. |

### 🟠 ALTAS

#### A1 · Tokens de sesión guardados en `localStorage` (robables ante un XSS)
| | |
|---|---|
| Severidad | ALTA |
| Archivos | <ul><li>`backend/src/modules/auth/auth.controller.js` (líneas 5-21)</li><li>`auth.service.js` (`emitirSesion`, `refresh` 140-171, `logoutTodas` 208)</li><li>`backend/src/utils/cookies.js` (nuevo)</li><li>`backend/src/config/seguridad.js` (nuevo)</li><li>`frontend/shared/api.js` (línea 18 en adelante)</li><li>`frontend/shared/tiempo-real.js`</li><li>`modules/web/portal.service.js` (`autenticar`, ~línea 215)</li><li>`modules/web/web.routes.js`</li><li>`frontend/web/web.js`</li><li>migración `0040_sesiones_cookies.js`</li></ul> |
| Causa | El access token y el refresh token (7 días) del personal, y el token del portal del paciente, vivían en `localStorage`. |
| Impacto | Cualquier XSS futuro permitía robar sesiones de larga duración. |
| Solución (de punta a punta) | <ul><li>**Access token:** JWT HS256 de 15 min con `jti` y `tv`, **solo en memoria**. Al recargar la página se renueva con la cookie.</li><li>**Refresh token del personal:** solo en la cookie `dova_rt` (`HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, `Secure` en https; con `COOKIES_SIEMPRE_SECURE=true`, siempre). Nunca aparece en el cuerpo de una respuesta.</li><li>**Rotación** en cada uso, con 60 s de gracia para dos pestañas. Si se reutiliza un token rotado, se cierran **todas** las sesiones y queda auditado `refresh_reutilizado`.</li><li>**Duración:** vence por inactividad (`SESSION_IDLE_TIMEOUT_DAYS`, 7) y por tope absoluto desde el login (`SESSION_ABSOLUTE_MAX_DAYS`, 30), con `sesion_id`/`sesion_inicio`.</li><li>**Cierre de sesiones:**<ul><li>"Cerrar sesión en todos los dispositivos" (`POST /api/auth/logout-todas`, en Configuración → Seguridad);</li><li>"Cerrar todas sus sesiones" desde la ficha de un usuario (`POST /api/usuarios/:id/cerrar-sesiones`, con `usuarios.manage` y la regla anti-escalada de admin sobre admin).</li></ul></li><li>**Portal del paciente:** cookie propia `dova_portal` (`HttpOnly`, `Strict`, `Path=/api/web/cuenta`). "Salir" revoca el `jti` en el servidor.</li><li>**Migración sin cortar a nadie:** las sesiones guardadas por la versión anterior se pasan solas a cookie la primera vez. El token en el cuerpo (personal) o en la cabecera `Bearer` (portal) **solo se acepta si es de antes del cambio** (refresh sin `sesion_id`, JWT del portal sin `jti`). Uno nuevo robado de una cookie no sirve fuera de la cookie.</li></ul> |
| Prueba | <ul><li>`endurecimiento.test.js`: rotación, reutilización, nada de tokens en el cuerpo, refresh nuevo por cuerpo da 401, sin anti-CSRF da 403, cookie con los atributos correctos.</li><li>`ui-sesiones` (19/19): nada en `localStorage`, la recarga mantiene la sesión, `logout-todas` echa al otro dispositivo, la migración funciona, cookie del portal y `/salir` invalidan una copia.</li></ul> |
| Estado | **FIXED** |

#### A2 · Un cobro de 1 Gs. aplicado a una cuota la marcaba pagada (y se podía usar la cuota de otro paciente)
| | |
|---|---|
| Severidad | ALTA (integridad financiera) |
| Archivo | `backend/src/modules/pagos/pagos.service.js`, líneas 52-58 |
| Causa | `crear()` validaba que la cuota fuera de la clínica, pero no que fuera del paciente del cobro ni que el monto la cubriera. |
| Impacto | <ul><li>Cuotas saldadas con cualquier monto.</li><li>Cobro a un paciente que salda la deuda de otro.</li><li>Estados de cuenta y planes falsos.</li></ul> |
| Solución | La cuota tiene que ser del mismo paciente, y un monto menor que la cuota se rechaza con un mensaje claro ("cobralo sin aplicarlo a la cuota"). |
| Prueba | `auditoria2.test.js`: "Cobrar 1 Gs. aplicado a una cuota mayor: 400" y "…cuota de OTRO paciente: 400". |
| Estado | **FIXED** |

#### A3 · Referencias entre clínicas por el cuerpo del pedido (IDOR por asignación masiva)
| | |
|---|---|
| Severidad | ALTA (aislamiento entre clínicas) |
| Archivos | <ul><li>`modules/usuarios/usuarios.service.js` (`odontologoDeLaClinica`, línea 128)</li><li>`modules/inventario/inventario.service.js` (`exigirProveedorPropio`, línea 18)</li></ul> |
| Causa | <ul><li>Alta y edición de usuarios guardaban `odontologoId` sin comprobar la clínica.</li><li>Alta de insumos y compras guardaban `proveedorId` sin comprobarla (la edición sí lo hacía).</li></ul> |
| Impacto | Una clínica podía enlazar filas a datos de otra y ver su nombre en los listados, por ejemplo el proveedor de la otra clínica. |
| Solución | Se valida que el profesional y el proveedor sean de la misma clínica, en todas las altas y ediciones. |
| Prueba | <ul><li>`inyeccion-fk.js`: 79 POST de alta como Clínica B, con IDs de la Clínica A en todos los campos `*Id`/`*_id` y en `clinicaId`/`clinica_id`. Resultado: 0 filas en la A y 0 filas de la B que apunten a la A.</li><li>`auditoria2.test.js`: "Vincular a un usuario un profesional de OTRA clínica: 400".</li></ul> |
| Estado | **FIXED** |

#### A4 · Usuario de base de datos con todos los privilegios
| | |
|---|---|
| Severidad | ALTA |
| Archivos | <ul><li>`backend/scripts/crear-usuario-app.sql` (nuevo)</li><li>`backend/scripts/migrar.js` (nuevo)</li><li>`backend/src/server.js` (líneas 1-5)</li><li>`backend/src/db/seed.js` (línea 12)</li><li>`package.json` (`migrate:up`)</li></ul> |
| Causa | La aplicación usa el usuario dueño de la base. Puede `DROP`, `ALTER`, `TRUNCATE` y saltear el bloqueo de la auditoría con `SET dova.permitir_auditoria='on'`. |
| Impacto | Una inyección SQL o un error grave podría destruir el esquema o borrar la auditoría. |
| Solución | Separación de usuarios: <ul><li>`dova_app`: solo `SELECT/INSERT/UPDATE/DELETE` y secuencias; sin `CREATE` en el esquema; sin escritura en `pgmigrations`; **sin `UPDATE/DELETE/TRUNCATE` en `auditoria`**; privilegios por defecto para las tablas futuras.</li><li>Las migraciones y el seed usan `MIGRATION_DATABASE_URL` o `DATABASE_URL` (dueño).</li><li>La aplicación en marcha usa `APP_DATABASE_URL` si está; si no, `DATABASE_URL`.</li><li>Nada destructivo: el script es idempotente y no cambia datos.</li></ul> |
| Prueba | Se creó `dova_app` en la base de prueba y **toda la suite corrió con el servidor conectado como `dova_app`** (se verificó en `pg_stat_activity`). Con `dova_app`: <ul><li>`CREATE TABLE`: denegado;</li><li>`DROP`/`ALTER pacientes`: "must be owner";</li><li>`TRUNCATE auditoria`: denegado;</li><li>`SET dova.permitir_auditoria` + `DELETE auditoria`: denegado;</li><li>`INSERT pgmigrations`: denegado;</li><li>`CREATE ROLE`: denegado.</li></ul>Las migraciones y el seed corrieron con el usuario de migración, y el seed funcionó aunque `DATABASE_URL` tenía una clave inválida. |
| Estado | **REQUIRES INFRASTRUCTURE CHANGE** (ver sección 5, punto 2) |

### 🟡 MEDIAS

| # | Problema | Archivo / línea | Causa e impacto | Solución | Prueba | Estado |
|---|---|---|---|---|---|---|
| M1 | Importes sin validar del todo | <ul><li>`utils/montos.js` (nuevo)</li><li>`pagos.service.js:37`</li><li>`caja.service.js:67, 95, 148`</li><li>`planespago.service.js:23`</li><li>`presupuestos.service.js:35`</li><li>`utils/recurso.js:54`</li><li>`inventario.service.js:42, 111`</li></ul> | <ul><li>`Number('abc') <= 0` es falso, así que un movimiento de caja con monto `"abc"` pasaba la validación.</li><li>Se aceptaban `Infinity`, `1e400`, montos desmesurados, cuotas fraccionarias y cantidades infinitas.</li></ul>Resultado: errores 500 o datos absurdos en caja, planes y presupuestos. | Validador único: número finito, mayor a cero (o ≥ 0 donde corresponde), 2 decimales, tope de 100.000 millones. Cuotas enteras de 1 a 60. Descuento de 0 a 100. | `auditoria2.test.js`: 30 casos de importes inválidos. | **FIXED** |
| M2 | Sesiones sin vencimiento absoluto | `auth.service.js:150` | Con la rotación, una sesión usada una vez por semana no vencía nunca. | Tope absoluto configurable (`SESSION_ABSOLUTE_MAX_DAYS`, 30) e inactividad (`SESSION_IDLE_TIMEOUT_DAYS`, 7). | Revisión de código y vencimiento calculado por servidor (`refreshVence`). | **FIXED** |
| M3 | Avisos en tiempo real de tablas sin `clinica_id` | migración 0040 y `utils/tiempoReal.js:19` | Los cambios de `cuotas` y `caja_movimientos` llegaban como aviso (tabla e id) a pantallas de todas las clínicas. | El disparador deriva la clínica (vía `planes_pago` y `caja_aperturas`). Si no hay clínica, no avisa. El repartidor descarta eventos sin clínica o de otra. | `auditoria2.test.js`: la Clínica B no recibe los avisos de la A; los avisos no traen datos personales. | **FIXED** |
| M4 | Conexiones de tiempo real sin topes ni cierre al terminar la sesión | `utils/tiempoReal.js:59-91` | <ul><li>Sin tope por usuario ni global: agotamiento de memoria.</li><li>Un `EventSource` abierto seguía recibiendo avisos después de un logout, una baja o un cambio de contraseña.</li></ul> | <ul><li>Máximo 8 por usuario (cierra la más vieja) y 2.000 en total (503), configurables.</li><li>`cerrarJti` en logout y `cerrarUsuario` al invalidar sesiones.</li></ul> | `auditoria2.test.js`: "al cerrar sesión se corta la conexión abierta"; 401 sin sesión o con token inválido. | **FIXED** |
| M5 | Límite "por usuario" evitable | `middlewares/limite.middleware.js:91` | Se leía el `sub` del JWT **sin verificar la firma**. Inventando tokens se repartían pedidos entre "usuarios" falsos. | Se verifica la firma (HS256). Si no es válida, se cuenta por IP. | Revisión de código, `lint`, regresión. | **FIXED** |
| M6 | Límites de pedidos solo en memoria y valores fijos en el código | <ul><li>`limite.middleware.js`</li><li>`config/seguridad.js`</li><li>`app.js:51, 118`</li><li>migración `0041_limites_compartidos.js`</li></ul> | Con más de una instancia, cada una contaba por separado. Los topes estaban fijos en el código. | <ul><li>Configuración centralizada por variables de entorno.</li><li>Almacén intercambiable con la interfaz `contar(clave, ventana)`: `memoria` (por defecto) o `postgres` (tabla UNLOGGED, `RATE_LIMIT_STORE=postgres`).</li><li>Lo usan login, refresh, contraseña y portal.</li><li>Si el almacén compartido falla, se cuenta en memoria: nunca queda sin límite.</li><li>Redis entra escribiendo otro almacén con la misma interfaz.</li></ul> | Con `RATE_LIMIT_STORE=postgres` y el usuario `dova_app`: el login devuelve 429 y los contadores quedan en la tabla. | **MITIGATED.** Redis: **REQUIRES INFRASTRUCTURE CHANGE** si se escala. |
| M7 | Enumeración de pacientes al registrarse en la web | `modules/web/portal.service.js:91` y `frontend/web/web.js` | Registrarse con una cédula existente respondía 409 "Esa cédula ya está registrada". | <ul><li>Respuesta genérica ("Recibimos tus datos… la clínica te manda un código").</li><li>No se abre sesión ni se toma la ficha.</li><li>Recepción recibe el pedido de código automáticamente; el paciente legítimo sigue su camino.</li><li>"Pedir mi código" y "activar" ya respondían igual exista o no la cédula.</li></ul> | <ul><li>`portal-api` y `registro-api`: no confirma la ficha y crea el pedido.</li><li>`ui-registro` 29/29.</li></ul> | **MITIGATED.** Residual: una cédula nueva sí abre la cuenta al instante (diferencia observable). Se mantuvo para no quitar el alta inmediata; queda limitado a 5 registros cada 30 min por IP y cada intento crea una ficha visible para recepción. |
| M8 | Asignación masiva en datos de caja auditados | `caja.service.js:106` | La auditoría guardaba el cuerpo completo del pedido de caja. | Se guardan solo los campos validados. | Revisión y regresión. | **FIXED** |

### 🟢 BAJAS

| # | Problema | Archivo | Solución | Estado |
|---|---|---|---|---|
| B1 | Rutas de archivos viejos en disco (`storage_path`) usadas sin comprobar que estén dentro de la carpeta de subidas. Si alguien alterara la base, se podría leer o borrar cualquier archivo. | `utils/upload.js:69` (`rutaSegura`), `extras.service.js:104`, `helpdesk.controller.js:38`, `helpdesk.service.js` | Ruta resuelta y `realpath` dentro de `UPLOADS_DIR`; si no, 404. Nombre de descarga saneado. | **FIXED** (prueba: `/etc/passwd`, `../../../etc/passwd`, `/proc/self/environ` → 404) |
| B2 | Vulnerabilidad alta en dependencia de desarrollo (`braces` vía `nodemon`, sin versión corregida). | `backend/package.json` | Se quitó `nodemon`; `npm run dev` usa `node --watch`. `npm audit`: 0. | **FIXED** |
| B3 | `trust proxy` fijo en el código. | `app.js:51` | `TRUST_PROXY_SALTOS` (Render = 1). | **FIXED** |
| B4 | Sin análisis estático ni verificación de sintaxis antes del deploy. | `eslint.config.js`, `scripts/verificar-sintaxis.js` | `npm run lint` (recomendadas + `no-eval`/`no-implied-eval`/`no-new-func`) y `npm run build` (`node --check` de 205 archivos). 9 avisos corregidos (variables sin uso, escapes, BOM literal). | **FIXED** |
| B5 | El bloqueo temporal del portal ("la cuenta quedó bloqueada") solo aparece en cuentas existentes. | `portal.service.js` (`ingresar`) | Se mantiene: avisar al paciente legítimo es más útil. Requiere 5 fallos y el límite por IP sigue activo. | **ACCEPTED RISK** |

---

## 3. 🟢 Controles que ya estaban bien (verificados de nuevo)

- **RBAC en el servidor:** `requirePermiso` en todas las rutas de datos. Las denegaciones quedan auditadas (`acceso_denegado`). La pantalla solo esconde botones; el backend decide.
- **Escalada de privilegios:**
  - nadie da permisos que no tiene;
  - nadie cambia su propio rol ni se da de baja;
  - solo un admin toca a otro admin;
  - el admin protegido no pierde el rol.
- **Aislamiento entre clínicas:** todas las consultas filtran por la `clinica_id` del token. El token con la clínica cambiada se rechaza (`tv` + `clinicaId` contra la base).
- **SQL:** todas las consultas son parametrizadas. Los nombres de tablas y columnas dinámicos salen de listas fijas del código (`utils/recurso.js`), nunca del pedido.
- **Asignación masiva:** listas blancas de campos (`recurso.js` y servicios). `clinica_id`, `id`, `estado`, `usuario_id`, `total`, `es_admin_protegido`, `password_hash` y `token_version` del cuerpo se ignoran (probado).
- **XSS:** todo el texto se escapa en pantalla y la CSP es `script-src 'self'`, sin scripts en línea.
- **Archivos:**
  - se validan por contenido (bytes mágicos), no por la extensión ni por el tipo declarado;
  - se guardan en la base (`bytea`);
  - se descargan con `nosniff` y nombre saneado;
  - un archivo de otra clínica da 404.
- **Exportaciones:** exigen su permiso (`pacientes.export`, reportes) y respetan la clínica.
- **Finanzas:**
  - el total del presupuesto y de la factura lo calcula el servidor;
  - las transiciones de estado se validan;
  - las notas de crédito no superan el saldo;
  - una restricción única impide pagar dos veces la misma cuota;
  - las facturas emitidas no se borran.
- **Contraseñas y JWT:**
  - bcrypt con bloqueo por intentos fallidos;
  - mismo tiempo de respuesta si el usuario no existe;
  - JWT con algoritmo fijo (HS256: `none`, HS512 y otra firma dan 401).
- **Auditoría:**
  - registra quién, qué, IP y resultado (ok, denegado o fallido), sin contraseñas ni tokens;
  - es inmutable por disparador.
- **Cabeceras:** Helmet con CSP estricta, HSTS, `Referrer-Policy`, `Permissions-Policy` y `nosniff`.
- **CORS:** en producción, solo el propio sitio (más `CORS_ORIGIN`), sin credenciales.
- **Errores:** los 500 son genéricos, con un código de referencia.
- **Registros del servidor:** sin nombres de pacientes ni tokens en las URL (morgan `url-segura`).
- **Secretos:**
  - búsqueda en todo el repositorio de claves de API, URLs con contraseña y claves privadas: no se encontraron secretos;
  - `backend/.env` no se versiona;
  - los secretos JWT los genera Render, y el servidor no arranca en producción con secretos débiles o de ejemplo.

## 4. Estrategia CSRF

- **API del personal:** el token de acceso va en la cabecera `Authorization`, que un sitio ajeno no puede poner, así que esa parte no es vulnerable a CSRF.
- **Endpoints que usan cookies** (`/api/auth/refresh`, `/logout`, `/logout-todas` y toda la cuenta del portal `/api/web/cuenta/*`). Tienen tres barreras:
  1. Cookie `SameSite=Strict`, que el navegador no envía desde otro sitio.
  2. Cabecera obligatoria `X-DOVA-CSRF: 1`, que un formulario o una imagen ajenos no pueden poner y un `fetch` de otro origen no puede mandar sin pasar por CORS (que no lo permite).
  3. Si viene `Origin`, tiene que ser el propio sitio o uno de `CORS_ORIGIN`.

  Se comprobó: sin la cabecera da 403; con `Origin: https://sitio-malicioso.example` da 403.

## 5. ⚠️ REQUIERE CONFIGURACIÓN DE INFRAESTRUCTURA

1. **Contraseña del `admin` en Render (C1).**
   - En el próximo deploy, si el `admin` todavía tiene `admin`, el seed la reemplaza por una aleatoria y la imprime **una vez** en el registro del build/pre-deploy de Render (solo lo ven los dueños de la cuenta). Hay que cambiarla al entrar.
   - Alternativa: definir `ADMIN_PASSWORD` en Render → dova → Environment **antes** de desplegar.
   - Si ya se había cambiado, no se toca.
2. **Usuario de base con mínimo privilegio (A4).** Se hace una vez:
   1. En Render → base `dova-db` → Connect, copiar la **External Database URL** (usuario dueño).
   2. Desde una PC con `psql`, en la carpeta `backend`:
      ```
      psql "<URL externa>" -v clave="'<clave larga aleatoria>'" -f scripts/crear-usuario-app.sql
      ```
   3. En Render → servicio dova → Environment, agregar `APP_DATABASE_URL` = la **Internal Database URL**, cambiando usuario y clave por `dova_app` y la clave elegida. `DATABASE_URL` (del Blueprint) queda para migraciones y seed.
   4. Guardar y desplegar. Verificar que la app inicia y que se puede ingresar.

   Notas:
   - Si en el plan de Render el usuario dueño no puede crear roles (`CREATE ROLE` denegado), el paso no se puede hacer desde la base. Hay que pedirlo a soporte de Render o dejarlo pendiente: la app funciona igual con el usuario dueño.
   - Para volver atrás, alcanza con borrar `APP_DATABASE_URL`.
3. **Copias de seguridad.** No dependen del código.
   - Pasar a la base paga (`render-pago.yaml`) y confirmar las copias automáticas.
   - Además, un `pg_dump` periódico con la URL externa, guardado fuera de Render, y probar una restauración.
   - En el plan gratis la base se borra a los 30 días.
4. **Varias instancias.** Hoy hay una sola y alcanza con la memoria. Si se escalara:
   - `RATE_LIMIT_STORE=postgres` (ya disponible), o un almacén Redis nuevo con la misma interfaz;
   - el tiempo real ya usa `LISTEN/NOTIFY` de Postgres y funciona con varias instancias.
5. **Variables nuevas** (ya incluidas en `render.yaml` y `render-pago.yaml`, con valores por defecto seguros):
   - `SESSION_IDLE_TIMEOUT_DAYS=7`
   - `SESSION_ABSOLUTE_MAX_DAYS=30`
   - `COOKIES_SIEMPRE_SECURE=true`

   Opcionales:
   - `TRUST_PROXY_SALTOS` (1)
   - `RATE_LIMIT_STORE`
   - `LOGIN_LIMITE_USUARIO_POR_MINUTO`, `LOGIN_LIMITE_IP_POR_MINUTO`
   - `REFRESH_LIMITE_POR_MINUTO`, `PORTAL_LOGIN_LIMITE_POR_MINUTO`
   - `WEB_LIMITE_POR_MINUTO`, `EXPORT_LIMITE_POR_MINUTO`, `API_LIMITE_POR_MINUTO`
   - `SSE_MAX_POR_USUARIO`, `SSE_MAX_TOTAL`
6. **Rotación de secretos.** No se encontró ningún secreto en el código, así que no hace falta rotar por filtración. Si alguna vez se compartió el `.env` de producción, regenerar `JWT_SECRET` y `JWT_REFRESH_SECRET` en Render (cierra todas las sesiones).

## 6. Migraciones de esta ronda (solo nuevas, no destructivas)

- `0040_sesiones_cookies.js`:
  - `refresh_tokens.sesion_id` y `sesion_inicio`;
  - `web_cuentas.sesion_inicio`;
  - disparador de tiempo real con la clínica derivada para `cuotas` y `caja_movimientos`.
- `0041_limites_compartidos.js`: tabla UNLOGGED `limites_pedidos`, para el almacén `postgres` de los límites.

No se editó ninguna migración anterior.
