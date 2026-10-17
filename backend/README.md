# DOVA — backend

Servidor de DOVA: Node 22 + Express 5 + PostgreSQL. Atiende la API (`/api/...`) y sirve las
pantallas del frontend. Guía corta para entenderlo y mantenerlo.

## Cómo está armado

```
backend/
  src/
    server.js               Enciende el servidor (puerto, avisos automáticos programados).
    app.js                  Arma el servidor en 5 pasos: seguridad → límites → API → pantallas → errores.
    rutas.js                MAPA DE LA API: qué dirección atiende cada módulo (una fila por módulo).
    arranque/
      seguridad.js          Cabeceras de seguridad (CSP), CORS, compresión, JSON, registro de pedidos.
      limites.js            Frenos contra fuerza bruta y abuso (login, búsquedas, exportaciones…).
      frontend.js           Sirve frontend/ (app del personal y página web) y las redirecciones viejas.
    config/
      env.js                Variables de entorno, con valores por defecto y validación.
      db.js                 Conexión a PostgreSQL: query(), getClient() para transacciones y conCandado() para evitar dobles.
      permisos.js           Lista de permisos y qué tiene cada rol del sistema.
      planes.js             Planes de la clínica (esencial, base, completo, premium) y sus módulos.
      seguridad.js          Sesiones, cookies y números de los límites (todo por entorno).
    middlewares/
      auth.middleware.js    Exige sesión válida y carga el usuario (req.usuario).
      clinica.middleware.js Fija la clínica del usuario (req.clinicaId). TODO filtra por ella.
      rbac.middleware.js    requirePermiso('permiso.x', …): corta con 403 si no lo tiene.
      modulo.middleware.js  exigirModulo('…'): corta si el plan de la clínica no incluye ese módulo.
      limite.middleware.js  Contador de pedidos para los límites.
      error.middleware.js   ApiError(status, mensaje) y la respuesta de error prolija.
    modules/<area>/         Un módulo por área (pacientes, agenda, caja, facturación…).
      <area>.routes.js      Direcciones y permisos. Solo "qué entra y quién puede".
      <area>.service.js     Reglas del negocio y validaciones. Acá se decide.
      <area>.repository.js  SQL. Solo consultas, siempre parametrizadas.
      <area>.controller.js  (algunos módulos) Pasa del pedido HTTP al servicio.
    utils/                  Ayudantes: auditoria, montos, recurso (CRUD genérico), correo, whatsapp, tiempo real…
    db/migrations/          Cambios de la base, numerados. SOLO se agregan nuevos, nunca se editan.
    db/seed.js              Roles, permisos y usuario admin inicial (se puede correr siempre).
    jobs/                   Tareas de mantenimiento (limpieza de adjuntos vencidos).
  tests/                    Pruebas de API (*.test.js), de pantallas (ui-*.js) y de seguridad (seguridad/).
  scripts/                  migrar.js, verificar-sintaxis.js, etc.
```

## El recorrido de un pedido

```
navegador → app.js (seguridad, límites) → rutas.js → <area>.routes.js
          → authMiddleware → resolverClinicaMiddleware → requirePermiso
          → <area>.service.js (reglas) → <area>.repository.js (SQL) → PostgreSQL
          → respuesta JSON (o error con ApiError → error.middleware.js)
```

## Cómo agregar un módulo nuevo

1. Crear `src/modules/mi-area/` con `mi-area.routes.js`, `mi-area.service.js` y, si toca la base,
   `mi-area.repository.js`. Molde de la ruta:

   ```js
   const express = require('express');
   const { authMiddleware } = require('../../middlewares/auth.middleware');
   const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
   const { requirePermiso } = require('../../middlewares/rbac.middleware');
   const servicio = require('./mi-area.service');

   const router = express.Router();
   router.use(authMiddleware, resolverClinicaMiddleware);
   const responder = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

   router.get('/', requirePermiso('mi_area.ver'), responder((req) => servicio.listar(req.clinicaId)));

   module.exports = router;
   ```
2. Sumar la fila en `src/rutas.js`: `['/api/mi-area', './modules/mi-area/mi-area.routes'],`.
3. Si hay permisos nuevos: agregarlos en `config/permisos.js` (y a qué roles van) y correr `npm run seed`.
4. Si cambia la base: una migración NUEVA en `db/migrations/` (`00NN_que_hace.js`).
5. Pruebas: `tests/mi-area.test.js` y correr el barrido de seguridad (`tests/seguridad/barrido-rutas.js`).

## Reglas que no se rompen

- **Cada ruta lleva `requirePermiso(...)` y filtra por `req.clinicaId`.** Todo id que llega
  (en la dirección o en el cuerpo) se valida contra la clínica del usuario.
- **SQL siempre parametrizado** (`$1, $2…`). Nombres de columnas dinámicos solo desde listas fijas.
- **Errores con `ApiError(status, 'mensaje claro en español')`.** Un error inesperado nunca muestra
  detalles internos al usuario: queda en el registro con una referencia.
- **Importes con `utils/montos.js`;** estados y totales los calcula el servidor, no la pantalla.
- **Auditoría:** las acciones importantes se registran con `utils/auditoria.js`.
- **Nombres en español y claros** (`idPaciente`, `totalCobrado`, `registrarSesion`).
- No commitear `.env`, `node_modules` ni `uploads`.

## Comandos (desde `backend/`)

```bash
npm install
npm run migrate:up      # migraciones
npm run seed            # roles, permisos y admin
npm run dev             # servidor con recarga → http://localhost:4000/mecanico/
npm run lint            # tiene que dar 0 errores
npm run lint:front      # revisión del front (variables sin definir o sobrantes)
```
