/* Sesiones con cookie HttpOnly (auditoría de seguridad 2):
   - sesion_id: identifica la sesión (todas las rotaciones de un mismo login).
   - sesion_inicio: momento del login; ninguna sesión supera la duración
     absoluta (SESSION_ABSOLUTE_MAX_DAYS) aunque se renueve todos los días.
   - Lo mismo para las cuentas del portal del paciente (versión de token ya existía).
   - SSE: los avisos de tablas sin clinica_id (cuotas, caja_movimientos) ahora llevan la clínica,
     así nunca llegan a pantallas de otra clínica. */
exports.up = (pgm) => {
  pgm.addColumns('refresh_tokens', {
    sesion_id: { type: 'varchar(40)' },
    sesion_inicio: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('refresh_tokens', ['sesion_id']);
  pgm.addColumns('web_cuentas', { sesion_inicio: { type: 'timestamptz' } });
  pgm.sql(`
    CREATE OR REPLACE FUNCTION dova_avisar_cambio() RETURNS trigger AS $$
    DECLARE j jsonb; cli int;
    BEGIN
      IF TG_OP = 'DELETE' THEN j := to_jsonb(OLD); ELSE j := to_jsonb(NEW); END IF;
      cli := (j->>'clinica_id')::int;
      IF cli IS NULL AND TG_TABLE_NAME = 'cuotas' THEN
        SELECT pp.clinica_id INTO cli FROM planes_pago pp WHERE pp.id = (j->>'plan_pago_id')::int;
      ELSIF cli IS NULL AND TG_TABLE_NAME = 'caja_movimientos' THEN
        SELECT ca.clinica_id INTO cli FROM caja_aperturas ca WHERE ca.id = (j->>'caja_apertura_id')::int;
      END IF;
      IF cli IS NULL THEN RETURN NULL; END IF;  -- sin clínica conocida no se avisa a nadie
      PERFORM pg_notify('dova_cambios', json_build_object(
        't', TG_TABLE_NAME,
        'c', cli,
        'u', CASE WHEN TG_TABLE_NAME = 'notificaciones' THEN (j->>'usuario_id')::int END
      )::text);
      RETURN NULL;
    END $$ LANGUAGE plpgsql;
  `);
};
exports.down = (pgm) => {
  pgm.dropColumns('refresh_tokens', ['sesion_id', 'sesion_inicio']);
  pgm.dropColumns('web_cuentas', ['sesion_inicio']);
};
