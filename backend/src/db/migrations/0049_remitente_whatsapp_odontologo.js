/* Cada odontólogo puede tener su propio WhatsApp para los recordatorios de
   sus pacientes (solo agrega).
   - whatsapp_numero: lo registra el propio doctor (o quien tenga permiso).
   - whatsapp_phone_id: el id que da Meta cuando ese número se conecta a
     WhatsApp Business (lo carga el administrador).
   - whatsapp_envia: los recordatorios automáticos de sus turnos salen de su
     número en vez del número general de la clínica. */
exports.up = (pgm) => {
  pgm.addColumns('odontologos', {
    whatsapp_numero: { type: 'varchar(30)' },
    whatsapp_phone_id: { type: 'varchar(40)' },
    whatsapp_envia: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addColumns('recordatorios_envios', { remitente: { type: 'varchar(120)' } });
};
exports.down = (pgm) => {
  pgm.dropColumns('recordatorios_envios', ['remitente']);
  pgm.dropColumns('odontologos', ['whatsapp_numero', 'whatsapp_phone_id', 'whatsapp_envia']);
};
