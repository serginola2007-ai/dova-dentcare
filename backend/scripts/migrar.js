/* Corre las migraciones con el usuario de MIGRACIONES (dueño del esquema) si
   está configurado (MIGRATION_DATABASE_URL); si no, con DATABASE_URL.
   La aplicación en marcha usa DATABASE_URL, que puede ser un usuario sin
   permisos para cambiar tablas (ver scripts/crear-usuario-app.sql). */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL (o MIGRATION_DATABASE_URL).'); process.exit(1); }
const accion = process.argv[2] || 'up';
const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'node-pg-migrate');
const r = spawnSync(bin, [accion, '-m', 'src/db/migrations', ...process.argv.slice(3)], { cwd: path.join(__dirname, '..'), stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status === null ? 1 : r.status);
