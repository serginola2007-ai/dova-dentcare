# DOVA — Sistema de gestión odontológica
### Clínica configurada: DentCareRC

DOVA es **una sola aplicación, una sola lógica, un solo backend y una sola
base de datos**, con tres estilos visuales entre los que cada usuario puede
elegir: **Moderno**, **Minimalista** y **Técnico**. Ningún dato, función,
rol ni permiso cambia según el diseño elegido — el diseño es solamente una
capa visual.

## Estructura

```
dova/
├── netlify.toml        Config de deploy del frontend en Netlify
├── backend/             API REST (Node.js + Express + PostgreSQL) — ÚNICA, la usan los 3 diseños
└── frontend/
    ├── shared/           Motor común: cliente API, vistas, router SPA (#hash), CSS base
    │   ├── app.js         Boot de la SPA + selector/redirección de diseño
    │   ├── api.js         Cliente HTTP (sesión, tokens, endpoints)
    │   ├── views.js       Todas las pantallas (HTML + listeners)
    │   ├── base.css       Variables de marca y estilos base compartidos
    │   ├── config.js      URL del backend para desarrollo local (ver Netlify más abajo)
    │   └── config.template.js  Plantilla que Netlify usa para generar config.js en el build
    ├── moderno/          Diseño 1: interfaz actual, tarjetas con sombra suave, radios generosos
    ├── minimalista/      Diseño 2: sin bordes marcados, whitespace, tipografía como jerarquía
    └── tecnico/          Diseño 3: barra superior densa, monoespaciado, estilo panel operativo/ERP
```

Los 3 diseños comparten el 100% de la lógica (`shared/*.js`) y solo cambian
`index.html` (fuentes/estructura mínima) y `skin.css` (colores/layout). Esto
significa que corregir un bug o agregar una función se hace **una sola vez**
y se refleja automáticamente en los tres.

## Instalación

```bash
git clone <este repositorio>
cd DOVA/backend && npm install
```

El frontend no tiene dependencias ni build — es HTML/CSS/JS plano servido
directamente.

## Desarrollo

### Backend
```bash
cd backend
cp .env.example .env      # completar DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npm run migrate:up        # crea/actualiza todas las tablas, incluida la preferencia de diseño
npm run seed               # clínica DentCareRC, roles, permisos y usuario admin/admin
npm run dev                 # http://localhost:4000 (con recarga automática)
```

### Frontend
Servir la carpeta `frontend/` con cualquier servidor de archivos estáticos
(no requiere build para desarrollo local):
```bash
cd frontend
npx serve -l 8080 .
```
Luego abrir `http://localhost:8080/moderno/index.html` (o `minimalista`/`tecnico` —
cualquiera de los tres sirve como punto de entrada; ver "Sistema de
diseños" más abajo para cómo decide DOVA cuál mostrar).

En Windows, `Iniciar DOVA.bat` hace exactamente esto (levanta backend y
frontend y abre el navegador) y `Detener DOVA.bat` los cierra.

**Importante**: `backend/.env` debe tener `CORS_ORIGIN` apuntando al origen
donde se sirve el frontend (por defecto `http://localhost:8080`).

Usuario de acceso inicial: **admin / admin** (usuario protegido, no se puede
desactivar ni eliminar — garantiza que la clínica nunca quede sin administración).
En el primer ingreso DOVA obliga a cambiar esa contraseña. Si se define la
variable `ADMIN_PASSWORD` antes del primer seed, el admin se crea con esa clave.

## Variables de entorno

### Backend (`backend/.env`, ver `backend/.env.example`)

| Variable | Qué es |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` | Puerto del servidor API (default 4000) |
| `DATABASE_URL` | Cadena de conexión Postgres (`postgres://usuario:password@host:5432/basededatos`) |
| `JWT_SECRET` | Secreto para firmar los access tokens (15 min) |
| `JWT_REFRESH_SECRET` | Secreto para los refresh tokens (7 días) — **no reutilizar el de arriba** |
| `JWT_EXPIRES_IN` | Duración del access token (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token (default `7d`) |
| `CORS_ORIGIN` | Uno o varios orígenes separados por coma (sin barra final) desde los que se acepta el frontend, ej. `https://tu-sitio.netlify.app`, o `*` para permitir cualquiera (solo en desarrollo) |
| `PGSSLMODE` | Poner en `require` cuando el Postgres es remoto (Render y la mayoría de los administrados lo exigen). Se detecta solo si `DATABASE_URL` no apunta a `localhost` y `NODE_ENV=production`, así que en general no hace falta setearla a mano — `render.yaml` ya la incluye |

Ninguna de estas variables tiene un valor real en el repositorio — `.env` no
se versiona (agregalo a tu `.gitignore` si no está).

### Frontend (Netlify)

El frontend no usa un bundler (no es Vite/webpack), así que la URL del
backend NO se hardcodea en el HTML: se inyecta en el build de Netlify.

| Variable (en Netlify > Site settings > Environment variables) | Qué es |
|---|---|
| `DOVA_API_URL` | URL pública del backend desplegado, ej. `https://dova-api.onrender.com/api` |

El build de Netlify (definido en `netlify.toml`) genera
`frontend/shared/config.js` a partir de `frontend/shared/config.template.js`,
reemplazando el placeholder por el valor de `DOVA_API_URL`. Si la variable no
está seteada, cae al `localhost:4000` de desarrollo (útil para un build de
prueba, pero hay que configurarla para producción real).

Para desarrollo local no hace falta tocar nada: `frontend/shared/config.js`
ya viene versionado con `http://localhost:4000/api` para que `Iniciar DOVA.bat`
funcione de una.

- `WEB_EN_INICIO` (opcional, `true`/`false`): si es `true`, la dirección principal (`/`) abre la página web de la clínica en vez de DOVA. DOVA sigue en `/moderno/`.
- `WEB_CLINICA_ID` (opcional): clínica que atiende la página web (por defecto, la primera).
- **Cuentas de pacientes en la web**: no necesitan email. Las personas nuevas se registran solas; los pacientes con ficha entran con un código que se genera en DOVA → Página web → "Cuentas de pacientes" y se manda por WhatsApp.
- **Email (opcional, solo avisos de pagos)**: el plan gratis de Render bloquea el SMTP, así que se usa **Brevo** por su API web: `BREVO_API_KEY` y `MAIL_REMITENTE` (email verificado en Brevo), `MAIL_NOMBRE` opcional. Con un plan pago también sirve SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`). Para pruebas locales: `MAIL_TRANSPORTE=archivo` y `MAIL_ARCHIVO=/ruta/emails.jsonl`.

## Sistema de diseños

Cada usuario elige su estilo visual la primera vez que inicia sesión y esa
elección queda guardada **en el backend**, ligada a su usuario (columna
`diseno_preferido` en la tabla `usuarios`, valores `moderno` / `minimalista`
/ `tecnico`). `localStorage` solo cachea la sesión (igual que el resto de
DOVA) — nunca es la única fuente de verdad, así que la preferencia viaja
con el usuario a cualquier dispositivo donde inicie sesión.

**Flujo:**
1. Login correcto → el backend devuelve `usuario.disenoPreferido`.
2. Si es `null` (todavía no eligió) → aparece el selector de diseño de
   pantalla completa ("Elegí cómo querés ver DOVA") con las 3 tarjetas.
3. Al elegir, se guarda con `PATCH /api/usuarios/me/preferencias` y el
   navegador pasa a la carpeta de ese diseño (`/moderno/`, `/minimalista/`
   o `/tecnico/`), **sin perder la sesión** (los tokens JWT están en
   `localStorage`, que es el mismo para las 3 carpetas del mismo sitio).
4. En cada login/recarga posterior, DOVA compara la preferencia guardada
   contra la carpeta donde está parado y redirige automáticamente a la
   correcta (hay un pequeño script en el `<head>` de cada `index.html` que
   hace esto ANTES de pintar nada, para evitar el parpadeo del diseño
   equivocado).
5. Si el backend no puede confirmar la preferencia (caída de red, por
   ejemplo) DOVA no se rompe: simplemente no redirige y sigue mostrando la
   carpeta donde ya estás.

**Cómo cambiarlo después:** dentro de DOVA, **Configuración → Apariencia**
muestra las mismas 3 tarjetas, marca la actual, y al elegir otra guarda el
cambio y navega a esa carpeta manteniendo la sesión abierta (no hay que
volver a loguearse ni se pierde ningún dato).

**Seguridad:** el endpoint `PATCH /api/usuarios/me/preferencias` solo puede
modificar la preferencia **del usuario autenticado** (usa el id que viene
en su propio token JWT, nunca un id que mande el cliente) y valida en el
backend que el valor recibido sea exactamente `moderno`, `minimalista` o
`tecnico` — cualquier otro valor se rechaza con 400, incluso si el request
está manipulado a mano.

**Para agregar un cuarto diseño en el futuro** (ej. "corporativo"): crear
`frontend/corporativo/` con su propio `index.html` + `skin.css` (copiando la
estructura de cualquiera de los 3 actuales), agregarlo a la lista
`TEMAS_VALIDOS` en `shared/app.js`, al `CHECK` de la migración de
`diseno_preferido` (nueva migración) y a la lista `DISENOS` en
`shared/views.js`. No hace falta tocar el backend más que esa migración.

## Deployment

### Todo en Render (recomendado): un solo servicio, una sola dirección

El servidor de DOVA sirve **la API y las pantallas** (los 3 diseños) desde
la misma dirección, así que no hace falta Netlify ni configurar CORS.

Hay dos blueprints:
- `render.yaml` (el que Render toma por defecto): **gratis, para probar**. La
  base se borra a los 30 días, el servidor se apaga tras 15 min sin uso y
  los archivos subidos se pierden al actualizar.
- `render-pago.yaml` (**uso real**; en Render → Blueprint Path poner
  `render-pago.yaml`) crea:

| Recurso | Plan | Para qué |
|---|---|---|
| Servicio web `dova` | `0.5c-512mb` (Starter, ~US$ 7/mes) | API + pantallas, siempre encendido |
| Postgres `dova-db` | `0.1c-256mb` (Basic, ~US$ 6/mes + 5 GB) | Base de datos (sin acceso desde internet) |
| Disco `dova-archivos` (1 GB) | ~US$ 0,25/mes | Fotos, estudios y adjuntos (no se pierden al actualizar) |

Región: Virginia (la más cercana a Paraguay). El plan gratis de Render
**no sirve** para uso real: la base gratis se borra a los 30 días y no
permite disco para archivos.

**Pasos:**
1. Subí la carpeta `DOVA` completa a un repositorio **privado** de GitHub.
2. En [render.com](https://render.com) conectá tu GitHub y cargá una
   tarjeta (los planes son pagos).
3. **New → Blueprint** → elegí el repositorio (para uso real, en
   *Blueprint Path* poné `render-pago.yaml`) → **Apply**. No hay que
   completar ninguna variable: las claves secretas se generan solas.
4. Render instala, prepara la base (`migrate:up` + `seed`) y arranca. Tarda unos minutos la primera vez.
5. Abrí la dirección que te da Render (ej. `https://dova.onrender.com`),
   entrá con **admin / admin** y elegí la contraseña nueva que DOVA pide.

**Actualizaciones:** cada vez que subís cambios a GitHub, Render vuelve a
desplegar solo. Las migraciones aplican únicamente lo nuevo (nunca borran
datos) y el seed no duplica nada.

**Dominio propio** (ej. `sistema.dentcarerc.com`): Render → servicio
`dova` → Settings → Custom Domains.

**Opcional:** `ADMIN_PASSWORD` (contraseña inicial del admin, solo antes del
primer deploy) y `CORS_ORIGIN` (solo si además publicás las pantallas en
otro dominio, ej. Netlify).

### Alternativa: pantallas en Netlify y API en Render

También se puede publicar `frontend/` en Netlify (lee `netlify.toml`) con
la variable `DOVA_API_URL` = `https://<tu-servicio>.onrender.com/api`, y
en Render agregar `CORS_ORIGIN` = la dirección de Netlify. No es
necesario si se usa Render solo.

### Base de datos

Cualquier Postgres administrado sirve (Render Postgres, Railway, Neon,
Supabase, RDS, un Postgres propio en el mismo VPS). Solo hace falta que
`DATABASE_URL` sea alcanzable desde donde corra el backend. Las migraciones
(`db/migrations/0001` a `0022`) son acumulativas y nunca destructivas — se
pueden correr contra una base ya existente sin perder datos.

## Seguimiento integral (migración 0020)

DOVA incorpora el seguimiento clínico a largo plazo: salud estructurada con alertas e interacciones, recalls automáticos, periodontograma de 6 sitios, implantes, endodoncia, ortodoncia, prevención, esterilización trazable, laboratorio, seguros, cuenta corriente, comisiones, indicadores y auditoría. El detalle completo, con cada función, los permisos nuevos y cómo se probó, está en [`SEGUIMIENTO-INTEGRAL.md`](SEGUIMIENTO-INTEGRAL.md).

Las correcciones hechas después de la simulación de un año de uso están en [`CORRECCIONES.md`](CORRECCIONES.md).

## Qué se implementó en esta sesión — Selector de diseño (moderno/minimalista/técnico)

- **Backend**: nueva migración `0019_diseno_preferido.js` (columna
  `diseno_preferido` en `usuarios`, con `CHECK` a nivel de base de datos
  además de la validación en el backend). Endpoint nuevo
  `PATCH /api/usuarios/me/preferencias` (self-service, cualquier usuario
  logueado, valida el valor recibido). `disenoPreferido` viaja ahora en la
  respuesta de `POST /api/auth/login`.
- **Frontend**: pantalla de selección de primer login, sección
  Configuración → Apariencia para cambiarlo después, redirección automática
  entre carpetas de tema preservando la sesión, y el script anti-parpadeo
  en cada `index.html`.
- **Deploy**: `netlify.toml` nuevo (publica los 3 diseños desde un solo
  sitio), `shared/config.template.js` + `shared/config.js` para no
  hardcodear la URL del backend.
- **Ningún módulo, permiso, rol ni dato existente se tocó** — ver la
  sección de pruebas realizadas más abajo.

## Qué queda para una siguiente sesión
- Vistas de frontend para: odontograma visual, consentimientos con firma en canvas, recetas, laboratorio, lista de espera, gestión de usuarios/roles desde la UI (el backend ya soporta todo esto).
- Facturación electrónica de Paraguay (SIFEN/SET): DOVA ya tiene el módulo **Facturación** de comprobantes internos (ver CORRECCIONES.md → Facturación). Falta solo conectar un proveedor de timbrado/factura electrónica cuando se decida.
- Inconsistencia preexistente (no introducida en esta sesión, mencionada
  para que quede documentada): el toggle de modo claro/oscuro
  (`#theme-toggle-btn`) solo está conectado en `moderno/index.html`, no en
  `minimalista/tecnico`. Es un eje totalmente independiente del selector de
  diseño (moderno/minimalista/técnico) y no formaba parte de este pedido.
