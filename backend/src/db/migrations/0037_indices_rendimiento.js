/* Fase 6 — índices para las consultas por paciente que usan la bandeja de
   seguimiento, los reportes, el portal y la ficha. Solo agrega índices
   (no cambia datos). */
const INDICES = [
  ['pagos', 'paciente_id, estado'],
  ['turnos', 'paciente_id, fecha'],
  ['turnos', 'clinica_id, estado, fecha'],
  ['presupuestos', 'paciente_id, estado'],
  ['presupuestos', 'clinica_id, estado, fecha'],
  ['planes_tratamiento', 'clinica_id, estado'],
  ['planes_pago', 'paciente_id'],
  ['ajustes_cuenta', 'paciente_id'],
  ['recetas', 'clinica_id, paciente_id'],
  ['historia_clinica', 'clinica_id, fecha'],
  ['auditoria', 'clinica_id, accion'],
  ['comunicaciones', 'referencia_tipo, referencia_id'],
  ['etapas_tratamiento', 'plan_id'],
  ['receta_items', 'receta_id'],
  ['estudios', 'clinica_id, paciente_id, visible_paciente'],
];
const nombre = (t, c) => `idx_f6_${t}_${c.replace(/[^a-z_]/g, '_').replace(/_+/g, '_')}`.slice(0, 63);
exports.up = (pgm) => { for (const [t, c] of INDICES) pgm.sql(`CREATE INDEX IF NOT EXISTS ${nombre(t, c)} ON ${t} (${c})`); };
exports.down = (pgm) => { for (const [t, c] of INDICES) pgm.sql(`DROP INDEX IF EXISTS ${nombre(t, c)}`); };
