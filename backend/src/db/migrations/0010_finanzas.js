exports.up = (pgm) => {
  pgm.createTable('presupuestos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    fecha: { type: 'date', notNull: true, default: pgm.func('current_date') },
    vencimiento: { type: 'date' },
    descuento: { type: 'numeric(6,2)', notNull: true, default: 0 },
    total: { type: 'numeric(14,2)', notNull: true, default: 0 },
    estado: { type: 'varchar(20)', notNull: true, default: 'borrador' },
    // borrador, enviado, aceptado, rechazado, vencido, cancelado
    observaciones: { type: 'text' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('presupuesto_items', {
    id: 'id',
    presupuesto_id: { type: 'integer', notNull: true, references: 'presupuestos', onDelete: 'CASCADE' },
    tratamiento_id: { type: 'integer', references: 'tratamientos' },
    descripcion: { type: 'varchar(200)', notNull: true },
    pieza: { type: 'varchar(10)' },
    cantidad: { type: 'integer', notNull: true, default: 1 },
    precio_unitario: { type: 'numeric(14,2)', notNull: true, default: 0 },
  });

  pgm.createTable('planes_pago', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    presupuesto_id: { type: 'integer', references: 'presupuestos', onDelete: 'SET NULL' },
    total: { type: 'numeric(14,2)', notNull: true },
    entrega: { type: 'numeric(14,2)', notNull: true, default: 0 },
    cantidad_cuotas: { type: 'integer', notNull: true },
    fecha_inicio: { type: 'date', notNull: true, default: pgm.func('current_date') },
    estado: { type: 'varchar(20)', notNull: true, default: 'activo' }, // activo, finalizado, cancelado
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('cuotas', {
    id: 'id',
    plan_pago_id: { type: 'integer', notNull: true, references: 'planes_pago', onDelete: 'CASCADE' },
    numero: { type: 'integer', notNull: true },
    monto: { type: 'numeric(14,2)', notNull: true },
    vencimiento: { type: 'date', notNull: true },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' }, // pendiente, pagada, vencida
    pagado_en: { type: 'timestamptz' },
  });
  pgm.addConstraint('cuotas', 'cuotas_plan_numero_unique', 'UNIQUE(plan_pago_id, numero)');

  pgm.createTable('pagos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    cuota_id: { type: 'integer', references: 'cuotas', onDelete: 'SET NULL' },
    concepto: { type: 'varchar(200)' },
    monto: { type: 'numeric(14,2)', notNull: true },
    metodo: { type: 'varchar(20)', notNull: true, default: 'efectivo' }, // efectivo, tarjeta, transferencia, qr, otro
    estado: { type: 'varchar(20)', notNull: true, default: 'pagado' }, // pagado, anulado
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    fecha: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('pagos', ['clinica_id', 'fecha']);
  // Evita pagar dos veces la misma cuota (bug crítico pedido en la auditoría del prompt maestro).
  pgm.sql(`
    CREATE UNIQUE INDEX pagos_cuota_unica_activa
    ON pagos (cuota_id)
    WHERE cuota_id IS NOT NULL AND estado = 'pagado';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('pagos');
  pgm.dropTable('cuotas');
  pgm.dropTable('planes_pago');
  pgm.dropTable('presupuesto_items');
  pgm.dropTable('presupuestos');
};
