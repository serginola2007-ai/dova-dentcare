exports.up = (pgm) => {
  pgm.createTable('tratamientos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(150)', notNull: true },
    categoria: { type: 'varchar(80)' },
    descripcion: { type: 'text' },
    precio: { type: 'numeric(14,2)', notNull: true, default: 0 },
    duracion_minutos: { type: 'integer' },
    activo: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('turnos', 'turnos_tratamiento_fk',
    'FOREIGN KEY (tratamiento_id) REFERENCES tratamientos(id) ON DELETE SET NULL');

  pgm.createTable('planes_tratamiento', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    tratamiento_id: { type: 'integer', references: 'tratamientos' },
    nombre: { type: 'varchar(150)', notNull: true },
    diagnostico: { type: 'text' },
    pieza: { type: 'varchar(10)' },
    superficie: { type: 'varchar(30)' },
    prioridad: { type: 'varchar(20)', default: 'media' }, // urgente, alta, media, baja
    precio: { type: 'numeric(14,2)', notNull: true, default: 0 },
    descuento: { type: 'numeric(6,2)', notNull: true, default: 0 },
    sesiones_totales: { type: 'integer', notNull: true, default: 1 },
    sesiones_realizadas: { type: 'integer', notNull: true, default: 0 },
    fecha_inicio: { type: 'date' },
    fecha_estimada_fin: { type: 'date' },
    estado: {
      type: 'varchar(20)', notNull: true, default: 'pendiente',
      // pendiente, presupuestado, aprobado, en_proceso, pausado, finalizado, cancelado, rechazado
    },
    observaciones: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('planes_tratamiento', ['clinica_id', 'paciente_id']);

  pgm.createTable('sesiones_tratamiento', {
    id: 'id',
    plan_id: { type: 'integer', notNull: true, references: 'planes_tratamiento', onDelete: 'CASCADE' },
    numero: { type: 'integer', notNull: true },
    fecha: { type: 'date', notNull: true },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    procedimiento: { type: 'text' },
    pieza: { type: 'varchar(10)' },
    observaciones: { type: 'text' },
    evolucion: { type: 'text' },
    proxima_sesion: { type: 'date' },
    estado: { type: 'varchar(20)', notNull: true, default: 'realizada' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sesiones_tratamiento', 'plan_id');
};

exports.down = (pgm) => {
  pgm.dropTable('sesiones_tratamiento');
  pgm.dropTable('planes_tratamiento');
  pgm.dropConstraint('turnos', 'turnos_tratamiento_fk');
  pgm.dropTable('tratamientos');
};
