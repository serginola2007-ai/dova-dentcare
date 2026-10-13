/* Mensajes automáticos (solo agrega):
   - ofertas_turno: un horario que se liberó (cancelación) y se ofrece a la
     lista de espera. Lo toma el primero que acepta.
   - avisos_envios: cada mensaje (oferta de turno, control periódico,
     encuesta). "clave" única: nunca se manda dos veces lo mismo.
   - avisos_enlaces: enlace privado del mensaje (solo se guarda el hash).
   - clinicas: qué mensajes salen solos, a qué hora, y el enlace para dejar
     una reseña en Google. */
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS ofertas_turno (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    odontologo_id integer NOT NULL REFERENCES odontologos(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    hora time NOT NULL,
    duracion_minutos integer NOT NULL,
    sillon_id integer REFERENCES sillones(id) ON DELETE SET NULL,
    motivo varchar(200),
    turno_origen_id integer REFERENCES turnos(id) ON DELETE SET NULL,
    estado varchar(20) NOT NULL DEFAULT 'abierta',
    paciente_id integer REFERENCES pacientes(id) ON DELETE SET NULL,
    turno_nuevo_id integer REFERENCES turnos(id) ON DELETE SET NULL,
    lista_espera_id integer REFERENCES lista_espera(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    cerrada_en timestamptz,
    CONSTRAINT ofertas_turno_estado_check CHECK (estado IN ('abierta','tomada','vencida','cancelada'))
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS ofertas_turno_clinica_idx ON ofertas_turno (clinica_id, estado, fecha)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS avisos_envios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL,
    referencia_id integer NOT NULL,
    clave varchar(120) NOT NULL UNIQUE,
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
    CONSTRAINT avisos_envios_tipo_check CHECK (tipo IN ('oferta','control','encuesta')),
    CONSTRAINT avisos_envios_estado_check CHECK (estado IN ('enviando','enviado','entregado','leido','fallo','respondido'))
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS avisos_envios_proveedor_idx ON avisos_envios (proveedor_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS avisos_envios_tel_idx ON avisos_envios (telefono, creado_en DESC)');
  pgm.sql('CREATE INDEX IF NOT EXISTS avisos_envios_ref_idx ON avisos_envios (tipo, referencia_id)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS avisos_enlaces (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL,
    referencia_id integer NOT NULL,
    token_hash varchar(64) NOT NULL UNIQUE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    expira_en timestamptz NOT NULL,
    usado_en timestamptz
  )`);
  pgm.addColumns('clinicas', {
    lista_espera_auto: { type: 'boolean', notNull: true, default: false },
    controles_auto: { type: 'boolean', notNull: true, default: false },
    encuesta_auto: { type: 'boolean', notNull: true, default: false },
    mensajes_hora: { type: 'smallint', notNull: true, default: 10 },
    resena_url: { type: 'text' },
  });
  pgm.addConstraint('clinicas', 'clinicas_mensajes_hora_rango', 'CHECK (mensajes_hora BETWEEN 8 AND 20)');
};
exports.down = (pgm) => {
  pgm.dropConstraint('clinicas', 'clinicas_mensajes_hora_rango');
  pgm.dropColumns('clinicas', ['lista_espera_auto', 'controles_auto', 'encuesta_auto', 'mensajes_hora', 'resena_url']);
  pgm.sql('DROP TABLE IF EXISTS avisos_enlaces');
  pgm.sql('DROP TABLE IF EXISTS avisos_envios');
  pgm.sql('DROP TABLE IF EXISTS ofertas_turno');
};
