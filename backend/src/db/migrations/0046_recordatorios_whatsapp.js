/* Recordatorios de turnos por WhatsApp (solo agrega).
   - turno_enlaces: enlace privado para que el paciente confirme o cancele su
     turno desde el mensaje (solo se guarda el hash del token).
   - recordatorios_envios: un envío por turno, con su estado (enviado,
     entregado, leído, falló, respondido). La restricción única evita mandar
     dos veces el mismo recordatorio aunque corran dos procesos a la vez.
   - clinicas: envío automático (sí/no), hora del envío y días de anticipación. */
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS turno_enlaces (
    id serial PRIMARY KEY,
    turno_id integer NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    expira_en timestamptz NOT NULL
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS turno_enlaces_turno_idx ON turno_enlaces (turno_id)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS recordatorios_envios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    turno_id integer NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL DEFAULT 'turno',
    canal varchar(20) NOT NULL DEFAULT 'whatsapp_api',
    telefono varchar(20),
    estado varchar(20) NOT NULL DEFAULT 'enviando',
    proveedor_id varchar(120),
    error text,
    respuesta text,
    automatico boolean NOT NULL DEFAULT false,
    usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recordatorios_envios_estado_check CHECK (estado IN ('enviando','enviado','entregado','leido','fallo','respondido')),
    CONSTRAINT recordatorios_envios_unico UNIQUE (turno_id, tipo)
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS recordatorios_envios_proveedor_idx ON recordatorios_envios (proveedor_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS recordatorios_envios_tel_idx ON recordatorios_envios (telefono, creado_en DESC)');
  pgm.addColumns('clinicas', {
    recordatorio_auto: { type: 'boolean', notNull: true, default: false },
    recordatorio_hora: { type: 'smallint', notNull: true, default: 10 },
    recordatorio_dias: { type: 'smallint', notNull: true, default: 1 },
  });
  pgm.addConstraint('clinicas', 'clinicas_recordatorio_rango', 'CHECK (recordatorio_hora BETWEEN 6 AND 21 AND recordatorio_dias BETWEEN 1 AND 3)');
};
exports.down = (pgm) => {
  pgm.dropConstraint('clinicas', 'clinicas_recordatorio_rango');
  pgm.dropColumns('clinicas', ['recordatorio_auto', 'recordatorio_hora', 'recordatorio_dias']);
  pgm.sql('DROP TABLE IF EXISTS recordatorios_envios');
  pgm.sql('DROP TABLE IF EXISTS turno_enlaces');
};
