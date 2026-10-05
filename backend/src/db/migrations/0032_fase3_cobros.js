/* Fase 3 — cobros y presupuestos.
   - Anulación de cobros con motivo, quién y cuándo (queda en el cobro, además
     de la auditoría).
   - Planes de tratamiento creados desde un presupuesto: vínculo al ítem para
     no duplicarlos. */
exports.up = (pgm) => {
  pgm.addColumns('pagos', {
    anulado_motivo: { type: 'text' },
    anulado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    anulado_en: { type: 'timestamptz' },
  });
  pgm.addColumns('planes_tratamiento', {
    presupuesto_item_id: { type: 'integer', references: 'presupuesto_items', onDelete: 'SET NULL' },
  });
  pgm.createIndex('planes_tratamiento', ['presupuesto_item_id'], { unique: true, where: 'presupuesto_item_id IS NOT NULL' });
};
exports.down = (pgm) => {
  pgm.dropIndex('planes_tratamiento', ['presupuesto_item_id']);
  pgm.dropColumns('planes_tratamiento', ['presupuesto_item_id']);
  pgm.dropColumns('pagos', ['anulado_motivo', 'anulado_por', 'anulado_en']);
};
