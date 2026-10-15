/* Panel del dueño de la plataforma: las clínicas que alquilan DOVA, su plan,
   si están al día y si están suspendidas.
   Es lo único del sistema que mira TODAS las clínicas; solo lo abre un usuario
   marcado como "proveedor" (permiso sintetizado plataforma.manage). Nunca da
   acceso a datos de pacientes: solo cuenta y plan de cada clínica. */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, pool } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { str } = require('../../utils/texto');
const planes = require('../../config/planes');
const { PERMISOS, PERMISOS_POR_ROL } = require('../../config/permisos');

const auditar = (actor, clinicaId, accion, detalle) => require('../../utils/auditoria').registrar({
  clinicaId: actor.clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion, modulo: 'plataforma', entidadId: clinicaId, detalle,
});
const olvidar = () => require('../../middlewares/auth.middleware').olvidarUsuario();

const primeroDelMes = (v) => {
  const m = /^(\d{4})-(\d{2})/.exec(str(v));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new ApiError(400, 'Período inválido (usá AAAA-MM)');
  return `${m[1]}-${m[2]}-01`;
};
const monto = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000000000 || !Number.isInteger(n)) throw new ApiError(400, 'Monto inválido (guaraníes, sin decimales)');
  return n;
};
const modulosValidos = (v, campo) => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new ApiError(400, `${campo} tiene que ser una lista`);
  const l = [...new Set(v.map(str))];
  const mal = l.find((k) => !planes.MODULOS[k]);
  if (mal) throw new ApiError(400, `Módulo desconocido: ${mal.slice(0, 40)}`);
  return l;
};

function catalogo() {
  return {
    planes: planes.PLANES.map((p) => ({ clave: p, nombre: planes.NOMBRE_PLAN[p] })),
    modulos: Object.entries(planes.MODULOS).map(([clave, m]) => ({ clave, nombre: m.nombre, desde: m.desde })),
  };
}

async function listar() {
  const r = await query(`
    SELECT c.id, c.nombre, c.slug, c.plan, c.modulos_extra, c.modulos_quitar, c.activa, c.suspendida_motivo, c.mensualidad, c.creado_en,
           (SELECT count(*)::int FROM usuarios u WHERE u.clinica_id=c.id AND u.activo AND u.eliminado_en IS NULL) AS usuarios,
           (SELECT max(periodo) FROM suscripcion_pagos s WHERE s.clinica_id=c.id) AS ultimo_periodo
    FROM clinicas c ORDER BY c.id`);
  const hoy = new Date(); const actual = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return r.rows.map((c) => {
    let mesesAtraso = 0;
    if (c.mensualidad > 0) {
      const base = c.ultimo_periodo ? new Date(c.ultimo_periodo) : new Date(c.creado_en);
      const b = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
      mesesAtraso = Math.max(0, (actual.getUTCFullYear() - b.getUTCFullYear()) * 12 + actual.getUTCMonth() - b.getUTCMonth() - (c.ultimo_periodo ? 0 : 1));
    }
    return {
      id: c.id, nombre: c.nombre, slug: c.slug, plan: c.plan, nombrePlan: planes.NOMBRE_PLAN[c.plan],
      modulosExtra: c.modulos_extra || [], modulosQuitar: c.modulos_quitar || [],
      activa: c.activa, motivoSuspension: c.suspendida_motivo, mensualidad: Number(c.mensualidad), usuarios: c.usuarios,
      ultimoPeriodoPagado: c.ultimo_periodo ? new Date(c.ultimo_periodo).toISOString().slice(0, 7) : null, mesesAtraso,
    };
  });
}

async function existe(id) {
  const r = await query('SELECT id, nombre, activa FROM clinicas WHERE id=$1', [Number(id)]);
  if (!r.rowCount) throw new ApiError(404, 'Clínica no encontrada');
  return r.rows[0];
}

async function crear(d, actor) {
  const nombre = str(d.nombre).trim().slice(0, 150);
  const slug = str(d.slug).trim().toLowerCase();
  const plan = str(d.plan || 'esencial');
  if (!nombre) throw new ApiError(400, 'Falta el nombre de la clínica');
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) throw new ApiError(400, 'El código de la clínica usa solo minúsculas, números y guiones (2 a 60)');
  if (!planes.PLANES.includes(plan)) throw new ApiError(400, 'Plan inválido');
  const mensualidad = d.mensualidad === undefined || d.mensualidad === '' ? 0 : monto(d.mensualidad);
  const adminNombre = str(d.adminNombre || 'Administrador').trim().slice(0, 120) || 'Administrador';
  const clave = `Dova-${crypto.randomBytes(9).toString('base64url')}`;
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const dup = await cli.query('SELECT 1 FROM clinicas WHERE slug=$1', [slug]);
    if (dup.rowCount) throw new ApiError(409, 'Ya existe una clínica con ese código');
    const c = await cli.query('INSERT INTO clinicas (nombre, slug, plan, mensualidad, plan_actualizado_en) VALUES ($1,$2,$3,$4,now()) RETURNING id', [nombre, slug, plan, mensualidad]);
    const cid = c.rows[0].id;
    const permisos = Object.fromEntries((await cli.query('SELECT id, codigo FROM permisos')).rows.map((p) => [p.codigo, p.id]));
    const roles = { admin: 'Administrador', odontologo: 'Odontólogo', recepcion: 'Recepción', asistente: 'Asistente', helpdesk: 'Soporte técnico' };
    const rolId = {};
    for (const [codigo, nom] of Object.entries(roles)) {
      const r = await cli.query('INSERT INTO roles (clinica_id, codigo, nombre, es_sistema) VALUES ($1,$2,$3,true) RETURNING id', [cid, codigo, nom]);
      rolId[codigo] = r.rows[0].id;
      const lista = PERMISOS_POR_ROL[codigo] === '*' ? PERMISOS.map((p) => p.codigo) : (PERMISOS_POR_ROL[codigo] || []);
      for (const cod of new Set(lista)) if (permisos[cod]) await cli.query('INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, permisos[cod]]);
    }
    await cli.query(`INSERT INTO recall_tipos (clinica_id, codigo, nombre, intervalo_meses, descripcion, color)
      SELECT $1, codigo, nombre, intervalo_meses, descripcion, color FROM recall_tipos WHERE clinica_id=(SELECT min(id) FROM clinicas WHERE id<>$1) ON CONFLICT DO NOTHING`, [cid]);
    await cli.query(`INSERT INTO usuarios (clinica_id, rol_id, nombre, username, password_hash, activo, es_admin_protegido, debe_cambiar_clave)
      VALUES ($1,$2,$3,'admin',$4,true,true,true)`, [cid, rolId.admin, adminNombre, await bcrypt.hash(clave, 12)]);
    await cli.query('COMMIT');
    await auditar(actor, cid, 'clinica_creada', { nombre, slug, plan, mensualidad });
    return { id: cid, slug, usuario: 'admin', claveTemporal: clave, aviso: 'Anotá la clave ahora: no se vuelve a mostrar. Se pide cambiarla al ingresar.' };
  } catch (e) { await cli.query('ROLLBACK'); throw e; } finally { cli.release(); }
}

async function editar(id, d, actor) {
  const antes = await existe(id);
  const sets = []; const vals = [Number(id)];
  const poner = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (d.plan !== undefined) { if (!planes.PLANES.includes(str(d.plan))) throw new ApiError(400, 'Plan inválido'); poner('plan', str(d.plan)); sets.push('plan_actualizado_en=now()'); }
  const extra = modulosValidos(d.modulosExtra, 'modulosExtra'); if (extra !== undefined) poner('modulos_extra', extra);
  const quitar = modulosValidos(d.modulosQuitar, 'modulosQuitar'); if (quitar !== undefined) poner('modulos_quitar', quitar);
  if (d.mensualidad !== undefined) poner('mensualidad', monto(d.mensualidad));
  if (d.nombre !== undefined) { const n = str(d.nombre).trim().slice(0, 150); if (!n) throw new ApiError(400, 'El nombre no puede quedar vacío'); poner('nombre', n); }
  if (!sets.length) throw new ApiError(400, 'No hay nada para cambiar');
  await query(`UPDATE clinicas SET ${sets.join(', ')} WHERE id=$1`, vals);
  olvidar();
  await auditar(actor, id, 'clinica_plan_cambiado', { clinica: antes.nombre, cambios: d });
  return (await listar()).find((c) => c.id === Number(id));
}

async function suspender(id, motivo, actor) {
  const c = await existe(id);
  if (Number(id) === Number(actor.clinicaId)) throw new ApiError(400, 'No podés suspender tu propia clínica desde el panel');
  const m = str(motivo || 'Falta de pago').trim().slice(0, 200) || 'Falta de pago';
  await query('UPDATE clinicas SET activa=false, suspendida_motivo=$2 WHERE id=$1', [Number(id), m]);
  olvidar();
  await auditar(actor, id, 'clinica_suspendida', { clinica: c.nombre, motivo: m });
  return { ok: true };
}

async function reactivar(id, actor) {
  const c = await existe(id);
  await query('UPDATE clinicas SET activa=true, suspendida_motivo=NULL WHERE id=$1', [Number(id)]);
  olvidar();
  await auditar(actor, id, 'clinica_reactivada', { clinica: c.nombre });
  return { ok: true };
}

async function pagos(id) {
  await existe(id);
  const r = await query("SELECT id, to_char(periodo,'YYYY-MM') AS periodo, monto, fecha_pago, nota FROM suscripcion_pagos WHERE clinica_id=$1 ORDER BY periodo DESC LIMIT 60", [Number(id)]);
  return r.rows.map((p) => ({ ...p, monto: Number(p.monto) }));
}

async function registrarPago(id, d, actor) {
  const c = await existe(id);
  const periodo = primeroDelMes(d.periodo);
  const m = monto(d.monto);
  const nota = str(d.nota || '').trim().slice(0, 200) || null;
  let fecha = str(d.fechaPago || '').slice(0, 10);
  if (fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`)))) throw new ApiError(400, 'Fecha de pago inválida');
  fecha = fecha || new Date().toISOString().slice(0, 10);
  try {
    const r = await query('INSERT INTO suscripcion_pagos (clinica_id, periodo, monto, fecha_pago, nota, creado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [Number(id), periodo, m, fecha, nota, actor.id]);
    await auditar(actor, id, 'clinica_pago_registrado', { clinica: c.nombre, periodo, monto: m });
    return { id: r.rows[0].id };
  } catch (e) {
    if (e.code === '23505') throw new ApiError(409, 'Ese mes ya figura como pagado');
    throw e;
  }
}

async function borrarPago(id, pagoId, actor) {
  const c = await existe(id);
  const r = await query('DELETE FROM suscripcion_pagos WHERE id=$1 AND clinica_id=$2 RETURNING periodo', [Number(pagoId), Number(id)]);
  if (!r.rowCount) throw new ApiError(404, 'Pago no encontrado');
  await auditar(actor, id, 'clinica_pago_eliminado', { clinica: c.nombre, periodo: r.rows[0].periodo });
  return { ok: true };
}

module.exports = { catalogo, listar, crear, editar, suspender, reactivar, pagos, registrarPago, borrarPago };
