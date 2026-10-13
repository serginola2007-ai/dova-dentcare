const service = require('./pendientes.service');
const miDia = require('./pendientes.midia');
const { ApiError } = require('../../middlewares/error.middleware');

async function obtener(req, res, next) {
  try {
    // Un odontólogo ve automáticamente solo lo suyo, sin excepción.
    // Solo alguien sin odontologoId propio (admin/recepción) y con permiso
    // amplio de historia clínica puede filtrar por otro odontólogo vía
    // query — nunca confiar en el frontend para esta decisión (sección 33).
    let odontologoId = req.usuario.odontologoId || undefined;
    if (!odontologoId && req.query.odontologoId && req.usuario.permisos.includes('pacientes.clinical.view')) {
      odontologoId = Number(req.query.odontologoId);
    }
    res.json(await service.obtener(req.clinicaId, odontologoId));
  } catch (e) { next(e); }
}

// Preparar el día: mismo criterio que obtener() para elegir el odontólogo.
async function prepararDia(req, res, next) {
  try {
    let odontologoId = req.usuario.odontologoId || undefined;
    if (!odontologoId && req.query.odontologoId !== undefined && req.query.odontologoId !== '' && req.usuario.permisos.includes('pacientes.clinical.view')) {
      odontologoId = Number(req.query.odontologoId);
      if (!Number.isInteger(odontologoId) || odontologoId <= 0) throw new ApiError(400, 'Odontólogo inválido');
    }
    res.json(await miDia.preparar(req.clinicaId, odontologoId, req.query.fecha, req.usuario.permisos));
  } catch (e) { next(e); }
}

module.exports = { obtener, prepararDia };
