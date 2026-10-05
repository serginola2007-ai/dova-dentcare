/* Portal del paciente en la página web: cuentas con contraseña (verificadas
   con un código al email que la clínica tiene en la ficha) y pagos por
   transferencia/QR con comprobante, que recepción aprueba en DOVA.
   - pacientes.web_verificado: los pacientes que se crean solos desde la web
     quedan sin verificar hasta que recepción confirme su identidad; sin eso
     no pueden abrir una cuenta (evita que alguien registre una cédula ajena
     con su propio email).
   - Comprobantes y QR se guardan en la base (el disco de Render no es
     permanente). */
exports.up = (pgm) => {
  pgm.addColumn('pacientes', { web_verificado: { type: 'boolean', notNull: true, default: true } });
  pgm.sql("UPDATE pacientes SET web_verificado = false WHERE fuente_referencia = 'pagina_web'");

  pgm.createTable('web_cuentas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, unique: true, references: 'pacientes', onDelete: 'CASCADE' },
    email: { type: 'varchar(150)', notNull: true },
    clave_hash: { type: 'varchar(100)', notNull: true },
    version_token: { type: 'integer', notNull: true, default: 0 },
    activa: { type: 'boolean', notNull: true, default: true },
    intentos_fallidos: { type: 'integer', notNull: true, default: 0 },
    bloqueada_hasta: { type: 'timestamptz' },
    ultimo_ingreso: { type: 'timestamptz' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('web_codigos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    codigo_hash: { type: 'varchar(64)', notNull: true },
    expira_en: { type: 'timestamptz', notNull: true },
    intentos: { type: 'integer', notNull: true, default: 0 },
    usado: { type: 'boolean', notNull: true, default: false },
    ip: { type: 'varchar(60)' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('web_codigos', ['paciente_id', 'creado_en']);

  pgm.createTable('web_pagos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    monto: { type: 'numeric(14,2)', notNull: true },
    metodo: { type: 'varchar(30)', notNull: true },
    referencia: { type: 'varchar(100)' },
    nota: { type: 'varchar(500)' },
    cuota_id: { type: 'integer', references: 'cuotas', onDelete: 'SET NULL' },
    presupuesto_id: { type: 'integer', references: 'presupuestos', onDelete: 'SET NULL' },
    comprobante: { type: 'bytea', notNull: true },
    comprobante_mime: { type: 'varchar(40)', notNull: true },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente', check: "estado IN ('pendiente','aprobado','rechazado')" },
    motivo_rechazo: { type: 'varchar(500)' },
    pago_id: { type: 'integer', references: 'pagos', onDelete: 'SET NULL' },
    factura_id: { type: 'integer', references: 'facturas', onDelete: 'SET NULL' },
    revisado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    revisado_en: { type: 'timestamptz' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('web_pagos', ['clinica_id', 'estado', 'creado_en']);
  pgm.createIndex('web_pagos', ['paciente_id']);

  pgm.addColumns('web_config', {
    cuentas_activas: { type: 'boolean', notNull: true, default: true },
    pagos_activos: { type: 'boolean', notNull: true, default: false },
    banco: { type: 'varchar(100)' },
    titular: { type: 'varchar(150)' },
    numero_cuenta: { type: 'varchar(60)' },
    documento_titular: { type: 'varchar(40)' },
    alias_pago: { type: 'varchar(100)' },
    instrucciones_pago: { type: 'text' },
    qr: { type: 'bytea' },
    qr_mime: { type: 'varchar(40)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('web_config', ['cuentas_activas', 'pagos_activos', 'banco', 'titular', 'numero_cuenta', 'documento_titular', 'alias_pago', 'instrucciones_pago', 'qr', 'qr_mime']);
  pgm.dropTable('web_pagos');
  pgm.dropTable('web_codigos');
  pgm.dropTable('web_cuentas');
  pgm.dropColumn('pacientes', 'web_verificado');
};
