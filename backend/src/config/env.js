require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return v;
}

// Secretos débiles o de ejemplo: en producción el servidor no arranca.
if ((process.env.NODE_ENV || 'development') === 'production') {
  for (const n of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[n] || '';
    if (v.length < 16 || /CAMBIAR|changeme/i.test(v)) {
      throw new Error(`${n} es demasiado corto o es un valor de ejemplo: usá un valor aleatorio largo (Render lo genera solo).`);
    }
    if (v.length < 32) console.warn(`[seguridad] ${n} tiene menos de 32 caracteres: conviene reemplazarlo por uno aleatorio más largo.`);
  }
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) throw new Error('JWT_SECRET y JWT_REFRESH_SECRET tienen que ser distintos.');
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  // CORS_ORIGIN admite uno o varios orígenes separados por coma (por ejemplo
  // la URL de producción de Netlify + una preview URL), o "*" para permitir
  // cualquiera (solo recomendable en desarrollo).
  corsOrigin: (process.env.CORS_ORIGIN || ((process.env.NODE_ENV || 'development') === 'production' ? '' : '*'))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
