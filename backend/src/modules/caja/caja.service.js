const { ApiError } = require('../../middlewares/error.middleware');
const { monto: validarMonto } = require('../../utils/montos');
const repo = require('./caja.repository');
const auditoria = require('../../utils/auditoria');
const { query, conCandado } = require('../../config/db');

/* Lo que tiene que haber FÍSICAMENTE en el cajón: monto inicial + cobros en
   efectivo − egresos en efectivo. Tarjeta, transferencia y QR se muestran
   aparte (van al banco, no al cajón): antes se sumaban al esperado y la caja
   nunca cuadraba con el conteo. */
function calcularEsperado(caja, t) {
  const efectivo = Number(caja.monto_inicial) + Number(t.efectivo) - Number(t.egresos_efectivo);
  // Todo lo cobrado que no es efectivo (tarjetas, transferencias, QR, otros).
  const otrosMedios = Number(t.total_ingresos) - Number(t.efectivo);
  return {
    efectivoEsperado: Math.round(efectivo * 100) / 100,
    otrosMedios,
    totalGeneral: Number(caja.monto_inicial) + Number(t.total_ingresos) - Number(t.total_egresos),
  };
}

// Pagos de hoy que no entraron a ninguna caja (se cobraron con la caja cerrada).
async function pagosSinCaja(clinicaId) {
  const r = await query(
    `SELECT p.id, p.monto, p.metodo, p.fecha, pa.nombre || ' ' || pa.apellido AS paciente
       FROM pagos p JOIN pacientes pa ON pa.id = p.paciente_id
      WHERE p.clinica_id=$1 AND p.estado='pagado' AND (p.fecha AT TIME ZONE 'America/Asuncion')::date = (now() AT TIME ZONE 'America/Asuncion')::date
        AND NOT EXISTS (SELECT 1 FROM caja_movimientos m WHERE m.pago_id = p.id)
      ORDER BY p.id`, [clinicaId]);
  return r.rows;
}

async function obtenerEstadoActual(clinicaId) {
  const abierta = await repo.obtenerAbierta(clinicaId);
  if (!abierta) {
    const sinCaja = await pagosSinCaja(clinicaId);
    return { abierta: false, pagosSinCaja: sinCaja, totalSinCaja: sinCaja.reduce((a, p) => a + Number(p.monto), 0) };
  }
  const totales = await repo.calcularTotales(abierta.id);
  const movimientos = await repo.listarMovimientos(abierta.id);
  const e = calcularEsperado(abierta, totales);
  // saldoFinal = efectivo que debería haber en el cajón (compatibilidad).
  return { abierta: true, caja: abierta, totales, movimientos, saldoFinal: e.efectivoEsperado, ...e };
}

/* Regla crítica del prompt maestro: "caja de otro día" nunca debe absorber
   silenciosamente movimientos de hoy. El índice único ya impide dos cajas
   abiertas por clínica; acá además avisamos explícitamente si la caja
   abierta es de una fecha anterior a hoy, para que el frontend fuerce
   el cierre antes de operar. */
async function abrir(clinicaId, datos, usuario) {
  // Mismo candado que el reflejo de pagos: un cobro que llega justo mientras
  // se abre la caja no se cuenta dos veces ni se pierde.
  return conCandado(`caja:${clinicaId}`, () => abrirSinCandado(clinicaId, datos, usuario));
}
async function abrirSinCandado(clinicaId, datos, usuario) {
  const existente = await repo.obtenerAbierta(clinicaId);
  if (existente) {
    const esDeOtroDia = new Date(existente.fecha).toDateString() !== new Date().toDateString();
    throw new ApiError(
      409,
      esDeOtroDia
        ? `Hay una caja abierta desde ${existente.fecha} sin cerrar. Cerrala antes de abrir una nueva.`
        : 'Ya hay una caja abierta hoy.'
    );
  }
  const montoInicial = validarMonto(datos.montoInicial === undefined || datos.montoInicial === '' ? 0 : datos.montoInicial, { campo: 'El monto inicial', cero: true });
  const caja = await repo.abrir(clinicaId, montoInicial, usuario.id);
  // Los cobros de HOY hechos antes de abrir la caja se incorporan a esta
  // caja (quedan marcados en el concepto), así no se pierden del arqueo.
  const previos = await pagosSinCaja(clinicaId);
  for (const p of previos) {
    await repo.registrarMovimiento(caja.id, {
      tipo: 'ingreso', concepto: `Pago #${p.id} (${p.paciente}) cobrado antes de abrir la caja`,
      monto: p.monto, metodo: p.metodo, pagoId: p.id, usuarioId: usuario.id,
    });
  }
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'abrir_caja', modulo: 'caja', entidadId: caja.id, detalle: { montoInicial, pagosIncorporados: previos.length },
  });
  return { ...caja, pagosIncorporados: previos.length };
}

async function registrarMovimiento(clinicaId, datosIn, usuario) {
  const caja = await repo.obtenerAbierta(clinicaId);
  if (!caja) throw new ApiError(409, 'No hay una caja abierta. Abrí la caja antes de registrar movimientos.');
  // Devolución: sale plata de la caja (se guarda como egreso marcado "Devolución").
  const datos = { ...datosIn };
  if (datos.tipo === 'devolucion') {
    datos.tipo = 'egreso';
    datos.concepto = `Devolución: ${String(datos.concepto || '').trim() || 'sin detalle'}`;
  }
  if (!['ingreso', 'egreso'].includes(datos.tipo)) throw new ApiError(400, 'Tipo de movimiento inválido');
  datos.monto = validarMonto(datos.monto);
  datos.concepto = String(datos.concepto || '').trim().slice(0, 300);
  if (!datos.concepto) throw new ApiError(400, 'Escribí el concepto del movimiento');
  if (datos.metodo !== undefined && datos.metodo !== null && (typeof datos.metodo !== 'string' || datos.metodo.length > 40)) throw new ApiError(400, 'Método inválido');

  const movimiento = await repo.registrarMovimiento(caja.id, {
    tipo: datos.tipo, concepto: datos.concepto, monto: datos.monto,
    metodo: datos.metodo, usuarioId: usuario.id,
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: `caja_${datos.tipo}`, modulo: 'caja', entidadId: caja.id, detalle: { tipo: datos.tipo, concepto: datos.concepto, monto: datos.monto, metodo: datos.metodo || null, movimientoId: movimiento.id },
  });
  return movimiento;
}

/* Usado internamente por el módulo de pagos: si hay caja abierta, refleja
   el pago como ingreso automáticamente (pagoId evita duplicar si se
   reintenta). Si NO hay caja abierta, el pago igual se registra (no se
   bloquea la operación comercial) pero se avisa que no impactó en caja. */
async function reflejarPagoEnCaja(clinicaId, d) {
  return conCandado(`caja:${clinicaId}`, () => reflejarSinCandado(clinicaId, d));
}
async function reflejarSinCandado(clinicaId, { pagoId, concepto, monto, metodo, usuarioId }) {
  const caja = await repo.obtenerAbierta(clinicaId);
  if (!caja) return { reflejado: false, motivo: 'No hay caja abierta: el cobro se va a sumar a la caja cuando se abra hoy.' };
  await repo.registrarMovimiento(caja.id, { tipo: 'ingreso', concepto, monto, metodo, pagoId, usuarioId });
  return { reflejado: true, cajaId: caja.id };
}

// Cobro anulado que había entrado a la caja: se registra la devolución en la
// caja abierta (con el mismo medio de pago) para que el arqueo cierre.
async function registrarDevolucionPago(clinicaId, pago, motivo, usuario) {
  return conCandado(`caja:${clinicaId}`, async () => {
    const caja = await repo.obtenerAbierta(clinicaId);
    if (!caja) return null;
    const mov = await repo.registrarMovimiento(caja.id, {
      tipo: 'egreso', concepto: `Devolución: cobro #${pago.id} anulado (${String(motivo).slice(0, 120)})`,
      monto: pago.monto, metodo: pago.metodo, usuarioId: usuario.id,
    });
    await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'caja_devolucion', modulo: 'caja', entidadId: caja.id, detalle: { pagoId: pago.id, monto: Number(pago.monto), metodo: pago.metodo } });
    return mov;
  });
}

async function cerrar(clinicaId, id, datos, usuario) {
  const caja = await repo.obtenerPorId(clinicaId, id);
  if (!caja || caja.estado !== 'abierta') throw new ApiError(404, 'No hay una caja abierta con ese ID');

  const totales = await repo.calcularTotales(id);
  const e = calcularEsperado(caja, totales);
  const montoEsperado = e.efectivoEsperado;
  if (datos.montoContado === undefined || datos.montoContado === null || datos.montoContado === '') throw new ApiError(400, 'Debés indicar el monto contado físicamente');
  const montoContado = validarMonto(datos.montoContado, { campo: 'El monto contado', cero: true });
  const diferencia = Math.round((montoContado - montoEsperado) * 100) / 100;

  if (diferencia !== 0 && !datos.motivoDiferencia) {
    throw new ApiError(400, 'Hay una diferencia entre el monto esperado y el contado: indicá el motivo antes de cerrar');
  }

  const cerrada = await repo.cerrar(clinicaId, id, {
    montoEsperado, montoContado, diferencia, motivoDiferencia: datos.motivoDiferencia,
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cerrar_caja', modulo: 'caja', entidadId: id,
    detalle: { montoEsperado, montoContado, diferencia, otrosMedios: e.otrosMedios },
  });
  return { ...cerrada, totales, ...e };
}

async function listarHistorico(clinicaId, filtros) {
  return repo.listarHistorico(clinicaId, filtros);
}

module.exports = {
  registrarDevolucionPago, obtenerEstadoActual, abrir, registrarMovimiento, reflejarPagoEnCaja, cerrar, listarHistorico };
