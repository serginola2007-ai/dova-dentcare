const service = require('./reportes.service');

function rango(req) {
  return { desde: req.query.desde, hasta: req.query.hasta };
}

async function financiero(req, res, next) {
  try { res.json(await service.reporteFinanciero(req.clinicaId, rango(req))); } catch (e) { next(e); }
}
async function agenda(req, res, next) {
  try { res.json(await service.reporteAgenda(req.clinicaId, rango(req))); } catch (e) { next(e); }
}
async function tratamientos(req, res, next) {
  try { res.json(await service.reporteTratamientos(req.clinicaId, rango(req))); } catch (e) { next(e); }
}
async function pacientes(req, res, next) {
  try { res.json(await service.reportePacientes(req.clinicaId, rango(req))); } catch (e) { next(e); }
}
async function inventario(req, res, next) {
  try { res.json(await service.reporteInventario(req.clinicaId, rango(req))); } catch (e) { next(e); }
}
async function alertasDashboard(req, res, next) {
  try { res.json(await service.alertasDashboard(req.clinicaId)); } catch (e) { next(e); }
}

module.exports = { financiero, agenda, tratamientos, pacientes, inventario, alertasDashboard };
