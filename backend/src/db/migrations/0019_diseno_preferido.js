/* Preferencia de diseño visual de DOVA (selector moderno/minimalista/técnico).
   Es un dato PERSONAL de cada usuario (no de la clínica): cada persona que
   usa DOVA puede preferir un estilo distinto en la misma clínica.
   NULL = todavía no eligió (dispara el selector de diseño en el primer login). */
exports.up = (pgm) => {
  pgm.addColumn('usuarios', {
    diseno_preferido: {
      type: 'varchar(20)',
      notNull: false,
      default: null,
    },
  });

  // Blindaje a nivel de base de datos: aunque el backend ya valida el valor
  // recibido, este CHECK evita que un dato inválido llegue a existir aunque
  // se inserte por otra vía (script, migración futura con bug, etc.).
  pgm.addConstraint('usuarios', 'usuarios_diseno_preferido_check', {
    check: "diseno_preferido IS NULL OR diseno_preferido IN ('moderno', 'minimalista', 'tecnico')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('usuarios', 'usuarios_diseno_preferido_check');
  pgm.dropColumn('usuarios', 'diseno_preferido');
};
