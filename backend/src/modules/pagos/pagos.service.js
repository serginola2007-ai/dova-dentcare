const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./pagos.repository');
const planesPagoRepo = require('../planes-pago/planespago.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const cajaService = require('../caja/caja.service');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) { return repo.listarPorPaciente(clinicaId, pacienteId); }
async function listar(clinicaId, filtros) { return repo.listar(clinicaId, filtros); }
async function resumenPaciente(clinicaId, pacienteId) { return repo.resumenPaciente(clinicaId, pacienteId); }

const METODOS_VALIDOS = ['efectivo', 'tarjeta', 'transferencia', 'qr', 'otro'];

/* Registrar un pago:
   1) Si viene ligado a una cuota, la marca pagada. El índice único parcial
      en DB (pagos_cuota_unica_activa) es la última línea de defensa contra
      doble pago aunque lleguen dos requests casi simultáneas; acá además
      se valida explícitamente antes para dar un mensaje claro.
   2) Refleja el ingreso en caja automáticamente si hay caja abierta.
   3) Audita. Todo dentro de una transacción lógica a nivel de service
      (las tablas involucradas tienen sus propias constraints como red
      de seguridad final). */
async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId) throw new ApiError(400, 'El paciente es obligatorio');
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  if (!(Number(datos.monto) > 0)) throw new ApiError(400, 'El monto debe ser mayor a cero');
  if (datos.metodo && !METODOS_VALIDOS.includes(datos.metodo)) {
    throw new ApiError(400, `Método de pago inválido: ${METODOS_VALIDOS.join(', ')}`);
  }

  if (datos.cuotaId) {
    const cuota = await planesPagoRepo.obtenerCuota(clinicaId, datos.cuotaId);
    if (!cuota) throw new ApiError(404, 'Cuota no encontrada');
    if (cuota.estado === 'pagada') throw new ApiError(409, 'Esta cuota ya fue pagada anteriormente');
  }

  let pago;
  try {
    pago = await repo.crear(clinicaId, datos, usuario.id);
  } catch (err) {
    if (err.code === '23505') { // unique_violation -> pagos_cuota_unica_activa
      throw new ApiError(409, 'Esta cuota ya fue pagada (pago duplicado evitado)');
    }
    throw err;
  }

  if (datos.cuotaId) {
    await planesPagoRepo.marcarCuotaPagada(datos.cuotaId);
    const cuota = await planesPagoRepo.obtenerCuota(clinicaId, datos.cuotaId);
    await planesPagoRepo.actualizarEstadoPlanSiCorresponde(cuota.plan_pago_id);
  }

  const reflejo = await cajaService.reflejarPagoEnCaja(clinicaId, {
    pagoId: pago.id,
    concepto: datos.concepto || (datos.cuotaId ? `Pago de cuota #${datos.cuotaId}` : 'Pago de paciente'),
    monto: datos.monto,
    metodo: datos.metodo || 'efectivo',
    usuarioId: usuario.id,
  });

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'registrar_pago', modulo: 'pagos', entidadId: pago.id,
    detalle: { pacienteId: datos.pacienteId, monto: datos.monto, metodo: datos.metodo, reflejadoEnCaja: reflejo.reflejado },
  });

  return { ...pago, cajaReflejada: reflejo.reflejado };
}

async function anular(clinicaId, id, usuario) {
  // Cierre contable: un pago de un período cerrado no se puede anular.
  const { query } = require('../../config/db');
  const previo = await query('SELECT fecha FROM pagos WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  if (previo.rowCount) {
    const { verificarBloqueoContable } = require('../finanzas-ext/cuentas.service');
    const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(previo.rows[0].fecha));
    await verificarBloqueoContable(clinicaId, fechaLocal);
  }
  const pago = await repo.anular(clinicaId, id);
  if (!pago) throw new ApiError(404, 'Pago no encontrado o ya estaba anulado');
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'anular_pago', modulo: 'pagos', entidadId: id,
  });
  return pago;
}

module.exports = { listarPorPaciente, listar, resumenPaciente, crear, anular };
