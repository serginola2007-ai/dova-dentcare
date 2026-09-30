const service = require('./planes.service');
async function listarPorPaciente(req, res, next) { try { res.json(await service.listarPorPaciente(req.clinicaId, req.params.pacienteId)); } catch (e) { next(e); } }
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, req.params.id)); } catch (e) { next(e); } }
async function crear(req, res, next) { try { res.status(201).json(await service.crear(req.clinicaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function actualizar(req, res, next) { try { res.json(await service.actualizar(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
async function registrarSesion(req, res, next) { try { res.status(201).json(await service.registrarSesion(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
async function completar(req, res, next) { try { res.json(await service.completar(req.clinicaId, req.params.id, req.usuario)); } catch (e) { next(e); } }
async function cancelar(req, res, next) { try { res.json(await service.cancelar(req.clinicaId, req.params.id, req.usuario)); } catch (e) { next(e); } }
async function crearEtapa(req, res, next) { try { res.status(201).json(await service.crearEtapa(req.clinicaId, req.params.id, req.body, req.usuario)); } catch (e) { next(e); } }
async function aplicarEtapas(req, res, next) { try { res.status(201).json(await service.aplicarEtapas(req.clinicaId, req.params.id, req.body.nombres, req.usuario)); } catch (e) { next(e); } }
async function completarEtapa(req, res, next) { try { res.json(await service.completarEtapa(req.clinicaId, req.params.id, req.params.etapaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function reabrirEtapa(req, res, next) { try { res.json(await service.reabrirEtapa(req.clinicaId, req.params.id, req.params.etapaId, req.usuario)); } catch (e) { next(e); } }
async function registrarMaterialEtapa(req, res, next) { try { res.status(201).json(await service.registrarMaterialEtapa(req.clinicaId, req.params.id, req.params.etapaId, req.body, req.usuario)); } catch (e) { next(e); } }
async function registrarMaterialSesion(req, res, next) { try { res.status(201).json(await service.registrarMaterialSesion(req.clinicaId, req.params.id, req.params.sesionId, req.body, req.usuario)); } catch (e) { next(e); } }
async function generarPresupuesto(req, res, next) { try { res.status(201).json(await service.generarPresupuesto(req.clinicaId, req.params.id, req.usuario)); } catch (e) { next(e); } }
async function listarInsumosParaConsumo(req, res, next) { try { res.json(await service.listarInsumosParaConsumo(req.clinicaId)); } catch (e) { next(e); } }
module.exports = {
  listarPorPaciente, obtener, crear, actualizar, registrarSesion, completar, cancelar,
  crearEtapa, aplicarEtapas, completarEtapa, reabrirEtapa,
  registrarMaterialEtapa, registrarMaterialSesion, generarPresupuesto, listarInsumosParaConsumo,
};
