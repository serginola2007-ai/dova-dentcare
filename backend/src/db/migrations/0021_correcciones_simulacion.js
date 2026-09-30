/* Correcciones detectadas en la simulación de 1 año de uso.
   - usuarios.debe_cambiar_clave: obliga a cambiar la contraseña inicial
     (admin/admin) en el primer ingreso.
   - login_intentos: registro de intentos de ingreso para frenar ataques de
     fuerza bruta (bloqueo temporal tras varios intentos fallidos).
   - Un pago entra UNA sola vez a la caja (índice único parcial). */
exports.up = (pgm) => {
  pgm.addColumn('usuarios', {
    debe_cambiar_clave: { type: 'boolean', notNull: true, default: false },
  });

  pgm.createTable('login_intentos', {
    id: 'id',
    clave: { type: 'varchar(200)', notNull: true }, // usuario en minúsculas
    ip: { type: 'varchar(64)' },
    exitoso: { type: 'boolean', notNull: true, default: false },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('login_intentos', ['clave', 'creado_en']);
  pgm.createIndex('login_intentos', ['ip', 'creado_en']);

  // Si alguna instalación ya tuviera un pago duplicado en caja, se conserva
  // el primer movimiento y el resto queda sin vínculo al pago.
  pgm.sql(`UPDATE caja_movimientos m SET pago_id = NULL
            WHERE pago_id IS NOT NULL AND id <> (SELECT min(id) FROM caja_movimientos x WHERE x.pago_id = m.pago_id)`);
  pgm.createIndex('caja_movimientos', 'pago_id', { unique: true, where: 'pago_id IS NOT NULL', name: 'caja_movimientos_pago_unico' });
};

exports.down = (pgm) => {
  pgm.dropIndex('caja_movimientos', 'pago_id', { name: 'caja_movimientos_pago_unico' });
  pgm.dropTable('login_intentos');
  pgm.dropColumn('usuarios', 'debe_cambiar_clave');
};
