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
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    error: {
      message: err.message || 'Error interno del servidor',
      details: err.details || undefined,
    },
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
