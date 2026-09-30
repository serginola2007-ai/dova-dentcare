/* Migración: tabla base de clínicas (multi-clínica DOVA).
   DOVA es el software; cada fila de esta tabla es una clínica configurada
   dentro de DOVA (branding, contacto, horarios). DentCareRC será la
   primera fila insertada por el seed, no un valor hardcodeado en el código. */
exports.up = (pgm) => {
  pgm.createTable('clinicas', {
    id: 'id',
    nombre: { type: 'varchar(150)', notNull: true },
    slug: { type: 'varchar(80)', notNull: true, unique: true },
    logo_url: { type: 'text' },
    favicon_url: { type: 'text' },
    color_primario: { type: 'varchar(20)', default: '#C1673F' },
    color_secundario: { type: 'varchar(20)', default: '#A5522F' },
    direccion: { type: 'text' },
    telefono: { type: 'varchar(40)' },
    whatsapp: { type: 'varchar(40)' },
    email: { type: 'varchar(150)' },
    sitio_web: { type: 'text' },
    instagram: { type: 'text' },
    facebook: { type: 'text' },
    horario_atencion: { type: 'text' },
    ruc: { type: 'varchar(40)' },
    moneda: { type: 'varchar(10)', default: 'Gs.' },
    activa: { type: 'boolean', notNull: true, default: true },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('clinicas');
};
