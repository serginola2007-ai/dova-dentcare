/* Fase 5 — bandeja de seguimiento.
   Cada caso detectado (tratamiento incompleto o atrasado, control pendiente,
   paciente que no volvió, presupuesto sin aceptar, saldo pendiente, cita
   perdida) o creado a mano se gestiona con: motivo, responsable, próximo
   contacto, resultado y estado. Las gestiones quedan en "comunicaciones"
   (referencia_tipo = 'seguimiento'). */
exports.up = (pgm) => {
  pgm.createTable('seguimiento_casos', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(40)', notNull: true },
    referencia_tipo: { type: 'varchar(40)' },
    referencia_id: { type: 'integer' },
    motivo: { type: 'text' },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' },
    responsable_id: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    proximo_contacto: { type: 'date' },
    ultimo_resultado: { type: 'varchar(40)' },
    ultimo_contacto_en: { type: 'timestamptz' },
    intentos: { type: 'integer', notNull: true, default: 0 },
    cerrado_en: { type: 'timestamptz' },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('seguimiento_casos', 'seguimiento_casos_estado_check', "CHECK (estado IN ('pendiente','en_curso','resuelto','descartado'))");
  pgm.createIndex('seguimiento_casos', ['clinica_id', 'estado', 'proximo_contacto']);
  pgm.createIndex('seguimiento_casos', ['clinica_id', 'tipo', 'referencia_tipo', 'referencia_id']);
  // Un solo caso abierto por detección.
  pgm.sql(`CREATE UNIQUE INDEX seguimiento_casos_abierto_unico ON seguimiento_casos (clinica_id, tipo, referencia_tipo, referencia_id)
           WHERE estado IN ('pendiente','en_curso') AND referencia_id IS NOT NULL`);
  pgm.sql('CREATE TRIGGER dova_tiempo_real AFTER INSERT OR UPDATE OR DELETE ON seguimiento_casos FOR EACH ROW EXECUTE FUNCTION dova_avisar_cambio();');
};
exports.down = (pgm) => { pgm.dropTable('seguimiento_casos'); };
