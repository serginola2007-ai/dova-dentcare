const service = require('./odontograma.service');
async function obtenerPorPaciente(req, res, next) { try { res.json(await service.obtenerPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function historialPieza(req, res, next) { try { res.json(await service.obtenerHistorialPieza(req.clinicaId, req.params.pacienteId, req.params.pieza)); } catch (e) { next(e); } }
async function expedientePieza(req, res, next) { try { res.json(await service.expedientePieza(req.clinicaId, req.params.pacienteId, req.params.pieza)); } catch (e) { next(e); } }
async function actualizarPieza(req, res, next) { try { res.json(await service.actualizarPieza(req.clinicaId, req.params.pacienteId, req.body, req.usuario)); } catch (e) { next(e); } }
module.exports = { obtenerPorPaciente, historialPieza, expedientePieza, actualizarPieza };
