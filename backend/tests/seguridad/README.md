# Pruebas de seguridad de DOVA

Se corren contra un servidor **local de pruebas** con una base de datos de prueba. Nunca hay que correrlas contra producción, porque crean usuarios, una segunda clínica y datos ficticios.

## Preparación

```bash
cd backend
export DATABASE_URL=postgres://...base_de_prueba...
export DOVA_URL=http://localhost:4500          # servidor local
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
| `barrido-rutas.js` | Las 512 rutas de la API: sin sesión responden 401 y un usuario sin permisos recibe 403. |
| `idor-clinicas.js <idPaciente>` | El administrador de otra clínica intenta leer y modificar unos 5.500 recursos del paciente indicado, cambiando los IDs. |
| `integridad-clinicas.js` | Revisa las 190 relaciones de la base y confirma que ninguna fila apunta a datos de otra clínica. |
| `multiclinica.test.js` | Listados, búsquedas, reportes y exportaciones de otra clínica no traen datos ajenos. |
| `permisos-por-rol.test.js` | Matriz de permisos con 4 roles, token adulterado e inyección en los parámetros. |
| `endurecimiento.test.js` | Las correcciones de la auditoría: contraseñas, cambio obligatorio de contraseña, anti-escalada de privilegios, cierre de sesiones, rotación de tokens, datos clínicos, archivos, errores, CORS, cabeceras, límites, auditoría inmutable y registros. |

Las pruebas usan los usuarios del juego de datos de prueba (`admin`, `recep1`, `odo1`, `asis1`). Son datos ficticios de la base de prueba, no credenciales reales.
