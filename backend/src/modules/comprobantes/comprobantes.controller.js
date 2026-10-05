const service = require('./comprobantes.service');

async function pago(req, res, next) {
  try { await service.pago(req.clinicaId, Number(req.params.id), res); } catch (e) { next(e); }
}
async function presupuesto(req, res, next) {
  try { await service.presupuesto(req.clinicaId, Number(req.params.id), res); } catch (e) { next(e); }
}
async function consentimiento(req, res, next) {
  try { await service.consentimiento(req.clinicaId, Number(req.params.id), res); } catch (e) { next(e); }
}
async function planTratamiento(req, res, next) {
  try { await service.planTratamiento(req.clinicaId, Number(req.params.id), res); } catch (e) { next(e); }
}

async function receta(req, res, next) {
  try { await service.receta(req.clinicaId, Number(req.params.id), res); } catch (e) { next(e); }
}
module.exports = { pago, presupuesto, consentimiento, planTratamiento, receta };
