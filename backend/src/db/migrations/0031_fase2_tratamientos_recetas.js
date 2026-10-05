/* Fase 2 — tratamientos por etapas y recetas completas.
   - Etapas con estado (pendiente / en progreso / completado / cancelado),
     fecha de inicio y piezas; "completada" se mantiene sincronizado para lo
     que ya lo usaba (progreso, reportes).
   - Fotos y estudios pueden vincularse a una etapa.
   - Recetas: vía e indicación por medicamento, vínculo a la consulta,
     anulación con motivo (nunca se borran). */
exports.up = (pgm) => {
  pgm.addColumns('etapas_tratamiento', {
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' },
    fecha_inicio: { type: 'date' },
    piezas: { type: 'varchar(10)[]' },
  });
  pgm.sql("UPDATE etapas_tratamiento SET estado = 'completado' WHERE completada");
  pgm.addConstraint('etapas_tratamiento', 'etapas_estado_check', "CHECK (estado IN ('pendiente','en_progreso','completado','cancelado'))");
  pgm.addColumns('fotos_clinicas', { etapa_id: { type: 'integer', references: 'etapas_tratamiento', onDelete: 'SET NULL' } });
  pgm.addColumns('estudios', { etapa_id: { type: 'integer', references: 'etapas_tratamiento', onDelete: 'SET NULL' } });
  pgm.addColumns('receta_items', {
    via: { type: 'varchar(60)' },
    indicaciones: { type: 'text' },
  });
  pgm.addColumns('recetas', {
    historia_clinica_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    estado: { type: 'varchar(20)', notNull: true, default: 'emitida' },
    anulada_motivo: { type: 'text' },
    anulada_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    anulada_en: { type: 'timestamptz' },
  });
  pgm.addConstraint('recetas', 'recetas_estado_check', "CHECK (estado IN ('emitida','anulada'))");
};

exports.down = (pgm) => {
  pgm.dropConstraint('recetas', 'recetas_estado_check');
  pgm.dropColumns('recetas', ['historia_clinica_id', 'creado_por', 'estado', 'anulada_motivo', 'anulada_por', 'anulada_en']);
  pgm.dropColumns('receta_items', ['via', 'indicaciones']);
  pgm.dropColumns('estudios', ['etapa_id']);
  pgm.dropColumns('fotos_clinicas', ['etapa_id']);
  pgm.dropConstraint('etapas_tratamiento', 'etapas_estado_check');
  pgm.dropColumns('etapas_tratamiento', ['estado', 'fecha_inicio', 'piezas']);
};
