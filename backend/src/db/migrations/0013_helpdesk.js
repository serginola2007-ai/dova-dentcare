/* Helpdesk interno. Decisiones definitivas del prompt maestro respetadas:
   estados = nuevo/abierto/en_espera/resuelto (sin "cerrado" ni prioridad);
   categorías = error/mejora/otro. Adjuntos con metadata de retención mensual
   (el job de limpieza real se implementa como script node ejecutable por
   cron en el servidor de producción; acá se deja la estructura y el script,
   documentado, sin fingir un cron permanente en este entorno). */
exports.up = (pgm) => {
  pgm.createTable('tickets', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    titulo: { type: 'varchar(200)', notNull: true },
    descripcion: { type: 'text', notNull: true },
    categoria: { type: 'varchar(30)', notNull: true, default: 'otro' }, // error, mejora, otro
    modulo_afectado: { type: 'varchar(60)' },
    creador_id: { type: 'integer', notNull: true, references: 'usuarios', onDelete: 'CASCADE' },
    asignado_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    estado: { type: 'varchar(20)', notNull: true, default: 'nuevo' }, // nuevo, abierto, en_espera, resuelto
    resolucion: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resuelto_en: { type: 'timestamptz' },
  });
  pgm.createIndex('tickets', ['clinica_id', 'estado']);
  pgm.createIndex('tickets', 'asignado_id');

  pgm.createTable('ticket_mensajes', {
    id: 'id',
    ticket_id: { type: 'integer', notNull: true, references: 'tickets', onDelete: 'CASCADE' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    usuario_nombre: { type: 'varchar(120)' }, // snapshot
    contenido: { type: 'text', notNull: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('ticket_mensajes', 'ticket_id');

  pgm.createTable('ticket_adjuntos', {
    id: 'id',
    ticket_id: { type: 'integer', notNull: true, references: 'tickets', onDelete: 'CASCADE' },
    mensaje_id: { type: 'integer', references: 'ticket_mensajes', onDelete: 'CASCADE' },
    subido_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    nombre_original: { type: 'varchar(255)', notNull: true },
    nombre_interno: { type: 'varchar(255)', notNull: true }, // nombre seguro en disco/storage
    mime_type: { type: 'varchar(100)', notNull: true },
    tamanio_bytes: { type: 'bigint', notNull: true },
    storage_path: { type: 'text', notNull: true },
    subido_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    eliminacion_programada_en: { type: 'timestamptz' },
    eliminado_en: { type: 'timestamptz' },
    estado: { type: 'varchar(30)', notNull: true, default: 'active' },
    // active, deleted_by_retention, deleted_manually
    motivo_eliminacion: { type: 'text' },
  });
  pgm.createIndex('ticket_adjuntos', 'ticket_id');
  pgm.createIndex('ticket_adjuntos', ['estado', 'eliminacion_programada_en']);
};

exports.down = (pgm) => {
  pgm.dropTable('ticket_adjuntos');
  pgm.dropTable('ticket_mensajes');
  pgm.dropTable('tickets');
};
