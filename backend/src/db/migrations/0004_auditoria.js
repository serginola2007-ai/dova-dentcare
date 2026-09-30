exports.up = (pgm) => {
  pgm.createTable('auditoria', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    usuario_nombre: { type: 'varchar(120)' }, // snapshot por si se elimina el usuario
    accion: { type: 'varchar(60)', notNull: true }, // crear, editar, eliminar, pago, login, etc.
    modulo: { type: 'varchar(60)', notNull: true },
    entidad_id: { type: 'varchar(60)' },
    detalle: { type: 'jsonb' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('auditoria', ['clinica_id', 'creado_en']);
  pgm.createIndex('auditoria', ['modulo']);
};

exports.down = (pgm) => {
  pgm.dropTable('auditoria');
};
