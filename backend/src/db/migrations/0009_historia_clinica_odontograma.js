exports.up = (pgm) => {
  pgm.createTable('historia_clinica', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    motivo_consulta: { type: 'text' },
    anamnesis: { type: 'text' },
    diagnostico: { type: 'text' },
    diagnostico_diferencial: { type: 'text' },
    procedimiento: { type: 'text' },
    tratamiento_id: { type: 'integer', references: 'tratamientos' },
    anestesia: { type: 'text' },
    materiales: { type: 'text' },
    evolucion: { type: 'text' },
    indicaciones: { type: 'text' },
    observaciones: { type: 'text' },
    proxima_consulta: { type: 'date' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('historia_clinica', ['clinica_id', 'paciente_id', 'fecha']);

  // Odontograma: estado ACTUAL por pieza+superficie, con historial en tabla aparte
  // (nunca se sobreescribe destructivamente, según prompts maestros).
  pgm.createTable('odontograma_piezas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    pieza: { type: 'varchar(10)', notNull: true }, // notación FDI, 11-48
    superficie: { type: 'varchar(30)', notNull: true, default: 'general' },
    // general, mesial, distal, vestibular, lingual_palatina, oclusal_incisal
    estado: { type: 'varchar(30)', notNull: true, default: 'sano' },
    tratamiento: { type: 'text' },
    observacion: { type: 'text' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('odontograma_piezas', 'odontograma_piezas_unique', 'UNIQUE(paciente_id, pieza, superficie)');

  pgm.createTable('odontograma_historial', {
    id: 'id',
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    pieza: { type: 'varchar(10)', notNull: true },
    superficie: { type: 'varchar(30)', notNull: true },
    estado: { type: 'varchar(30)', notNull: true },
    tratamiento: { type: 'text' },
    observacion: { type: 'text' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    fecha: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('odontograma_historial', ['paciente_id', 'pieza']);
};

exports.down = (pgm) => {
  pgm.dropTable('odontograma_historial');
  pgm.dropTable('odontograma_piezas');
  pgm.dropTable('historia_clinica');
};
