/* Portal del paciente — Fase 5: datos personales, antecedentes y su
   información clínica (tratamientos, recetas, estudios que la clínica
   decidió compartir, próximos controles y documentos).
   Todo se filtra por el paciente de la sesión; la información clínica y
   los documentos requieren que la clínica haya confirmado su identidad. */
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso } = require('../../utils/recurso');
const auditoria = require('../../utils/auditoria');
const w = require('./web.service');

const txt = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const SIN_VERIFICAR = () => new ApiError(403, 'Para ver tu información clínica, la clínica tiene que confirmar tu identidad: mostrá tu cédula en recepción en tu próxima visita.');
const exigirVerificado = (pt) => { if (pt.verificado === false) throw SIN_VERIFICAR(); };

// ---------- datos personales ----------
async function actualizarDatos(pt, d) {
  const antes = (await query('SELECT telefono, email, direccion, ciudad FROM pacientes WHERE id=$1', [pt.pacienteId])).rows[0];
  const nuevo = { telefono: txt(d.telefono, 40), email: txt(d.email, 150), direccion: txt(d.direccion, 300), ciudad: txt(d.ciudad, 100) };
  if (!nuevo.telefono) throw new ApiError(400, 'El teléfono es obligatorio para poder avisarte de tus turnos');
  if (!/^[\d\s()+-]{6,40}$/.test(nuevo.telefono)) throw new ApiError(400, 'Teléfono inválido');
  if (nuevo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo.email)) throw new ApiError(400, 'Email inválido');
  await query('UPDATE pacientes SET telefono=$2, email=$3, direccion=$4, ciudad=$5, actualizado_en=now() WHERE id=$1', [pt.pacienteId, nuevo.telefono, nuevo.email, nuevo.direccion, nuevo.ciudad]);
  await auditoria.registrar({ clinicaId: pt.clinicaId, usuarioId: null, usuarioNombre: 'Paciente (cuenta web)', accion: 'paciente_actualiza_datos', modulo: 'pacientes', entidadId: pt.pacienteId, detalle: { antes, despues: nuevo } });
  return nuevo;
}

// ---------- antecedentes (los declara el paciente; la clínica los ve en la ficha) ----------
async function antecedentes(pt) {
  const p = (await query('SELECT alergias, medicamentos, antecedentes_medicos, grupo_sanguineo, contacto_emergencia FROM pacientes WHERE id=$1', [pt.pacienteId])).rows[0];
  return p;
}
async function guardarAntecedentes(pt, d) {
  const antes = await antecedentes(pt);
  const nuevo = { alergias: txt(d.alergias, 1000), medicamentos: txt(d.medicamentos, 1000), antecedentes_medicos: txt(d.antecedentesMedicos, 3000),
    grupo_sanguineo: txt(d.grupoSanguineo, 5), contacto_emergencia: txt(d.contactoEmergencia, 200) };
  if (nuevo.grupo_sanguineo && !/^(A|B|AB|O)[+-]$/.test(nuevo.grupo_sanguineo)) throw new ApiError(400, 'Grupo sanguíneo inválido (ej.: O+)');
  await query(`UPDATE pacientes SET alergias=$2, medicamentos=$3, antecedentes_medicos=$4, grupo_sanguineo=$5, contacto_emergencia=$6, actualizado_en=now() WHERE id=$1`,
    [pt.pacienteId, nuevo.alergias, nuevo.medicamentos, nuevo.antecedentes_medicos, nuevo.grupo_sanguineo, nuevo.contacto_emergencia]);
  await auditoria.registrar({ clinicaId: pt.clinicaId, usuarioId: null, usuarioNombre: 'Paciente (cuenta web)', accion: 'paciente_actualiza_antecedentes', modulo: 'historia_clinica', entidadId: pt.pacienteId, detalle: { antes, despues: nuevo } });
  const cambioAlergias = (antes.alergias || '') !== (nuevo.alergias || '') || (antes.medicamentos || '') !== (nuevo.medicamentos || '');
  await w.notificarRecepcion(pt.clinicaId, { tipo: 'antecedentes_web', titulo: `${pt.nombre} ${pt.apellido} actualizó sus antecedentes`, mensaje: cambioAlergias ? 'Cambió alergias o medicación: revisalo antes de la próxima consulta.' : 'Revisá la ficha antes de la próxima consulta.', entidad: 'paciente', entidadId: pt.pacienteId, ruta: `paciente/${pt.pacienteId}` });
  return nuevo;
}

// ---------- información clínica ----------
async function clinico(pt) {
  exigirVerificado(pt);
  const c = pt.clinicaId; const p = pt.pacienteId; const hoy = hoyIso();
  const [planes, recetas, estudios, recalls, controles, presupuestos] = await Promise.all([
    query(`SELECT pt.id, pt.nombre, pt.pieza, pt.estado, pt.sesiones_totales, pt.sesiones_realizadas, pt.fecha_inicio::text AS fecha_inicio, o.nombre AS odontologo,
             (SELECT json_agg(json_build_object('nombre', e.nombre, 'estado', e.estado) ORDER BY e.orden, e.id) FROM etapas_tratamiento e WHERE e.plan_id=pt.id AND e.estado <> 'cancelado') AS etapas
           FROM planes_tratamiento pt LEFT JOIN odontologos o ON o.id=pt.odontologo_id
           WHERE pt.clinica_id=$1 AND pt.paciente_id=$2 AND pt.estado <> 'cancelado' ORDER BY (pt.estado='finalizado'), pt.id DESC LIMIT 50`, [c, p]),
    query(`SELECT r.id, r.fecha::text AS fecha, o.nombre AS odontologo, r.indicaciones,
             (SELECT json_agg(json_build_object('medicamento', i.medicamento, 'dosis', i.dosis, 'frecuencia', i.frecuencia, 'duracion', i.duracion) ORDER BY i.id) FROM receta_items i WHERE i.receta_id=r.id) AS items
           FROM recetas r LEFT JOIN odontologos o ON o.id=r.odontologo_id
           WHERE r.clinica_id=$1 AND r.paciente_id=$2 AND COALESCE(r.estado,'emitida') <> 'anulada' ORDER BY r.fecha DESC, r.id DESC LIMIT 30`, [c, p]),
    query(`SELECT e.id, e.tipo, e.fecha::text AS fecha, e.descripcion, e.pieza, e.mime FROM estudios e
           WHERE e.clinica_id=$1 AND e.paciente_id=$2 AND e.visible_paciente AND (e.archivo IS NOT NULL OR e.storage_path IS NOT NULL) ORDER BY e.fecha DESC NULLS LAST, e.id DESC`, [c, p]),
    query(`SELECT rt.nombre, r.proxima_fecha::text AS fecha FROM paciente_recalls r JOIN recall_tipos rt ON rt.id=r.recall_tipo_id
           WHERE r.clinica_id=$1 AND r.paciente_id=$2 AND r.estado='activo' AND r.proxima_fecha IS NOT NULL ORDER BY r.proxima_fecha`, [c, p]),
    query(`SELECT titulo AS nombre, fecha_programada::text AS fecha FROM controles_programados WHERE clinica_id=$1 AND paciente_id=$2 AND estado='pendiente' ORDER BY fecha_programada`, [c, p]),
    query("SELECT id, fecha::text AS fecha, total, estado FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('enviado','aceptado','rechazado','vencido') ORDER BY fecha DESC LIMIT 30", [c, p]),
  ]);
  const controlesTodos = [...recalls.rows, ...controles.rows].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => ({ ...x, vencido: x.fecha < hoy }));
  return {
    tratamientos: planes.rows.map((x) => ({ ...x, etapas: x.etapas || [] })),
    recetas: recetas.rows.map((x) => ({ ...x, items: x.items || [] })),
    estudios: estudios.rows,
    controles: controlesTodos,
    presupuestos: presupuestos.rows.map((x) => ({ ...x, total: Number(x.total) })),
  };
}

async function recetaPdf(pt, id, res) {
  exigirVerificado(pt);
  const r = (await query("SELECT id FROM recetas WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND COALESCE(estado,'emitida') <> 'anulada'", [Number(id), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!r) throw new ApiError(404, 'Receta no encontrada');
  return require('../comprobantes/comprobantes.service').receta(pt.clinicaId, r.id, res);
}
async function presupuestoPdf(pt, id, res) {
  exigirVerificado(pt);
  const r = (await query("SELECT id FROM presupuestos WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND estado IN ('enviado','aceptado','rechazado','vencido')", [Number(id), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!r) throw new ApiError(404, 'Presupuesto no encontrado');
  return require('../comprobantes/comprobantes.service').presupuesto(pt.clinicaId, r.id, res);
}
async function estudioArchivo(pt, id, res) {
  exigirVerificado(pt);
  const e = (await query('SELECT id FROM estudios WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND visible_paciente', [Number(id), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!e) throw new ApiError(404, 'Estudio no encontrado');
  const a = await require('../clinico-extras/extras.service').archivo(pt.clinicaId, 'estudios', e.id);
  const inline = /^image\/|application\/pdf/.test(a.mime);
  res.set({ 'Content-Type': a.mime, 'Content-Length': a.datos.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${String(a.nombre || `estudio-${e.id}`).replace(/[^\w.\- ]/g, '_')}"` });
  res.end(a.datos);
  await auditoria.registrar({ clinicaId: pt.clinicaId, usuarioId: null, usuarioNombre: 'Paciente (cuenta web)', accion: 'paciente_descarga_estudio', modulo: 'pacientes', entidadId: e.id, detalle: { pacienteId: pt.pacienteId } });
}

module.exports = { actualizarDatos, antecedentes, guardarAntecedentes, clinico, recetaPdf, presupuestoPdf, estudioArchivo };
