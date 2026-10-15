/* Un solo diseño (el mecánico) con modo claro u oscuro, que cada usuario elige en Configuración.
   - usuarios.tema_preferido: 'claro' (por defecto) u 'oscuro'.
   - Todos pasan al diseño mecánico. */
exports.up = (pgm) => {
  pgm.addColumns('usuarios', { tema_preferido: { type: 'varchar(10)', notNull: true, default: 'claro' } });
  pgm.addConstraint('usuarios', 'usuarios_tema_preferido_check', { check: "tema_preferido IN ('claro','oscuro')" });
  pgm.sql("UPDATE usuarios SET diseno_preferido='mecanico' WHERE diseno_preferido IS DISTINCT FROM 'mecanico'");
};
exports.down = (pgm) => {
  pgm.dropConstraint('usuarios', 'usuarios_tema_preferido_check');
  pgm.dropColumns('usuarios', ['tema_preferido']);
};
