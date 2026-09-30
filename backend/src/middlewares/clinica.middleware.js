/* Middleware de resolución de clínica (arquitectura multi-clínica de DOVA).
   Hoy, todas las requests autenticadas resuelven la clínica desde el token
   del usuario logueado (req.usuario.clinicaId), porque no hay todavía
   selección de clínica por subdominio/dominio (fuera de alcance de esta
   etapa, ver prompt de identidad DOVA). Se deja como middleware global y
   único punto de resolución para que agregar esa capa en el futuro
   (subdominio -> clinica_id) no requiera tocar cada controlador. */
function resolverClinicaMiddleware(req, res, next) {
  if (req.usuario && req.usuario.clinicaId) {
    req.clinicaId = req.usuario.clinicaId;
  }
  next();
}

module.exports = { resolverClinicaMiddleware };
