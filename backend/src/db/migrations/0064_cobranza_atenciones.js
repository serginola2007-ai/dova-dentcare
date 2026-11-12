/* Avisos de cobro también para las atenciones cargadas al atender (0063).
   referencia_id = la atención más reciente del paciente: si se le carga otra, el ciclo de avisos empieza de nuevo. */
exports.up = (pgm) => {
  pgm.dropConstraint('cobranza_envios', 'cobranza_envios_tipo_check');
  pgm.addConstraint('cobranza_envios', 'cobranza_envios_tipo_check', { check: "tipo IN ('cuota','presupuesto','atencion')" });
};
exports.down = (pgm) => {
  pgm.sql("DELETE FROM cobranza_envios WHERE tipo='atencion'");
  pgm.dropConstraint('cobranza_envios', 'cobranza_envios_tipo_check');
  pgm.addConstraint('cobranza_envios', 'cobranza_envios_tipo_check', { check: "tipo IN ('cuota','presupuesto')" });
};
