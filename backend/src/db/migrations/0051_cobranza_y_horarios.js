/* Avisos de cobro por WhatsApp y horario de cada odontólogo (solo agrega).
   - cobranza_envios: cada aviso (cuota por vencer o vencida, presupuesto sin
     respuesta). La restricción única (tipo, referencia, etapa) evita mandar
     dos veces el mismo aviso aunque corran dos procesos a la vez.
   - cobranza_enlaces: enlace privado que lleva el aviso (solo se guarda el hash).
   - clinicas: configuración de los avisos automáticos.
   - odontologos.horarios: días y horas en que atiende cada profesional (si es
     nulo, se usa el horario de la clínica). Lo usa la reserva online. */
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS cobranza_envios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL,
    referencia_id integer NOT NULL,
    etapa smallint NOT NULL,
    canal varchar(20) NOT NULL DEFAULT 'whatsapp_api',
    telefono varchar(20),
    estado varchar(20) NOT NULL DEFAULT 'enviando',
    proveedor_id varchar(120),
    error text,
    respuesta text,
    remitente varchar(120),
    automatico boolean NOT NULL DEFAULT false,
    usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobranza_envios_tipo_check CHECK (tipo IN ('cuota','presupuesto')),
    CONSTRAINT cobranza_envios_estado_check CHECK (estado IN ('enviando','enviado','entregado','leido','fallo','respondido')),
    CONSTRAINT cobranza_envios_unico UNIQUE (tipo, referencia_id, etapa)
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS cobranza_envios_proveedor_idx ON cobranza_envios (proveedor_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS cobranza_envios_tel_idx ON cobranza_envios (telefono, creado_en DESC)');
  pgm.sql('CREATE INDEX IF NOT EXISTS cobranza_envios_ref_idx ON cobranza_envios (clinica_id, tipo, referencia_id)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS cobranza_enlaces (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    expira_en timestamptz NOT NULL,
    abierto_en timestamptz
  )`);
  pgm.addColumns('clinicas', {
    cobranza_auto: { type: 'boolean', notNull: true, default: false },
    cobranza_hora: { type: 'smallint', notNull: true, default: 10 },
    cobranza_dias_antes: { type: 'smallint', notNull: true, default: 2 },
    cobranza_repetir_dias: { type: 'smallint', notNull: true, default: 7 },
    cobranza_max_avisos: { type: 'smallint', notNull: true, default: 3 },
    presupuesto_seguimiento: { type: 'boolean', notNull: true, default: true },
    presupuesto_dias: { type: 'smallint', notNull: true, default: 3 },
  });
  pgm.addConstraint('clinicas', 'clinicas_cobranza_rango', `CHECK (cobranza_hora BETWEEN 8 AND 20 AND cobranza_dias_antes BETWEEN 0 AND 7
    AND cobranza_repetir_dias BETWEEN 3 AND 30 AND cobranza_max_avisos BETWEEN 1 AND 5 AND presupuesto_dias BETWEEN 1 AND 30)`);
  pgm.addColumns('odontologos', { horarios: { type: 'jsonb' } });
};
exports.down = (pgm) => {
  pgm.dropColumns('odontologos', ['horarios']);
  pgm.dropConstraint('clinicas', 'clinicas_cobranza_rango');
  pgm.dropColumns('clinicas', ['cobranza_auto', 'cobranza_hora', 'cobranza_dias_antes', 'cobranza_repetir_dias', 'cobranza_max_avisos', 'presupuesto_seguimiento', 'presupuesto_dias']);
  pgm.sql('DROP TABLE IF EXISTS cobranza_enlaces');
  pgm.sql('DROP TABLE IF EXISTS cobranza_envios');
};
