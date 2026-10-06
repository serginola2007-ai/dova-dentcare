# DOVA — Pruebas de seguridad

Pruebas automáticas que **atacan** cada control de `SECURITY-AUDIT.md` y `SEGURIDAD.md`. Se corren contra un servidor local en modo producción con una base de prueba, **nunca contra producción**: crean usuarios, una segunda clínica y datos ficticios.

## Cómo correrlas

```bash
cd backend
export DATABASE_URL=postgres://...base_de_prueba...        # usuario dueño (migraciones y preparación)
export DOVA_URL=http://localhost:4500
export JWT_SECRET=<el mismo que usa el servidor de prueba>
npm run migrate:up && npm run seed

# (Recomendado) correr la app con el usuario de mínimo privilegio, como en producción:
psql "$DATABASE_URL" -v clave="'clave-de-prueba'" -f scripts/crear-usuario-app.sql
NODE_ENV=production APP_DATABASE_URL=postgres://dova_app:clave-de-prueba@localhost:5432/<base> \
  JWT_SECRET=$JWT_SECRET JWT_REFRESH_SECRET=<otro de 32+> API_LIMITE_POR_MINUTO=100000 PORT=4500 node src/server.js &

node tests/seguridad/preparar.js            # usuario sin permisos y "Clínica B"
python3 tests/seguridad/enumerar-rutas.py   # inventario de rutas → rutas.json

node tests/seguridad/barrido-rutas.js
node tests/seguridad/idor-clinicas.js <idPacienteDeLaClínicaA>
node tests/seguridad/inyeccion-fk.js        # correr solo (cuenta filas nuevas)
node tests/seguridad/integridad-clinicas.js
node tests/seguridad/multiclinica.test.js
node tests/seguridad/permisos-por-rol.test.js
node tests/seguridad/endurecimiento.test.js
node tests/seguridad/auditoria2.test.js
npm run lint && npm run build && npm audit
```

Notas para correrlas:
- Conviene dejar ~1 minuto entre archivos. El límite de 10 logins por minuto por cuenta es real y, si se corren todas seguidas, frena a las pruebas que vuelven a entrar como `admin`. Eso es el control funcionando, no una falla.
- `API_LIMITE_POR_MINUTO` solo sube el tope general para que el barrido pueda hacer miles de pedidos. Los límites de login, de la web pública y de exportaciones siguen activos y se prueban.

## Qué ataca cada prueba

| Área | Prueba (archivo → caso) |
|---|---|
| **Sin token / token inválido** | `barrido-rutas.js`: todas las rutas sin sesión dan 401. `auditoria2.test.js`: "Sin token: 401", "Token basura: 401". |
| **Token vencido** | `auditoria2.test.js` → "Token vencido: 401". |
| **Token adulterado** | `auditoria2.test.js`: otra firma, HS512, clínica cambiada, versión de sesión anterior. `permisos-por-rol.test.js`: `alg:none`. |
| **Usuario desactivado** | `auditoria2.test.js`: token, renovación y login después de la baja dan 401. |
| **Cambio de contraseña o rol: sesiones invalidadas** | `endurecimiento.test.js`: blanqueo, cambio propio y cierre de sesiones. |
| **Rotación y reutilización de refresh** | `endurecimiento.test.js`: rotación, gracia de 60 s, reutilización que cierra todo y queda auditada. |
| **Cookies y CSRF** | `endurecimiento.test.js`: <ul><li>el refresh token nunca va en el cuerpo de una respuesta;</li><li>uno nuevo mandado en el cuerpo da 401;</li><li>sin `X-DOVA-CSRF` da 403;</li><li>`Origin` ajeno da 403;</li><li>la cookie es `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`.</li></ul>`ui-sesiones`: <ul><li>no queda nada en `localStorage`;</li><li>la recarga mantiene la sesión;</li><li>"cerrar en todos los dispositivos";</li><li>migración de sesión vieja;</li><li>cookie del portal;</li><li>`/salir` invalida una copia robada.</li></ul> |
| **Contraseña inicial / admin** | `endurecimiento.test.js` (403 `DEBE_CAMBIAR_CLAVE`), `ui-primer-ingreso`, prueba del seed en una base aparte. |
| **RBAC** | `barrido-rutas.js`: un usuario sin permisos recibe 403 en todas. `permisos-por-rol.test.js`: matriz con 4 roles. |
| **Escalada de privilegios** | `endurecimiento.test.js` (11 casos). `auditoria2.test.js`: <ul><li>recepción no crea usuarios ni amplía su rol;</li><li>el admin de A no edita, blanquea ni cierra sesiones del admin de B.</li></ul> |
| **Aislamiento entre clínicas: leer, modificar, exportar** | <ul><li>`idor-clinicas.js`: ~5.500 pedidos con IDs ajenos.</li><li>`multiclinica.test.js`: listados, búsquedas, reportes y exportaciones.</li><li>`integridad-clinicas.js`: 190 relaciones.</li><li>`auditoria2.test.js`: exportar un paciente de otra clínica da 404; un CSV de B no trae datos de A.</li></ul> |
| **IDOR por cuerpo / asignación masiva de FKs** | `inyeccion-fk.js`: 79 altas desde la Clínica B con todos los `*Id` de la Clínica A. |
| **Asignación masiva** (`rol`, `rolId`, `clinicaId`, `clinica_id`, `permisos`, `es_admin_protegido`, `password_hash`, `estado`, `usuario_id`, `total`) | `auditoria2.test.js` → sección 2 y los casos de "en el cuerpo". |
| **Finanzas: monto, descuento, estado** | `auditoria2.test.js` → sección 4: <ul><li>monto 0, negativo, texto, `1e400`, `Infinity`, desmesurado, booleano, objeto, "100abc";</li><li>cuota con monto menor o de otro paciente;</li><li>cuotas fraccionarias o en cero;</li><li>entrega mayor al total;</li><li>descuento > 100, negativo o texto;</li><li>total y estado del presupuesto calculados por el servidor;</li><li>estado inexistente;</li><li>transición inválida;</li><li>caja con monto o tipo inválidos;</li><li>factura con precio negativo.</li></ul>`fact-api`, `fact-ingresos`, `flujo-completo`: totales, notas de crédito, anulaciones. |
| **Archivos** | `auditoria2.test.js` → sección 5: <ul><li>foto de otra clínica: 404;</li><li>sin permiso clínico: 403;</li><li>ruta manipulada en la base (`/etc/passwd`, `../../`, `/proc/self/environ`): 404 sin contenido;</li><li>path traversal o inyección en el ID de la URL: 4xx;</li><li>archivo disfrazado de PNG con nombre `../`: 400.</li></ul>`endurecimiento.test.js`: tipos falsos y tamaño. `adjuntos-api`. |
| **Exportar sin permiso** | `auditoria2.test.js`: exportar paciente, reportes XLSX/CSV/PDF sin permiso dan 403. |
| **SSE (tiempo real)** | `auditoria2.test.js` → sección 7: <ul><li>sin sesión: 401;</li><li>token inválido: 401;</li><li>la Clínica B no recibe avisos de la A (con control positivo);</li><li>los avisos no traen datos personales;</li><li>el logout corta la conexión abierta.</li></ul> |
| **Enumeración de pacientes** | `portal-api`, `registro-api`, `ui-registro`: el registro con una cédula existente no confirma la ficha ni abre sesión, y avisa a recepción. |
| **XSS** | `ui-xss`, `ui-portal-seg`, `endurecimiento.test.js` (CSP y sin scripts en línea). |
| **SQL injection** | `permisos-por-rol.test.js` (inyección en parámetros); `auditoria2.test.js` (`1 OR 1=1` en el ID). |
| **Usuario de base con mínimo privilegio** | Toda la suite se corre con la app conectada como `dova_app`. Además, a mano con `psql` como `dova_app`: `CREATE`, `DROP`, `ALTER`, `TRUNCATE auditoria`, desvío del disparador, `pgmigrations` y `CREATE ROLE`, todos denegados. |
| **Límites de pedidos** | `endurecimiento.test.js` (429 en login y web pública); almacén `postgres` probado a mano (429 con contadores en la tabla). |
| **Cabeceras, CORS y errores** | `endurecimiento.test.js`. |

## Resultados de la última corrida (6 de octubre de 2026)

Servidor local, `NODE_ENV=production`, aplicación conectada como **`dova_app`** (mínimo privilegio).

**Seguridad:**

| Prueba | Resultado |
|---|---|
| `auditoria2.test.js` (nueva) | 76/76 |
| `inyeccion-fk.js` (nueva) | 79 altas con IDs ajenos: 0 filas cruzadas (antes de la corrección: 1, `insumos.proveedor_id`) |
| `endurecimiento.test.js` (adaptado a cookies) | 64/64 |
| `ui-sesiones` (nueva) | 19/19 |
| `barrido-rutas.js` | 516 rutas, 0 anomalías |
| `idor-clinicas.js` | 4.138 pedidos de la Clínica B con IDs de la A: 0 lecturas con datos de A, 0 modificaciones |
| `integridad-clinicas.js` | 190 relaciones, 0 filas cruzadas |
| `multiclinica.test.js` | 23/23 |
| `permisos-por-rol.test.js` | 65/65 |
| `npm run lint` | 0 problemas |
| `npm run build` | 205 archivos, 0 errores de sintaxis |
| `npm audit` (backend) | 0 vulnerabilidades |

**Regresión de API:**

| Prueba | Resultado |
|---|---|
| fase1-api | 28 |
| fase2-api | 23 |
| fase3-api | 17 |
| fase4-api | 36 |
| fase5-api | 77 |
| flujo-completo | 38 |
| adjuntos-api | 12 |
| fact-api | 63 |
| fact-ingresos | 21 |
| portal-api | 64 |
| web-api | 51 |
| registro-api | 20 |
| multiclinica-api | 23 |

**Regresión de pantallas** (Playwright, 3 diseños; la sesión ahora en cookie):

| Prueba | Resultado |
|---|---|
| ui-sesiones (nueva) | 19/19 |
| ui-primer-ingreso | 5/5 |
| ui-permisos-viejos (adaptada: sesión vencida = sin cookie) | 2/2 |
| ui-portal-seg (adaptada a la cookie del portal, con control positivo) | 9/9 |
| ui-xss | 4/4 |
| ui-anio (un año de uso simulado) | 164/164, 0 hallazgos |
| ui-menu | 75 |
| ui-vivo | 48 |
| ui-portal | 52 |
| ui-consulta | 24 |
| ui-registro (adaptada al mensaje genérico) | 29 |
| ui-web | 60 |
| ui-fase2 | 18 |
| ui-fase3 | 6 |
| ui-fase4 | 24 |
| ui-fase5 | 34 |
| ui-fase6 | 78 |
| ui-operativo | 34 |
| ui-facturacion | 68 |
| ui-calendario | 42 |
| ui-eliminar | 24 |
| ui-pwa | 9 |
| ui-color | 14 |
| tablet (3 diseños × 2 orientaciones) | 12/12 |

Detalle de la tablet: se corrigió un desborde horizontal en Operaciones → Sala de espera. Con nombres de profesionales muy largos, la tabla no tenía contenedor con desplazamiento; ahora usa `dova-ext-tabla-wrap`, como el resto de las tablas.
