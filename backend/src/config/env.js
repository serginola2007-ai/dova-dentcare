require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return v;
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
  corsOrigin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
