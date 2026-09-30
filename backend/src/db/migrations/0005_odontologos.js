exports.up = (pgm) => {
  pgm.createTable('odontologos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(150)', notNull: true },
    matricula: { type: 'varchar(60)' },
    especialidad: { type: 'varchar(120)' },
    telefono: { type: 'varchar(40)' },
    email: { type: 'varchar(150)' },
    color_agenda: { type: 'varchar(20)' },
    activo: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('usuarios', 'usuarios_odontologo_fk',
    'FOREIGN KEY (odontologo_id) REFERENCES odontologos(id) ON DELETE SET NULL');
};

exports.down = (pgm) => {
  pgm.dropConstraint('usuarios', 'usuarios_odontologo_fk');
  pgm.dropTable('odontologos');
};
