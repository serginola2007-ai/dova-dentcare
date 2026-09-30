const service = require('./notificaciones.service');
async function listar(req, res, next) {
  try { res.json(await service.listar(req.clinicaId, req.usuario.id, { soloNoLeidas: req.query.soloNoLeidas === 'true' })); }
  catch (e) { next(e); }
}
async function contador(req, res, next) {
  try { res.json({ noLeidas: await service.contarNoLeidas(req.clinicaId, req.usuario.id) }); }
  catch (e) { next(e); }
}
async function marcarLeida(req, res, next) {
  try { res.json({ ok: !!(await service.marcarLeida(req.clinicaId, req.usuario.id, req.params.id)) }); }
  catch (e) { next(e); }
}
async function marcarTodasLeidas(req, res, next) {
  try { await service.marcarTodasLeidas(req.clinicaId, req.usuario.id); res.json({ ok: true }); }
  catch (e) { next(e); }
}
module.exports = { listar, contador, marcarLeida, marcarTodasLeidas };
