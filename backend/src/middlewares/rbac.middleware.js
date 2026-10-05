/* RBAC: nunca confiar solo en ocultar botones en el frontend (ver prompt
   maestro de auditoría). Cada endpoint sensible se protege acá, en el
   backend, usando los permisos EFECTIVOS calculados en el login
   (rol base + permisos_usuario overrides) y embebidos en el JWT.
   Si los permisos cambian, el usuario los recibe recién en su próximo
   login/refresh — trade-off simple y documentado para esta etapa. */
const { ApiError } = require('./error.middleware');

function requirePermiso(...codigosRequeridos) {
  return (req, res, next) => {
    const permisos = (req.usuario && req.usuario.permisos) || [];
    const tieneAlguno = codigosRequeridos.some((codigo) => permisos.includes(codigo));
    if (!tieneAlguno) {
      // Intento de acceso sin permiso (p. ej. alguien que arma la petición a
      // mano): queda en la auditoría como "denegado".
      if (req.usuario) {
        require('../utils/auditoria').registrar({
          clinicaId: req.usuario.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre,
          accion: 'acceso_denegado', modulo: 'seguridad', resultado: 'denegado',
          detalle: { metodo: req.method, ruta: (req.originalUrl || '').split('?')[0].slice(0, 200), requiere: codigosRequeridos },
        });
      }
      return next(new ApiError(403, 'No tenés permiso para realizar esta acción'));
    }
    next();
  };
}

function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rolCodigo)) {
      return next(new ApiError(403, 'Tu rol no tiene acceso a esta acción'));
    }
    next();
  };
}

module.exports = { requirePermiso, requireRol };
