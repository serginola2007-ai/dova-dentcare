/* La clínica decidió no usar la verificación en dos pasos. Se limpian los
   secretos que alguien pudiera haber activado (no se borran columnas: las
   migraciones solo agregan). Las columnas totp_* y clinicas.exigir_2fa_admin
   quedan sin uso. */
exports.up = (pgm) => {
  pgm.sql(`UPDATE usuarios SET totp_activo=false, totp_secreto=NULL, totp_pendiente=NULL, totp_pendiente_en=NULL,
    totp_activado_en=NULL, totp_ultimo_paso=NULL, totp_recuperacion=NULL
    WHERE totp_activo OR totp_secreto IS NOT NULL OR totp_pendiente IS NOT NULL`);
  pgm.sql('UPDATE clinicas SET exigir_2fa_admin=false WHERE exigir_2fa_admin');
};
exports.down = () => {};
