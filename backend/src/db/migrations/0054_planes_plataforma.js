/* Planes por clínica y panel del dueño de la plataforma (solo agrega):
   - clinicas.plan: esencial | base | completo | premium (las clínicas que ya existen
     quedan en "premium", o sea que no pierden ninguna función).
   - clinicas.modulos_extra / modulos_quitar: ajustes finos por clínica sobre su plan.
   - clinicas.suspendida_motivo: por qué se suspendió el servicio (clinicas.activa = false).
   - usuarios.proveedor: la persona que administra la plataforma (alta de clínicas, planes y
     mensualidades). No da acceso a datos de pacientes. Queda marcado el administrador
     protegido de la primera clínica.
   - suscripcion_pagos: mensualidades cobradas a cada clínica. */
exports.up = (pgm) => {
  pgm.addColumns('clinicas', {
    plan: { type: 'varchar(20)', notNull: true, default: 'premium' },
    modulos_extra: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    modulos_quitar: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    suspendida_motivo: { type: 'varchar(200)' },
    plan_actualizado_en: { type: 'timestamptz' },
  });
  pgm.addConstraint('clinicas', 'clinicas_plan_check', "CHECK (plan IN ('esencial','base','completo','premium'))");
  pgm.addColumns('usuarios', { proveedor: { type: 'boolean', notNull: true, default: false } });
  pgm.sql(`UPDATE usuarios SET proveedor = true
            WHERE es_admin_protegido AND clinica_id = (SELECT min(id) FROM clinicas)`);
  pgm.sql(`CREATE TABLE IF NOT EXISTS suscripcion_pagos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    periodo date NOT NULL,
    monto numeric(14,0) NOT NULL CHECK (monto >= 0),
    fecha_pago date NOT NULL DEFAULT current_date,
    nota varchar(200),
    creado_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT suscripcion_pagos_periodo_primero CHECK (periodo = date_trunc('month', periodo)::date),
    CONSTRAINT suscripcion_pagos_unico UNIQUE (clinica_id, periodo)
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS suscripcion_pagos_clinica_idx ON suscripcion_pagos (clinica_id, periodo DESC)');
  pgm.addColumns('clinicas', { mensualidad: { type: 'numeric(14,0)', notNull: true, default: 0 } });
};
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS suscripcion_pagos');
  pgm.dropColumns('usuarios', ['proveedor']);
  pgm.dropConstraint('clinicas', 'clinicas_plan_check');
  pgm.dropColumns('clinicas', ['plan', 'modulos_extra', 'modulos_quitar', 'suspendida_motivo', 'plan_actualizado_en', 'mensualidad']);
};
