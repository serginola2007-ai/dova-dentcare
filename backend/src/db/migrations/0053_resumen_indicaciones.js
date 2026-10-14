/* Resumen del día al dueño e indicaciones después del tratamiento (solo agrega):
   - clinicas: resumen diario (activo, hora, correos y WhatsApp de destino) e
     indicaciones automáticas por WhatsApp.
   - resumenes_diarios: un resumen por clínica y día (nunca se manda dos veces).
   - tratamientos.indicaciones: los cuidados que recibe el paciente después.
   - avisos_envios: admite el tipo "indicaciones".
   Los controles archivados usan el estado 'archivado' (paciente_recalls y
   controles_programados no tienen restricción de estados). */
exports.up = (pgm) => {
  pgm.addColumns('clinicas', {
    resumen_activo: { type: 'boolean', notNull: true, default: false },
    resumen_hora: { type: 'smallint', notNull: true, default: 20 },
    resumen_correos: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    resumen_whatsapp: { type: 'varchar(20)' },
    indicaciones_auto: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint('clinicas', 'clinicas_resumen_hora_rango', 'CHECK (resumen_hora BETWEEN 12 AND 23)');
  pgm.addConstraint('clinicas', 'clinicas_resumen_correos_max', 'CHECK (cardinality(resumen_correos) <= 3)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS resumenes_diarios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    estado varchar(20) NOT NULL DEFAULT 'enviando',
    canales text,
    error text,
    automatico boolean NOT NULL DEFAULT true,
    usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resumenes_diarios_estado_check CHECK (estado IN ('enviando','enviado','fallo')),
    CONSTRAINT resumenes_diarios_unico UNIQUE (clinica_id, fecha)
  )`);
  pgm.addColumns('tratamientos', { indicaciones: { type: 'text' } });
  pgm.sql('ALTER TABLE avisos_envios DROP CONSTRAINT IF EXISTS avisos_envios_tipo_check');
  pgm.sql("ALTER TABLE avisos_envios ADD CONSTRAINT avisos_envios_tipo_check CHECK (tipo IN ('oferta','control','encuesta','indicaciones'))");
};
exports.down = (pgm) => {
  pgm.sql("DELETE FROM avisos_envios WHERE tipo='indicaciones'");
  pgm.sql('ALTER TABLE avisos_envios DROP CONSTRAINT IF EXISTS avisos_envios_tipo_check');
  pgm.sql("ALTER TABLE avisos_envios ADD CONSTRAINT avisos_envios_tipo_check CHECK (tipo IN ('oferta','control','encuesta'))");
  pgm.dropColumns('tratamientos', ['indicaciones']);
  pgm.sql('DROP TABLE IF EXISTS resumenes_diarios');
  pgm.dropConstraint('clinicas', 'clinicas_resumen_correos_max');
  pgm.dropConstraint('clinicas', 'clinicas_resumen_hora_rango');
  pgm.dropColumns('clinicas', ['resumen_activo', 'resumen_hora', 'resumen_correos', 'resumen_whatsapp', 'indicaciones_auto']);
};
