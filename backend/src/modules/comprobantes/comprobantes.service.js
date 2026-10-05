const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const clinicaRepo = require('../clinica/clinica.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const presupuestosRepo = require('../presupuestos/presupuestos.repository');
const planesRepo = require('../planes-tratamiento/planes.repository');
const pdf = require('./comprobantes.pdf');

async function pago(clinicaId, id, res) {
  const pagoRes = await query('SELECT * FROM pagos WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  const pagoRow = pagoRes.rows[0];
  if (!pagoRow) throw new ApiError(404, 'Pago no encontrado');
  const [clinica, paciente] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    pacientesRepo.obtenerPorId(clinicaId, pagoRow.paciente_id),
  ]);
  pdf.comprobantePago(res, { clinica, pago: pagoRow, paciente });
}

async function presupuesto(clinicaId, id, res) {
  const presupuestoRow = await presupuestosRepo.obtenerPorId(clinicaId, id);
  if (!presupuestoRow) throw new ApiError(404, 'Presupuesto no encontrado');
  const [clinica, paciente] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    pacientesRepo.obtenerPorId(clinicaId, presupuestoRow.paciente_id),
  ]);
  pdf.comprobantePresupuesto(res, { clinica, presupuesto: presupuestoRow, items: presupuestoRow.items, paciente });
}

async function consentimiento(clinicaId, id, res) {
  const extrasRepo = require('../clinico-extras/extras.repository');
  const consentimientoRow = await extrasRepo.obtenerConsentimiento(clinicaId, id);
  if (!consentimientoRow) throw new ApiError(404, 'Consentimiento no encontrado');
  const [clinica, paciente] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    pacientesRepo.obtenerPorId(clinicaId, consentimientoRow.paciente_id),
  ]);
  pdf.comprobanteConsentimiento(res, { clinica, consentimiento: consentimientoRow, paciente });
}

async function planTratamiento(clinicaId, id, res) {
  const planRow = await planesRepo.obtenerPorId(clinicaId, id);
  if (!planRow) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const [clinica, paciente, sesiones] = await Promise.all([
    clinicaRepo.findById(clinicaId),
    pacientesRepo.obtenerPorId(clinicaId, planRow.paciente_id),
    planesRepo.listarSesiones(id),
  ]);
  pdf.comprobantePlanTratamiento(res, { clinica, plan: planRow, sesiones, paciente });
}

async function receta(clinicaId, id, res) {
  const extrasRepo = require('../clinico-extras/extras.repository');
  const r = await extrasRepo.obtenerReceta(clinicaId, id);
  if (!r) throw new ApiError(404, 'Receta no encontrada');
  const [clinica, paciente] = await Promise.all([clinicaRepo.findById(clinicaId), pacientesRepo.obtenerPorId(clinicaId, r.paciente_id)]);
  pdf.comprobanteReceta(res, { clinica, receta: r, paciente });
}

module.exports = { pago, presupuesto, consentimiento, planTratamiento, receta };
