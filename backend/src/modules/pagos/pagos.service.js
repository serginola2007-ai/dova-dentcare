const { ApiError } = require('../../middlewares/error.middleware');
const { monto: validarMonto } = require('../../utils/montos');
const repo = require('./pagos.repository');
const planesPagoRepo = require('../planes-pago/planespago.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const cajaService = require('../caja/caja.service');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) { return repo.listarPorPaciente(clinicaId, pacienteId); }
async function listar(clinicaId, filtros) { return repo.listar(clinicaId, filtros); }
async function resumenPaciente(clinicaId, pacienteId) { return repo.resumenPaciente(clinicaId, pacienteId); }

// Métodos de pago: los configura la clínica en Facturación → Configuración.
// Si todavía no hay configuración, se usan estos.
const METODOS_VALIDOS = ['efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'qr', 'otro'];
async function metodosValidos(clinicaId) {
  try {
    const { metodosPago } = require('../facturacion/facturacion.service');
    const l = await metodosPago(clinicaId, { incluirInactivos: false });
    return l.length ? l.map((m) => m.codigo) : METODOS_VALIDOS;
  } catch (_e) { return METODOS_VALIDOS; }
}

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
  datos.monto = validarMonto(datos.monto);
  const metodos = await metodosValidos(clinicaId);
  if (datos.metodo && !metodos.includes(datos.metodo)) {
    throw new ApiError(400, `Método de pago inválido: ${metodos.join(', ')}`);
  }
  // Presupuesto al que corresponde el cobro (opcional; en cuotas se toma del plan).
  const { query, conCandado } = require('../../config/db');
  if (datos.presupuestoId) {
    const pr = await query('SELECT id FROM presupuestos WHERE clinica_id=$1 AND id=$2 AND paciente_id=$3', [clinicaId, Number(datos.presupuestoId), Number(datos.pacienteId)]);
    if (!pr.rowCount) throw new ApiError(400, 'El presupuesto indicado no es de este paciente');
    datos.presupuestoId = Number(datos.presupuestoId);
  }

  if (datos.cuotaId) {
    const cuota = await planesPagoRepo.obtenerCuota(clinicaId, datos.cuotaId);
    if (!cuota) throw new ApiError(404, 'Cuota no encontrada');
    if (cuota.estado === 'pagada') throw new ApiError(409, 'Esta cuota ya fue pagada anteriormente');
    const pl = await query('SELECT presupuesto_id, paciente_id FROM planes_pago WHERE id=$1', [cuota.plan_pago_id]);
    // La cuota tiene que ser del mismo paciente del cobro, y un cobro menor no la salda.
    if (!pl.rows[0] || Number(pl.rows[0].paciente_id) !== Number(datos.pacienteId)) throw new ApiError(400, 'La cuota indicada no es de este paciente');
    if (datos.monto + 0.005 < Number(cuota.monto)) throw new ApiError(400, `El monto es menor que la cuota (Gs. ${Number(cuota.monto).toLocaleString('es-PY')}). Cobralo sin aplicarlo a la cuota o corregí el monto.`);
    if (pl.rows[0] && pl.rows[0].presupuesto_id && !datos.presupuestoId) datos.presupuestoId = pl.rows[0].presupuesto_id;
  }

  // Todo el cobro (pago + cuota + caja + auditoría) en una sola transacción:
  // si algo falla, no queda un pago a medias.
  return conCandado(datos.cuotaId ? `cuota:${datos.cuotaId}` : null, () => crearEnTransaccion(clinicaId, datos, usuario));
}

async function crearEnTransaccion(clinicaId, datos, usuario) {
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

async function anular(clinicaId, id, usuario, { motivo } = {}) {
  const m = String(motivo || '').trim().slice(0, 500);
  if (m.length < 5) throw new ApiError(400, 'Escribí el motivo de la anulación (queda registrado)');
  // Cierre contable: un pago de un período cerrado no se puede anular.
  const { query } = require('../../config/db');
  const previo = await query('SELECT fecha FROM pagos WHERE clinica_id=$1 AND id=$2', [clinicaId, id]);
  if (previo.rowCount) {
    const { verificarBloqueoContable } = require('../finanzas-ext/cuentas.service');
    const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(previo.rows[0].fecha));
    await verificarBloqueoContable(clinicaId, fechaLocal);
  }
  const pago = await repo.anular(clinicaId, id, m, usuario.id);
  if (!pago) throw new ApiError(404, 'Pago no encontrado o ya estaba anulado');
  // Si la plata había entrado a la caja, se registra la devolución en la caja
  // abierta (si no, el arqueo esperaría un dinero que ya no está).
  let caja = null;
  try {
    const mov = await query('SELECT m.id FROM caja_movimientos m WHERE m.pago_id=$1 LIMIT 1', [pago.id]);
    if (mov.rowCount) {
      const cajaSvc = require('../caja/caja.service');
      caja = await cajaSvc.registrarDevolucionPago(clinicaId, pago, m, usuario);
    }
  } catch (e) { console.error('[caja] no se pudo registrar la devolución del cobro anulado:', e.message); }
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'anular_pago', modulo: 'pagos', entidadId: id,
    detalle: { motivo: m, monto: Number(pago.monto), metodo: pago.metodo, pacienteId: pago.paciente_id, fecha: pago.fecha, devolucionEnCaja: !!caja },
  });
  pago.devolucionEnCaja = !!caja;
  // Si el pago estaba en una factura, la factura vuelve a quedar pendiente
  // (la factura NO se anula sola: eso lo decide una persona).
  try {
    const fact = require('../facturacion/facturacion.service');
    await fact.alAnularPago(clinicaId, Number(id), usuario);
  } catch (e) { console.error('[facturacion] no se pudo actualizar la factura del pago anulado:', e.message); }
  return pago;
}

module.exports = { listarPorPaciente, listar, resumenPaciente, crear, anular };
