/* Cobro online (solo agrega):
   - clinicas.cobro_online_activo: la clínica decide si ofrece "Pagar ahora" en Mi pago.
   - cobros_online: cada intento de cobro de una cuota por la pasarela de pago. El pago real
     (tabla pagos, caja y cuota) se registra recién cuando la pasarela confirma, por el mismo
     camino que un cobro a mano. */
exports.up = (pgm) => {
  pgm.addColumns('clinicas', { cobro_online_activo: { type: 'boolean', notNull: true, default: false } });
  pgm.createTable('cobros_online', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes' },
    cuota_id: { type: 'integer', notNull: true, references: 'cuotas' },
    monto: { type: 'numeric(14,0)', notNull: true },
    proveedor: { type: 'varchar(30)', notNull: true },
    pedido_comercio: { type: 'varchar(80)', notNull: true, unique: true },
    hash_proveedor: { type: 'varchar(200)' },
    url_pago: { type: 'text' },
    estado: { type: 'varchar(20)', notNull: true, default: 'creado' },
    pago_id: { type: 'integer', references: 'pagos' },
    forma_pago: { type: 'varchar(80)' },
    vence_en: { type: 'timestamptz', notNull: true },
    pagado_en: { type: 'timestamptz' },
    ultimo_error: { type: 'varchar(300)' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('cobros_online', 'cobros_online_estado_check', "CHECK (estado IN ('creado','pagado','cancelado','vencido','revisar'))");
  pgm.createIndex('cobros_online', ['clinica_id', 'creado_en']);
  pgm.createIndex('cobros_online', ['hash_proveedor']);
  pgm.createIndex('cobros_online', ['cuota_id', 'estado']);
};
exports.down = (pgm) => {
  pgm.dropTable('cobros_online');
  pgm.dropColumns('clinicas', ['cobro_online_activo']);
};
