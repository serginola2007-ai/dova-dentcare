/* Fase 4 — inventario por lotes y archivos del laboratorio.
   - Lotes: cada entrada puede traer lote y vencimiento; las salidas descuentan
     primero lo que vence antes (FEFO). El stock del insumo sigue siendo la
     suma (insumos.stock_actual) y insumos.lote / fecha_vencimiento muestran el
     lote que vence primero, para no romper pantallas ni reportes.
   - Cada movimiento indica el lote que tocó.
   - Laboratorio: archivos (fotos, PDF, STL) guardados en la base. */
exports.up = (pgm) => {
  pgm.createTable('insumo_lotes', {
    id: 'id',
    insumo_id: { type: 'integer', notNull: true, references: 'insumos', onDelete: 'CASCADE' },
    lote: { type: 'varchar(60)' },
    vencimiento: { type: 'date' },
    cantidad_inicial: { type: 'numeric(12,2)', notNull: true, default: 0 },
    cantidad_actual: { type: 'numeric(12,2)', notNull: true, default: 0 },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('insumo_lotes', ['insumo_id', 'vencimiento']);
  pgm.addColumns('movimientos_inventario', { lote_id: { type: 'integer', references: 'insumo_lotes', onDelete: 'SET NULL' } });
  // Lotes iniciales con el stock que ya había.
  pgm.sql(`INSERT INTO insumo_lotes (insumo_id, lote, vencimiento, cantidad_inicial, cantidad_actual)
           SELECT id, lote, fecha_vencimiento, stock_actual, stock_actual FROM insumos WHERE stock_actual > 0`);
  pgm.createTable('laboratorio_archivos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    laboratorio_id: { type: 'integer', notNull: true, references: 'laboratorio', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(200)', notNull: true },
    mime: { type: 'varchar(60)', notNull: true },
    tamano: { type: 'integer', notNull: true },
    archivo: { type: 'bytea', notNull: true },
    subido_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('laboratorio_archivos', ['laboratorio_id']);
};
exports.down = (pgm) => {
  pgm.dropTable('laboratorio_archivos');
  pgm.dropColumns('movimientos_inventario', ['lote_id']);
  pgm.dropTable('insumo_lotes');
};
