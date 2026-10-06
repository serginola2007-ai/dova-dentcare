-- DOVA — usuario de base de datos con MÍNIMO PRIVILEGIO para la aplicación.
--
-- Qué hace: crea el rol "dova_app" que solo puede leer y escribir datos
-- (SELECT / INSERT / UPDATE / DELETE y usar secuencias). No puede crear ni
-- borrar tablas, ni bases, ni roles. Las migraciones y el seed siguen
-- corriendo con el usuario dueño (el que crea Render).
--
-- Cómo usarlo (una sola vez, con el usuario dueño de la base):
--   psql "<URL EXTERNA DE RENDER>" -v clave="'UNA-CLAVE-LARGA-Y-ALEATORIA'" -f scripts/crear-usuario-app.sql
-- Después, en Render → servicio dova → Environment, agregar:
--   APP_DATABASE_URL = la URL INTERNA de la base cambiando usuario y clave
--                      por dova_app y la clave elegida
-- y volver a desplegar. DATABASE_URL (la del Blueprint, usuario dueño) se
-- sigue usando solo para migraciones y seed. (Alternativa fuera de Render:
-- DATABASE_URL = usuario dova_app y MIGRATION_DATABASE_URL = usuario dueño.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dova_app') THEN
    CREATE ROLE dova_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END $$;
ALTER ROLE dova_app WITH PASSWORD :clave;

-- Conectarse a ESTA base y usar el esquema, pero no crear objetos en él.
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO dova_app', current_database()); END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM dova_app;
GRANT USAGE ON SCHEMA public TO dova_app;

-- Datos: leer y escribir. Secuencias: para los id automáticos.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dova_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dova_app;
-- La tabla de control de migraciones solo la toca el usuario de migraciones.
REVOKE INSERT, UPDATE, DELETE ON TABLE pgmigrations FROM dova_app;

-- La auditoría es de solo agregar: la aplicación nunca la modifica ni la borra.
-- Con este usuario ni siquiera el desvío de mantenimiento del disparador
-- (SET dova.permitir_auditoria) permite alterarla.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE auditoria FROM dova_app;

-- Tablas que creen las migraciones futuras (las crea el usuario dueño) quedan
-- con los mismos permisos automáticamente.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dova_app;
