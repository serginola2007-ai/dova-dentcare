/* Almacén compartido para los límites de pedidos (RATE_LIMIT_STORE=postgres).
   Tabla UNLOGGED: es un contador descartable; no hace falta que sobreviva a
   una caída de la base ni que se replique. No toca datos existentes. */
exports.up = (pgm) => {
  pgm.sql(`CREATE UNLOGGED TABLE IF NOT EXISTS limites_pedidos (
    clave varchar(200) PRIMARY KEY,
    inicio timestamptz NOT NULL DEFAULT now(),
    cuenta integer NOT NULL DEFAULT 0
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS limites_pedidos_inicio_idx ON limites_pedidos (inicio)');
};
exports.down = (pgm) => { pgm.sql('DROP TABLE IF EXISTS limites_pedidos'); };
