/* Consentimientos firmados en tablet (solo agrega).
   - Quién firmó (paciente o responsable, con su documento), cuándo, desde
     qué dispositivo/IP y quién del personal estuvo presente.
   - Huella SHA-256 del documento firmado (texto + firmas + datos): se imprime
     en el PDF y DOVA puede comprobar que nada cambió.
   - Un consentimiento firmado ya no se puede modificar (disparador en la
     base): solo se puede anular, y la anulación queda registrada. */
exports.up = (pgm) => {
  pgm.addColumns('consentimientos', {
    firmado_en: { type: 'timestamptz' },
    firmante_nombre: { type: 'varchar(150)' },
    firmante_documento: { type: 'varchar(30)' },
    firmante_relacion: { type: 'varchar(30)' },
    firma_ip: { type: 'varchar(64)' },
    firma_dispositivo: { type: 'varchar(200)' },
    testigo_usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    hash_documento: { type: 'varchar(64)' },
    anulado_en: { type: 'timestamptz' },
    anulado_motivo: { type: 'text' },
  });
  pgm.sql(`CREATE OR REPLACE FUNCTION dova_consentimiento_inmutable() RETURNS trigger AS $$
    BEGIN
      IF OLD.estado = 'firmado' THEN
        IF NEW.texto IS DISTINCT FROM OLD.texto OR NEW.procedimiento IS DISTINCT FROM OLD.procedimiento
           OR NEW.firma_paciente IS DISTINCT FROM OLD.firma_paciente OR NEW.firma_odontologo IS DISTINCT FROM OLD.firma_odontologo
           OR NEW.paciente_id IS DISTINCT FROM OLD.paciente_id OR NEW.firmado_en IS DISTINCT FROM OLD.firmado_en
           OR NEW.firmante_nombre IS DISTINCT FROM OLD.firmante_nombre OR NEW.firmante_documento IS DISTINCT FROM OLD.firmante_documento
           OR NEW.hash_documento IS DISTINCT FROM OLD.hash_documento
           OR (NEW.estado <> OLD.estado AND NEW.estado <> 'anulado') THEN
          RAISE EXCEPTION 'Un consentimiento firmado no se puede modificar (solo anular)' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF OLD.estado = 'anulado' AND NEW.estado <> 'anulado' THEN
        RAISE EXCEPTION 'Un consentimiento anulado no vuelve atrás' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  pgm.sql('DROP TRIGGER IF EXISTS consentimiento_inmutable ON consentimientos');
  pgm.sql('CREATE TRIGGER consentimiento_inmutable BEFORE UPDATE ON consentimientos FOR EACH ROW EXECUTE FUNCTION dova_consentimiento_inmutable()');
  pgm.sql(`CREATE OR REPLACE FUNCTION dova_consentimiento_sin_borrar() RETURNS trigger AS $$
    BEGIN
      IF OLD.estado = 'firmado' AND current_setting('dova.borrando_paciente', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Un consentimiento firmado no se puede borrar (solo anular)' USING ERRCODE = '23514';
      END IF;
      RETURN OLD;
    END $$ LANGUAGE plpgsql`);
  pgm.sql('DROP TRIGGER IF EXISTS consentimiento_sin_borrar ON consentimientos');
  pgm.sql('CREATE TRIGGER consentimiento_sin_borrar BEFORE DELETE ON consentimientos FOR EACH ROW EXECUTE FUNCTION dova_consentimiento_sin_borrar()');
};
exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS consentimiento_sin_borrar ON consentimientos');
  pgm.sql('DROP FUNCTION IF EXISTS dova_consentimiento_sin_borrar()');
  pgm.sql('DROP TRIGGER IF EXISTS consentimiento_inmutable ON consentimientos');
  pgm.sql('DROP FUNCTION IF EXISTS dova_consentimiento_inmutable()');
  pgm.dropColumns('consentimientos', ['firmado_en', 'firmante_nombre', 'firmante_documento', 'firmante_relacion', 'firma_ip', 'firma_dispositivo', 'testigo_usuario_id', 'hash_documento', 'anulado_en', 'anulado_motivo']);
};
