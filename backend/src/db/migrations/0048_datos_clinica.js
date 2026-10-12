/* Datos de la clínica según su ficha de Google (RC Odontología Integral):
   dirección, teléfono/WhatsApp y horario. Solo completa lo que está VACÍO
   (o el horario de ejemplo del primer arranque); nunca pisa lo que la
   clínica ya cargó. Se cambian en Configuración y en Página web. */
exports.up = (pgm) => {
  pgm.sql(`UPDATE clinicas SET
      direccion = COALESCE(NULLIF(trim(direccion), ''), 'Nro 49, Pampa Grande, Luque, Paraguay'),
      telefono = COALESCE(NULLIF(trim(telefono), ''), '0986 451 065'),
      whatsapp = COALESCE(NULLIF(trim(whatsapp), ''), '0986 451 065'),
      horario_atencion = CASE WHEN horario_atencion IS NULL OR trim(horario_atencion) = '' OR horario_atencion = 'Lunes a viernes 8:00 - 18:00'
                              THEN 'Lunes a sábado de 8:00 a 12:00 y de 14:00 a 19:00' ELSE horario_atencion END
    WHERE slug = 'dentcarerc'`);
  pgm.sql(`UPDATE web_config w SET
      direccion = COALESCE(NULLIF(trim(w.direccion), ''), c.direccion),
      telefono = COALESCE(NULLIF(trim(w.telefono), ''), c.telefono),
      whatsapp = COALESCE(NULLIF(trim(w.whatsapp), ''), c.whatsapp)
    FROM clinicas c WHERE c.id = w.clinica_id AND c.slug = 'dentcarerc'`);
};
exports.down = () => {};
