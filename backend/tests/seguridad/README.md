# Pruebas de seguridad de DOVA

Se corren contra un servidor **local de pruebas** con una base de datos de prueba. Nunca hay que correrlas contra producción, porque crean usuarios, una segunda clínica y datos ficticios.

## Preparación

```bash
cd backend
export DATABASE_URL=postgres://...base_de_prueba...
export DOVA_URL=http://localhost:4500          # servidor local
export JWT_SECRET=<el mismo del servidor>      # para auditoria2.test.js
# Servidor de pruebas (NODE_ENV=production para probar la configuración real)
NODE_ENV=production JWT_SECRET=<32+ caracteres> JWT_REFRESH_SECRET=<otro> \
  API_LIMITE_POR_MINUTO=100000 PORT=4500 node src/server.js
node tests/seguridad/preparar.js               # usuario sin permisos y "Clínica B"
python3 tests/seguridad/enumerar-rutas.py      # inventario de rutas → rutas.json
```

`API_LIMITE_POR_MINUTO` solo sube el tope general de pedidos para que el barrido pueda hacer miles de pedidos seguidos. Los límites de login, de la página pública y de exportación siguen activos.

## Pruebas

| Archivo | Qué comprueba |
|---|---|
| `barrido-rutas.js` | Las 516 rutas de la API: sin sesión responden 401 y un usuario sin permisos recibe 403. |
| `idor-clinicas.js <idPaciente>` | El administrador de otra clínica intenta leer y modificar unos 5.500 recursos del paciente indicado, cambiando los IDs. |
| `integridad-clinicas.js` | Revisa las 190 relaciones de la base y confirma que ninguna fila apunta a datos de otra clínica. |
| `multiclinica.test.js` | Listados, búsquedas, reportes y exportaciones de otra clínica no traen datos ajenos. |
| `permisos-por-rol.test.js` | Matriz de permisos con 4 roles, token adulterado e inyección en los parámetros. |
| `endurecimiento.test.js` | Las correcciones de la auditoría: contraseñas, cambio obligatorio de contraseña, anti-escalada de privilegios, cierre de sesiones, rotación de tokens, sesión en cookie HttpOnly con anti-CSRF, datos clínicos, archivos, errores, CORS, cabeceras, límites, auditoría inmutable y registros. |
| `auditoria2.test.js` | Segunda auditoría: token vencido o adulterado, usuario desactivado, asignación masiva, escalada de privilegios, importes y estados financieros, archivos (ajenos, rutas manipuladas, path traversal), exportaciones sin permiso y tiempo real (SSE) sin sesión o de otra clínica. Necesita `JWT_SECRET`. |
| `ui-sesiones.js` | En un navegador real (Playwright): nada sensible en `localStorage`, la sesión sobrevive a recargar, "cerrar en todos los dispositivos", migración de sesiones viejas, cookie del portal y `/salir`. Necesita `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` si no están instalados globalmente. |
| `inyeccion-fk.js` | La Clínica B llama a todas las altas mandando en el cuerpo IDs de la Clínica A; después revisa que ninguna fila quede en la A ni apunte a la A. Correrlo solo. |

Ver también `SECURITY-TESTS.md` (raíz del repositorio): cómo correr la app con el usuario de base de mínimo privilegio y el resultado de la última corrida.

Las pruebas usan los usuarios del juego de datos de prueba (`admin`, `recep1`, `odo1`, `asis1`). Son datos ficticios de la base de prueba, no credenciales reales.
