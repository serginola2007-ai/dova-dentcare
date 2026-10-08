/* Eliminar usuarios desde Administración → Usuarios.
   Un usuario que ya registró algo (turnos, cobros, historias, auditoría) no se
   borra físicamente: se marca eliminado_en, no puede entrar, no aparece más en
   la lista y su nombre sigue en el historial de lo que hizo. No toca datos. */
exports.up = (pgm) => {
  pgm.addColumns('usuarios', { eliminado_en: { type: 'timestamptz' } });
};
exports.down = (pgm) => { pgm.dropColumns('usuarios', ['eliminado_en']); };
