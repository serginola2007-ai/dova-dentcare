/* Tamaño de letra de cada usuario ('normal' o 'grande'), se elige en Configuración → Apariencia. */
exports.up = (pgm) => {
  pgm.addColumns('usuarios', { letra_preferida: { type: 'varchar(10)', notNull: true, default: 'normal' } });
  pgm.addConstraint('usuarios', 'usuarios_letra_preferida_check', { check: "letra_preferida IN ('normal','grande')" });
};
exports.down = (pgm) => {
  pgm.dropConstraint('usuarios', 'usuarios_letra_preferida_check');
  pgm.dropColumns('usuarios', ['letra_preferida']);
};
