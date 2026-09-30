const repo = require('./reportes.repository');
const { ApiError } = require('../../middlewares/error.middleware');

function validarRango({ desde, hasta }) {
  if (!desde || !hasta) throw new ApiError(400, 'Los parámetros desde y hasta son obligatorios (YYYY-MM-DD)');
  if (new Date(desde) > new Date(hasta)) throw new ApiError(400, 'El rango de fechas es inválido: desde debe ser anterior a hasta');
}

async function reporteFinanciero(clinicaId, rango) {
  validarRango(rango);
  const [ingresos, porDia, porMetodo] = await Promise.all([
    repo.ingresosPorPeriodo(clinicaId, rango),
    repo.ingresosPorDia(clinicaId, rango),
    repo.ingresosPorMetodo(clinicaId, rango),
  ]);
  return { ...ingresos, porDia, porMetodo };
}

async function reporteAgenda(clinicaId, rango) {
  validarRango(rango);
  const [porEstado, inasistencia, productividad] = await Promise.all([
    repo.turnosPorEstado(clinicaId, rango),
    repo.tasaInasistencia(clinicaId, rango),
    repo.productividadOdontologos(clinicaId, rango),
  ]);
  return { porEstado, inasistencia, productividadOdontologos: productividad };
}

async function reporteTratamientos(clinicaId, rango) {
  validarRango(rango);
  return { topTratamientos: await repo.topTratamientos(clinicaId, rango) };
}

async function reportePacientes(clinicaId, rango) {
  validarRango(rango);
  return { pacientesNuevos: await repo.pacientesNuevos(clinicaId, rango) };
}

// Fase 5 — Integración: reporte de consumo de insumos, ahora que las
// etapas/sesiones de tratamiento registran materiales usados de verdad.
async function reporteInventario(clinicaId, rango) {
  validarRango(rango);
  return { consumo: await repo.consumoInsumosPorPeriodo(clinicaId, rango) };
}

/* Alertas reales para el dashboard: cada número viene de una consulta a la
   base, nunca un placeholder. Si algún día una de estas consultas no
   aplica (ej. clínica sin caja configurada) el número real es 0, no un
   valor inventado. */
async function alertasDashboard(clinicaId) {
  const [stockBajo, cuotasVencidas, turnosHoy, listaEspera, porVencer, caja, ticketsAbiertos] = await Promise.all([
    repo.alertaStockBajo(clinicaId),
    repo.alertaCuotasVencidas(clinicaId),
    repo.alertaTurnosHoy(clinicaId),
    repo.alertaListaEsperaPendiente(clinicaId),
    repo.alertaInsumosPorVencer(clinicaId),
    repo.alertaCajaAbierta(clinicaId),
    repo.alertaTicketsHelpdeskAbiertos(clinicaId),
  ]);
  return {
    stockBajo, cuotasVencidas, turnosHoy, listaEsperaPendiente: listaEspera,
    insumosPorVencer: porVencer, cajaAbierta: caja, ticketsHelpdeskAbiertos: ticketsAbiertos,
  };
}

module.exports = { reporteFinanciero, reporteAgenda, reporteTratamientos, reportePacientes, reporteInventario, alertasDashboard };
