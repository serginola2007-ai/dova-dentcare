/* Reparación de datos: hasta esta versión, cuando un recall con intervalo
   propio del paciente (ej. flúor cada 4 meses) se volvía a disparar, la
   próxima fecha se calculaba con el intervalo del tipo (ej. 6 meses).
   Se recalculan SOLO los recalls que quedaron exactamente con la fecha del
   intervalo del tipo; los que alguien ajustó a mano no se tocan. */
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE paciente_recalls r
       SET proxima_fecha = (r.ultima_fecha + make_interval(months => r.intervalo_meses))::date,
           actualizado_en = now()
      FROM recall_tipos t
     WHERE t.id = r.recall_tipo_id
       AND r.intervalo_meses IS NOT NULL
       AND r.ultima_fecha IS NOT NULL
       AND r.intervalo_meses <> t.intervalo_meses
       AND r.proxima_fecha = (r.ultima_fecha + make_interval(months => t.intervalo_meses))::date`);
};

exports.down = () => { /* reparación de datos: no se revierte */ };
