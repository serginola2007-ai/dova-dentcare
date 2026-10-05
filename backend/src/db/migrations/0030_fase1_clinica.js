/* Fase 1 — clínica integral.
   - Fotos y estudios: el archivo se guarda EN LA BASE (bytea). El disco de
     Render se borra en cada actualización, así que los archivos subidos antes
     se perdían y además no había forma de verlos. Se vinculan a la consulta
     (historia_clinica) y al tratamiento (plan).
   - Notas internas del paciente (no clínicas: avisos para el equipo).
   - Auditoría: IP y resultado de cada acción (ok / fallido / denegado). */
exports.up = (pgm) => {
  pgm.alterColumn('fotos_clinicas', 'storage_path', { notNull: false });
  pgm.addColumns('fotos_clinicas', {
    archivo: { type: 'bytea' },
    mime: { type: 'varchar(40)' },
    tamano: { type: 'integer' },
    historia_clinica_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' },
    plan_id: { type: 'integer', references: 'planes_tratamiento', onDelete: 'SET NULL' },
  });
  pgm.addColumns('estudios', {
    archivo: { type: 'bytea' },
    mime: { type: 'varchar(40)' },
    tamano: { type: 'integer' },
    nombre_archivo: { type: 'varchar(200)' },
    observaciones: { type: 'text' },
    historia_clinica_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' },
    plan_id: { type: 'integer', references: 'planes_tratamiento', onDelete: 'SET NULL' },
  });
  pgm.createTable('paciente_notas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    texto: { type: 'text', notNull: true },
    importante: { type: 'boolean', notNull: true, default: false },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    usuario_nombre: { type: 'varchar(150)' },
    eliminada_en: { type: 'timestamptz' },
    eliminada_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('paciente_notas', ['clinica_id', 'paciente_id', 'creado_en']);
  pgm.addColumns('auditoria', {
    ip: { type: 'varchar(64)' },
    resultado: { type: 'varchar(20)', notNull: true, default: 'ok' },
  });
  pgm.createIndex('historia_clinica', ['clinica_id', 'turno_id']);
};

exports.down = (pgm) => {
  pgm.dropIndex('historia_clinica', ['clinica_id', 'turno_id']);
  pgm.dropColumns('auditoria', ['ip', 'resultado']);
  pgm.dropTable('paciente_notas');
  pgm.dropColumns('estudios', ['archivo', 'mime', 'tamano', 'nombre_archivo', 'observaciones', 'historia_clinica_id', 'plan_id']);
  pgm.dropColumns('fotos_clinicas', ['archivo', 'mime', 'tamano', 'historia_clinica_id', 'plan_id']);
};
