exports.up = (pgm) => {
  pgm.createTable('fotos_clinicas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    categoria: { type: 'varchar(30)', notNull: true }, // frontal, lateral, intraoral, superior, inferior, antes, despues, otra
    pieza: { type: 'varchar(10)' },
    tratamiento_id: { type: 'integer', references: 'tratamientos' },
    storage_path: { type: 'text', notNull: true },
    observacion: { type: 'text' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    subido_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('fotos_clinicas', 'paciente_id');

  pgm.createTable('estudios', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(40)', notNull: true }, // panoramica, periapical, bitewing, cefalometria, tomografia, fotografia, otro
    pieza: { type: 'varchar(10)' },
    descripcion: { type: 'text' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    storage_path: { type: 'text' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('estudios', 'paciente_id');

  pgm.createTable('consentimientos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    procedimiento: { type: 'varchar(80)', notNull: true },
    texto: { type: 'text', notNull: true },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' }, // pendiente, firmado, rechazado, anulado
    firma_paciente: { type: 'text' }, // base64 canvas
    firma_odontologo: { type: 'text' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('recetas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    indicaciones: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('receta_items', {
    id: 'id',
    receta_id: { type: 'integer', notNull: true, references: 'recetas', onDelete: 'CASCADE' },
    medicamento: { type: 'varchar(150)', notNull: true },
    concentracion: { type: 'varchar(60)' },
    presentacion: { type: 'varchar(60)' },
    dosis: { type: 'varchar(60)' },
    frecuencia: { type: 'varchar(60)' },
    duracion: { type: 'varchar(60)' },
  });

  pgm.createTable('lista_espera', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    tratamiento_id: { type: 'integer', references: 'tratamientos' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    preferencia_dia: { type: 'varchar(40)' },
    preferencia_horario: { type: 'varchar(40)' },
    prioridad: { type: 'varchar(20)', default: 'media' },
    estado: { type: 'varchar(20)', notNull: true, default: 'esperando' }, // esperando, contactado, asignado, cancelado
    observaciones: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('whatsapp_historial', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', references: 'pacientes', onDelete: 'CASCADE' },
    tipo_mensaje: { type: 'varchar(40)', notNull: true },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('laboratorio', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    laboratorio_nombre: { type: 'varchar(150)' },
    trabajo: { type: 'varchar(200)' },
    pieza: { type: 'varchar(10)' },
    fecha_envio: { type: 'date' },
    fecha_estimada: { type: 'date' },
    fecha_recepcion: { type: 'date' },
    costo: { type: 'numeric(14,2)' },
    estado: { type: 'varchar(20)', notNull: true, default: 'solicitado' },
    observaciones: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('laboratorio');
  pgm.dropTable('whatsapp_historial');
  pgm.dropTable('lista_espera');
  pgm.dropTable('receta_items');
  pgm.dropTable('recetas');
  pgm.dropTable('consentimientos');
  pgm.dropTable('estudios');
  pgm.dropTable('fotos_clinicas');
};
