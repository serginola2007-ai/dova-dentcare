/* Adjuntos de derivaciones y de pedidos de ayuda guardados en la base.
   Antes se guardaban en el disco del servidor, que en Render se borra en
   cada actualización (y las derivaciones no tenían forma de descargarse).
   Los registros viejos se siguen leyendo del disco si el archivo existe. */
exports.up = (pgm) => {
  pgm.addColumns('derivaciones', {
    archivo: { type: 'bytea' },
    archivo_mime: { type: 'varchar(100)' },
    archivo_tamano: { type: 'integer' },
  });
  pgm.addColumns('ticket_adjuntos', { archivo: { type: 'bytea' } });
  pgm.alterColumn('ticket_adjuntos', 'storage_path', { notNull: false });
};
exports.down = (pgm) => {
  pgm.dropColumns('derivaciones', ['archivo', 'archivo_mime', 'archivo_tamano']);
  pgm.dropColumns('ticket_adjuntos', ['archivo']);
};
