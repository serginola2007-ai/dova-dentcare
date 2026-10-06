# DOVA — Auditoría de seguridad y endurecimiento (octubre 2026)

Esta auditoría revisa el sistema completo como si se fuera a poner en producción en una clínica real: backend, API, base de datos, archivos, sesiones, configuración y frontend.

**Alcance:**
- Las 512 rutas de la API.
- Las 190 relaciones entre tablas de la base.
- Los flujos del personal, del paciente (portal) y del público (página web).

No se agregaron funciones nuevas ni se rediseñó la interfaz. **No se declara que el sistema sea "100 % seguro":** el objetivo fue reducir la superficie de ataque y dejar documentado lo que queda.

## Cómo se auditó

1. **Inventario automático de rutas** (`backend/tests/seguridad/enumerar-rutas.py`): método, ruta, permiso exigido y archivo.
2. **Barrido de autenticación y autorización** sobre las 512 rutas:
   - Sin sesión, todas responden 401.
   - Con un usuario sin ningún permiso, todas responden 403.
   - Excepciones: las rutas públicas y las que son de "cualquier usuario logueado" (sus propias notificaciones, su diseño, la búsqueda que filtra por permisos).
3. **IDOR y aislamiento entre clínicas:**
   - Se creó una segunda clínica con un administrador que tiene todos los permisos.
   - Ese administrador intentó unos 5.500 pedidos de lectura y escritura sobre los recursos de un paciente de la otra clínica, cambiando los IDs.
   - Además se verificó en la base que ninguna fila apunte a datos de otra clínica.
4. **XSS dinámico:**
   - Se guardó HTML malicioso en todos los campos que escriben el personal, el paciente en el portal y el público en la web.
   - Se recorrieron 14 pantallas con todas sus pestañas, más el portal, buscando elementos inyectados.
5. **Revisión de código:**
   - Consultas SQL.
   - Asignación masiva de campos.
   - Subidas de archivos.
   - Sesiones y tokens.
   - Errores.
   - Registros.
   - Cabeceras y CORS.
   - Secretos.
   - Dependencias (`npm audit`).

## Lo que ya estaba bien (verificado, no se tocó)

- **Contraseñas:**
  - Se guardan con bcrypt (con sal y costo 10), nunca en texto plano.
  - El login bloquea 15 minutos tras 5 fallos por usuario o 30 por IP.
  - El mensaje de error es el mismo exista o no el usuario.
- **SQL:** todas las consultas usan parámetros. Los nombres de columnas y tablas que se arman dinámicamente salen de listas fijas del código, nunca del pedido.
- **Asignación masiva:** pacientes, usuarios, configuración y recursos genéricos solo aceptan campos de una lista permitida. Mandar `rol`, `permisos` o `es_admin` no tiene efecto.
- **Autorización:** el permiso se exige en el servidor en cada ruta, y los permisos se recalculan desde la base en cada pedido (no se confía en el token).
- **Aislamiento entre clínicas:** cero fugas en las 5.500 pruebas de ID y cero relaciones cruzadas en la base.
- **Portal:**
  - Tokens separados de los del personal y bloqueo por cuenta.
  - Códigos de activación de un solo uso con 5 intentos.
  - Cada documento se busca siempre por el paciente de la sesión.
- **Archivos clínicos:**
  - Se guardan en la base, nunca en carpetas públicas.
  - El tipo se valida por los primeros bytes (no por la extensión).
  - Se descargan solo con permiso.
  - Nombres internos aleatorios.
  - No se aceptan SVG ni HTML.
- **Secretos:**
  - El `.env` no está en el repositorio ni en el historial.
  - Los JWT de Render se generan automáticamente.
  - El frontend no contiene secretos.
- **CSRF:** DOVA no usa cookies; la sesión viaja en la cabecera `Authorization`. Un sitio ajeno no puede hacer pedidos en nombre del usuario, así que no hace falta un token CSRF.

## Hallazgos y correcciones

### CRÍTICAS

**C1. La contraseña inicial obligatoria solo la exigía la pantalla**
- **Ubicación:** `backend/src/middlewares/auth.middleware.js`.
- **Impacto:** el usuario `admin` de una instalación nueva tiene contraseña `admin`. La pantalla obligaba a cambiarla, pero la API respondía igual. Alguien que conociera la contraseña por defecto podía operar todo el sistema por la API sin cambiarla nunca.
- **Solución aplicada:**
  - Mientras `debe_cambiar_clave` esté activo, la API responde 403 `DEBE_CAMBIAR_CLAVE` a todo, salvo al cambio de contraseña.
  - En instalaciones nuevas en producción sin `ADMIN_PASSWORD`, el seed genera una contraseña aleatoria y la muestra una sola vez en el registro del deploy (`backend/src/db/seed.js`).
  - Las contraseñas que pone un administrador (alta o blanqueo) son temporales: la persona tiene que cambiarlas al entrar.
- **Prueba:** `endurecimiento.test.js` ("Con la contraseña inicial la API responde 403") y `ui-primer-ingreso` (flujo completo en pantalla).

### ALTAS

**A1. Escalada de privilegios desde la gestión de usuarios**
- **Ubicación:** `backend/src/modules/usuarios/usuarios.service.js`.
- **Impacto:** cualquiera con `usuarios.manage` o `roles.manage` (por ejemplo, un encargado al que se le diera ese permiso) podía:
  - darse a sí mismo cualquier permiso;
  - pasarse al rol administrador;
  - crear administradores;
  - blanquear la contraseña del administrador y entrar como él;
  - ampliar los permisos de su propio rol.
- **Solución aplicada:**
  - Nadie puede dar permisos que no tiene (salvo el administrador).
  - Nadie puede cambiar su propio rol, sus permisos ni darse de baja.
  - Solo un administrador puede tocar a otro administrador o asignar ese rol.
  - El blanqueo propio va por "Cambiar mi contraseña", que pide la actual.
  - Se validan los códigos de permiso.
  - La auditoría de cambios de rol guarda el antes y el después.
- **Prueba:** `endurecimiento.test.js`, 11 casos de anti-escalada.

**A2. Las sesiones no se cerraban al cambiar la contraseña, dar de baja o cambiar el rol**
- **Ubicación:** `auth.service.js`, `auth.middleware.js`, nuevo `utils/sesiones.js`, migración 0039.
- **Impacto:** si a alguien le robaban la contraseña o el token, blanquearla no echaba al intruso. El token de acceso seguía valiendo hasta 15 minutos y el de renovación hasta 7 días. Cerrar sesión tampoco anulaba el token de acceso.
- **Solución aplicada:**
  - `usuarios.token_version`: al cambiar o blanquear la contraseña, cambiar el rol o dar de baja, todas las sesiones de esa persona se cierran al instante.
  - Al cerrar sesión, el token de acceso entra en una lista de bloqueo hasta que vence.
  - Los refresh tokens rotan en cada uso. Si se reutiliza uno viejo pasado un margen de 60 segundos, se asume robo: se cierran todas las sesiones y queda en la auditoría.
  - El margen de 60 segundos existe para que dos pestañas abiertas no se echen entre sí.
- **Prueba:** `endurecimiento.test.js` (blanqueo, cierre de sesión, rotación, reutilización).

**A3. La política de contenido permitía scripts en línea**
- **Ubicación:** `backend/src/app.js` (CSP) y los `index.html` de los 3 diseños.
- **Impacto:** si algún texto se mostrara sin escapar, el navegador lo ejecutaría y podría robar la sesión guardada en el navegador.
- **Solución aplicada:**
  - Los scripts en línea de las pantallas pasaron a archivos (`shared/pre-diseno.js`, `shared/arranque.js`).
  - La impresión ya no inyecta un script.
  - La política queda en `script-src 'self'`: ningún script en línea puede ejecutarse.
- **Prueba:**
  - `endurecimiento.test.js` (CSP y "las pantallas no tienen scripts en línea").
  - `ui-xss` (14 pantallas sin HTML inyectado y sin bloqueos de la política).
  - Regresión completa de pantallas en verde.

**A4. Datos de salud visibles para quien no tiene permisos clínicos**
- **Ubicación:** `backend/src/modules/pacientes/pacientes.controller.js`.
- **Impacto:** recepción (sin permisos clínicos) recibía en la ficha y en el listado las alergias, la medicación, los antecedentes y el grupo sanguíneo, y podía modificarlos desde el formulario administrativo.
- **Solución aplicada:** sin `pacientes.clinical.view` o `historia_clinica.*`, esos campos no se envían y no se pueden escribir. El resto de la ficha sigue igual.
- **Prueba:** `endurecimiento.test.js` ("Recepción no recibe alergias", "no puede pisarlas", "tampoco en el listado").

### MEDIAS

| # | Problema | Ubicación | Solución | Prueba |
|---|---|---|---|---|
| M1 | Los errores 500 devolvían el mensaje interno (por ejemplo, el texto del error de SQL). | `middlewares/error.middleware.js` | Mensaje genérico con un código de referencia; el detalle queda en el registro del servidor. | `endurecimiento.test.js` |
| M2 | Un archivo de tipo o tamaño no permitido daba 500. | `error.middleware.js` | Responde 400 o 413. | `endurecimiento.test.js` |
| M3 | Sin `CORS_ORIGIN`, la API aceptaba cualquier origen con credenciales. | `app.js`, `config/env.js` | En producción solo el propio sitio (y lo que se liste en `CORS_ORIGIN`), sin credenciales. | `endurecimiento.test.js` |
| M4 | El logo de facturas confiaba en el tipo que declara el navegador: un archivo disfrazado rompía la impresión de facturas. | `facturacion.service.js` | Se valida por contenido (PNG o JPG). | `endurecimiento.test.js` |
| M5 | Los adjuntos de ayuda técnica confiaban en el tipo declarado. | `helpdesk.service.js` | El contenido tiene que coincidir con el tipo. | `endurecimiento.test.js` |
| M6 | El registro del servidor guardaba las búsquedas completas (nombres de pacientes) y los tokens de los enlaces de turnos. | `app.js` (morgan) | Se registran solo la ruta y el nombre de los parámetros; los tokens se enmascaran. | `endurecimiento.test.js` |
| M7 | Contraseñas del personal de 6 caracteres, sin más reglas. | `utils/sesiones.js` | Mínimo 8, con letras y números, y no comunes ni con el nombre de usuario. | `endurecimiento.test.js` |
| M8 | Sin límites de pedidos fuera del login y de la web pública. | nuevo `middlewares/limite.middleware.js` | Límites por usuario o IP en login, refresh, cambio de contraseña, portal, web pública, búsqueda, exportaciones, subidas y un tope general. | `endurecimiento.test.js` (429) |
| M9 | La auditoría se podía modificar o borrar desde la base. | migración 0039 | Trigger que bloquea UPDATE, DELETE y TRUNCATE (también al propio servidor). | `endurecimiento.test.js` |
| M10 | Dependencias con vulnerabilidades: nodemailer (alta) y uuid (moderada, vía exceljs). | `package.json` | nodemailer 10 (API compatible, probada) y versión de uuid corregida por override. `npm audit` da 0. | prueba de envío y de Excel |
| M11 | La limpieza de adjuntos vencidos de ayuda técnica actuaba sobre todas las clínicas. | `helpdesk.*` | Queda limitada a la clínica de quien la ejecuta. | barrido IDOR |

### BAJAS

| # | Problema | Solución |
|---|---|---|
| B1 | El tiempo de respuesta del login revelaba si un usuario existía. | Comparación con un hash falso cuando el usuario no existe. |
| B2 | Los JWT no fijaban el algoritmo. | Se exige HS256 (personal y portal). Un token con `alg:none` se rechaza (probado). |
| B3 | Algunos `limite` o `page` negativos o enormes daban error 500. | Valores acotados. |
| B4 | Faltaban `Permissions-Policy` y una `Referrer-Policy` explícita. | Agregadas, junto con HSTS de 1 año. |
| B5 | Los secretos JWT no se controlaban al arrancar. | En producción no arranca con secretos de ejemplo o de menos de 16 caracteres, ni con los dos secretos iguales; avisa si tienen menos de 32. |
| B6 | Las derivaciones y los adjuntos de ayuda guardaban archivos en el disco y exponían su ruta interna. | Ya estaba corregido en el cierre integral anterior (migración 0038). |

## Problemas que no pude corregir (requieren acción externa)

1. **Contraseña del `admin` en producción.** No tengo acceso a la base de Render ni corresponde probar credenciales en producción.
   - Si el administrador todavía tiene la contraseña inicial `admin`, cualquiera que llegue primero a la pantalla podría entrar y fijar su propia contraseña.
   - **Acción:** entrar ya y cambiarla, o definir `ADMIN_PASSWORD` en Render.
2. **Copias de seguridad: no existen en el código.** El permiso `backup.manage` existe, pero no hay función de respaldo.
   - En el plan gratis de Render la base se borra a los 30 días.
   - **Acción:** pasar al plan pago (`render-pago.yaml`) y confirmar en el panel de Render que la base tenga copias automáticas.
   - Además, conviene un respaldo propio periódico (`pg_dump` con la URL externa, guardado fuera de Render) y probar una restauración al menos una vez.
3. **Usuario de base de datos con todos los privilegios.** DOVA usa la cuenta que crea Render, dueña de la base.
   - Lo ideal es un rol de aplicación sin permisos para modificar el esquema y otro para las migraciones. Eso se configura en la base, no en el código.
   - Mientras tanto, el trigger de la auditoría la protege también de la propia aplicación.
4. **Sesión guardada en el navegador.** Los tokens de acceso y de renovación están en `localStorage`.
   - Si un día apareciera un XSS, podrían robarse.
   - Hoy está mitigado: la política estricta de scripts, todas las pantallas escapando el texto (verificado en el barrido de XSS), tokens de acceso de 15 minutos y rotación del de renovación.
   - Pasar a cookies HttpOnly es un cambio de arquitectura (con protección CSRF) que no se hizo para no romper la app instalada.
5. **Límites de pedidos en memoria.** Valen con un solo servidor (como en Render hoy). Si se escalara a varias instancias, habría que moverlos a un almacenamiento compartido (por ejemplo Redis).
6. **Registro de pacientes en la web.** Al registrarse con una cédula que ya es de la clínica, la respuesta lo indica (necesario para guiar al paciente a pedir su código). Eso permite saber si una cédula es paciente. Está limitado a 5 intentos cada 30 minutos por IP.
7. **Sesiones sin vencimiento absoluto.** Con la rotación, una sesión usada al menos una vez por semana no vence nunca. Se cierra con logout, cambio de contraseña o baja. Si se quisiera, se puede agregar un tope absoluto (por ejemplo 30 días).
8. **Eventos en tiempo real de tablas sin clínica.** Para tablas como `cuotas`, el aviso "algo cambió" llega a las pantallas de todas las clínicas conectadas. No incluye datos: cada pantalla vuelve a pedir lo suyo con sus permisos.

## Verificación final

Todo se corrió contra un servidor local en modo producción con la base de prueba.

**Seguridad (nuevas):**

| Prueba | Resultado |
|---|---|
| Barrido de rutas | 512/512 sin anomalías |
| IDOR entre clínicas | 5.468 pedidos, 0 fugas, 0 modificaciones |
| Integridad entre clínicas | 190 relaciones, 0 cruzadas |
| `multiclinica.test.js` | 23/23 |
| `permisos-por-rol.test.js` | 65/65 |
| `endurecimiento.test.js` | 59/59 |
| XSS en pantallas del personal | 4/4 |
| Portal: XSS e IDOR | 7/7 |
| Primer ingreso con contraseña temporal | 5/5 |

**Regresión de API:**

| Prueba | Resultado |
|---|---|
| fase1-api | 28 |
| fase2-api | 23 |
| fase3-api | 17 |
| fase4-api | 36 |
| fase5-api | 77 |
| flujo completo de punta a punta | 38 |
| adjuntos-api | 12 |
| fact-api | 63 |
| fact-ingresos | 21 |
| portal-api | 62 |
| web-api | 51 |
| registro-api | 20 |

**Regresión de pantallas:**

| Prueba | Resultado |
|---|---|
| ui-anio | 164/164 |
| ui-menu | 75 |
| ui-consulta | 24 |
| ui-fase2 | 18 |
| ui-fase3 | 6 |
| ui-fase4 | 24 |
| ui-fase5 | 34 |
| ui-fase6 | 78 |
| ui-operativo | 34 |
| ui-vivo | 48 |
| ui-portal | 52 |
| ui-web | 60 |
| ui-facturacion | 68 |
| ui-pwa | 9 |
| ui-calendario | 42 |
| ui-registro | 31 |
| ui-eliminar | 24 |
| tablet (3 diseños × 2 orientaciones) | 12/12 |

**Configuración que conviene revisar en Render:**
- `CORS_ORIGIN`: vacío salvo que el frontend se publique en otro dominio.
- `ADMIN_PASSWORD`.
- Plan de base de datos con copias automáticas.
