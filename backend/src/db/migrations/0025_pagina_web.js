/* Página web pública conectada a DOVA.
   - web_config: qué muestra la página y cómo se reservan turnos online
     (horario de atención por día, intervalo, anticipación, qué tratamientos
     y profesionales se ofrecen).
   - web_solicitudes: todo lo que llega desde la web (turno, registro de
     paciente, consulta) para que recepción lo revise. Nada de lo que escribe
     un visitante pisa datos de una ficha existente.
   - turnos.origen / turnos.web_token_hash: el turno reservado online y el
     enlace privado con el que el paciente lo ve, confirma o cancela. */
exports.up = (pgm) => {
  pgm.createTable('web_config', {
    clinica_id: { type: 'integer', primaryKey: true, references: 'clinicas', onDelete: 'CASCADE' },
    reservas_activas: { type: 'boolean', notNull: true, default: true },
    titulo: { type: 'varchar(150)' },
    eslogan: { type: 'varchar(250)' },
    presentacion: { type: 'text' },
    direccion: { type: 'varchar(300)' },
    telefono: { type: 'varchar(60)' },
    whatsapp: { type: 'varchar(60)' },
    email: { type: 'varchar(150)' },
    instagram: { type: 'varchar(150)' },
    facebook: { type: 'varchar(150)' },
    mapa_url: { type: 'text' },
    // { "1": [["08:00","12:00"],["14:00","19:00"]], ... "0": [] }  (0 = domingo)
    horarios: { type: 'jsonb', notNull: true, default: pgm.func(`'{"1":[["08:00","12:00"],["14:00","19:00"]],"2":[["08:00","12:00"],["14:00","19:00"]],"3":[["08:00","12:00"],["14:00","19:00"]],"4":[["08:00","12:00"],["14:00","19:00"]],"5":[["08:00","12:00"],["14:00","19:00"]],"6":[["08:00","12:00"]],"0":[]}'::jsonb`) },
    intervalo_minutos: { type: 'integer', notNull: true, default: 30 },
    dias_adelante: { type: 'integer', notNull: true, default: 30 },
    anticipacion_horas: { type: 'integer', notNull: true, default: 2 },
    cancelacion_horas: { type: 'integer', notNull: true, default: 12 },
    mostrar_precios: { type: 'boolean', notNull: true, default: false },
    tratamientos_web: { type: 'integer[]' }, // null = todos los activos
    odontologos_web: { type: 'integer[]' }, // null = todos los activos
    max_turnos_por_persona: { type: 'integer', notNull: true, default: 2 },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
  });

  pgm.createTable('web_solicitudes', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(20)', notNull: true, check: "tipo IN ('turno','registro','consulta')" },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente', check: "estado IN ('pendiente','resuelta','descartada')" },
    nombre: { type: 'varchar(250)', notNull: true },
    ci: { type: 'varchar(30)' },
    telefono: { type: 'varchar(60)' },
    email: { type: 'varchar(150)' },
    mensaje: { type: 'text' },
    datos: { type: 'jsonb', notNull: true, default: '{}' },
    paciente_id: { type: 'integer', references: 'pacientes', onDelete: 'SET NULL' },
    paciente_nuevo: { type: 'boolean', notNull: true, default: false },
    turno_id: { type: 'integer', references: 'turnos', onDelete: 'SET NULL' },
    ip: { type: 'varchar(60)' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resuelta_en: { type: 'timestamptz' },
    resuelta_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    nota_interna: { type: 'text' },
  });
  pgm.createIndex('web_solicitudes', ['clinica_id', 'estado', 'creado_en']);

  pgm.addColumns('turnos', {
    origen: { type: 'varchar(10)', notNull: true, default: 'dova', check: "origen IN ('dova','web')" },
    web_token_hash: { type: 'varchar(64)' },
  });
  pgm.createIndex('turnos', 'web_token_hash', { unique: true, where: 'web_token_hash IS NOT NULL' });
};

exports.down = (pgm) => {
  pgm.dropIndex('turnos', 'web_token_hash');
  pgm.dropColumns('turnos', ['origen', 'web_token_hash']);
  pgm.dropTable('web_solicitudes');
  pgm.dropTable('web_config');
};
