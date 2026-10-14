const { ApiError } = require('../../middlewares/error.middleware');
const { monto: validarMonto } = require('../../utils/montos');
const repo = require('./presupuestos.repository');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');

const ESTADOS_VALIDOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado'];

const { query } = require('../../config/db');

// Vigencia: un presupuesto en borrador o enviado cuya fecha de vencimiento ya
// pasó queda "vencido" (se puede volver a enviar). Queda en la auditoría.
async function vencerAutomaticos(clinicaId, pacienteId) {
  const r = await query(`UPDATE presupuestos SET estado='vencido', actualizado_en=now()
                          WHERE clinica_id=$1 AND ($2::int IS NULL OR paciente_id=$2::int) AND estado IN ('borrador','enviado')
                            AND vencimiento IS NOT NULL AND vencimiento < (now() AT TIME ZONE 'America/Asuncion')::date RETURNING id`, [clinicaId, pacienteId || null]);
  for (const x of r.rows) await auditoria.registrar({ clinicaId, usuarioNombre: 'Sistema', accion: 'vencimiento_automatico', modulo: 'presupuestos', entidadId: x.id });
}

async function listarPorPaciente(clinicaId, pacienteId) {
  await vencerAutomaticos(clinicaId, Number(pacienteId));
  return repo.listarPorPaciente(clinicaId, pacienteId);
}

// Sección Presupuestos: todos los de la clínica, con filtros.
async function listar(clinicaId, q) {
  await vencerAutomaticos(clinicaId, null);
  const params = [clinicaId]; const cond = ['p.clinica_id=$1'];
  if (q.estado !== undefined && q.estado !== '') {
    if (!ESTADOS_VALIDOS.includes(q.estado)) throw new ApiError(400, 'Estado inválido');
    params.push(q.estado); cond.push(`p.estado=$${params.length}`);
  }
  for (const [k, op] of [['desde', '>='], ['hasta', '<=']]) {
    if (q[k] === undefined || q[k] === '') continue;
    if (typeof q[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(q[k])) throw new ApiError(400, 'Fecha inválida');
    params.push(q[k]); cond.push(`p.fecha ${op} $${params.length}`);
  }
  if (q.odontologoId !== undefined && q.odontologoId !== '') {
    const o = Number(q.odontologoId); if (!Number.isInteger(o) || o <= 0) throw new ApiError(400, 'Odontólogo inválido');
    params.push(o); cond.push(`p.odontologo_id=$${params.length}`);
  }
  if (typeof q.q === 'string' && q.q.trim()) {
    params.push(`%${q.q.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    cond.push(`(pac.nombre ILIKE $${params.length} OR pac.apellido ILIKE $${params.length} OR (pac.nombre || ' ' || pac.apellido) ILIKE $${params.length} OR pac.ci ILIKE $${params.length} OR p.id::text = btrim($${params.length}, '%'))`);
  }
  const limite = Math.min(200, Math.max(1, Number(q.limite) || 100));
  const r = await query(`SELECT p.id, p.fecha, p.vencimiento, p.estado, p.total, p.descuento, p.odontologo_id, p.paciente_id,
            pac.nombre AS paciente_nombre, pac.apellido AS paciente_apellido, pac.ci AS paciente_ci,
            o.nombre AS odontologo_nombre,
            (SELECT count(*)::int FROM presupuesto_items i WHERE i.presupuesto_id=p.id) AS items
       FROM presupuestos p JOIN pacientes pac ON pac.id=p.paciente_id AND pac.clinica_id=p.clinica_id
       LEFT JOIN odontologos o ON o.id=p.odontologo_id
      WHERE ${cond.join(' AND ')}
      ORDER BY p.fecha DESC, p.id DESC LIMIT ${limite}`, params);
  const tot = await query(`SELECT p.estado, count(*)::int n, COALESCE(sum(p.total),0)::numeric total FROM presupuestos p WHERE p.clinica_id=$1 AND p.fecha >= date_trunc('year', CURRENT_DATE) GROUP BY p.estado`, [clinicaId]);
  return { items: r.rows, resumenAnio: tot.rows.map((x) => ({ estado: x.estado, cantidad: x.n, total: Number(x.total) })) };
}

async function obtener(clinicaId, id) {
  const p = await repo.obtenerPorId(clinicaId, id);
  if (!p) throw new ApiError(404, 'Presupuesto no encontrado');
  return p;
}

function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'El presupuesto debe tener al menos un ítem');
  for (const it of items) {
    if (!it.descripcion) throw new ApiError(400, 'Cada ítem necesita una descripción');
    it.cantidad = validarMonto(it.cantidad === undefined ? 1 : it.cantidad, { campo: 'La cantidad', max: 10000 });
    it.precioUnitario = validarMonto(it.precioUnitario === undefined ? 0 : it.precioUnitario, { campo: 'El precio', cero: true });
  }
}

// C.I.: letras, números, puntos y guiones (se guarda sin espacios).
const CI_VALIDA = /^[0-9A-Za-z][0-9A-Za-z.-]{2,19}$/;

async function crear(clinicaId, datos, usuario) {
  if (!datos || typeof datos !== 'object') throw new ApiError(400, 'Datos inválidos');
  const pacienteId = Number(datos.pacienteId);
  if (!Number.isInteger(pacienteId) || pacienteId <= 0) throw new ApiError(400, 'El paciente es obligatorio');
  datos.pacienteId = pacienteId;
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  // Sin tratamientos no hay presupuesto.
  validarItems(datos.items);
  const { verificarReferencia } = require('../../utils/recurso');
  if (datos.odontologoId !== undefined && datos.odontologoId !== null && datos.odontologoId !== '') {
    const o = Number(datos.odontologoId);
    if (!Number.isInteger(o) || o <= 0) throw new ApiError(400, 'Odontólogo inválido');
    await verificarReferencia(clinicaId, 'odontologos', o, 'Odontólogo');
    datos.odontologoId = o;
  } else datos.odontologoId = null;
  for (const it of datos.items) {
    if (it.tratamientoId === undefined || it.tratamientoId === null || it.tratamientoId === '') { it.tratamientoId = null; continue; }
    const t = Number(it.tratamientoId);
    if (!Number.isInteger(t) || t <= 0) throw new ApiError(400, 'Tratamiento inválido');
    await verificarReferencia(clinicaId, 'tratamientos', t, 'Tratamiento');
    it.tratamientoId = t;
  }
  if (datos.descuento !== undefined && datos.descuento !== null && datos.descuento !== '') {
    datos.descuento = validarMonto(datos.descuento, { campo: 'El descuento', cero: true, max: 100 });
  }
  // La C.I. del paciente es obligatoria para presupuestar. Si todavía no la
  // tiene, se puede cargar en el mismo paso (no puede ser la de otro paciente).
  if (!paciente.ci || !String(paciente.ci).trim()) {
    const ci = typeof datos.pacienteCi === 'string' ? datos.pacienteCi.replace(/\s+/g, '') : '';
    if (!ci) { const e = new ApiError(400, 'Falta la C.I. del paciente. Cargala para poder guardar el presupuesto.'); e.details = { campo: 'pacienteCi' }; throw e; }
    if (!CI_VALIDA.test(ci)) throw new ApiError(400, 'La C.I. tiene un formato inválido (solo números, letras, puntos o guiones).');
    const { conCandado } = require('../../config/db');
    await conCandado(`paciente:ci:${clinicaId}:${ci}`, async () => {
      const otro = await pacientesRepo.obtenerPorCi(clinicaId, ci);
      if (otro && Number(otro.id) !== pacienteId) throw new ApiError(409, 'Esa C.I. ya está cargada en otro paciente.');
      const r = await query("UPDATE pacientes SET ci=$3, actualizado_en=now() WHERE clinica_id=$1 AND id=$2 AND (ci IS NULL OR btrim(ci)='') RETURNING id", [clinicaId, pacienteId, ci]);
      if (r.rowCount) {
        await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'cargar_ci', modulo: 'pacientes', entidadId: pacienteId, detalle: { ci, desde: 'presupuesto' } });
      }
    });
  }
  const presupuesto = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'presupuestos', entidadId: presupuesto.id, detalle: { total: presupuesto.total },
  });
  return presupuesto;
}

// Cambios de estado permitidos (un presupuesto aceptado o rechazado no vuelve
// a borrador: si cambia lo acordado, se hace uno nuevo).
const TRANSICIONES = {
  borrador: ['enviado', 'aceptado', 'cancelado'],
  enviado: ['aceptado', 'rechazado', 'vencido', 'cancelado'],
  vencido: ['enviado', 'cancelado'],
  rechazado: [],
  aceptado: ['cancelado'],
  cancelado: [],
};
const NOMBRE_ESTADO = { borrador: 'borrador', enviado: 'enviado', aceptado: 'aceptado', rechazado: 'rechazado', vencido: 'vencido', cancelado: 'cancelado' };

async function cambiarEstado(clinicaId, id, estado, usuario) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new ApiError(400, `Estado inválido: ${ESTADOS_VALIDOS.join(', ')}`);
  const antes = await repo.obtenerPorId(clinicaId, id);
  if (!antes) throw new ApiError(404, 'Presupuesto no encontrado');
  if (antes.estado !== estado && !(TRANSICIONES[antes.estado] || []).includes(estado)) {
    throw new ApiError(409, `Un presupuesto ${NOMBRE_ESTADO[antes.estado]} no puede pasar a ${NOMBRE_ESTADO[estado]}${(TRANSICIONES[antes.estado] || []).length ? ` (puede pasar a: ${TRANSICIONES[antes.estado].join(', ')})` : ''}.`);
  }
  if (estado === 'cancelado' && antes.estado === 'aceptado') {
    const pagado = await query("SELECT COALESCE(SUM(monto),0)::numeric s FROM pagos WHERE clinica_id=$1 AND presupuesto_id=$2 AND estado='pagado'", [clinicaId, id]);
    if (Number(pagado.rows[0].s) > 0) throw new ApiError(409, 'Este presupuesto ya tiene cobros: anulá los cobros antes de cancelarlo.');
  }
  const presupuesto = await repo.actualizarEstado(clinicaId, id, estado);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado', modulo: 'presupuestos', entidadId: id, detalle: { antes: antes.estado, despues: estado },
  });
  return presupuesto;
}

// Presupuesto aceptado → plan de tratamiento: un plan por cada ítem (sin
// duplicar los que ya se crearon), con su precio, pieza y tratamiento.
async function crearPlanes(clinicaId, id, usuario) {
  const pr = await repo.obtenerPorId(clinicaId, id);
  if (!pr) throw new ApiError(404, 'Presupuesto no encontrado');
  if (pr.estado !== 'aceptado') throw new ApiError(409, 'Solo un presupuesto aceptado se convierte en plan de tratamiento');
  const items = pr.items || [];
  if (!items.length) throw new ApiError(400, 'El presupuesto no tiene ítems');
  const creados = [];
  const { conCandado } = require('../../config/db');
  await conCandado(`presupuesto:planes:${clinicaId}:${id}`, async () => {
    for (const it of items) {
      const ya = await query('SELECT id FROM planes_tratamiento WHERE clinica_id=$1 AND presupuesto_item_id=$2', [clinicaId, it.id]);
      if (ya.rowCount) continue;
      const trat = it.tratamiento_id ? (await query('SELECT nombre FROM tratamientos WHERE clinica_id=$1 AND id=$2', [clinicaId, it.tratamiento_id])).rows[0] : null;
      const precio = Number(it.precio_unitario) * Number(it.cantidad || 1) * (1 - Number(pr.descuento || 0) / 100);
      const r = await query(`INSERT INTO planes_tratamiento (clinica_id, paciente_id, odontologo_id, tratamiento_id, nombre, pieza, precio, sesiones_totales, presupuesto_id, presupuesto_item_id, estado, observaciones)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendiente',$11) RETURNING id, nombre, pieza`,
      [clinicaId, pr.paciente_id, pr.odontologo_id || null, it.tratamiento_id || null, String(it.descripcion || (trat && trat.nombre) || 'Tratamiento').slice(0, 200),
        it.pieza || null, Math.round(precio * 100) / 100, Math.max(1, Math.round(Number(it.cantidad) || 1)), pr.id, it.id, `Del presupuesto #${pr.id}`]);
      creados.push(r.rows[0]);
    }
  });
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'crear_planes_desde_presupuesto', modulo: 'presupuestos', entidadId: id, detalle: { planes: creados.map((x) => x.id) } });
  return { creados, yaExistian: items.length - creados.length };
}

module.exports = { listar, listarPorPaciente, obtener, crear, cambiarEstado, crearPlanes, vencerAutomaticos, ESTADOS_VALIDOS };
