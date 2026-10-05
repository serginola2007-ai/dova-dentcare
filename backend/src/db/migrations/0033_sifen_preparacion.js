/* Preparación para facturación electrónica (SIFEN / e-Kuatia de la DNIT).
   Hoy DOVA emite comprobantes con timbrado (preimpreso/autoimpresor). Para
   pasar a SIFEN se necesita, por cada documento: el CDC (código de control de
   44 dígitos), el XML firmado, el estado del envío y la respuesta de la SET,
   y en la configuración el modo (timbrado / electrónico), el ambiente (test /
   producción), el ID y el código de seguridad (CSC) y la actividad económica.
   Estas columnas quedan listas (vacías) para conectar el servicio de firma y
   envío sin tocar el resto: NO se envía nada a la SET todavía. */
exports.up = (pgm) => {
  pgm.addColumns('facturas', {
    cdc: { type: 'varchar(44)' },
    sifen_estado: { type: 'varchar(20)', notNull: true, default: 'no_aplica' },
    sifen_xml: { type: 'text' },
    sifen_respuesta: { type: 'jsonb' },
    sifen_enviado_en: { type: 'timestamptz' },
  });
  pgm.addConstraint('facturas', 'facturas_sifen_estado_check', "CHECK (sifen_estado IN ('no_aplica','pendiente','enviado','aprobado','rechazado','cancelado'))");
  pgm.createIndex('facturas', ['cdc'], { unique: true, where: 'cdc IS NOT NULL' });
  pgm.addColumns('facturacion_config', {
    modo_emision: { type: 'varchar(20)', notNull: true, default: 'timbrado' },
    sifen_ambiente: { type: 'varchar(10)', notNull: true, default: 'test' },
    sifen_id_csc: { type: 'varchar(10)' },
    actividad_economica: { type: 'varchar(200)' },
  });
  pgm.addConstraint('facturacion_config', 'fac_config_modo_check', "CHECK (modo_emision IN ('timbrado','electronico'))");
};
exports.down = (pgm) => {
  pgm.dropConstraint('facturacion_config', 'fac_config_modo_check');
  pgm.dropColumns('facturacion_config', ['modo_emision', 'sifen_ambiente', 'sifen_id_csc', 'actividad_economica']);
  pgm.dropIndex('facturas', ['cdc']);
  pgm.dropConstraint('facturas', 'facturas_sifen_estado_check');
  pgm.dropColumns('facturas', ['cdc', 'sifen_estado', 'sifen_xml', 'sifen_respuesta', 'sifen_enviado_en']);
};
