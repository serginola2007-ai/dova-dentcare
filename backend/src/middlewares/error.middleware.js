class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'Recurso no encontrado'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Errores de PostgreSQL causados por datos del cliente: se responden como
  // 4xx con un mensaje entendible, en vez de un 500 opaco.
  if (!err.status && err.code) {
    const PG = {
      '22P02': [400, 'Algún dato enviado tiene un formato inválido (por ejemplo, un identificador que no es numérico).'],
      '22007': [400, 'Fecha u hora con formato inválido.'],
      '22008': [400, 'Fecha u hora fuera de rango.'],
      '22003': [400, 'Un número está fuera del rango permitido.'],
      '22001': [400, 'Un texto supera el largo máximo permitido.'],
      '23502': [400, 'Falta un dato obligatorio.'],
      '23503': [409, 'La operación hace referencia a un registro inexistente o que está en uso por otros datos.'],
      '23505': [409, 'Ya existe un registro con esos datos (duplicado).'],
      '23514': [400, 'Algún dato no cumple las reglas permitidas.'],
    };
    if (PG[err.code]) {
      err.status = PG[err.code][0];
      err.message = PG[err.code][1];
    }
  }
  if (err.message === 'Origen no permitido por CORS') err.status = 403;
  if (err.type === 'entity.parse.failed') { err.status = 400; err.message = 'El cuerpo de la petición no es JSON válido.'; }
  if (err.type === 'entity.too.large') { err.status = 413; err.message = 'La petición es demasiado grande.'; }
  // Subidas de archivos: tamaño, cantidad o tipo no permitidos → 400 (antes 500).
  if (err.name === 'MulterError') {
    err.status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    err.message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido.' : 'El archivo enviado no es válido.';
  }
  if (!err.status && /^Tipo de archivo no permitido/.test(err.message || '')) err.status = 400;
  const status = err.status || 500;
  if (status >= 500 && !(err instanceof ApiError)) {
    // El detalle queda en el registro del servidor; al cliente nunca le llegan
    // mensajes internos (SQL, rutas, nombres de tablas).
    const ref = require('crypto').randomBytes(4).toString('hex');
    console.error(`[error ${ref}] ${req.method} ${(req.originalUrl || '').split('?')[0]}`, err);
    res.status(500).json({ error: { message: `Ocurrió un error inesperado. Si se repite, avisá al soporte (referencia ${ref}).` } });
    return;
  }
  res.status(status).json({
    error: {
      message: err.message || 'Solicitud inválida',
      details: err.details || undefined,
    },
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
