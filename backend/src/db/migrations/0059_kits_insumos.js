/* Kits de insumos por tratamiento: lo que se usa en cada sesión de ese tratamiento.
   Al registrar una sesión realizada se descuenta solo (una sola vez por sesión: kit_aplicado). */
exports.up = (pgm) => {
  pgm.createTable('tratamiento_kits', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    tratamiento_id: { type: 'integer', notNull: true, references: 'tratamientos', onDelete: 'CASCADE' },
    insumo_id: { type: 'integer', notNull: true, references: 'insumos', onDelete: 'CASCADE' },
    cantidad: { type: 'numeric(12,2)', notNull: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tratamiento_kits', 'tratamiento_kits_unico', { unique: ['tratamiento_id', 'insumo_id'] });
  pgm.addConstraint('tratamiento_kits', 'tratamiento_kits_cantidad', { check: 'cantidad > 0' });
  pgm.createIndex('tratamiento_kits', ['clinica_id', 'tratamiento_id']);
  pgm.addColumns('sesiones_tratamiento', { kit_aplicado: { type: 'boolean', notNull: true, default: false } });
};
exports.down = (pgm) => {
  pgm.dropColumns('sesiones_tratamiento', ['kit_aplicado']);
  pgm.dropTable('tratamiento_kits');
};
