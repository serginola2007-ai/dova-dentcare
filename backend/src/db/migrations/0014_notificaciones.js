exports.up = (pgm) => {
  pgm.createTable('notificaciones', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    usuario_id: { type: 'integer', notNull: true, references: 'usuarios', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(40)', notNull: true }, // ticket_nuevo, ticket_respuesta, ticket_resuelto, turno, pago_vencido, etc.
    titulo: { type: 'varchar(200)', notNull: true },
    mensaje: { type: 'text' },
    entidad: { type: 'varchar(40)' }, // 'ticket', 'turno', 'paciente'...
    entidad_id: { type: 'varchar(40)' },
    ruta: { type: 'text' }, // ruta/deeplink del frontend
    leido: { type: 'boolean', notNull: true, default: false },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('notificaciones', ['usuario_id', 'leido']);
};

exports.down = (pgm) => {
  pgm.dropTable('notificaciones');
};
