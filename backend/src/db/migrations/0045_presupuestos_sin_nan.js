/* Repara presupuestos con total "NaN" (antes un cálculo inválido podía
   guardarse así). Se recalcula con sus ítems y el descuento; sin ítems, 0.
   Solo toca filas con total NaN. */
exports.up = (pgm) => {
  pgm.sql(`UPDATE presupuestos p SET total = GREATEST(0, ROUND(
      COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM presupuesto_items i WHERE i.presupuesto_id = p.id), 0)
      * (1 - COALESCE(NULLIF(p.descuento, 'NaN'), 0) / 100), 2))
    WHERE p.total = 'NaN'`);
};
exports.down = () => {};
