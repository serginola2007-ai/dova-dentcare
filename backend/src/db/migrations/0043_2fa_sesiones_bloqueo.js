/* Tercera ronda de seguridad (oct 2026). Solo agrega; no toca datos.
   - Verificación en dos pasos (TOTP) del personal: secreto cifrado, último
     paso usado (anti-repetición) y códigos de recuperación (solo su hash).
   - Sesiones: una fila por login (dispositivo, IP, último uso, bloqueo de
     pantalla, cierre). Los refresh tokens ya llevan sesion_id.
   - Política de la clínica: minutos sin uso hasta bloquear la pantalla y
     verificación en dos pasos obligatoria para administradores. */
exports.up = (pgm) => {
  pgm.addColumns('usuarios', {
    totp_secreto: { type: 'text' },
    totp_pendiente: { type: 'text' },
    totp_pendiente_en: { type: 'timestamptz' },
    totp_activo: { type: 'boolean', notNull: true, default: false },
    totp_activado_en: { type: 'timestamptz' },
    totp_ultimo_paso: { type: 'bigint' },
    totp_recuperacion: { type: 'text[]' },
  });
  pgm.addColumns('clinicas', {
    bloqueo_inactividad_min: { type: 'smallint', notNull: true, default: 15 },
    exigir_2fa_admin: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint('clinicas', 'clinicas_bloqueo_inactividad_rango', 'CHECK (bloqueo_inactividad_min BETWEEN 0 AND 240)');
  pgm.sql(`CREATE TABLE IF NOT EXISTS sesiones (
    id varchar(40) PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    clinica_id integer NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    inicio timestamptz NOT NULL DEFAULT now(),
    ultimo_uso timestamptz NOT NULL DEFAULT now(),
    ip varchar(64),
    agente varchar(300),
    bloqueada boolean NOT NULL DEFAULT false,
    bloqueada_en timestamptz,
    cerrada_en timestamptz,
    motivo varchar(30)
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS sesiones_usuario_idx ON sesiones (usuario_id) WHERE cerrada_en IS NULL');
};
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS sesiones');
  pgm.dropConstraint('clinicas', 'clinicas_bloqueo_inactividad_rango');
  pgm.dropColumns('clinicas', ['bloqueo_inactividad_min', 'exigir_2fa_admin']);
  pgm.dropColumns('usuarios', ['totp_secreto', 'totp_pendiente', 'totp_pendiente_en', 'totp_activo', 'totp_activado_en', 'totp_ultimo_paso', 'totp_recuperacion']);
};
