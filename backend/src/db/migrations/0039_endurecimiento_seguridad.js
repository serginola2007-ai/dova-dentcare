/* Auditoría de seguridad (oct 2026).
   - usuarios.token_version: al cambiar la contraseña, desactivar al usuario o
     cambiarle el rol se incrementa y TODAS sus sesiones abiertas dejan de valer
     al instante (antes seguían hasta 15 min / 7 días con el refresh token).
   - refresh_tokens: rotación con detección de reutilización (revocado_en, motivo).
   - tokens_revocados: el token de acceso de quien cierra sesión deja de valer
     enseguida (lista de bloqueo por jti hasta que vence).
   - auditoria: solo se puede AGREGAR. UPDATE/DELETE quedan bloqueados en la
     base (también para el propio servidor). Para mantenimiento excepcional, un
     DBA puede ejecutar SET dova.permitir_auditoria = 'on' en su sesión. */
exports.up = (pgm) => {
  pgm.addColumns('usuarios', { token_version: { type: 'integer', notNull: true, default: 0 } });
  pgm.addColumns('refresh_tokens', {
    revocado_en: { type: 'timestamptz' },
    motivo: { type: 'varchar(30)' },
  });
  pgm.createIndex('refresh_tokens', ['usuario_id'], { ifNotExists: true });
  pgm.createTable('tokens_revocados', {
    jti: { type: 'varchar(64)', primaryKey: true },
    expira_en: { type: 'timestamptz', notNull: true },
  });
  pgm.sql(`
    CREATE OR REPLACE FUNCTION dova_auditoria_inmutable() RETURNS trigger AS $$
    BEGIN
      IF current_setting('dova.permitir_auditoria', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar' USING ERRCODE = 'insufficient_privilege';
    END $$ LANGUAGE plpgsql;
  `);
  pgm.sql('CREATE TRIGGER dova_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION dova_auditoria_inmutable();');
  pgm.sql('CREATE TRIGGER dova_auditoria_sin_truncate BEFORE TRUNCATE ON auditoria FOR EACH STATEMENT EXECUTE FUNCTION dova_auditoria_inmutable();');
};
exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS dova_auditoria_inmutable ON auditoria;');
  pgm.sql('DROP TRIGGER IF EXISTS dova_auditoria_sin_truncate ON auditoria;');
  pgm.sql('DROP FUNCTION IF EXISTS dova_auditoria_inmutable();');
  pgm.dropTable('tokens_revocados');
  pgm.dropColumns('refresh_tokens', ['revocado_en', 'motivo']);
  pgm.dropColumns('usuarios', ['token_version']);
};
