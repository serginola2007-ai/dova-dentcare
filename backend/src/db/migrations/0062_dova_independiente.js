/* DOVA pasa a ser un producto propio: la clínica con la que arrancó la
   instalación (código "dentcarerc") deja de ser cliente. Se renombra a la
   clínica DOVA (código "dova") y se borran sus datos de identidad: contacto,
   redes, logo, datos fiscales y textos de la página web. No se borra ninguna
   fila: pacientes, turnos y usuarios de prueba siguen igual.
   Si ya existe una clínica "dova", no se toca nada. */
exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE cid integer;
    BEGIN
      IF EXISTS (SELECT 1 FROM clinicas WHERE slug = 'dova') THEN RETURN; END IF;
      SELECT id INTO cid FROM clinicas WHERE slug = 'dentcarerc';
      IF cid IS NULL THEN RETURN; END IF;

      UPDATE clinicas SET
        nombre = 'DOVA', slug = 'dova', logo_url = NULL, favicon_url = NULL,
        color_primario = '#3E7C62', color_secundario = '#24292C',
        direccion = NULL, telefono = NULL, whatsapp = NULL, email = NULL,
        instagram = NULL, facebook = NULL, horario_atencion = NULL
      WHERE id = cid;

      UPDATE web_config SET
        titulo = NULL, eslogan = NULL, presentacion = NULL,
        direccion = NULL, telefono = NULL, whatsapp = NULL, email = NULL,
        instagram = NULL, facebook = NULL, mapa_url = NULL
      WHERE clinica_id = cid;

      UPDATE facturacion_config SET
        nombre_comercial = NULL, razon_social = NULL, ruc = NULL,
        direccion = NULL, telefono = NULL, email = NULL,
        logo = NULL, logo_mime = NULL, timbrado = NULL, timbrado_vence = NULL, pie_texto = NULL
      WHERE clinica_id = cid;
    END $$;`);
};
exports.down = () => {};
