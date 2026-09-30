exports.up = (pgm) => {
  pgm.createTable('usuarios', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    rol_id: { type: 'integer', notNull: true, references: 'roles' },
    nombre: { type: 'varchar(120)', notNull: true },
    username: { type: 'varchar(60)', notNull: true },
    email: { type: 'varchar(150)' },
    password_hash: { type: 'text', notNull: true },
    odontologo_id: { type: 'integer' }, // FK se agrega cuando exista tabla odontologos
    activo: { type: 'boolean', notNull: true, default: true },
    es_admin_protegido: { type: 'boolean', notNull: true, default: false }, // impide quedar sin admins
    ultimo_login: { type: 'timestamptz' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('usuarios', 'usuarios_clinica_username_unique', 'UNIQUE(clinica_id, username)');

  // Permisos personalizados por usuario: allow=true otorga, allow=false revoca
  // un permiso que el rol base sí tendría.
  pgm.createTable('permisos_usuario', {
    usuario_id: { type: 'integer', notNull: true, references: 'usuarios', onDelete: 'CASCADE' },
    permiso_id: { type: 'integer', notNull: true, references: 'permisos', onDelete: 'CASCADE' },
    allow: { type: 'boolean', notNull: true },
  });
  pgm.addConstraint('permisos_usuario', 'permisos_usuario_pk', 'PRIMARY KEY(usuario_id, permiso_id)');

  pgm.createTable('refresh_tokens', {
    id: 'id',
    usuario_id: { type: 'integer', notNull: true, references: 'usuarios', onDelete: 'CASCADE' },
    token_hash: { type: 'text', notNull: true },
    expira_en: { type: 'timestamptz', notNull: true },
    revocado: { type: 'boolean', notNull: true, default: false },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('refresh_tokens', 'usuario_id');
};

exports.down = (pgm) => {
  pgm.dropTable('refresh_tokens');
  pgm.dropTable('permisos_usuario');
  pgm.dropTable('usuarios');
};
