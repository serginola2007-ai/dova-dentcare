/* Fase 5 — portal del paciente: la clínica decide qué estudios comparte.
   Por defecto ninguno es visible para el paciente. */
exports.up = (pgm) => {
  pgm.addColumns('estudios', {
    visible_paciente: { type: 'boolean', notNull: true, default: false },
    compartido_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    compartido_en: { type: 'timestamptz' },
  });
};
exports.down = (pgm) => { pgm.dropColumns('estudios', ['visible_paciente', 'compartido_por', 'compartido_en']); };
