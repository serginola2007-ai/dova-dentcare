/* Facturación de DOVA — comprobantes internos.

   Reglas de diseño (ver migración 0023):
   - Pago ≠ Factura ≠ Movimiento de caja. La factura se VINCULA a pagos ya
     registrados (factura_pagos); la caja se alcanza a través del pago. Emitir
     una factura nunca crea otro ingreso de caja. Si al facturar se cobra en
     el momento, se registra UN pago con el módulo de pagos (que ya refleja
     la caja una vez) y se vincula.
   - Número, totales, IVA, estado y usuario se calculan en el servidor. Lo
     que manda el navegador para esos campos se ignora.
   - La numeración sale de la base (fila de serie bloqueada dentro de una
     transacción) + índice único como última defensa: no hay duplicados ni
     aunque dos personas emitan a la vez.
   - Nada se borra: una factura se anula (queda registrada con motivo,
     usuario y fecha) y el pago queda libre para facturarse de nuevo.
   - DOVA NO emite facturas fiscales. es_fiscal = false siempre; el timbrado
     se guarda solo para una futura integración. */
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const { hoyIso } = require('../../utils/recurso');

const METODOS_DEFECTO = [
  { codigo: 'efectivo', nombre: 'Efectivo', activo: true },
  { codigo: 'transferencia', nombre: 'Transferencia', activo: true },
  { codigo: 'tarjeta_debito', nombre: 'Tarjeta de débito', activo: true },
  { codigo: 'tarjeta_credito', nombre: 'Tarjeta de crédito', activo: true },
  { codigo: 'tarjeta', nombre: 'Tarjeta', activo: true },
  { codigo: 'qr', nombre: 'QR', activo: true },
  { codigo: 'otro', nombre: 'Otro', activo: true },
];
const TIPOS = { comprobante_interno: 'Comprobante interno', nota_credito_interna: 'Nota de crédito interna' };
const redondear = (n) => Math.round(Number(n) || 0); // Guaraníes: sin decimales
const txt = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// ------------------------------------------------------------------ alcance
/* Quién ve qué: con facturacion.ver, todo; con facturacion.ver_propias (odontólogo),
   solo las facturas donde figura o de pacientes que atiende. */
function alcance(usuario) {
  const p = usuario.permisos || [];
  if (p.includes('facturacion.ver')) return { todas: true };
  if (p.includes('facturacion.ver_propias')) {
    if (!usuario.odontologoId) throw new ApiError(403, 'Tu usuario no está vinculado a un odontólogo: no hay facturas para mostrarte.');
    return { todas: false, odontologoId: Number(usuario.odontologoId) };
  }
  throw new ApiError(403, 'No tenés permiso para ver facturas.');
}
function condAlcance(a, params, alias = 'f') {
  if (a.todas) return '';
  params.push(a.odontologoId);
  const i = params.length;
  return ` AND (${alias}.odontologo_id = $${i} OR ${alias}.paciente_id IN (
      SELECT paciente_id FROM turnos WHERE odontologo_id = $${i}
      UNION SELECT paciente_id FROM planes_tratamiento WHERE odontologo_id = $${i}
      UNION SELECT id FROM pacientes WHERE odontologo_principal_id = $${i}))`;
}

// ------------------------------------------------------------ configuración
async function asegurarConfig(clinicaId) {
  await query(
    `INSERT INTO facturacion_config (clinica_id, nombre_comercial, ruc, direccion, telefono, email)
     SELECT id, nombre, ruc, direccion, telefono, email FROM clinicas WHERE id=$1
     ON CONFLICT (clinica_id) DO NOTHING`, [clinicaId]);
}
async function obtenerConfig(clinicaId) {
  await asegurarConfig(clinicaId);
  const r = await query(
    `SELECT c.clinica_id, c.nombre_comercial, c.razon_social, c.ruc, c.direccion, c.telefono, c.email,
            (c.logo IS NOT NULL) AS tiene_logo, c.logo_mime, c.timbrado, c.timbrado_vence, c.establecimiento,
            c.punto_expedicion, c.iva_por_defecto, c.metodos_pago, c.pie_texto, c.actualizado_en,
            c.facturar_al_cobrar, c.imprimir_al_facturar, c.formato_impresion,
            u.nombre AS actualizado_por_nombre
       FROM facturacion_config c LEFT JOIN usuarios u ON u.id = c.actualizado_por
      WHERE c.clinica_id=$1`, [clinicaId]);
  const cfg = r.rows[0];
  const serie = await serieActiva(clinicaId, 'comprobante_interno', cfg);
  const max = await query('SELECT COALESCE(MAX(numero),0) AS n FROM facturas WHERE serie_id=$1', [serie.id]);
  return {
    ...cfg,
    modo: 'interno', // DOVA todavía no está integrado con un sistema fiscal
    serie: { id: serie.id, establecimiento: serie.establecimiento, punto_expedicion: serie.punto_expedicion, siguiente_numero: serie.siguiente_numero, ultimo_usado: Number(max.rows[0].n) },
    proximo_numero: formatearNumero(serie, serie.siguiente_numero),
  };
}

async function metodosPago(clinicaId, { incluirInactivos = false } = {}) {
  const r = await query('SELECT metodos_pago FROM facturacion_config WHERE clinica_id=$1', [clinicaId]);
  const l = r.rowCount ? r.rows[0].metodos_pago : METODOS_DEFECTO;
  return (Array.isArray(l) ? l : METODOS_DEFECTO).filter((m) => incluirInactivos || m.activo !== false);
}

function validarMetodos(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new ApiError(400, 'Tiene que haber al menos un método de pago');
  const vistos = new Set();
  const out = lista.map((m) => {
    const codigo = String(m.codigo || '').trim().toLowerCase();
    const nombre = txt(m.nombre, 40);
    if (!/^[a-z0-9_]{2,30}$/.test(codigo)) throw new ApiError(400, `Código de método de pago inválido: "${m.codigo}" (solo letras minúsculas, números y _)`);
    if (!nombre) throw new ApiError(400, `Falta el nombre del método "${codigo}"`);
    if (vistos.has(codigo)) throw new ApiError(400, `Método de pago repetido: ${codigo}`);
    vistos.add(codigo);
    return { codigo, nombre, activo: m.activo !== false };
  });
  if (!out.some((m) => m.activo)) throw new ApiError(400, 'Dejá al menos un método de pago activo');
  if (!out.some((m) => m.codigo === 'efectivo')) throw new ApiError(400, 'El método "efectivo" no se puede quitar (la caja lo necesita); podés desactivarlo si no lo usan.');
  return out;
}

const CAMPOS_CONFIG = {
  nombreComercial: ['nombre_comercial', 150], razonSocial: ['razon_social', 200], ruc: ['ruc', 40], direccion: ['direccion', 300],
  telefono: ['telefono', 60], email: ['email', 150], timbrado: ['timbrado', 20], pieTexto: ['pie_texto', 500],
};
async function guardarConfig(clinicaId, datos, usuario) {
  const previo = await obtenerConfig(clinicaId);
  const sets = []; const params = [clinicaId];
  const cambios = {};
  for (const [k, [col, max]] of Object.entries(CAMPOS_CONFIG)) {
    if (datos[k] === undefined) continue;
    const v = txt(datos[k], max);
    if (col === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ApiError(400, 'El email no es válido');
    if (col === 'ruc' && v && !/^[0-9A-Za-z.-]{3,20}$/.test(v)) throw new ApiError(400, 'El RUC no es válido (ej.: 80012345-6)');
    if ((previo[col] || null) !== v) cambios[col] = { antes: previo[col] || null, despues: v };
    params.push(v); sets.push(`${col}=$${params.length}`);
  }
  if (datos.timbradoVence !== undefined) {
    const v = datos.timbradoVence ? String(datos.timbradoVence).slice(0, 10) : null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(400, 'Fecha de vencimiento del timbrado inválida');
    if (String(previo.timbrado_vence || '') !== String(v || '')) cambios.timbrado_vence = { antes: previo.timbrado_vence, despues: v };
    params.push(v); sets.push(`timbrado_vence=$${params.length}`);
  }
  if (datos.ivaPorDefecto !== undefined) {
    const v = Number(datos.ivaPorDefecto);
    if (![0, 5, 10].includes(v)) throw new ApiError(400, 'IVA por defecto: 10, 5 o 0 (exento)');
    if (v !== previo.iva_por_defecto) cambios.iva_por_defecto = { antes: previo.iva_por_defecto, despues: v };
    params.push(v); sets.push(`iva_por_defecto=$${params.length}`);
  }
  for (const [k, col] of [['facturarAlCobrar', 'facturar_al_cobrar'], ['imprimirAlFacturar', 'imprimir_al_facturar']]) {
    if (datos[k] === undefined) continue;
    const v = datos[k] === true || datos[k] === 'true';
    if (v !== previo[col]) cambios[col] = { antes: previo[col], despues: v };
    params.push(v); sets.push(`${col}=$${params.length}`);
  }
  if (datos.formatoImpresion !== undefined) {
    if (!['a4', 'ticket'].includes(datos.formatoImpresion)) throw new ApiError(400, 'Formato de impresión: a4 o ticket');
    if (datos.formatoImpresion !== previo.formato_impresion) cambios.formato_impresion = { antes: previo.formato_impresion, despues: datos.formatoImpresion };
    params.push(datos.formatoImpresion); sets.push(`formato_impresion=$${params.length}`);
  }
  if (datos.metodosPago !== undefined) {
    const v = validarMetodos(datos.metodosPago);
    cambios.metodos_pago = { antes: previo.metodos_pago, despues: v };
    params.push(JSON.stringify(v)); sets.push(`metodos_pago=$${params.length}::jsonb`);
  }
  if (!sets.length) return obtenerConfig(clinicaId);
  params.push(usuario.id);
  await query(`UPDATE facturacion_config SET ${sets.join(', ')}, actualizado_en=now(), actualizado_por=$${params.length} WHERE clinica_id=$1`, params);
  const fiscales = ['razon_social', 'ruc', 'timbrado', 'timbrado_vence', 'nombre_comercial'].filter((c) => cambios[c]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: fiscales.length ? 'cambiar_datos_fiscales' : 'configurar_facturacion', modulo: 'facturacion', entidadId: 'config', detalle: { cambios } });
  return obtenerConfig(clinicaId);
}

async function guardarLogo(clinicaId, archivo, usuario) {
  if (!archivo) throw new ApiError(400, 'Elegí una imagen');
  // Se valida el contenido real (no lo que dice el navegador): un archivo
  // disfrazado de imagen rompería la impresión de todas las facturas.
  const mime = require('../../utils/upload').tipoReal(archivo.buffer);
  if (!['image/png', 'image/jpeg'].includes(mime)) throw new ApiError(400, 'El logo tiene que ser PNG o JPG');
  if (archivo.size > 500 * 1024) throw new ApiError(400, 'El logo no puede pesar más de 500 KB');
  await asegurarConfig(clinicaId);
  await query('UPDATE facturacion_config SET logo=$2, logo_mime=$3, actualizado_en=now(), actualizado_por=$4 WHERE clinica_id=$1', [clinicaId, archivo.buffer, mime, usuario.id]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'cambiar_logo_facturacion', modulo: 'facturacion', entidadId: 'config', detalle: { bytes: archivo.size } });
  return { ok: true };
}
async function quitarLogo(clinicaId, usuario) {
  await query('UPDATE facturacion_config SET logo=NULL, logo_mime=NULL, actualizado_en=now(), actualizado_por=$2 WHERE clinica_id=$1', [clinicaId, usuario.id]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'quitar_logo_facturacion', modulo: 'facturacion', entidadId: 'config' });
  return { ok: true };
}
async function obtenerLogo(clinicaId) {
  const r = await query('SELECT logo, logo_mime FROM facturacion_config WHERE clinica_id=$1 AND logo IS NOT NULL', [clinicaId]);
  return r.rows[0] || null;
}

// --------------------------------------------------------------- numeración
function formatearNumero(serie, n) {
  return `${serie.establecimiento}-${serie.punto_expedicion}-${String(n).padStart(7, '0')}`;
}
async function serieActiva(clinicaId, tipo, cfg) {
  const c = cfg || (await query('SELECT establecimiento, punto_expedicion FROM facturacion_config WHERE clinica_id=$1', [clinicaId])).rows[0] || { establecimiento: '001', punto_expedicion: '001' };
  await query(
    `INSERT INTO facturacion_series (clinica_id, tipo, establecimiento, punto_expedicion) VALUES ($1,$2,$3,$4)
     ON CONFLICT (clinica_id, tipo, establecimiento, punto_expedicion) DO NOTHING`,
    [clinicaId, tipo, c.establecimiento, c.punto_expedicion]);
  const r = await query('SELECT * FROM facturacion_series WHERE clinica_id=$1 AND tipo=$2 AND establecimiento=$3 AND punto_expedicion=$4', [clinicaId, tipo, c.establecimiento, c.punto_expedicion]);
  return r.rows[0];
}
/* Toma el próximo número de la serie. La fila de la serie queda bloqueada
   hasta que termina la transacción: dos facturas simultáneas no pueden
   recibir el mismo número. */
async function tomarNumero(serieId) {
  const r = await query('UPDATE facturacion_series SET siguiente_numero = siguiente_numero + 1 WHERE id=$1 RETURNING siguiente_numero - 1 AS numero, establecimiento, punto_expedicion', [serieId]);
  return r.rows[0];
}

/* Cambiar serie (establecimiento / punto de expedición) o el próximo número.
   El próximo número nunca puede quedar en uno ya usado. */
async function cambiarNumeracion(clinicaId, datos, usuario) {
  const est = String(datos.establecimiento || '').padStart(3, '0');
  const pto = String(datos.puntoExpedicion || '').padStart(3, '0');
  if (!/^\d{3}$/.test(est) || !/^\d{3}$/.test(pto) || est === '000' || pto === '000') throw new ApiError(400, 'Establecimiento y punto de expedición: 3 números, ej. 001');
  return conCandado(`factura:serie:${clinicaId}`, async () => {
    const previo = await query('SELECT establecimiento, punto_expedicion FROM facturacion_config WHERE clinica_id=$1', [clinicaId]);
    await query('UPDATE facturacion_config SET establecimiento=$2, punto_expedicion=$3, actualizado_en=now(), actualizado_por=$4 WHERE clinica_id=$1', [clinicaId, est, pto, usuario.id]);
    const serie = await serieActiva(clinicaId, 'comprobante_interno', { establecimiento: est, punto_expedicion: pto });
    await serieActiva(clinicaId, 'nota_credito_interna', { establecimiento: est, punto_expedicion: pto });
    const max = Number((await query('SELECT COALESCE(MAX(numero),0) n FROM facturas WHERE serie_id=$1', [serie.id])).rows[0].n);
    let siguiente = serie.siguiente_numero;
    if (datos.siguienteNumero !== undefined && datos.siguienteNumero !== null && datos.siguienteNumero !== '') {
      const n = Number(datos.siguienteNumero);
      if (!Number.isInteger(n) || n < 1 || n > 9999999) throw new ApiError(400, 'El próximo número tiene que ser un entero entre 1 y 9.999.999');
      if (n <= max) throw new ApiError(409, `El número ${n} ya se usó en esta serie: el próximo tiene que ser ${max + 1} o mayor.`);
      siguiente = n;
      await query('UPDATE facturacion_series SET siguiente_numero=$2 WHERE id=$1', [serie.id, n]);
    }
    await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'cambiar_numeracion', modulo: 'facturacion', entidadId: serie.id,
      detalle: { antes: previo.rows[0], despues: { establecimiento: est, punto_expedicion: pto, siguiente_numero: siguiente } } });
    return obtenerConfig(clinicaId);
  });
}

// ------------------------------------------------------------------ cálculo
/* Calcula cada ítem y los totales en el servidor. Precios con IVA incluido
   (como se cobra en Paraguay): IVA 10% = monto/11, IVA 5% = monto/21. */
async function calcularItems(clinicaId, items, ivaDefecto) {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'La factura tiene que tener al menos un concepto');
  if (items.length > 100) throw new ApiError(400, 'Demasiados conceptos en una sola factura (máximo 100)');
  const out = [];
  let bruto = 0; let desc = 0; let total = 0; let exento = 0; let g5 = 0; let g10 = 0; let iva5 = 0; let iva10 = 0;
  for (const [i, it] of items.entries()) {
    const descripcion = txt(it.descripcion, 250);
    const cantidad = Number(it.cantidad);
    const precio = redondear(it.precioUnitario);
    const descuento = redondear(it.descuento || 0);
    const tasa = it.tasaIva === undefined || it.tasaIva === null || it.tasaIva === '' ? ivaDefecto : Number(it.tasaIva);
    let tratamientoId = it.tratamientoId ? Number(it.tratamientoId) : null;
    if (!descripcion) throw new ApiError(400, `Concepto ${i + 1}: falta la descripción`);
    if (!(cantidad > 0) || cantidad > 1000 || Math.round(cantidad * 100) !== cantidad * 100) throw new ApiError(400, `Concepto ${i + 1}: cantidad inválida`);
    if (!(precio >= 0) || precio > 1e11) throw new ApiError(400, `Concepto ${i + 1}: precio inválido`);
    if (![0, 5, 10].includes(tasa)) throw new ApiError(400, `Concepto ${i + 1}: IVA tiene que ser 10, 5 o 0 (exento)`);
    const linea = redondear(cantidad * precio);
    if (descuento < 0 || descuento > linea) throw new ApiError(400, `Concepto ${i + 1}: el descuento no puede ser mayor al importe`);
    if (tratamientoId) {
      const t = await query('SELECT id FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, tratamientoId]);
      if (!t.rowCount) throw new ApiError(400, `Concepto ${i + 1}: el tratamiento no existe en esta clínica`);
    } else tratamientoId = null;
    const subtotal = linea - descuento;
    const iva = tasa === 10 ? redondear(subtotal / 11) : tasa === 5 ? redondear(subtotal / 21) : 0;
    bruto += linea; desc += descuento; total += subtotal;
    if (tasa === 10) { g10 += subtotal; iva10 += iva; } else if (tasa === 5) { g5 += subtotal; iva5 += iva; } else exento += subtotal;
    out.push({ orden: i + 1, descripcion, pieza: txt(it.pieza, 10), cantidad, precioUnitario: precio, descuento, tasaIva: tasa, subtotal, iva, tratamientoId, presupuestoItemId: it.presupuestoItemId ? Number(it.presupuestoItemId) : null });
  }
  if (total <= 0) throw new ApiError(400, 'El total de la factura tiene que ser mayor a cero');
  return { items: out, totales: { subtotal: bruto, descuentoTotal: desc, total, exento, gravado5: g5, gravado10: g10, iva5, iva10 } };
}

// ------------------------------------------------------------------- estado
// Lo cobrado de una factura: cobros de pacientes + el ingreso de caja que la originó (si lo hay).
const SQL_COBRADO = `((SELECT COALESCE(SUM(fp.monto),0) FROM factura_pagos fp JOIN pagos p ON p.id=fp.pago_id WHERE fp.factura_id=f.id AND fp.activo AND p.estado='pagado')
  + COALESCE((SELECT cm.monto FROM caja_movimientos cm WHERE cm.id=f.caja_movimiento_id),0))`;
async function recalcularEstado(facturaId, usuario, motivo) {
  const f = (await query('SELECT id, estado, total FROM facturas WHERE id=$1', [facturaId])).rows[0];
  if (!f || f.estado === 'anulada') return f;
  const s = (await query(
    `SELECT ${SQL_COBRADO} AS cobrado,
            (SELECT COALESCE(SUM(monto),0) FROM notas_credito WHERE factura_id=$1 AND estado='emitida') AS acreditado
       FROM facturas f WHERE f.id=$1`, [facturaId])).rows[0];
  const nuevo = Number(s.cobrado) + Number(s.acreditado) >= Number(f.total) ? 'pagada' : 'pendiente';
  if (nuevo !== f.estado) {
    await query('UPDATE facturas SET estado=$2, actualizado_en=now() WHERE id=$1', [facturaId, nuevo]);
    await evento(facturaId, 'estado', { de: f.estado, a: nuevo, motivo }, usuario);
  }
  return { ...f, estado: nuevo };
}
async function evento(facturaId, tipo, detalle, usuario) {
  await query('INSERT INTO factura_eventos (factura_id, tipo, detalle, usuario_id, usuario_nombre) VALUES ($1,$2,$3,$4,$5)',
    [facturaId, tipo, detalle ? JSON.stringify(detalle) : null, usuario ? usuario.id : null, usuario ? usuario.nombre : 'sistema']);
}

// Pagos del paciente que se pueden vincular (vigentes y sin factura).
async function validarPagos(clinicaId, pacienteId, pagoIds) {
  const ids = [...new Set((pagoIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const r = await query(
    `SELECT p.*, f.numero_completo AS factura_numero FROM pagos p
       LEFT JOIN factura_pagos fp ON fp.pago_id=p.id AND fp.activo
       LEFT JOIN facturas f ON f.id=fp.factura_id
      WHERE p.clinica_id=$1 AND p.id = ANY($2::int[])`, [clinicaId, ids]);
  if (r.rowCount !== ids.length) throw new ApiError(404, 'Alguno de los cobros no existe');
  for (const p of r.rows) {
    if (p.paciente_id !== Number(pacienteId)) throw new ApiError(400, `El cobro #${p.id} es de otro paciente`);
    if (p.estado !== 'pagado') throw new ApiError(409, `El cobro #${p.id} está anulado`);
    if (p.factura_numero) throw new ApiError(409, `Este cobro ya tiene la factura ${p.factura_numero}. Para volver a facturarlo, anulá esa factura primero.`);
  }
  return r.rows;
}

async function notificarResponsables(clinicaId, excluirUsuarioId, datos) {
  try {
    const noti = require('../notificaciones/notificaciones.service');
    const authRepo = require('../auth/auth.repository');
    const us = await query('SELECT id, rol_id FROM usuarios WHERE clinica_id=$1 AND activo', [clinicaId]);
    for (const u of us.rows) {
      if (u.id === excluirUsuarioId) continue;
      const permisos = await authRepo.getPermisosEfectivos(u.id, u.rol_id);
      if (permisos.includes('facturacion.anular') || permisos.includes('facturacion.configurar')) await noti.notificar(clinicaId, u.id, datos);
    }
  } catch (e) { console.error('[facturacion] no se pudo notificar:', e.message); }
}

// ------------------------------------------------------------------- crear
async function crear(clinicaId, datos, usuario, { movimiento = null } = {}) {
  // movimiento: ingreso manual de caja (puede no tener paciente). Solo lo usa facturarMovimiento().
  const pacienteId = datos.pacienteId ? Number(datos.pacienteId) : null;
  const pac = pacienteId ? (await query('SELECT * FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId])).rows[0] : null;
  if (!pac && !movimiento) throw new ApiError(404, 'Paciente no encontrado');
  const cfg = await obtenerConfig(clinicaId);
  const metodos = (cfg.metodos_pago || METODOS_DEFECTO).filter((m) => m.activo !== false).map((m) => m.codigo);

  const fecha = datos.fecha ? String(datos.fecha).slice(0, 10) : hoyIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new ApiError(400, 'Fecha inválida');
  if (fecha > hoyIso()) throw new ApiError(400, 'La factura no puede tener fecha futura');
  const { verificarBloqueoContable } = require('../finanzas-ext/cuentas.service');
  await verificarBloqueoContable(clinicaId, fecha);

  const condicion = datos.condicion === 'credito' ? 'credito' : 'contado';
  const metodo = txt(datos.metodoPago, 30);
  if (metodo && !metodos.includes(metodo) && !(movimiento && metodo === movimiento.metodo)) throw new ApiError(400, 'Método de pago inválido');
  if (condicion === 'contado' && !metodo) throw new ApiError(400, 'Indicá el método de pago');

  let odontologoId = datos.odontologoId ? Number(datos.odontologoId) : null;
  if (odontologoId && !(await query('SELECT 1 FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, odontologoId])).rowCount) throw new ApiError(400, 'Odontólogo inválido');
  let presupuestoId = datos.presupuestoId ? Number(datos.presupuestoId) : null;
  if (presupuestoId) {
    const pr = (await query('SELECT id, odontologo_id FROM presupuestos WHERE clinica_id=$1 AND id=$2 AND paciente_id=$3', [clinicaId, presupuestoId, pacienteId])).rows[0];
    if (!pr) throw new ApiError(400, 'El presupuesto no es de este paciente');
    if (!odontologoId && pr.odontologo_id) odontologoId = pr.odontologo_id;
  }
  const calc = await calcularItems(clinicaId, datos.items, cfg.iva_por_defecto);
  // Ítems de presupuesto: tienen que ser de ese presupuesto.
  for (const it of calc.items) {
    if (!it.presupuestoItemId) continue;
    const ok = presupuestoId && (await query('SELECT 1 FROM presupuesto_items WHERE id=$1 AND presupuesto_id=$2', [it.presupuestoItemId, presupuestoId])).rowCount;
    if (!ok) it.presupuestoItemId = null;
  }

  // Cliente: lo que se imprime. Por defecto, los datos de la ficha.
  const P = pac || {};
  const cliente = {
    nombre: txt(datos.clienteNombre, 200) || txt(P.razon_social, 200) || (pac ? `${pac.nombre} ${pac.apellido}` : 'Consumidor final'),
    documento: txt(datos.clienteDocumento, 40) ?? P.ci ?? null,
    ruc: txt(datos.clienteRuc, 40) ?? P.ruc ?? null,
    direccion: txt(datos.clienteDireccion, 300) ?? P.direccion ?? null,
    telefono: txt(datos.clienteTelefono, 60) ?? P.telefono ?? null,
    email: txt(datos.clienteEmail, 150) ?? P.email ?? null,
  };
  if (cliente.ruc && !/^[0-9A-Za-z.-]{3,20}$/.test(cliente.ruc)) throw new ApiError(400, 'El RUC del cliente no es válido (ej.: 4567890-1)');
  if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) throw new ApiError(400, 'El email del cliente no es válido');

  const pagoIds = !movimiento && Array.isArray(datos.pagoIds) ? datos.pagoIds : [];
  const registrarCobro = !movimiento && datos.registrarCobro && Number(datos.registrarCobro.monto) > 0 ? datos.registrarCobro : null;
  if (registrarCobro && !metodos.includes(registrarCobro.metodo || metodo)) throw new ApiError(400, 'Método del cobro inválido');

  const serie = await serieActiva(clinicaId, 'comprobante_interno');
  const claves = [`factura:serie:${clinicaId}`, ...pagoIds.map((id) => `factura:pago:${Number(id)}`), ...(movimiento ? [`factura:mov:${movimiento.id}`] : [])];

  const factura = await conCandado(claves, async () => {
    const pagos = await validarPagos(clinicaId, pacienteId, pagoIds);
    if (movimiento && (await query("SELECT 1 FROM facturas WHERE caja_movimiento_id=$1 AND estado<>'anulada'", [movimiento.id])).rowCount) throw new ApiError(409, 'Este ingreso ya tiene factura.');
    // Cobro en el momento: UN pago por el módulo de pagos (refleja la caja una sola vez).
    if (registrarCobro) {
      const pagosService = require('../pagos/pagos.service');
      const nuevo = await pagosService.crear(clinicaId, {
        pacienteId, monto: redondear(registrarCobro.monto), metodo: registrarCobro.metodo || metodo,
        concepto: txt(registrarCobro.concepto, 200) || `Cobro de factura (${calc.items[0].descripcion})`.slice(0, 200), presupuestoId: presupuestoId || undefined,
      }, usuario);
      pagos.push(nuevo);
    }
    const cobrado = pagos.reduce((a, p) => a + Number(p.monto), 0) + (movimiento ? Number(movimiento.monto) : 0);
    if (cobrado > calc.totales.total) throw new ApiError(400, `Los cobros asociados (Gs. ${cobrado.toLocaleString('es-PY')}) superan el total de la factura (Gs. ${calc.totales.total.toLocaleString('es-PY')}). Revisá los conceptos o los cobros elegidos.`);
    const num = await tomarNumero(serie.id);
    const numeroCompleto = formatearNumero(num, num.numero);
    const estado = cobrado >= calc.totales.total ? 'pagada' : 'pendiente';
    const t = calc.totales;
    const f = (await query(
      `INSERT INTO facturas (clinica_id, serie_id, tipo, es_fiscal, numero, numero_completo, fecha, condicion, paciente_id,
         cliente_nombre, cliente_documento, cliente_ruc, cliente_direccion, cliente_telefono, cliente_email,
         odontologo_id, presupuesto_id, metodo_pago, subtotal, descuento_total, exento, gravado_5, gravado_10, iva_5, iva_10, total,
         estado, observaciones, creado_por, caja_movimiento_id)
       VALUES ($1,$2,'comprobante_interno',false,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [clinicaId, serie.id, num.numero, numeroCompleto, fecha, condicion, pacienteId, cliente.nombre, cliente.documento, cliente.ruc, cliente.direccion,
        cliente.telefono, cliente.email, odontologoId, presupuestoId, metodo || (pagos[0] && pagos[0].metodo) || null,
        t.subtotal, t.descuentoTotal, t.exento, t.gravado5, t.gravado10, t.iva5, t.iva10, t.total, estado, txt(datos.observaciones, 1000), usuario.id, movimiento ? movimiento.id : null])).rows[0];
    for (const it of calc.items) {
      await query(
        `INSERT INTO factura_items (factura_id, orden, tratamiento_id, presupuesto_item_id, descripcion, pieza, cantidad, precio_unitario, descuento, tasa_iva, subtotal, iva)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [f.id, it.orden, it.tratamientoId, it.presupuestoItemId, it.descripcion, it.pieza, it.cantidad, it.precioUnitario, it.descuento, it.tasaIva, it.subtotal, it.iva]);
    }
    for (const p of pagos) {
      await query('INSERT INTO factura_pagos (factura_id, pago_id, monto, creado_por) VALUES ($1,$2,$3,$4)', [f.id, p.id, p.monto, usuario.id]);
    }
    await evento(f.id, 'creada', { numero: numeroCompleto, total: t.total, estado, pagos: pagos.map((p) => p.id), cobroRegistrado: !!registrarCobro, ingresoCaja: movimiento ? movimiento.id : undefined }, usuario);
    for (const p of pagos) await evento(f.id, 'pago_asociado', { pagoId: p.id, monto: Number(p.monto), metodo: p.metodo }, usuario);
    // Guardar RUC / razón social en la ficha si se pidió.
    if (datos.guardarEnFicha && pac) {
      await query('UPDATE pacientes SET ruc=$3, razon_social=$4, actualizado_en=now() WHERE clinica_id=$1 AND id=$2',
        [clinicaId, pacienteId, cliente.ruc, cliente.nombre !== `${pac.nombre} ${pac.apellido}` ? cliente.nombre : pac.razon_social]);
    }
    return f;
  });

  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'emitir_factura', modulo: 'facturacion', entidadId: factura.id,
    detalle: { numero: factura.numero_completo, pacienteId, ingresoCaja: movimiento ? movimiento.id : undefined, total: Number(factura.total), estado: factura.estado, pagos: pagoIds } });
  if (factura.estado === 'pendiente') {
    await notificarResponsables(clinicaId, usuario.id, { tipo: 'factura_pendiente', titulo: `Factura ${factura.numero_completo} pendiente de cobro`, mensaje: `${factura.cliente_nombre} — Gs. ${Number(factura.total).toLocaleString('es-PY')}`, entidad: 'factura', entidadId: factura.id, ruta: `facturacion/factura/${factura.id}` });
  }
  return obtener(clinicaId, factura.id, { todas: true });
}

// ---------------------------------------------------------- asociar un pago
async function asociarPago(clinicaId, facturaId, pagoId, usuario, a) {
  const f = await obtenerBase(clinicaId, facturaId, a);
  if (f.estado === 'anulada') throw new ApiError(409, 'La factura está anulada');
  if (!f.paciente_id) throw new ApiError(400, 'Esta factura es de un ingreso de caja sin paciente: no se le pueden asociar cobros.');
  await conCandado([`factura:pago:${Number(pagoId)}`, `factura:${facturaId}`], async () => {
    const [p] = await validarPagos(clinicaId, f.paciente_id, [pagoId]);
    const ya = (await query(`SELECT COALESCE(SUM(fp.monto),0) s FROM factura_pagos fp JOIN pagos p ON p.id=fp.pago_id WHERE fp.factura_id=$1 AND fp.activo AND p.estado='pagado'`, [facturaId])).rows[0].s;
    if (Number(ya) + Number(p.monto) > Number(f.total)) throw new ApiError(400, `Con este cobro se pasaría del total de la factura (quedan Gs. ${(Number(f.total) - Number(ya)).toLocaleString('es-PY')} por cobrar).`);
    await query('INSERT INTO factura_pagos (factura_id, pago_id, monto, creado_por) VALUES ($1,$2,$3,$4)', [facturaId, p.id, p.monto, usuario.id]);
    await evento(facturaId, 'pago_asociado', { pagoId: p.id, monto: Number(p.monto), metodo: p.metodo }, usuario);
    await recalcularEstado(facturaId, usuario, 'pago asociado');
  });
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'asociar_pago_factura', modulo: 'facturacion', entidadId: facturaId, detalle: { pagoId } });
  return obtener(clinicaId, facturaId, a);
}

// Un pago anulado deja la factura con saldo (vuelve a "pendiente").
async function alAnularPago(clinicaId, pagoId, usuario) {
  const r = await query('SELECT fp.factura_id FROM factura_pagos fp JOIN facturas f ON f.id=fp.factura_id WHERE fp.pago_id=$1 AND fp.activo AND f.clinica_id=$2', [pagoId, clinicaId]);
  for (const { factura_id: fid } of r.rows) {
    await evento(fid, 'pago_anulado', { pagoId }, usuario);
    const f = await recalcularEstado(fid, usuario, 'cobro anulado');
    if (f && f.estado === 'pendiente') {
      const num = (await query('SELECT numero_completo, cliente_nombre FROM facturas WHERE id=$1', [fid])).rows[0];
      await notificarResponsables(clinicaId, usuario.id, { tipo: 'factura_pendiente', titulo: `Se anuló un cobro de la factura ${num.numero_completo}`, mensaje: `${num.cliente_nombre}: la factura quedó pendiente de cobro.`, entidad: 'factura', entidadId: fid, ruta: `facturacion/factura/${fid}` });
    }
  }
}

// ------------------------------------------------------------------ editar
async function editar(clinicaId, id, datos, usuario, a) {
  const f = await obtenerBase(clinicaId, id, a);
  if (f.estado === 'anulada') throw new ApiError(409, 'Una factura anulada no se puede modificar');
  const permitidos = { clienteNombre: ['cliente_nombre', 200], clienteDocumento: ['cliente_documento', 40], clienteRuc: ['cliente_ruc', 40], clienteDireccion: ['cliente_direccion', 300], clienteTelefono: ['cliente_telefono', 60], clienteEmail: ['cliente_email', 150], observaciones: ['observaciones', 1000] };
  const sets = []; const params = [id]; const cambios = {};
  for (const [k, [col, max]] of Object.entries(permitidos)) {
    if (datos[k] === undefined) continue;
    const v = txt(datos[k], max);
    if (col === 'cliente_nombre' && !v) throw new ApiError(400, 'El nombre del cliente es obligatorio');
    if (col === 'cliente_ruc' && v && !/^[0-9A-Za-z.-]{3,20}$/.test(v)) throw new ApiError(400, 'El RUC no es válido');
    if (col === 'cliente_email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ApiError(400, 'El email no es válido');
    if ((f[col] || null) !== v) { cambios[col] = { antes: f[col] || null, despues: v }; params.push(v); sets.push(`${col}=$${params.length}`); }
  }
  const noEditables = ['items', 'total', 'numero', 'fecha', 'estado', 'pacienteId', 'metodoPago'].filter((k) => datos[k] !== undefined);
  if (noEditables.length) throw new ApiError(400, 'Los conceptos, importes, número, fecha y estado no se pueden cambiar: anulá la factura y emití una nueva.');
  if (!sets.length) return obtener(clinicaId, id, a);
  await query(`UPDATE facturas SET ${sets.join(', ')}, actualizado_en=now() WHERE id=$1`, params);
  await evento(id, 'editada', { cambios }, usuario);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar_factura', modulo: 'facturacion', entidadId: id, detalle: { numero: f.numero_completo, cambios } });
  return obtener(clinicaId, id, a);
}

// ------------------------------------------------------------------ anular
async function anular(clinicaId, id, motivo, usuario, a) {
  const m = txt(motivo, 500);
  if (!m || m.length < 5) throw new ApiError(400, 'Escribí el motivo de la anulación (al menos 5 letras)');
  const f = await obtenerBase(clinicaId, id, a);
  if (f.estado === 'anulada') throw new ApiError(409, 'La factura ya estaba anulada');
  const { verificarBloqueoContable } = require('../finanzas-ext/cuentas.service');
  await verificarBloqueoContable(clinicaId, String(f.fecha).slice(0, 10));
  await conCandado(`factura:${id}`, async () => {
    const r = await query(`UPDATE facturas SET estado='anulada', anulada_en=now(), anulada_por=$3, motivo_anulacion=$4, actualizado_en=now()
                            WHERE id=$1 AND clinica_id=$2 AND estado<>'anulada' RETURNING id`, [id, clinicaId, usuario.id, m]);
    if (!r.rowCount) throw new ApiError(409, 'La factura ya estaba anulada');
    // Los cobros quedan libres para otra factura. Pagos y caja NO se tocan.
    const libres = await query('UPDATE factura_pagos SET activo=false WHERE factura_id=$1 AND activo RETURNING pago_id', [id]);
    await query("UPDATE notas_credito SET estado='anulada' WHERE factura_id=$1 AND estado='emitida'", [id]);
    await evento(id, 'anulada', { motivo: m, estadoAnterior: f.estado, pagosLiberados: libres.rows.map((x) => x.pago_id) }, usuario);
  });
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'anular_factura', modulo: 'facturacion', entidadId: id, detalle: { numero: f.numero_completo, motivo: m, total: Number(f.total) } });
  await notificarResponsables(clinicaId, usuario.id, { tipo: 'factura_anulada', titulo: `Factura ${f.numero_completo} anulada`, mensaje: `Por ${usuario.nombre}. Motivo: ${m}`, entidad: 'factura', entidadId: id, ruta: `facturacion/factura/${id}` });
  return obtener(clinicaId, id, a);
}

// ------------------------------------------------- nota de crédito interna
async function crearNotaCredito(clinicaId, id, datos, usuario, a) {
  const f = await obtenerBase(clinicaId, id, a);
  if (f.estado === 'anulada') throw new ApiError(409, 'La factura está anulada');
  const monto = redondear(datos.monto);
  const motivo = txt(datos.motivo, 500);
  if (!(monto > 0)) throw new ApiError(400, 'El monto tiene que ser mayor a cero');
  if (!motivo || motivo.length < 5) throw new ApiError(400, 'Escribí el motivo de la nota de crédito');
  const serie = await serieActiva(clinicaId, 'nota_credito_interna');
  const nc = await conCandado([`factura:${id}`, `nc:serie:${clinicaId}`], async () => {
    const ya = Number((await query("SELECT COALESCE(SUM(monto),0) s FROM notas_credito WHERE factura_id=$1 AND estado='emitida'", [id])).rows[0].s);
    if (ya + monto > Number(f.total)) throw new ApiError(400, `La nota de crédito no puede superar lo que queda de la factura (Gs. ${(Number(f.total) - ya).toLocaleString('es-PY')}).`);
    const num = await tomarNumero(serie.id);
    const numeroCompleto = formatearNumero(num, num.numero);
    const r = (await query('INSERT INTO notas_credito (clinica_id, factura_id, serie_id, numero, numero_completo, fecha, monto, motivo, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [clinicaId, id, serie.id, num.numero, numeroCompleto, hoyIso(), monto, motivo, usuario.id])).rows[0];
    await evento(id, 'nota_credito', { numero: numeroCompleto, monto, motivo }, usuario);
    await recalcularEstado(id, usuario, 'nota de crédito');
    return r;
  });
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'nota_credito_interna', modulo: 'facturacion', entidadId: id, detalle: { factura: f.numero_completo, nota: nc.numero_completo, monto, motivo } });
  return obtener(clinicaId, id, a);
}

// ---------------------------------------------------------------- consultar
async function obtenerBase(clinicaId, id, a) {
  const params = [clinicaId, Number(id)];
  const r = await query(`SELECT f.* FROM facturas f WHERE f.clinica_id=$1 AND f.id=$2${condAlcance(a, params)}`, params);
  if (!r.rowCount) throw new ApiError(404, 'Factura no encontrada');
  return r.rows[0];
}

async function obtener(clinicaId, id, a) {
  const f = await obtenerBase(clinicaId, id, a);
  const [items, pagos, eventos, notas, mov, extra] = await Promise.all([
    query(`SELECT fi.*, t.nombre AS tratamiento_nombre FROM factura_items fi LEFT JOIN tratamientos t ON t.id=fi.tratamiento_id WHERE fi.factura_id=$1 ORDER BY fi.orden, fi.id`, [f.id]),
    query(`SELECT fp.monto AS monto_aplicado, fp.activo, p.id, p.fecha, p.monto, p.metodo, p.estado, p.concepto, u.nombre AS usuario_nombre,
                  cm.id AS caja_movimiento_id, ca.id AS caja_id, ca.fecha AS caja_fecha, ca.estado AS caja_estado
             FROM factura_pagos fp JOIN pagos p ON p.id=fp.pago_id
             LEFT JOIN usuarios u ON u.id=p.usuario_id
             LEFT JOIN caja_movimientos cm ON cm.pago_id=p.id
             LEFT JOIN caja_aperturas ca ON ca.id=cm.caja_apertura_id
            WHERE fp.factura_id=$1 ORDER BY p.fecha`, [f.id]),
    query('SELECT * FROM factura_eventos WHERE factura_id=$1 ORDER BY creado_en, id', [f.id]),
    query('SELECT nc.*, u.nombre AS usuario_nombre FROM notas_credito nc LEFT JOIN usuarios u ON u.id=nc.creado_por WHERE nc.factura_id=$1 ORDER BY nc.id', [f.id]),
    f.caja_movimiento_id ? query(`SELECT cm.id, cm.monto, cm.metodo, cm.concepto, cm.creado_en, u.nombre AS usuario_nombre, ca.fecha AS caja_fecha, ca.estado AS caja_estado
             FROM caja_movimientos cm JOIN caja_aperturas ca ON ca.id=cm.caja_apertura_id LEFT JOIN usuarios u ON u.id=cm.usuario_id WHERE cm.id=$1`, [f.caja_movimiento_id]) : { rows: [] },
    query(`SELECT uc.nombre AS creado_por_nombre, ua.nombre AS anulada_por_nombre, o.nombre AS odontologo_nombre,
                  pr.id AS presupuesto_id, pr.total AS presupuesto_total, pr.estado AS presupuesto_estado, pr.fecha AS presupuesto_fecha
             FROM facturas f LEFT JOIN usuarios uc ON uc.id=f.creado_por LEFT JOIN usuarios ua ON ua.id=f.anulada_por
             LEFT JOIN odontologos o ON o.id=f.odontologo_id LEFT JOIN presupuestos pr ON pr.id=f.presupuesto_id WHERE f.id=$1`, [f.id]),
  ]);
  const movimiento = mov.rows[0] || null;
  const cobrado = pagos.rows.filter((p) => p.activo && p.estado === 'pagado').reduce((s, p) => s + Number(p.monto_aplicado), 0) + (movimiento ? Number(movimiento.monto) : 0);
  const acreditado = notas.rows.filter((n) => n.estado === 'emitida').reduce((s, n) => s + Number(n.monto), 0);
  return {
    ...f, ...extra.rows[0],
    tipo_nombre: TIPOS[f.tipo] || f.tipo,
    items: items.rows, pagos: pagos.rows, movimiento, eventos: eventos.rows, notas_credito: notas.rows,
    cobrado, acreditado, saldo: f.estado === 'anulada' ? 0 : Math.max(Number(f.total) - cobrado - acreditado, 0),
    presupuesto: f.presupuesto_id ? await resumenPresupuesto(clinicaId, f.presupuesto_id) : null,
  };
}

const ORDEN = { fecha: 'f.fecha', numero: 'f.numero', total: 'f.total', paciente: 'f.cliente_nombre', estado: 'f.estado' };
function filtrosSql(clinicaId, fl, a) {
  const params = [clinicaId]; const c = ['f.clinica_id=$1'];
  const fecha = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (fecha(fl.desde)) { params.push(fl.desde); c.push(`f.fecha >= $${params.length}`); }
  if (fecha(fl.hasta)) { params.push(fl.hasta); c.push(`f.fecha <= $${params.length}`); }
  if (fl.pacienteId) { params.push(Number(fl.pacienteId)); c.push(`f.paciente_id = $${params.length}`); }
  if (fl.estado && ['pagada', 'pendiente', 'anulada', 'emitida'].includes(fl.estado)) {
    if (fl.estado === 'emitida') c.push("f.estado <> 'anulada'"); else { params.push(fl.estado); c.push(`f.estado = $${params.length}`); }
  }
  if (fl.metodo) { params.push(String(fl.metodo)); c.push(`f.metodo_pago = $${params.length}`); }
  if (fl.odontologoId) { params.push(Number(fl.odontologoId)); c.push(`f.odontologo_id = $${params.length}`); }
  if (fl.usuarioId) { params.push(Number(fl.usuarioId)); c.push(`f.creado_por = $${params.length}`); }
  if (fl.presupuestoId) { params.push(Number(fl.presupuestoId)); c.push(`f.presupuesto_id = $${params.length}`); }
  if (fl.pagoId) { params.push(Number(fl.pagoId)); c.push(`f.id IN (SELECT factura_id FROM factura_pagos WHERE pago_id = $${params.length})`); }
  if (fl.q && String(fl.q).trim()) {
    params.push(`%${String(fl.q).trim().toLowerCase()}%`);
    const i = params.length;
    c.push(`(lower(f.numero_completo) LIKE $${i} OR lower(f.cliente_nombre) LIKE $${i} OR lower(COALESCE(f.cliente_documento,'')) LIKE $${i}
             OR lower(COALESCE(f.cliente_ruc,'')) LIKE $${i} OR EXISTS (SELECT 1 FROM factura_items fi WHERE fi.factura_id=f.id AND lower(fi.descripcion) LIKE $${i}))`);
  }
  const alc = condAlcance(a, params);
  return { where: c.join(' AND ') + alc, params };
}

async function listar(clinicaId, fl, a) {
  const { where, params } = filtrosSql(clinicaId, fl, a);
  const orden = ORDEN[fl.orden] || 'f.fecha';
  const dir = fl.dir === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(Math.max(Number(fl.pageSize) || 20, 5), 100);
  const page = Math.min(Math.max(Math.trunc(Number(fl.page)) || 1, 1), 100000);
  const total = Number((await query(`SELECT count(*) n FROM facturas f WHERE ${where}`, params)).rows[0].n);
  const r = await query(
    `SELECT f.id, f.numero_completo, f.fecha, f.paciente_id, f.cliente_nombre, f.cliente_documento, f.cliente_ruc, f.total, f.metodo_pago,
            f.estado, f.condicion, f.creado_en, f.odontologo_id, u.nombre AS usuario_nombre, o.nombre AS odontologo_nombre,
            (SELECT string_agg(fi.descripcion, ' · ' ORDER BY fi.orden) FROM factura_items fi WHERE fi.factura_id=f.id) AS concepto,
            ${SQL_COBRADO} AS cobrado
       FROM facturas f LEFT JOIN usuarios u ON u.id=f.creado_por LEFT JOIN odontologos o ON o.id=f.odontologo_id
      WHERE ${where} ORDER BY ${orden} ${dir}, f.id ${dir} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  return { items: r.rows, total, page, pageSize, paginas: Math.max(Math.ceil(total / pageSize), 1) };
}

// Resumen para el tablero: todo sale de la base (nada inventado).
async function estadisticas(clinicaId, a) {
  const hoy = hoyIso(); const mes = `${hoy.slice(0, 8)}01`;
  const params = [clinicaId]; const alc = condAlcance(a, params);
  params.push(hoy, mes);
  const iH = params.length - 1; const iM = params.length;
  const r = (await query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE estado<>'anulada' AND fecha = $${iH}),0) AS facturado_hoy,
       count(*) FILTER (WHERE estado<>'anulada' AND fecha = $${iH}) AS cantidad_hoy,
       COALESCE(SUM(total) FILTER (WHERE estado<>'anulada' AND fecha >= $${iM}),0) AS facturado_mes,
       count(*) FILTER (WHERE estado<>'anulada' AND fecha >= $${iM}) AS cantidad_mes,
       count(*) FILTER (WHERE estado<>'anulada') AS emitidas,
       count(*) FILTER (WHERE estado='pagada') AS pagadas,
       count(*) FILTER (WHERE estado='pendiente') AS pendientes,
       count(*) FILTER (WHERE estado='anulada') AS anuladas,
       COALESCE(SUM(total) FILTER (WHERE estado<>'anulada'),0) AS total_facturado
     FROM facturas f WHERE f.clinica_id=$1${alc}`, params)).rows[0];
  const p2 = [clinicaId]; const alc2 = condAlcance(a, p2);
  const cob = (await query(
    `SELECT COALESCE(SUM(fp.monto) FILTER (WHERE p.estado='pagado'),0)
              + (SELECT COALESCE(SUM(cm.monto),0) FROM facturas f JOIN caja_movimientos cm ON cm.id=f.caja_movimiento_id WHERE f.clinica_id=$1 AND f.estado<>'anulada'${alc2}) AS cobrado,
            (SELECT COALESCE(SUM(nc.monto),0) FROM notas_credito nc JOIN facturas f ON f.id=nc.factura_id WHERE nc.estado='emitida' AND f.clinica_id=$1 AND f.estado<>'anulada'${alc2}) AS acreditado
       FROM factura_pagos fp JOIN facturas f ON f.id=fp.factura_id JOIN pagos p ON p.id=fp.pago_id
      WHERE fp.activo AND f.estado<>'anulada' AND f.clinica_id=$1${alc2}`, p2)).rows[0];
  const p3 = [clinicaId]; const alc3 = condAlcance(a, p3); p3.push(mes);
  const serie = (await query(`SELECT fecha, SUM(total) AS total, count(*) AS cantidad FROM facturas f WHERE f.clinica_id=$1${alc3} AND estado<>'anulada' AND fecha >= $${p3.length} GROUP BY fecha ORDER BY fecha`, p3)).rows;
  const n = (x) => Number(x);
  return {
    facturadoHoy: n(r.facturado_hoy), cantidadHoy: n(r.cantidad_hoy), facturadoMes: n(r.facturado_mes), cantidadMes: n(r.cantidad_mes),
    emitidas: n(r.emitidas), pagadas: n(r.pagadas), pendientes: n(r.pendientes), anuladas: n(r.anuladas),
    totalFacturado: n(r.total_facturado), totalCobrado: n(cob.cobrado), totalAcreditado: n(cob.acreditado),
    totalPendiente: Math.max(n(r.total_facturado) - n(cob.cobrado) - n(cob.acreditado), 0),
    serieMes: serie.map((s) => ({ fecha: s.fecha, total: n(s.total), cantidad: n(s.cantidad) })),
  };
}

// Reportes por período y agrupación.
const AGRUPAR = {
  dia: { sel: "f.fecha::text", etiqueta: "to_char(f.fecha, 'DD/MM/YYYY')", orden: '1' },
  mes: { sel: "to_char(f.fecha, 'YYYY-MM')", etiqueta: "to_char(f.fecha, 'MM/YYYY')", orden: '1' },
  odontologo: { sel: "COALESCE(f.odontologo_id::text, '-')", etiqueta: "COALESCE(o.nombre, 'Sin odontólogo')", orden: 'total DESC' },
  paciente: { sel: 'f.paciente_id::text', etiqueta: 'f.cliente_nombre', orden: 'total DESC' },
  metodo: { sel: "COALESCE(f.metodo_pago, '-')", etiqueta: "COALESCE(f.metodo_pago, 'Sin indicar')", orden: 'total DESC' },
  estado: { sel: 'f.estado', etiqueta: 'f.estado', orden: 'total DESC' },
};
async function reporte(clinicaId, fl, a) {
  const agrupar = fl.agrupar || 'dia';
  const base = filtrosSql(clinicaId, { ...fl, estado: fl.estado || undefined }, a);
  let filas;
  if (agrupar === 'tratamiento') {
    filas = (await query(
      `SELECT COALESCE(fi.tratamiento_id::text, 'otros') AS clave, COALESCE(t.nombre, 'Otros conceptos') AS etiqueta,
              count(DISTINCT f.id) AS facturas, SUM(fi.subtotal) AS total, 0 AS cobrado
         FROM facturas f JOIN factura_items fi ON fi.factura_id=f.id LEFT JOIN tratamientos t ON t.id=fi.tratamiento_id
        WHERE ${base.where} AND f.estado<>'anulada' GROUP BY 1,2 ORDER BY total DESC`, base.params)).rows;
  } else {
    const g = AGRUPAR[agrupar];
    if (!g) throw new ApiError(400, 'Agrupación inválida');
    const soloVigentes = agrupar === 'estado' ? '' : " AND f.estado<>'anulada'";
    filas = (await query(
      `SELECT ${g.sel} AS clave, ${g.etiqueta} AS etiqueta, count(*) AS facturas, SUM(f.total) AS total,
              SUM(${SQL_COBRADO}) AS cobrado
         FROM facturas f LEFT JOIN odontologos o ON o.id=f.odontologo_id
        WHERE ${base.where}${soloVigentes} GROUP BY 1,2 ORDER BY ${g.orden}`, base.params)).rows;
  }
  const tot = (await query(
    `SELECT count(*) FILTER (WHERE f.estado<>'anulada') AS emitidas, COALESCE(SUM(f.total) FILTER (WHERE f.estado<>'anulada'),0) AS facturado,
            count(*) FILTER (WHERE f.estado='pendiente') AS pendientes, count(*) FILTER (WHERE f.estado='anulada') AS anuladas,
            COALESCE(SUM(f.total) FILTER (WHERE f.estado='anulada'),0) AS total_anulado,
            COALESCE(SUM(${SQL_COBRADO}) FILTER (WHERE f.estado<>'anulada'),0) AS cobrado,
            COALESCE(SUM((SELECT COALESCE(SUM(nc.monto),0) FROM notas_credito nc WHERE nc.factura_id=f.id AND nc.estado='emitida')) FILTER (WHERE f.estado<>'anulada'),0) AS acreditado
       FROM facturas f WHERE ${base.where}`, base.params)).rows[0];
  const n = (x) => Number(x);
  const metodos = await metodosPago(clinicaId, { incluirInactivos: true });
  const nombreMetodo = Object.fromEntries(metodos.map((m) => [m.codigo, m.nombre]));
  const ESTADOS = { pagada: 'Pagada', pendiente: 'Pendiente', anulada: 'Anulada' };
  return {
    agrupar, desde: fl.desde || null, hasta: fl.hasta || null,
    totales: { emitidas: n(tot.emitidas), facturado: n(tot.facturado), cobrado: n(tot.cobrado), acreditado: n(tot.acreditado), pendiente: Math.max(n(tot.facturado) - n(tot.cobrado) - n(tot.acreditado), 0), pendientes: n(tot.pendientes), anuladas: n(tot.anuladas), totalAnulado: n(tot.total_anulado) },
    filas: filas.map((f) => ({ clave: f.clave, etiqueta: agrupar === 'metodo' ? (nombreMetodo[f.etiqueta] || f.etiqueta) : agrupar === 'estado' ? (ESTADOS[f.etiqueta] || f.etiqueta) : f.etiqueta, facturas: n(f.facturas), total: n(f.total), cobrado: n(f.cobrado), pendiente: Math.max(n(f.total) - n(f.cobrado), 0) })),
  };
}

// Presupuesto: total, cobrado, facturado y facturas asociadas.
async function resumenPresupuesto(clinicaId, presupuestoId) {
  const pr = (await query('SELECT id, total, estado, paciente_id FROM presupuestos WHERE clinica_id=$1 AND id=$2', [clinicaId, presupuestoId])).rows[0];
  if (!pr) return null;
  const pag = (await query("SELECT COALESCE(SUM(monto),0) s FROM pagos WHERE clinica_id=$1 AND presupuesto_id=$2 AND estado='pagado'", [clinicaId, presupuestoId])).rows[0].s;
  const fs = (await query("SELECT id, numero_completo, fecha, total, estado FROM facturas WHERE clinica_id=$1 AND presupuesto_id=$2 ORDER BY id", [clinicaId, presupuestoId])).rows;
  const facturado = fs.filter((f) => f.estado !== 'anulada').reduce((s, f) => s + Number(f.total), 0);
  return { id: pr.id, total: Number(pr.total), estado: pr.estado, pagado: Number(pag), pendiente: Math.max(Number(pr.total) - Number(pag), 0), facturado, facturas: fs };
}

// Resumen del paciente para su ficha.
async function resumenPaciente(clinicaId, pacienteId, a) {
  const fl = await listar(clinicaId, { pacienteId, pageSize: 100 }, a);
  const vig = fl.items.filter((f) => f.estado !== 'anulada');
  const facturado = vig.reduce((s, f) => s + Number(f.total), 0);
  const cobrado = vig.reduce((s, f) => s + Number(f.cobrado), 0);
  const params = [clinicaId, Number(pacienteId)];
  const acred = Number((await query(`SELECT COALESCE(SUM(nc.monto),0) s FROM notas_credito nc JOIN facturas f ON f.id=nc.factura_id WHERE f.clinica_id=$1 AND f.paciente_id=$2 AND nc.estado='emitida' AND f.estado<>'anulada'${condAlcance(a, params)}`, params)).rows[0].s);
  return { facturas: fl.items, totalFacturado: facturado, totalPagado: cobrado, totalAcreditado: acred, totalPendiente: Math.max(facturado - cobrado - acred, 0), anuladas: fl.items.filter((f) => f.estado === 'anulada').length };
}

/* Borrador: los datos que DOVA ya conoce, para no cargar nada dos veces.
   Desde un cobro, un presupuesto o un paciente. */
async function borrador(clinicaId, { pagoId, presupuestoId, pacienteId }) {
  const cfg = await obtenerConfig(clinicaId);
  const out = { advertencias: [], items: [], pagoIds: [], pagosDisponibles: [], presupuestos: [], config: { ivaPorDefecto: cfg.iva_por_defecto, proximoNumero: cfg.proximo_numero, metodos: (cfg.metodos_pago || []).filter((m) => m.activo !== false) } };
  let pac = null; let pago = null; let pres = null;
  if (pagoId) {
    pago = (await query(`SELECT p.*, f.id AS factura_id, f.numero_completo AS factura_numero FROM pagos p LEFT JOIN factura_pagos fp ON fp.pago_id=p.id AND fp.activo LEFT JOIN facturas f ON f.id=fp.factura_id WHERE p.clinica_id=$1 AND p.id=$2`, [clinicaId, Number(pagoId)])).rows[0];
    if (!pago) throw new ApiError(404, 'Cobro no encontrado');
    if (pago.factura_id) { out.facturaExistente = { id: pago.factura_id, numero: pago.factura_numero }; out.advertencias.push(`Este cobro ya tiene la factura ${pago.factura_numero}.`); }
    if (pago.estado !== 'pagado') out.advertencias.push('Este cobro está anulado.');
    pacienteId = pago.paciente_id;
    if (!presupuestoId && pago.presupuesto_id) presupuestoId = pago.presupuesto_id;
  }
  if (!pacienteId && presupuestoId) {
    const r = (await query('SELECT paciente_id FROM presupuestos WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(presupuestoId)])).rows[0];
    if (!r) throw new ApiError(404, 'Presupuesto no encontrado');
    pacienteId = r.paciente_id;
  }
  if (!pacienteId) return out;
  pac = (await query('SELECT * FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(pacienteId)])).rows[0];
  if (!pac) throw new ApiError(404, 'Paciente no encontrado');
  out.paciente = { id: pac.id, nombre: `${pac.nombre} ${pac.apellido}` };
  out.cliente = { nombre: pac.razon_social || `${pac.nombre} ${pac.apellido}`, documento: pac.ci, ruc: pac.ruc, direccion: [pac.direccion, pac.ciudad].filter(Boolean).join(', ') || null, telefono: pac.telefono, email: pac.email };
  out.presupuestos = (await query("SELECT id, fecha, total, estado, odontologo_id FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('aceptado','enviado','borrador') ORDER BY id DESC LIMIT 20", [clinicaId, pac.id])).rows;
  out.pagosDisponibles = (await query(
    `SELECT p.id, p.fecha, p.monto, p.metodo, p.concepto, p.presupuesto_id FROM pagos p
      WHERE p.clinica_id=$1 AND p.paciente_id=$2 AND p.estado='pagado'
        AND NOT EXISTS (SELECT 1 FROM factura_pagos fp WHERE fp.pago_id=p.id AND fp.activo) ORDER BY p.fecha DESC LIMIT 50`, [clinicaId, pac.id])).rows;
  if (presupuestoId) {
    pres = (await query('SELECT * FROM presupuestos WHERE clinica_id=$1 AND id=$2 AND paciente_id=$3', [clinicaId, Number(presupuestoId), pac.id])).rows[0];
    if (pres) {
      out.presupuestoId = pres.id; out.odontologoId = pres.odontologo_id;
      out.presupuestoResumen = await resumenPresupuesto(clinicaId, pres.id);
      if (out.presupuestoResumen.facturado > 0) out.advertencias.push(`Este presupuesto ya tiene facturas por Gs. ${out.presupuestoResumen.facturado.toLocaleString('es-PY')}.`);
    }
  }
  const presItems = pres ? (await query('SELECT pi.*, t.nombre AS tratamiento_nombre FROM presupuesto_items pi LEFT JOIN tratamientos t ON t.id=pi.tratamiento_id WHERE pi.presupuesto_id=$1 ORDER BY pi.id', [pres.id])).rows : [];
  const itemsDePresupuesto = () => presItems.map((it) => {
    const linea = Number(it.cantidad) * Number(it.precio_unitario);
    return { descripcion: it.descripcion, tratamientoId: it.tratamiento_id, presupuestoItemId: it.id, pieza: it.pieza, cantidad: Number(it.cantidad), precioUnitario: Number(it.precio_unitario), descuento: redondear(linea * Number(pres.descuento || 0) / 100), tasaIva: cfg.iva_por_defecto };
  });
  if (pago) {
    out.pagoIds = pago.factura_id || pago.estado !== 'pagado' ? [] : [pago.id];
    out.metodoPago = pago.metodo; out.fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(pago.fecha));
    // Si el cobro cubre todo el presupuesto, se facturan sus tratamientos; si no, un concepto "a cuenta".
    const totalPres = pres ? Number(pres.total) : null;
    if (pres && Math.abs(Number(pago.monto) - totalPres) < 1 && presItems.length) out.items = itemsDePresupuesto();
    else {
      const trat = presItems.length === 1 ? presItems[0] : null;
      const desc = pago.concepto || (pres ? `Pago a cuenta — presupuesto #${pres.id}${presItems.length ? ` (${presItems.map((i) => i.descripcion).join(', ')})` : ''}` : 'Servicios odontológicos');
      out.items = [{ descripcion: desc.slice(0, 250), tratamientoId: trat ? trat.tratamiento_id : null, cantidad: 1, precioUnitario: Number(pago.monto), descuento: 0, tasaIva: cfg.iva_por_defecto }];
    }
    out.condicion = 'contado';
  } else if (pres) {
    out.items = itemsDePresupuesto();
    const cobrosDelPresupuesto = out.pagosDisponibles.filter((p) => p.presupuesto_id === pres.id);
    out.pagoIds = cobrosDelPresupuesto.map((p) => p.id);
    const cubierto = cobrosDelPresupuesto.reduce((s, p) => s + Number(p.monto), 0);
    out.condicion = cubierto >= Number(pres.total) ? 'contado' : 'credito';
    if (cobrosDelPresupuesto[0]) out.metodoPago = cobrosDelPresupuesto[0].metodo;
  }
  return out;
}

/* Facturar un cobro ya registrado en un paso (botón "Generar factura" o
   casilla al cobrar). Si ya tenía factura, la devuelve (no duplica). */
async function facturarCobro(clinicaId, pagoId, datos, usuario) {
  const b = await borrador(clinicaId, { pagoId });
  if (b.facturaExistente) return { yaExistia: true, factura: await obtener(clinicaId, b.facturaExistente.id, { todas: true }) };
  if (!b.pagoIds.length) throw new ApiError(409, 'Este cobro está anulado: no se puede facturar.');
  const cl = b.cliente || {};
  const ruc = txt(datos.clienteRuc, 40); const nombre = txt(datos.clienteNombre, 200);
  const factura = await crear(clinicaId, {
    pacienteId: b.paciente.id, presupuestoId: b.presupuestoId || undefined, odontologoId: b.odontologoId || undefined,
    fecha: b.fecha, condicion: 'contado', metodoPago: b.metodoPago, items: b.items, pagoIds: b.pagoIds,
    clienteNombre: nombre || cl.nombre, clienteDocumento: cl.documento, clienteRuc: ruc || cl.ruc,
    clienteDireccion: cl.direccion, clienteTelefono: cl.telefono, clienteEmail: cl.email,
    guardarEnFicha: !!(ruc || nombre),
  }, usuario);
  return { yaExistia: false, factura };
}

/* Facturar un ingreso manual de caja (con o sin paciente). Si el ingreso
   vino de un cobro de paciente, se factura ese cobro. */
async function facturarMovimiento(clinicaId, movimientoId, datos, usuario) {
  const m = (await query(
    `SELECT cm.*, ca.clinica_id FROM caja_movimientos cm JOIN caja_aperturas ca ON ca.id=cm.caja_apertura_id
      WHERE cm.id=$1 AND ca.clinica_id=$2`, [Number(movimientoId), clinicaId])).rows[0];
  if (!m) throw new ApiError(404, 'Movimiento de caja no encontrado');
  if (m.tipo !== 'ingreso') throw new ApiError(400, 'Solo los ingresos llevan factura');
  if (m.pago_id) return facturarCobro(clinicaId, m.pago_id, datos, usuario);
  const ya = (await query("SELECT id FROM facturas WHERE caja_movimiento_id=$1 AND estado<>'anulada'", [m.id])).rows[0];
  if (ya) return { yaExistia: true, factura: await obtener(clinicaId, ya.id, { todas: true }) };
  const cfg = await obtenerConfig(clinicaId);
  const tasa = [0, 5, 10].includes(Number(datos.tasaIva)) ? Number(datos.tasaIva) : cfg.iva_por_defecto;
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(m.creado_en));
  const factura = await crear(clinicaId, {
    pacienteId: datos.pacienteId || undefined, fecha, condicion: 'contado', metodoPago: m.metodo || 'efectivo',
    items: [{ descripcion: txt(datos.descripcion, 250) || m.concepto, cantidad: 1, precioUnitario: Number(m.monto), descuento: 0, tasaIva: tasa }],
    clienteNombre: txt(datos.clienteNombre, 200) || undefined, clienteRuc: txt(datos.clienteRuc, 40), clienteDocumento: txt(datos.clienteDocumento, 40),
  }, usuario, { movimiento: m });
  return { yaExistia: false, factura };
}

async function buscarGlobal(clinicaId, termino, usuario) {
  let a;
  try { a = alcance(usuario); } catch (_e) { return []; }
  const r = await listar(clinicaId, { q: termino, pageSize: 8, orden: 'fecha' }, a);
  return r.items;
}

module.exports = {
  alcance, obtenerConfig, guardarConfig, guardarLogo, quitarLogo, obtenerLogo, cambiarNumeracion, metodosPago,
  crear, obtener, listar, estadisticas, reporte, editar, anular, asociarPago, alAnularPago, crearNotaCredito,
  resumenPresupuesto, resumenPaciente, borrador, buscarGlobal, facturarCobro, facturarMovimiento, SQL_COBRADO, evento, formatearNumero, TIPOS,
};
