/* Cuentas web sin email (el plan gratis de Render bloquea el SMTP):
   - las personas nuevas crean su cuenta directamente desde la web;
   - los pacientes con ficha entran con un código que genera recepción en
     DOVA (web_codigos.usuario_id = quién lo generó; vale 48 horas).
   Los códigos se buscan por cédula. */
exports.up = (pgm) => {
  pgm.addColumns('web_codigos', {
    ci: { type: 'varchar(30)' },
    usuario_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
  });
  pgm.sql('UPDATE web_codigos k SET ci = p.ci FROM pacientes p WHERE p.id = k.paciente_id AND k.ci IS NULL');
  pgm.createIndex('web_codigos', ['clinica_id', 'ci', 'creado_en']);
};

exports.down = (pgm) => {
  pgm.dropIndex('web_codigos', ['clinica_id', 'ci', 'creado_en']);
  pgm.dropColumns('web_codigos', ['ci', 'usuario_id']);
};
