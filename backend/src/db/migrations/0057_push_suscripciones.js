/* Avisos push: cada dispositivo que activa las notificaciones guarda su suscripción.
   El endpoint es único: si otro usuario activa avisos en el mismo dispositivo, la suscripción pasa a él. */
exports.up = (pgm) => {
  pgm.createTable('push_suscripciones', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    usuario_id: { type: 'integer', notNull: true, references: 'usuarios', onDelete: 'CASCADE' },
    endpoint: { type: 'text', notNull: true, unique: true },
    p256dh: { type: 'text', notNull: true },
    auth: { type: 'text', notNull: true },
    dispositivo: { type: 'varchar(200)' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ultimo_envio: { type: 'timestamptz' },
  });
  pgm.createIndex('push_suscripciones', ['clinica_id', 'usuario_id']);
};
exports.down = (pgm) => { pgm.dropTable('push_suscripciones'); };
