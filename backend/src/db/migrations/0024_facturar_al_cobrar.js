/* Facturar al registrar cualquier ingreso e imprimir directo.
   - facturas.paciente_id pasa a ser opcional: un ingreso manual de caja
     (sin paciente) también puede llevar comprobante ("Consumidor final").
   - facturas.caja_movimiento_id: el ingreso de caja que cobra esa factura.
     Un mismo ingreso solo puede tener una factura vigente.
   - Preferencias: generar factura al cobrar, imprimir al facturar y
     formato de impresión (A4 o ticket de 80 mm). */
exports.up = (pgm) => {
  pgm.alterColumn('facturas', 'paciente_id', { notNull: false });
  pgm.addColumn('facturas', { caja_movimiento_id: { type: 'integer', references: 'caja_movimientos', onDelete: 'RESTRICT' } });
  pgm.createIndex('facturas', 'caja_movimiento_id', { unique: true, where: "caja_movimiento_id IS NOT NULL AND estado <> 'anulada'", name: 'facturas_movimiento_unico' });
  pgm.addColumns('facturacion_config', {
    facturar_al_cobrar: { type: 'boolean', notNull: true, default: true },
    imprimir_al_facturar: { type: 'boolean', notNull: true, default: true },
    formato_impresion: { type: 'varchar(10)', notNull: true, default: 'a4', check: "formato_impresion IN ('a4','ticket')" },
  });
};
exports.down = (pgm) => {
  pgm.dropColumns('facturacion_config', ['facturar_al_cobrar', 'imprimir_al_facturar', 'formato_impresion']);
  pgm.dropIndex('facturas', 'caja_movimiento_id', { name: 'facturas_movimiento_unico' });
  pgm.dropColumn('facturas', 'caja_movimiento_id');
  pgm.alterColumn('facturas', 'paciente_id', { notNull: true });
};
