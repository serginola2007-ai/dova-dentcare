const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./pacientes.repository');
const auditoria = require('../../utils/auditoria');
const { query, conCandado: candado } = require('../../config/db');
const { hoyIso: hoy } = require('../../utils/recurso');

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const paciente = await repo.obtenerPorId(clinicaId, id);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado');
  return paciente;
}

const CAMPOS_EXTRA = ['fuenteReferencia', 'referidoPorPacienteId', 'responsablePacienteId', 'responsableNombre', 'responsableParentesco',
  'responsableTelefono', 'responsableCi', 'grupoFamiliar', 'aceptaWhatsapp', 'aceptaRecordatorios', 'grupoSanguineo', 'listaPrecioId'];
const FUENTES = ['recomendacion_paciente', 'recomendacion_profesional', 'redes_sociales', 'google', 'instagram', 'facebook', 'tiktok', 'cartel', 'seguro_convenio', 'paso_por_la_zona', 'campana', 'otro'];
const GRUPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Valida los datos de seguimiento del paciente (migración 0020).
async function validarExtras(clinicaId, datos, pacienteId) {
  const { verificarReferencia } = require('../../utils/recurso');
  if (datos.fuenteReferencia && !FUENTES.includes(datos.fuenteReferencia)) throw new ApiError(400, `Fuente de referencia inválida. Opciones: ${FUENTES.join(', ')}`);
  if (datos.grupoSanguineo && !GRUPOS_SANGUINEOS.includes(datos.grupoSanguineo)) throw new ApiError(400, 'Grupo sanguíneo inválido');
  for (const [campo, tabla] of [['referidoPorPacienteId', 'pacientes'], ['responsablePacienteId', 'pacientes'], ['listaPrecioId', 'listas_precios']]) {
    if (datos[campo] === '') datos[campo] = null;
    if (datos[campo]) {
      await verificarReferencia(clinicaId, tabla, Number(datos[campo]), campo);
      if (pacienteId && tabla === 'pacientes' && Number(datos[campo]) === Number(pacienteId)) throw new ApiError(400, 'Un paciente no puede referirse a sí mismo');
    }
  }
  for (const b of ['aceptaWhatsapp', 'aceptaRecordatorios']) if (datos[b] !== undefined) datos[b] = datos[b] === true || datos[b] === 'true';
  if (datos.fechaNacimiento === '') datos.fechaNacimiento = null;
  if (datos.fechaNacimiento) {
    const f = String(datos.fechaNacimiento).slice(0, 10);
    const { hoyIso } = require('../../utils/recurso');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f + 'T12:00:00Z'))) throw new ApiError(400, 'Fecha de nacimiento inválida');
    if (f > hoyIso()) throw new ApiError(400, 'La fecha de nacimiento no puede ser futura');
    if (f < '1900-01-01') throw new ApiError(400, 'Revisá la fecha de nacimiento: es anterior a 1900');
  }
}

async function crear(clinicaId, datos, usuario) {
  await validarExtras(clinicaId, datos);
  // Bajo candado por cédula: dos altas simultáneas del mismo paciente no se duplican.
  const { conCandado } = require('../../config/db');
  let paciente = await conCandado(datos.ci && `paciente:ci:${clinicaId}:${String(datos.ci).trim()}`, async () => {
    if (datos.ci) {
      const existente = await repo.obtenerPorCi(clinicaId, datos.ci);
      if (existente) throw new ApiError(409, existente.activo ? 'Ya existe un paciente con esa cédula en esta clínica' : 'Hay un paciente eliminado con esa cédula. Restauralo desde Pacientes → "Ver eliminados".');
    }
    return repo.crear(clinicaId, datos);
  });
  const extras = Object.fromEntries(CAMPOS_EXTRA.filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]]));
  if (Object.keys(extras).length) paciente = await repo.actualizar(clinicaId, paciente.id, extras);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'pacientes', entidadId: paciente.id,
    detalle: { nombre: paciente.nombre, apellido: paciente.apellido },
  });
  return paciente;
}

async function actualizar(clinicaId, id, datos, usuario) {
  const actual = await repo.obtenerPorId(clinicaId, id);
  if (!actual) throw new ApiError(404, 'Paciente no encontrado');
  await validarExtras(clinicaId, datos, id);

  if (datos.ci && datos.ci !== actual.ci) {
    const existente = await repo.obtenerPorCi(clinicaId, datos.ci);
    if (existente && existente.id !== Number(id)) {
      throw new ApiError(409, 'Ya existe un paciente con esa cédula en esta clínica');
    }
  }

  const paciente = await repo.actualizar(clinicaId, id, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'editar', modulo: 'pacientes', entidadId: id, detalle: datos,
  });
  return paciente;
}

// Qué tiene el paciente antes de eliminarlo (para avisar en la confirmación).
async function resumenBaja(clinicaId, id) {
  const p = await repo.obtenerPorId(clinicaId, id);
  if (!p) throw new ApiError(404, 'Paciente no encontrado');
  const n = async (sql) => Number((await query(sql, sql.includes('$3') ? [clinicaId, Number(id), hoy()] : [clinicaId, Number(id)])).rows[0].n);
  return {
    turnosFuturos: await n("SELECT count(*) n FROM turnos WHERE clinica_id=$1 AND paciente_id=$2 AND fecha >= $3 AND estado NOT IN ('cancelado','no_asistio','atendido')"),
    pagos: await n("SELECT count(*) n FROM pagos WHERE clinica_id=$1 AND paciente_id=$2"),
    facturas: await n("SELECT count(*) n FROM facturas WHERE clinica_id=$1 AND paciente_id=$2 AND estado <> 'anulada'"),
    cuotasPendientes: await n("SELECT count(*) n FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND pp.estado <> 'cancelado' AND c.estado <> 'pagada'"),
    cuentaWeb: (await n('SELECT count(*) n FROM web_cuentas WHERE clinica_id=$1 AND paciente_id=$2 AND activa')) > 0,
  };
}

// Eliminar = dar de baja: deja de aparecer en pacientes, buscadores, agenda y
// web, pero su historia clínica, pagos y facturas se conservan (son
// obligatorios por ley y la caja depende de ellos). Se puede restaurar.
async function eliminar(clinicaId, id, usuario) {
  const r = await candado([`paciente:baja:${clinicaId}:${Number(id)}`], async () => {
    const eliminado = await repo.eliminarLogico(clinicaId, id);
    if (!eliminado) throw new ApiError(404, 'Paciente no encontrado');
    const t = await query(`UPDATE turnos SET estado='cancelado', actualizado_en=now()
                            WHERE clinica_id=$1 AND paciente_id=$2 AND fecha >= $3 AND estado NOT IN ('cancelado','no_asistio','atendido') RETURNING id`, [clinicaId, Number(id), hoy()]);
    await query('UPDATE web_cuentas SET activa=false, version_token=version_token+1 WHERE clinica_id=$1 AND paciente_id=$2', [clinicaId, Number(id)]);
    return { turnosCancelados: t.rowCount };
  });
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'eliminar', modulo: 'pacientes', entidadId: id, detalle: r,
  });
  return r;
}

async function restaurar(clinicaId, id, usuario) {
  const p = (await query('SELECT id, ci, activo FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(id)])).rows[0];
  if (!p) throw new ApiError(404, 'Paciente no encontrado');
  if (p.activo) return { ok: true };
  if (p.ci) {
    const otro = (await query('SELECT 1 FROM pacientes WHERE clinica_id=$1 AND ci=$2 AND activo AND id<>$3', [clinicaId, p.ci, p.id])).rowCount;
    if (otro) throw new ApiError(409, 'Ya hay otro paciente activo con esa cédula. Revisá cuál es el correcto antes de restaurar.');
  }
  await query('UPDATE pacientes SET activo=true, actualizado_en=now() WHERE id=$1', [p.id]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'restaurar', modulo: 'pacientes', entidadId: id });
  return { ok: true };
}

module.exports = { listar, obtener, crear, actualizar, eliminar, resumenBaja, restaurar };
