/* Tiempo real: cada vez que cambia algo importante, la base avisa por el
   canal "dova_cambios" (LISTEN/NOTIFY de PostgreSQL) y el servidor se lo
   reenvía al instante a las pantallas abiertas de esa clínica.
   El aviso solo dice QUÉ tabla cambió (y de qué clínica/usuario); nunca
   lleva datos de pacientes: cada pantalla vuelve a pedir lo suyo con sus
   permisos. Funciona con cualquier forma de escribir (DOVA, web, scripts). */
const TABLAS = ['turnos', 'pacientes', 'odontologos', 'lista_espera', 'web_solicitudes', 'web_pagos', 'web_cuentas',
  'notificaciones', 'pagos', 'caja_aperturas', 'caja_movimientos', 'facturas', 'presupuestos', 'planes_pago', 'cuotas', 'tickets'];

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION dova_avisar_cambio() RETURNS trigger AS $$
    DECLARE j jsonb;
    BEGIN
      IF TG_OP = 'DELETE' THEN j := to_jsonb(OLD); ELSE j := to_jsonb(NEW); END IF;
      PERFORM pg_notify('dova_cambios', json_build_object(
        't', TG_TABLE_NAME,
        'c', (j->>'clinica_id')::int,
        'u', CASE WHEN TG_TABLE_NAME = 'notificaciones' THEN (j->>'usuario_id')::int END
      )::text);
      RETURN NULL;
    END $$ LANGUAGE plpgsql;
  `);
  for (const t of TABLAS) {
    pgm.sql(`CREATE TRIGGER dova_tiempo_real AFTER INSERT OR UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION dova_avisar_cambio();`);
  }
};

exports.down = (pgm) => {
  for (const t of TABLAS) pgm.sql(`DROP TRIGGER IF EXISTS dova_tiempo_real ON ${t};`);
  pgm.sql('DROP FUNCTION IF EXISTS dova_avisar_cambio();');
};
