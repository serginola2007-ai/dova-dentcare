/* Cobro online de cuotas con una pasarela de pago (hoy: Pagopar).
   Camino: el paciente toca "Pagar ahora" en su página "Mi pago" → se crea el cobro en la pasarela
   y se lo lleva a pagar → la pasarela avisa → DOVA NO se fía del aviso: firma válida y, además,
   vuelve a consultar el pedido a la pasarela (pagado y por el monto exacto) → recién ahí registra el
   pago con el mismo camino que un cobro a mano (cuota pagada + caja + historial).
   Si la cuota ya estaba pagada por otro lado, el cobro queda "para revisar" y se avisa a la clínica
   (hay plata recibida que hay que devolver o aplicar a mano). */
const crypto = require('crypto');
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const planes = require('../../config/planes');
const proveedor = require('./proveedores/pagopar');

const SISTEMA = { id: null, nombre: 'Cobro online', permisos: [] };
const HORAS_VALIDEZ = 72;

const moduloActivo = async (clinicaId) => {
  const c = (await query('SELECT plan, modulos_extra, modulos_quitar FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  return !!c && planes.modulosHabilitados(c).has('cobro_online');
};

async function estado(clinicaId) {
  const c = (await query('SELECT cobro_online_activo FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  const incluido = await moduloActivo(clinicaId);
  return { proveedor: proveedor.nombre, configurado: proveedor.configurado(), activo: !!(c && c.cobro_online_activo), incluidoEnPlan: incluido };
}
// ¿Se le ofrece "Pagar ahora" al paciente?
async function disponible(clinicaId) {
  const e = await estado(clinicaId);
  return e.activo && e.configurado && e.incluidoEnPlan;
}

async function activar(clinicaId, activo, actor) {
  if (typeof activo !== 'boolean') throw new ApiError(400, 'Falta "activo" (verdadero o falso)');
  if (activo && !proveedor.configurado()) throw new ApiError(409, 'Todavía no está conectada la pasarela de pago en el servidor (claves de Pagopar).');
  if (activo && !(await moduloActivo(clinicaId))) throw new ApiError(409, 'El cobro online no está incluido en el plan de esta clínica.');
  await query('UPDATE clinicas SET cobro_online_activo=$2 WHERE id=$1', [clinicaId, activo]);
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: activo ? 'activar_cobro_online' : 'desactivar_cobro_online', modulo: 'finanzas', entidadId: 'cobro_online' });
  return estado(clinicaId);
}

async function metodoParaPago(clinicaId) {
  let validos = ['efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'qr', 'otro'];
  try {
    const l = await require('../facturacion/facturacion.service').metodosPago(clinicaId, { incluirInactivos: false });
    if (l.length) validos = l.map((m) => m.codigo);
  } catch (_e) { /* se usan los de siempre */ }
  return ['tarjeta', 'tarjeta_credito', 'qr', 'transferencia', 'otro'].find((m) => validos.includes(m)) || validos[0];
}

async function avisarClinica(clinicaId, titulo, mensaje, cobroId) {
  try { await require('../cobranza/cobranza.service').avisar(clinicaId, { titulo, mensaje, entidad: 'cobro_online', entidadId: cobroId }); } catch (e) { console.error('[cobro-online] aviso:', e.message); }
}

/* ---------------------------------------------------------------- iniciar */
async function iniciarConEnlace(token, d) {
  const pt = await require('../cobranza/cobranza.service').pacientePorToken(token);
  if (!(await disponible(pt.clinica_id))) throw new ApiError(409, 'El pago online no está disponible. Pagá por transferencia o consultá en la clínica.');
  const cuotaId = Number(d && d.cuotaId);
  if (!Number.isInteger(cuotaId) || cuotaId <= 0) throw new ApiError(400, 'Elegí la cuota que querés pagar');
  const cuota = (await query(`SELECT c.id, c.numero, c.monto, c.estado, pp.cantidad_cuotas
      FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
     WHERE c.id=$1 AND pp.clinica_id=$2 AND pp.paciente_id=$3 AND pp.estado NOT IN ('cancelado','cancelada','anulado')`, [cuotaId, pt.clinica_id, pt.paciente_id])).rows[0];
  if (!cuota) throw new ApiError(404, 'Esa cuota no es tuya');
  if (cuota.estado === 'pagada') throw new ApiError(409, 'Esa cuota ya está pagada');
  const monto = Math.round(Number(cuota.monto));
  if (!(monto > 0)) throw new ApiError(409, 'Esa cuota no tiene un monto para cobrar');

  return conCandado([`cobroonline:cuota:${cuotaId}`], async () => {
    const abierto = (await query("SELECT id, url_pago FROM cobros_online WHERE cuota_id=$1 AND estado='creado' AND vence_en > now() AND url_pago IS NOT NULL ORDER BY id DESC LIMIT 1", [cuotaId])).rows[0];
    if (abierto) return { url: abierto.url_pago };
    const pac = (await query('SELECT nombre, apellido, ci, telefono, whatsapp, email FROM pacientes WHERE id=$1', [pt.paciente_id])).rows[0];
    const cli = (await query('SELECT nombre, email FROM clinicas WHERE id=$1', [pt.clinica_id])).rows[0];
    const vence = new Date(Date.now() + HORAS_VALIDEZ * 3600 * 1000);
    const pedido = `dova-${pt.clinica_id}-${cuotaId}-${crypto.randomBytes(5).toString('hex')}`;
    const ins = (await query(`INSERT INTO cobros_online (clinica_id, paciente_id, cuota_id, monto, proveedor, pedido_comercio, vence_en)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [pt.clinica_id, pt.paciente_id, cuotaId, monto, proveedor.nombre, pedido, vence])).rows[0];
    try {
      const r = await proveedor.crearCobro({
        pedidoComercio: pedido, monto, vence, descripcion: `Cuota ${cuota.numero} de ${cuota.cantidad_cuotas} - ${cli.nombre}`,
        comprador: { nombre: `${pac.nombre} ${pac.apellido}`.trim(), email: pac.email || cli.email || '', documento: pac.ci || '0', telefono: pac.whatsapp || pac.telefono || '' },
      });
      await query('UPDATE cobros_online SET hash_proveedor=$2, url_pago=$3, actualizado_en=now() WHERE id=$1', [ins.id, r.hash, r.url]);
      return { url: r.url };
    } catch (e) {
      await query("UPDATE cobros_online SET estado='cancelado', ultimo_error=$2, actualizado_en=now() WHERE id=$1", [ins.id, String(e.message).slice(0, 300)]);
      throw new ApiError(502, e.message);
    }
  });
}

/* ---------------------------------------------------------------- confirmar */
// Consulta el estado a la pasarela y, si se pagó por el monto exacto, registra el pago (una sola vez).
async function confirmar(cobroId) {
  const previo = (await query('SELECT * FROM cobros_online WHERE id=$1', [Number(cobroId)])).rows[0];
  if (!previo) throw new ApiError(404, 'Cobro no encontrado');
  if (previo.estado === 'pagado' || !previo.hash_proveedor) return previo;
  const r = await proveedor.consultar(previo.hash_proveedor);
  return conCandado([`cobroonline:${previo.id}`], async () => {
    const x = (await query('SELECT * FROM cobros_online WHERE id=$1', [previo.id])).rows[0];
    if (x.estado === 'pagado') return x;
    if (r.pagado) {
      if (r.monto !== Number(x.monto)) {
        await query("UPDATE cobros_online SET estado='revisar', ultimo_error=$2, actualizado_en=now() WHERE id=$1", [x.id, `La pasarela cobró Gs. ${r.monto} y la cuota era de Gs. ${Number(x.monto)}`]);
        await avisarClinica(x.clinica_id, 'Un cobro online no coincide con la cuota', `La pasarela cobró un monto distinto al de la cuota. Revisalo en Finanzas → Cobro online.`, x.id);
        return (await query('SELECT * FROM cobros_online WHERE id=$1', [x.id])).rows[0];
      }
      try {
        const pago = await require('../pagos/pagos.service').crear(x.clinica_id, {
          pacienteId: x.paciente_id, monto: Number(x.monto), metodo: await metodoParaPago(x.clinica_id), cuotaId: x.cuota_id,
          concepto: `Pago online (${r.formaPago || proveedor.nombre}) - pedido ${x.pedido_comercio}`.slice(0, 200),
        }, SISTEMA);
        await query("UPDATE cobros_online SET estado='pagado', pago_id=$2, forma_pago=$3, pagado_en=now(), ultimo_error=NULL, actualizado_en=now() WHERE id=$1", [x.id, pago.id, r.formaPago]);
        await auditoria.registrar({ clinicaId: x.clinica_id, usuarioId: null, usuarioNombre: 'Cobro online', accion: 'cobro_online_pagado', modulo: 'pagos', entidadId: x.id, detalle: { pagoId: pago.id, cuotaId: x.cuota_id, monto: Number(x.monto) } });
        const p = (await query('SELECT nombre, apellido FROM pacientes WHERE id=$1', [x.paciente_id])).rows[0] || {};
        await avisarClinica(x.clinica_id, `Pago online: ${p.nombre || ''} ${p.apellido || ''}`.trim(), `Gs. ${Number(x.monto).toLocaleString('es-PY')} pagados por la pasarela. Ya figura en su cuenta y en la caja.`, x.id);
      } catch (e) {
        // Lo más común: la cuota ya figuraba pagada. Hay plata recibida que hay que aplicar o devolver.
        await query("UPDATE cobros_online SET estado='revisar', ultimo_error=$2, actualizado_en=now() WHERE id=$1", [x.id, String(e.message).slice(0, 300)]);
        await avisarClinica(x.clinica_id, 'Un cobro online necesita revisión', `Se recibió un pago online pero no se pudo registrar: ${String(e.message).slice(0, 150)}. Revisalo en Finanzas → Cobro online.`, x.id);
      }
    } else if (r.cancelado) {
      await query("UPDATE cobros_online SET estado='cancelado', actualizado_en=now() WHERE id=$1 AND estado='creado'", [x.id]);
    } else if (new Date(x.vence_en) < new Date()) {
      await query("UPDATE cobros_online SET estado='vencido', actualizado_en=now() WHERE id=$1 AND estado='creado'", [x.id]);
    }
    return (await query('SELECT * FROM cobros_online WHERE id=$1', [x.id])).rows[0];
  });
}

/* ---------------------------------------------------------------- aviso de la pasarela */
async function procesarAviso(cuerpo) {
  if (!proveedor.configurado()) throw new ApiError(404, 'No disponible');
  const hash = proveedor.leerAviso(cuerpo);
  if (!hash) throw new ApiError(401, 'Firma inválida');
  const x = (await query('SELECT id FROM cobros_online WHERE hash_proveedor=$1', [hash])).rows[0];
  if (!x) return { ok: true, ignorado: true }; // pedido que no es de DOVA: se responde 200 para que no reintente
  try { await confirmar(x.id); } catch (e) { console.error('[cobro-online] no se pudo confirmar:', e.message); throw new ApiError(503, 'Reintentá más tarde'); }
  return { ok: true };
}

/* ---------------------------------------------------------------- panel de la clínica */
async function listar(clinicaId) {
  const r = await query(`SELECT o.id, o.estado, o.monto, o.forma_pago, o.creado_en, o.pagado_en, o.vence_en, o.ultimo_error, o.pago_id,
        pa.nombre || ' ' || pa.apellido AS paciente, c.numero AS cuota_numero, pp.cantidad_cuotas
      FROM cobros_online o JOIN pacientes pa ON pa.id=o.paciente_id JOIN cuotas c ON c.id=o.cuota_id JOIN planes_pago pp ON pp.id=c.plan_pago_id
     WHERE o.clinica_id=$1 ORDER BY (o.estado='revisar') DESC, o.creado_en DESC LIMIT 100`, [clinicaId]);
  return r.rows.map((o) => ({ id: o.id, estado: o.estado, monto: Number(o.monto), formaPago: o.forma_pago, creado: o.creado_en, pagado: o.pagado_en, vence: o.vence_en, error: o.ultimo_error, pagoId: o.pago_id, paciente: o.paciente, cuota: `${o.cuota_numero}/${o.cantidad_cuotas}` }));
}

async function reconsultar(clinicaId, id, actor) {
  const x = (await query('SELECT id, estado FROM cobros_online WHERE id=$1 AND clinica_id=$2', [Number(id), clinicaId])).rows[0];
  if (!x) throw new ApiError(404, 'Cobro no encontrado');
  if (!proveedor.configurado()) throw new ApiError(409, 'La pasarela de pago no está conectada en el servidor.');
  let r;
  try { r = await confirmar(x.id); } catch (e) { throw new ApiError(502, e.message); }
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'reconsultar_cobro_online', modulo: 'finanzas', entidadId: x.id, detalle: { estado: r.estado } });
  return { id: r.id, estado: r.estado };
}

module.exports = { estado, disponible, activar, iniciarConEnlace, confirmar, procesarAviso, listar, reconsultar };
