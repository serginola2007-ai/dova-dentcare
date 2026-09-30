exports.up = (pgm) => {
  pgm.createTable('proveedores', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(150)', notNull: true },
    empresa: { type: 'varchar(150)' },
    telefono: { type: 'varchar(40)' },
    whatsapp: { type: 'varchar(40)' },
    email: { type: 'varchar(150)' },
    direccion: { type: 'text' },
    productos: { type: 'text' },
    observaciones: { type: 'text' },
    activo: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('insumos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(150)', notNull: true },
    categoria: { type: 'varchar(80)' },
    stock_actual: { type: 'numeric(12,2)', notNull: true, default: 0 },
    stock_minimo: { type: 'numeric(12,2)', notNull: true, default: 0 },
    proveedor_id: { type: 'integer', references: 'proveedores', onDelete: 'SET NULL' },
    precio_compra: { type: 'numeric(14,2)' },
    lote: { type: 'varchar(60)' },
    fecha_vencimiento: { type: 'date' },
    activo: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('insumos', 'clinica_id');

  pgm.createTable('movimientos_inventario', {
    id: 'id',
    insumo_id: { type: 'integer', notNull: true, references: 'insumos', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(20)', notNull: true }, // entrada, salida, ajuste, perdida, vencimiento
    cantidad: { type: 'numeric(12,2)', notNull: true },
    motivo: { type: 'text' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('movimientos_inventario', 'insumo_id');

  pgm.createTable('compras', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    proveedor_id: { type: 'integer', references: 'proveedores' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    total: { type: 'numeric(14,2)', notNull: true, default: 0 },
    estado: { type: 'varchar(20)', notNull: true, default: 'confirmada' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('compra_items', {
    id: 'id',
    compra_id: { type: 'integer', notNull: true, references: 'compras', onDelete: 'CASCADE' },
    insumo_id: { type: 'integer', notNull: true, references: 'insumos' },
    cantidad: { type: 'numeric(12,2)', notNull: true },
    precio_unitario: { type: 'numeric(14,2)', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('compra_items');
  pgm.dropTable('compras');
  pgm.dropTable('movimientos_inventario');
  pgm.dropTable('insumos');
  pgm.dropTable('proveedores');
};
