/* Cargo automático al atender: cuando un turno con tratamiento se marca "atendido"
   y ese trabajo no está en un plan ni en un presupuesto aceptado, se carga a la
   cuenta del paciente al precio que le corresponde (lista y cobertura).
   Se guarda como un movimiento de cuenta corriente de tipo "atencion" atado al turno:
   uno solo por turno (aunque se anule, no se vuelve a generar). */
exports.up = (pgm) => {
  pgm.addColumns('ajustes_cuenta', {
    turno_id: { type: 'integer', references: 'turnos', onDelete: 'SET NULL' },
    tratamiento_id: { type: 'integer', references: 'tratamientos', onDelete: 'SET NULL' },
    odontologo_id: { type: 'integer', references: 'odontologos', onDelete: 'SET NULL' },
  });
  pgm.createIndex('ajustes_cuenta', 'turno_id', { name: 'ajustes_cuenta_atencion_turno_unico', unique: true, where: "tipo = 'atencion'" });
  pgm.createIndex('ajustes_cuenta', ['clinica_id', 'tipo', 'fecha'], { name: 'ajustes_cuenta_clinica_tipo_fecha' });
  pgm.addColumns('clinicas', { cargo_al_atender: { type: 'boolean', notNull: true, default: true } });
};
exports.down = (pgm) => {
  pgm.dropColumns('clinicas', ['cargo_al_atender']);
  pgm.dropIndex('ajustes_cuenta', ['clinica_id', 'tipo', 'fecha'], { name: 'ajustes_cuenta_clinica_tipo_fecha' });
  pgm.dropIndex('ajustes_cuenta', 'turno_id', { name: 'ajustes_cuenta_atencion_turno_unico' });
  pgm.dropColumns('ajustes_cuenta', ['turno_id', 'tratamiento_id', 'odontologo_id']);
};
