/* Ortodoncia: el caso se vincula con su plan de cuotas mensuales (planes_pago), así las cuotas
   aparecen solas en Mi pago, en el cobro online, en los avisos de cobro y en "quién debe". */
exports.up = (pgm) => {
  pgm.addColumns('orto_casos', { plan_pago_id: { type: 'integer', references: 'planes_pago', onDelete: 'SET NULL' } });
  pgm.createIndex('orto_casos', ['plan_pago_id']);
};
exports.down = (pgm) => { pgm.dropColumns('orto_casos', ['plan_pago_id']); };
