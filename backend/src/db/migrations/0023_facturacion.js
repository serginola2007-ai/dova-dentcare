/* Facturación de DOVA.

   Principio: Pago ≠ Factura ≠ Movimiento de caja, pero relacionados.
   - pagos           → el dinero recibido (ya existía).
   - caja_movimientos → el reflejo del pago en la caja (ya existía, vía pago_id).
   - facturas        → el comprobante emitido al cliente. Se vincula a uno o
                       más pagos (factura_pagos); la caja se alcanza a través
                       del pago, así que NUNCA se duplica un ingreso de caja.

   Los comprobantes que emite DOVA son INTERNOS (es_fiscal = false). La
   columna tipo/es_fiscal y la tabla de series dejan preparada la estructura
   para una futura integración fiscal (timbrado / factura electrónica), sin
   simularla. Nada se borra: las facturas se anulan. */
exports.up = (pgm) => {
  // ---- Configuración de facturación (una por clínica) ----
  pgm.createTable('facturacion_config', {
    clinica_id: { type: 'integer', primaryKey: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre_comercial: { type: 'varchar(150)' },
    razon_social: { type: 'varchar(200)' },
    ruc: { type: 'varchar(40)' },
    direccion: { type: 'text' },
    telefono: { type: 'varchar(60)' },
    email: { type: 'varchar(150)' },
    logo: { type: 'bytea' },               // imagen chica (se guarda en la base: no se pierde al actualizar el servidor)
    logo_mime: { type: 'varchar(40)' },
    timbrado: { type: 'varchar(20)' },      // dato guardado para una futura integración fiscal
    timbrado_vence: { type: 'date' },
    establecimiento: { type: 'varchar(3)', notNull: true, default: '001' },
    punto_expedicion: { type: 'varchar(3)', notNull: true, default: '001' },
    iva_por_defecto: { type: 'smallint', notNull: true, default: 10 },
    metodos_pago: { type: 'jsonb', notNull: true, default: pgm.func(`'[{"codigo":"efectivo","nombre":"Efectivo","activo":true},{"codigo":"transferencia","nombre":"Transferencia","activo":true},{"codigo":"tarjeta_debito","nombre":"Tarjeta de débito","activo":true},{"codigo":"tarjeta_credito","nombre":"Tarjeta de crédito","activo":true},{"codigo":"tarjeta","nombre":"Tarjeta","activo":true},{"codigo":"qr","nombre":"QR","activo":true},{"codigo":"otro","nombre":"Otro","activo":true}]'::jsonb`) },
    pie_texto: { type: 'text' },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('facturacion_config', 'facturacion_config_iva_check', { check: 'iva_por_defecto IN (0, 5, 10)' });
  pgm.addConstraint('facturacion_config', 'facturacion_config_serie_check', { check: "establecimiento ~ '^[0-9]{3}$' AND punto_expedicion ~ '^[0-9]{3}$'" });

  // ---- Series de numeración (controladas por la base, nunca por el navegador) ----
  pgm.createTable('facturacion_series', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(30)', notNull: true },          // comprobante_interno | nota_credito_interna | (futuro) factura_fiscal
    establecimiento: { type: 'varchar(3)', notNull: true },
    punto_expedicion: { type: 'varchar(3)', notNull: true },
    siguiente_numero: { type: 'integer', notNull: true, default: 1 },
    activo: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('facturacion_series', 'facturacion_series_unica', { unique: ['clinica_id', 'tipo', 'establecimiento', 'punto_expedicion'] });
  pgm.addConstraint('facturacion_series', 'facturacion_series_tipo_check', { check: "tipo IN ('comprobante_interno','nota_credito_interna','factura_fiscal')" });
  pgm.addConstraint('facturacion_series', 'facturacion_series_num_check', { check: 'siguiente_numero >= 1' });

  // ---- Facturas / comprobantes ----
  pgm.createTable('facturas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    serie_id: { type: 'integer', notNull: true, references: 'facturacion_series', onDelete: 'RESTRICT' },
    tipo: { type: 'varchar(30)', notNull: true, default: 'comprobante_interno' },
    es_fiscal: { type: 'boolean', notNull: true, default: false },
    numero: { type: 'integer', notNull: true },
    numero_completo: { type: 'varchar(20)', notNull: true },
    fecha: { type: 'date', notNull: true },
    condicion: { type: 'varchar(10)', notNull: true, default: 'contado' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'RESTRICT' },
    // Datos del cliente tal como salieron impresos (si después cambia la ficha, el comprobante no cambia)
    cliente_nombre: { type: 'varchar(200)', notNull: true },
    cliente_documento: { type: 'varchar(40)' },
    cliente_ruc: { type: 'varchar(40)' },
    cliente_direccion: { type: 'text' },
    cliente_telefono: { type: 'varchar(60)' },
    cliente_email: { type: 'varchar(150)' },
    odontologo_id: { type: 'integer', references: 'odontologos', onDelete: 'SET NULL' },
    presupuesto_id: { type: 'integer', references: 'presupuestos', onDelete: 'SET NULL' },
    metodo_pago: { type: 'varchar(30)' },
    // Totales: SIEMPRE calculados en el servidor a partir de los ítems
    subtotal: { type: 'numeric(14,2)', notNull: true, default: 0 },
    descuento_total: { type: 'numeric(14,2)', notNull: true, default: 0 },
    exento: { type: 'numeric(14,2)', notNull: true, default: 0 },
    gravado_5: { type: 'numeric(14,2)', notNull: true, default: 0 },
    gravado_10: { type: 'numeric(14,2)', notNull: true, default: 0 },
    iva_5: { type: 'numeric(14,2)', notNull: true, default: 0 },
    iva_10: { type: 'numeric(14,2)', notNull: true, default: 0 },
    total: { type: 'numeric(14,2)', notNull: true },
    estado: { type: 'varchar(12)', notNull: true, default: 'pendiente' },
    observaciones: { type: 'text' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    anulada_en: { type: 'timestamptz' },
    anulada_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    motivo_anulacion: { type: 'text' },
  });
  pgm.addConstraint('facturas', 'facturas_numero_unico', { unique: ['serie_id', 'numero'] });
  pgm.addConstraint('facturas', 'facturas_estado_check', { check: "estado IN ('emitida','pagada','pendiente','anulada')" });
  pgm.addConstraint('facturas', 'facturas_condicion_check', { check: "condicion IN ('contado','credito')" });
  pgm.addConstraint('facturas', 'facturas_total_check', { check: 'total >= 0 AND subtotal >= 0 AND descuento_total >= 0' });
  pgm.addConstraint('facturas', 'facturas_anulacion_check', { check: "(estado = 'anulada') = (anulada_en IS NOT NULL)" });
  pgm.createIndex('facturas', ['clinica_id', 'fecha']);
  pgm.createIndex('facturas', ['clinica_id', 'paciente_id']);
  pgm.createIndex('facturas', ['clinica_id', 'estado']);
  pgm.createIndex('facturas', 'presupuesto_id');

  pgm.createTable('factura_items', {
    id: 'id',
    factura_id: { type: 'integer', notNull: true, references: 'facturas', onDelete: 'CASCADE' },
    orden: { type: 'smallint', notNull: true, default: 1 },
    tratamiento_id: { type: 'integer', references: 'tratamientos', onDelete: 'SET NULL' },
    presupuesto_item_id: { type: 'integer', references: 'presupuesto_items', onDelete: 'SET NULL' },
    descripcion: { type: 'varchar(250)', notNull: true },
    pieza: { type: 'varchar(10)' },
    cantidad: { type: 'numeric(10,2)', notNull: true },
    precio_unitario: { type: 'numeric(14,2)', notNull: true },
    descuento: { type: 'numeric(14,2)', notNull: true, default: 0 },
    tasa_iva: { type: 'smallint', notNull: true, default: 10 },
    subtotal: { type: 'numeric(14,2)', notNull: true },
    iva: { type: 'numeric(14,2)', notNull: true, default: 0 },
  });
  pgm.addConstraint('factura_items', 'factura_items_valores_check', { check: 'cantidad > 0 AND precio_unitario >= 0 AND descuento >= 0 AND subtotal >= 0' });
  pgm.addConstraint('factura_items', 'factura_items_iva_check', { check: 'tasa_iva IN (0, 5, 10)' });
  pgm.createIndex('factura_items', 'factura_id');
  pgm.createIndex('factura_items', 'tratamiento_id');

  // Relación factura ↔ pago. Un pago puede estar en UNA sola factura vigente.
  pgm.createTable('factura_pagos', {
    id: 'id',
    factura_id: { type: 'integer', notNull: true, references: 'facturas', onDelete: 'CASCADE' },
    pago_id: { type: 'integer', notNull: true, references: 'pagos', onDelete: 'RESTRICT' },
    monto: { type: 'numeric(14,2)', notNull: true },
    activo: { type: 'boolean', notNull: true, default: true }, // pasa a false si la factura se anula (el pago queda libre para facturarse de nuevo)
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
  });
  pgm.createIndex('factura_pagos', 'pago_id', { unique: true, where: 'activo', name: 'factura_pagos_pago_vigente_unico' });
  pgm.createIndex('factura_pagos', 'factura_id');

  // Historial de cada factura (lo que se ve en su detalle).
  pgm.createTable('factura_eventos', {
    id: 'id',
    factura_id: { type: 'integer', notNull: true, references: 'facturas', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(30)', notNull: true },
    detalle: { type: 'jsonb' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    usuario_nombre: { type: 'varchar(120)' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('factura_eventos', ['factura_id', 'creado_en']);

  // Notas de crédito INTERNAS (estructura preparada; no fiscales).
  pgm.createTable('notas_credito', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    factura_id: { type: 'integer', notNull: true, references: 'facturas', onDelete: 'RESTRICT' },
    serie_id: { type: 'integer', notNull: true, references: 'facturacion_series', onDelete: 'RESTRICT' },
    numero: { type: 'integer', notNull: true },
    numero_completo: { type: 'varchar(20)', notNull: true },
    fecha: { type: 'date', notNull: true },
    monto: { type: 'numeric(14,2)', notNull: true },
    motivo: { type: 'text', notNull: true },
    estado: { type: 'varchar(12)', notNull: true, default: 'emitida' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('notas_credito', 'notas_credito_numero_unico', { unique: ['serie_id', 'numero'] });
  pgm.addConstraint('notas_credito', 'notas_credito_monto_check', { check: 'monto > 0' });
  pgm.addConstraint('notas_credito', 'notas_credito_estado_check', { check: "estado IN ('emitida','anulada')" });
  pgm.createIndex('notas_credito', 'factura_id');

  // ---- Integración con datos existentes ----
  // Datos de facturación del paciente (se pueden guardar desde la factura).
  pgm.addColumns('pacientes', {
    ruc: { type: 'varchar(40)' },
    razon_social: { type: 'varchar(200)' },
  });
  // Un cobro puede indicar a qué presupuesto corresponde (así la factura lo hereda).
  pgm.addColumn('pagos', { presupuesto_id: { type: 'integer', references: 'presupuestos', onDelete: 'SET NULL' } });
  pgm.createIndex('pagos', 'presupuesto_id');
  // Los cobros de cuotas ya sabían su presupuesto a través del plan de pago.
  pgm.sql(`UPDATE pagos p SET presupuesto_id = pp.presupuesto_id
             FROM cuotas c JOIN planes_pago pp ON pp.id = c.plan_pago_id
            WHERE p.cuota_id = c.id AND pp.presupuesto_id IS NOT NULL AND p.presupuesto_id IS NULL`);
};

exports.down = (pgm) => {
  pgm.dropIndex('pagos', 'presupuesto_id');
  pgm.dropColumn('pagos', 'presupuesto_id');
  pgm.dropColumns('pacientes', ['ruc', 'razon_social']);
  pgm.dropTable('notas_credito');
  pgm.dropTable('factura_eventos');
  pgm.dropTable('factura_pagos');
  pgm.dropTable('factura_items');
  pgm.dropTable('facturas');
  pgm.dropTable('facturacion_series');
  pgm.dropTable('facturacion_config');
};
