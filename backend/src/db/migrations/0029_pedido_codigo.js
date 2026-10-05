/* "Pedir mi código" desde la página: el pedido llega a DOVA (Lo que llegó)
   como solicitud de tipo "codigo", con aviso en tiempo real a recepción. */
exports.up = (pgm) => {
  pgm.sql('ALTER TABLE web_solicitudes DROP CONSTRAINT IF EXISTS web_solicitudes_tipo_check');
  pgm.sql("ALTER TABLE web_solicitudes ADD CONSTRAINT web_solicitudes_tipo_check CHECK (tipo IN ('turno','registro','consulta','codigo'))");
};
exports.down = (pgm) => {
  pgm.sql("DELETE FROM web_solicitudes WHERE tipo = 'codigo'");
  pgm.sql('ALTER TABLE web_solicitudes DROP CONSTRAINT IF EXISTS web_solicitudes_tipo_check');
  pgm.sql("ALTER TABLE web_solicitudes ADD CONSTRAINT web_solicitudes_tipo_check CHECK (tipo IN ('turno','registro','consulta'))");
};
