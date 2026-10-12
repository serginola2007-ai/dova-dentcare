/* Diseño "mecánico" (estilo de sistema de escritorio clásico), solo para el
   rol admin: se agrega a los valores permitidos de usuarios.diseno_preferido.
   Que solo un admin pueda elegirlo lo controla el servidor. */
exports.up = (pgm) => {
  pgm.dropConstraint('usuarios', 'usuarios_diseno_preferido_check');
  pgm.addConstraint('usuarios', 'usuarios_diseno_preferido_check', {
    check: "diseno_preferido IS NULL OR diseno_preferido IN ('moderno', 'minimalista', 'tecnico', 'mecanico')",
  });
};
exports.down = (pgm) => {
  pgm.sql("UPDATE usuarios SET diseno_preferido='tecnico' WHERE diseno_preferido='mecanico'");
  pgm.dropConstraint('usuarios', 'usuarios_diseno_preferido_check');
  pgm.addConstraint('usuarios', 'usuarios_diseno_preferido_check', {
    check: "diseno_preferido IS NULL OR diseno_preferido IN ('moderno', 'minimalista', 'tecnico')",
  });
};
