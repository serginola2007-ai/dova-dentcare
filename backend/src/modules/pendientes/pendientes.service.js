const repo = require('./pendientes.repository');

/* "Mis pendientes" (sección 3/23 del prompt): agrega en paralelo todas las
   categorías de trabajo abierto del odontólogo (o de toda la clínica, si
   quien consulta no es un odontólogo puntual — ej. admin/recepción). Sin
   IA: son listados directos con reglas de fecha/estado fijas. */
async function obtener(clinicaId, odontologoId) {
  const [
    tratamientosAbiertos,
    pacientesSinProximaCita,
    estudiosPendientes,
    evolucionesSinFirmar,
    consentimientosPendientes,
    controlesVencidos,
    pacientesParaRevisar,
    derivacionesRecibidas,
  ] = await Promise.all([
    repo.tratamientosAbiertos(clinicaId, odontologoId),
    repo.pacientesSinProximaCita(clinicaId, odontologoId),
    repo.estudiosPendientes(clinicaId, odontologoId),
    repo.evolucionesSinFirmar(clinicaId, odontologoId),
    repo.consentimientosPendientes(clinicaId, odontologoId),
    repo.controlesVencidos(clinicaId, odontologoId),
    repo.pacientesParaRevisar(clinicaId, odontologoId),
    repo.derivacionesRecibidasPendientes(clinicaId, odontologoId),
  ]);

  const total = tratamientosAbiertos.length + pacientesSinProximaCita.length + estudiosPendientes.length
    + evolucionesSinFirmar.length + consentimientosPendientes.length + controlesVencidos.length
    + pacientesParaRevisar.length + derivacionesRecibidas.length;

  return {
    total,
    tratamientosAbiertos,
    pacientesSinProximaCita,
    estudiosPendientes,
    evolucionesSinFirmar,
    consentimientosPendientes,
    controlesVencidos,
    pacientesParaRevisar,
    derivacionesRecibidas,
  };
}

module.exports = { obtener };
