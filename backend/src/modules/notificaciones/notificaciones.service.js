const repo = require('./notificaciones.repository');

async function notificar(clinicaId, usuarioId, datos) {
  // La notificación nunca debe tumbar el flujo principal que la dispara.
  try { await repo.crear(clinicaId, usuarioId, datos); }
  catch (err) { console.error('[notificaciones] error al crear', err.message); }
}

async function listar(clinicaId, usuarioId, opciones) { return repo.listarPorUsuario(clinicaId, usuarioId, opciones); }
async function contarNoLeidas(clinicaId, usuarioId) { return repo.contarNoLeidas(clinicaId, usuarioId); }
async function marcarLeida(clinicaId, usuarioId, id) { return repo.marcarLeida(clinicaId, usuarioId, id); }
async function marcarTodasLeidas(clinicaId, usuarioId) { return repo.marcarTodasLeidas(clinicaId, usuarioId); }

module.exports = { notificar, listar, contarNoLeidas, marcarLeida, marcarTodasLeidas };
