const service = require('./odontograma.service');
async function obtenerPorPaciente(req, res, next) { try { res.json(await service.obtenerPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function historialPieza(req, res, next) { try { res.json(await service.obtenerHistorialPieza(req.clinicaId, req.params.pacienteId, req.params.pieza)); } catch (e) { next(e); } }
async function expedientePieza(req, res, next) { try { res.json(await service.expedientePieza(req.clinicaId, req.params.pacienteId, req.params.pieza)); } catch (e) { next(e); } }
async function actualizarPieza(req, res, next) { try { res.json(await service.actualizarPieza(req.clinicaId, req.params.pacienteId, req.body, req.usuario)); } catch (e) { next(e); } }
async function datos(req, res, next) { try { res.json(await service.datosOdontograma(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function historialPaciente(req, res, next) { try { res.json(await service.historialPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function guardarDenticion(req, res, next) {
  try {
    const d = req.body && req.body.denticion;
    res.json(await service.guardarDenticion(req.clinicaId, req.params.pacienteId, d === '' || d === undefined ? null : d, req.usuario));
  } catch (e) { next(e); }
}
module.exports = { datos, historialPaciente, guardarDenticion, obtenerPorPaciente, historialPieza, expedientePieza, actualizarPieza };
