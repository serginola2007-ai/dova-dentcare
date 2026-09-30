/* RBAC: roles con permisos por defecto + permisos personalizados por usuario.
   permisos_usuario permite otorgar (allow=true) o revocar (allow=false) un
   permiso puntual sin tocar el rol base, tal como pide el prompt maestro
   de Helpdesk (rol base + overrides individuales -> permisos efectivos). */
exports.up = (pgm) => {
  pgm.createTable('roles', {
    id: 'id',
    clinica_id: { type: 'integer', references: 'clinicas', onDelete: 'CASCADE' },
    codigo: { type: 'varchar(40)', notNull: true }, // admin, odontologo, recepcion, asistente, helpdesk
    nombre: { type: 'varchar(80)', notNull: true },
    es_sistema: { type: 'boolean', notNull: true, default: false }, // no editable/eliminable
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('roles', 'roles_clinica_codigo_unique', 'UNIQUE(clinica_id, codigo)');

  pgm.createTable('permisos', {
    id: 'id',
    codigo: { type: 'varchar(80)', notNull: true, unique: true }, // ej: pacientes.view, helpdesk.resolve
    modulo: { type: 'varchar(60)', notNull: true },
    descripcion: { type: 'text' },
  });

  pgm.createTable('rol_permisos', {
    rol_id: { type: 'integer', notNull: true, references: 'roles', onDelete: 'CASCADE' },
    permiso_id: { type: 'integer', notNull: true, references: 'permisos', onDelete: 'CASCADE' },
  });
  pgm.addConstraint('rol_permisos', 'rol_permisos_pk', 'PRIMARY KEY(rol_id, permiso_id)');
};

exports.down = (pgm) => {
  pgm.dropTable('rol_permisos');
  pgm.dropTable('permisos');
  pgm.dropTable('roles');
};
