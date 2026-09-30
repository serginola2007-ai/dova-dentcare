exports.up = (pgm) => {
  pgm.createTable('turnos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', notNull: true, references: 'odontologos' },
    fecha: { type: 'date', notNull: true },
    hora_inicio: { type: 'time', notNull: true },
    duracion_minutos: { type: 'integer', notNull: true, default: 30 },
    motivo: { type: 'text' },
    tratamiento_id: { type: 'integer' }, // FK se agrega cuando exista tabla tratamientos
    sala: { type: 'varchar(40)' },
    estado: {
      type: 'varchar(20)', notNull: true, default: 'reservado',
      // reservado, confirmado, atendido, cancelado, reprogramado, no_asistio
    },
    observaciones: { type: 'text' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('turnos', ['clinica_id', 'fecha']);
  pgm.createIndex('turnos', ['odontologo_id', 'fecha']);

  pgm.createTable('turno_historial', {
    id: 'id',
    turno_id: { type: 'integer', notNull: true, references: 'turnos', onDelete: 'CASCADE' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    cambio: { type: 'jsonb', notNull: true }, // {de: {...}, a: {...}}
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('turno_historial');
  pgm.dropTable('turnos');
};
