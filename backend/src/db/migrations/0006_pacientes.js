exports.up = (pgm) => {
  pgm.createTable('pacientes', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(120)', notNull: true },
    apellido: { type: 'varchar(120)', notNull: true },
    ci: { type: 'varchar(30)' },
    fecha_nacimiento: { type: 'date' },
    sexo: { type: 'varchar(20)' },
    telefono: { type: 'varchar(40)' },
    whatsapp: { type: 'varchar(40)' },
    email: { type: 'varchar(150)' },
    direccion: { type: 'text' },
    ciudad: { type: 'varchar(100)' },
    ocupacion: { type: 'varchar(100)' },
    contacto_emergencia: { type: 'text' },
    alergias: { type: 'text' },
    medicamentos: { type: 'text' },
    antecedentes_medicos: { type: 'text' },
    antecedentes_odontologicos: { type: 'text' },
    observaciones: { type: 'text' },
    odontologo_principal_id: { type: 'integer', references: 'odontologos', onDelete: 'SET NULL' },
    activo: { type: 'boolean', notNull: true, default: true }, // eliminación lógica
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Bug real encontrado en la simulación anterior: la CI no era única por clínica.
  // Solo aplica cuando ci no es null/vacío (partial unique index).
  pgm.sql(`
    CREATE UNIQUE INDEX pacientes_clinica_ci_unique
    ON pacientes (clinica_id, ci)
    WHERE ci IS NOT NULL AND ci <> '';
  `);
  pgm.createIndex('pacientes', ['clinica_id', 'apellido', 'nombre']);
};

exports.down = (pgm) => {
  pgm.dropTable('pacientes');
};
