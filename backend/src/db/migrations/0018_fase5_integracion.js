/* Fase 5 — Integración: vincula materiales usados en una etapa/sesión de
   tratamiento con el inventario real (en vez del campo de texto libre
   "materiales"), y vincula planes de tratamiento con el presupuesto que
   los origina. Migración 100% aditiva: no se modifica ni elimina ninguna
   columna existente. */

exports.up = (pgm) => {
  // Materiales consumidos por etapa de tratamiento (Fase 34 del prompt maestro:
  // el dentista registra el material usado y el stock se descuenta solo).
  pgm.createTable('etapa_materiales', {
    id: 'id',
    etapa_id: { type: 'integer', notNull: true, references: 'etapas_tratamiento', onDelete: 'CASCADE' },
    insumo_id: { type: 'integer', notNull: true, references: 'insumos', onDelete: 'RESTRICT' },
    cantidad: { type: 'numeric(12,2)', notNull: true },
    movimiento_id: { type: 'integer', references: 'movimientos_inventario', onDelete: 'SET NULL' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('etapa_materiales', 'etapa_id');

  // Lo mismo para sesiones de tratamiento (planes sin checklist de etapas).
  pgm.createTable('sesion_materiales', {
    id: 'id',
    sesion_id: { type: 'integer', notNull: true, references: 'sesiones_tratamiento', onDelete: 'CASCADE' },
    insumo_id: { type: 'integer', notNull: true, references: 'insumos', onDelete: 'RESTRICT' },
    cantidad: { type: 'numeric(12,2)', notNull: true },
    movimiento_id: { type: 'integer', references: 'movimientos_inventario', onDelete: 'SET NULL' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sesion_materiales', 'sesion_id');

  // Vínculo plan de tratamiento -> presupuesto que lo origina (tratamientos
  // ↔ presupuesto). Nullable y aditivo, no reemplaza nada existente.
  pgm.addColumns('planes_tratamiento', {
    presupuesto_id: { type: 'integer', references: 'presupuestos', onDelete: 'SET NULL' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('planes_tratamiento', ['presupuesto_id']);
  pgm.dropTable('sesion_materiales');
  pgm.dropTable('etapa_materiales');
};
