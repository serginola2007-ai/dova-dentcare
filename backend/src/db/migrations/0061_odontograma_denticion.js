/* Odontograma: qué dentición se muestra para cada paciente.
   NULL = automática por edad (menor de 6: temporal; de 6 a 12: mixta; más: permanente). */
exports.up = (pgm) => {
  pgm.addColumns('pacientes', { odontograma_denticion: { type: 'varchar(12)' } });
  pgm.addConstraint('pacientes', 'pacientes_odontograma_denticion_check', { check: "odontograma_denticion IS NULL OR odontograma_denticion IN ('permanente','temporal','mixta')" });
  // El historial se consulta por paciente y fecha (ver el odontograma de un día anterior).
  pgm.createIndex('odontograma_historial', ['paciente_id', 'fecha']);
};
exports.down = (pgm) => {
  pgm.dropIndex('odontograma_historial', ['paciente_id', 'fecha']);
  pgm.dropConstraint('pacientes', 'pacientes_odontograma_denticion_check');
  pgm.dropColumns('pacientes', ['odontograma_denticion']);
};
