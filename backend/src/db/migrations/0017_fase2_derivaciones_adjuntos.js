/* FASE 2 — Herramientas clínicas (prompt maestro DOVA).
   Migración puramente ADITIVA: agrega soporte de archivo adjunto a
   "derivaciones" (sección 3: "Derivar paciente... con archivos adjuntos"),
   que la migración 0016 había dejado sin ese campo. No toca ninguna
   columna ni tabla existente. */
exports.up = (pgm) => {
  pgm.addColumns('derivaciones', {
    archivo_nombre: { type: 'text' },
    archivo_path: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('derivaciones', ['archivo_nombre', 'archivo_path']);
};
