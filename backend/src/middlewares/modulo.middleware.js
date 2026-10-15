/* Cierra una ruta si el plan de la clínica no incluye el módulo (config/planes.js).
   Se usa en las rutas que no tienen un permiso propio del módulo. Va después de
   authMiddleware y resolverClinicaMiddleware. */
const { query } = require('../config/db');
const { ApiError } = require('./error.middleware');
const planes = require('../config/planes');

function exigirModulo(clave) {
  return async (req, res, next) => {
    try {
      const c = (await query('SELECT plan, modulos_extra, modulos_quitar FROM clinicas WHERE id=$1', [req.clinicaId])).rows[0];
      if (!c || !planes.modulosHabilitados(c).has(clave)) return next(new ApiError(403, 'Esta función no está incluida en el plan de tu clínica.'));
      return next();
    } catch (e) { return next(e); }
  };
}
module.exports = { exigirModulo };
