exports.up = (pgm) => {
  pgm.createTable('caja_aperturas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    monto_inicial: { type: 'numeric(14,2)', notNull: true, default: 0 },
    responsable_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    estado: { type: 'varchar(20)', notNull: true, default: 'abierta' }, // abierta, cerrada
    monto_esperado: { type: 'numeric(14,2)' },
    monto_contado: { type: 'numeric(14,2)' },
    diferencia: { type: 'numeric(14,2)' },
    motivo_diferencia: { type: 'text' },
    abierta_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    cerrada_en: { type: 'timestamptz' },
  });
  // No permitir dos cajas abiertas simultáneamente en la misma clínica
  // (bug real pedido evitar en el prompt de auditoría: "caja de otro día").
  pgm.sql(`
    CREATE UNIQUE INDEX caja_una_abierta_por_clinica
    ON caja_aperturas (clinica_id)
    WHERE estado = 'abierta';
  `);

  pgm.createTable('caja_movimientos', {
    id: 'id',
    caja_apertura_id: { type: 'integer', notNull: true, references: 'caja_aperturas', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(10)', notNull: true }, // ingreso, egreso
    concepto: { type: 'varchar(200)', notNull: true },
    monto: { type: 'numeric(14,2)', notNull: true },
    metodo: { type: 'varchar(20)', default: 'efectivo' },
    pago_id: { type: 'integer', references: 'pagos', onDelete: 'SET NULL' }, // link automático pago->caja
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('caja_movimientos', 'caja_apertura_id');
};

exports.down = (pgm) => {
  pgm.dropTable('caja_movimientos');
  pgm.dropTable('caja_aperturas');
};
