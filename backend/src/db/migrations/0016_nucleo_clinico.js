/* FASE 1 — Núcleo clínico (prompt maestro DOVA).
   Esta migración es puramente ADITIVA: no borra ni modifica el
   comportamiento de ninguna tabla existente. Extiende historia_clinica
   (que ya cumplía el rol de "evolución clínica" pedido por el prompt,
   con motivo_consulta/anamnesis/diagnostico/anestesia/materiales/
   evolucion/indicaciones) con los campos que le faltaban, y agrega
   tablas nuevas para lo que no tenía ningún lugar todavía: etapas de
   tratamiento (checklist), plantillas clínicas configurables,
   pacientes marcados "para revisar", controles postoperatorios y
   derivaciones entre odontólogos. */
exports.up = (pgm) => {
  // ---- Extender historia_clinica (= "evolución clínica" del prompt) ----
  pgm.addColumns('historia_clinica', {
    turno_id: { type: 'integer', references: 'turnos', onDelete: 'SET NULL' }, // liga la evolución a la consulta/cita concreta
    plan_id: { type: 'integer', references: 'planes_tratamiento', onDelete: 'SET NULL' },
    piezas: { type: 'varchar(10)[]' }, // piezas involucradas, notación FDI, puede ser varias
    complicaciones: { type: 'text' },
    medicacion: { type: 'text' }, // distinto de "materiales" (insumos clínicos) — medicación indicada al paciente
    proxima_accion: { type: 'text' },
    firmada: { type: 'boolean', notNull: true, default: false },
    firmada_en: { type: 'timestamptz' },
    // Enmienda/corrección post-firma (sección 41: nunca modificación silenciosa de una evolución firmada)
    enmendada_de_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' },
    motivo_enmienda: { type: 'text' },
  });
  pgm.createIndex('historia_clinica', ['paciente_id', 'fecha']);
  pgm.createIndex('historia_clinica', 'turno_id');

  // ---- Etapas de tratamiento (checklist tipo "5/7 etapas completadas") ----
  pgm.createTable('etapas_tratamiento', {
    id: 'id',
    plan_id: { type: 'integer', notNull: true, references: 'planes_tratamiento', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(100)', notNull: true }, // ej: "Apertura", "Conductometría", "Obturación"
    orden: { type: 'integer', notNull: true, default: 0 },
    completada: { type: 'boolean', notNull: true, default: false },
    fecha: { type: 'date' },
    odontologo_id: { type: 'integer', references: 'odontologos' },
    observaciones: { type: 'text' },
    materiales: { type: 'text' },
    historia_clinica_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' }, // evolución donde se registró
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    actualizado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('etapas_tratamiento', 'plan_id');

  // ---- Plantillas clínicas configurables (sin IA, campos predefinidos) ----
  pgm.createTable('plantillas_clinicas', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    nombre: { type: 'varchar(100)', notNull: true }, // "Extracción simple", "Limpieza", etc.
    categoria: { type: 'varchar(60)' },
    // Estructura de campos predefinidos que el frontend renderiza dinámicamente.
    // Ejemplo: [{"campo":"diagnostico","label":"Diagnóstico","tipo":"textarea"}, ...]
    campos: { type: 'jsonb', notNull: true, default: '[]' },
    activa: { type: 'boolean', notNull: true, default: true },
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('plantillas_clinicas', 'clinica_id');

  // ---- Pacientes "para revisar" (sección 21) ----
  pgm.createTable('pacientes_revision', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    motivo: { type: 'varchar(40)', notNull: true }, // revisar_radiografia, revisar_diagnostico, tratamiento_pendiente, seguimiento, contactar_paciente, revisar_documentacion, otro
    detalle: { type: 'text' },
    asignado_a: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' }, // normalmente el odontólogo responsable
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    resuelto: { type: 'boolean', notNull: true, default: false },
    resuelto_en: { type: 'timestamptz' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('pacientes_revision', ['clinica_id', 'resuelto']);
  pgm.createIndex('pacientes_revision', 'asignado_a');

  // ---- Controles postoperatorios (sección 19) ----
  pgm.createTable('controles_postoperatorios', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    historia_clinica_id: { type: 'integer', references: 'historia_clinica', onDelete: 'SET NULL' }, // evolución del procedimiento original
    fecha_procedimiento: { type: 'date' },
    fecha_control_programada: { type: 'date', notNull: true },
    fecha_control_realizado: { type: 'date' },
    dolor: { type: 'varchar(20)' }, // ninguno, leve, moderado, severo
    inflamacion: { type: 'varchar(20)' },
    sangrado: { type: 'varchar(20)' },
    cicatrizacion: { type: 'varchar(30)' }, // normal, retrasada, con_complicaciones
    observaciones: { type: 'text' },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' }, // pendiente, realizado, cancelado
    odontologo_id: { type: 'integer', references: 'odontologos' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('controles_postoperatorios', ['clinica_id', 'estado']);
  pgm.createIndex('controles_postoperatorios', 'paciente_id');

  // ---- Derivaciones entre odontólogos (sección 20) ----
  pgm.createTable('derivaciones', {
    id: 'id',
    clinica_id: { type: 'integer', notNull: true, references: 'clinicas', onDelete: 'CASCADE' },
    paciente_id: { type: 'integer', notNull: true, references: 'pacientes', onDelete: 'CASCADE' },
    odontologo_origen_id: { type: 'integer', references: 'odontologos' },
    odontologo_destino_id: { type: 'integer', notNull: true, references: 'odontologos' },
    especialidad: { type: 'varchar(80)' },
    motivo: { type: 'text', notNull: true },
    observaciones: { type: 'text' },
    estado: { type: 'varchar(20)', notNull: true, default: 'pendiente' }, // pendiente, aceptada, atendida, rechazada
    creado_por: { type: 'integer', references: 'usuarios', onDelete: 'SET NULL' },
    creado_en: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('derivaciones', ['clinica_id', 'odontologo_destino_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('derivaciones');
  pgm.dropTable('controles_postoperatorios');
  pgm.dropTable('pacientes_revision');
  pgm.dropTable('plantillas_clinicas');
  pgm.dropTable('etapas_tratamiento');
  pgm.dropColumns('historia_clinica', [
    'turno_id', 'plan_id', 'piezas', 'complicaciones', 'medicacion',
    'proxima_accion', 'firmada', 'firmada_en', 'enmendada_de_id', 'motivo_enmienda',
  ]);
};
