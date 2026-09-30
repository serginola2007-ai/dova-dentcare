const express = require('express');
const { query, getClient } = require('../../config/db');
const { crearRecurso, convertir, hoyIso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const controles = require('./controles.service');

const VER = ['especialidades.edit', 'pacientes.clinical.view'];
const EDITAR = ['especialidades.edit'];
const P = { ver: VER, editar: EDITAR };
const JOIN_ODONTO = { selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id' };

const router = express.Router();

async function recall(ctx, pacienteId, codigo, opciones) {
  try {
    const recalls = require('../recalls/recalls.service');
    await recalls.asignarPorCodigo(ctx.clinicaId, pacienteId, codigo, opciones, ctx.usuario);
  } catch (e) { console.error(`[especialidades] recall ${codigo} no programado:`, e.message); }
}

// ================================ IMPLANTES ================================
router.use('/implantes', crearRecurso({
  tabla: 'implantes', modulo: 'implantes', porPaciente: true, permisos: P, actualizadoEn: true, borrado: 'fisico',
  orden: 't.fecha_colocacion DESC NULLS LAST, t.id DESC', joinPaciente: true,
  selectExtra: 'o.nombre AS cirujano_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.cirujano_id',
  filtros: { lote: { col: 'lote', op: 'ILIKE', tipo: 'texto' }, fabricante: { col: 'fabricante', op: 'ILIKE', tipo: 'texto' }, estado: { col: 'estado' } },
  campos: {
    pieza: { tipo: 'pieza', requerido: true },
    fabricante: { tipo: 'texto', requerido: true, max: 100 },
    sistema: { tipo: 'texto', max: 100 },
    modeloRef: { tipo: 'texto', max: 80 },
    lote: { tipo: 'texto', max: 80 },
    numeroSerie: { tipo: 'texto', max: 80 },
    diametroMm: { tipo: 'numero', min: 2, maxNum: 8 },
    longitudMm: { tipo: 'numero', min: 4, maxNum: 25 },
    fechaColocacion: { tipo: 'fecha' },
    cirujanoId: { tipo: 'id', ref: 'odontologos' },
    torqueInsercionNcm: { tipo: 'entero', min: 0, maxNum: 100 },
    isqInicial: { tipo: 'entero', min: 0, maxNum: 100 },
    isqSegundaFase: { tipo: 'entero', min: 0, maxNum: 100 },
    tipoOseo: { tipo: 'enum', valores: ['D1', 'D2', 'D3', 'D4'] },
    injerto: { tipo: 'texto', max: 200 },
    membrana: { tipo: 'texto', max: 120 },
    tecnica: { tipo: 'enum', valores: ['una_etapa', 'dos_etapas', 'post_extraccion_inmediato', 'guiada'] },
    carga: { tipo: 'enum', valores: ['inmediata', 'temprana', 'convencional'] },
    fechaSegundaFase: { tipo: 'fecha' },
    pilarTipo: { tipo: 'texto', max: 100 },
    pilarLote: { tipo: 'texto', max: 80 },
    pilarTorqueNcm: { tipo: 'entero', min: 0, maxNum: 60 },
    restauracionTipo: { tipo: 'enum', valores: ['atornillada', 'cementada', 'sobredentadura', 'provisoria'] },
    fechaCarga: { tipo: 'fecha' },
    laboratorio: { tipo: 'texto', max: 120 },
    estado: { tipo: 'enum', valores: ['colocado', 'osteointegrado', 'cargado', 'fracaso', 'retirado'], defecto: 'colocado' },
    fechaRetiro: { tipo: 'fecha' },
    motivoRetiro: { tipo: 'texto' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d) => {
    if (['fracaso', 'retirado'].includes(d.estado) && !d.fecha_retiro) d.fecha_retiro = hoyIso();
  },
  // Controles automáticos: retiro de puntos (7-10 días), control de
  // osteointegración (3 meses) y, una vez cargado, mantenimiento anual.
  despuesDeGuardar: async (f, ctx) => {
    if (f.fecha_colocacion) {
      await controles.programar(ctx.clinicaId, {
        pacienteId: f.paciente_id, origenTipo: 'implante', origenId: f.id, odontologoId: f.cirujano_id,
        controles: [
          { titulo: `Control postquirúrgico implante ${f.pieza} (retiro de puntos)`, fecha: controles.sumarDias(f.fecha_colocacion, 10) },
          { titulo: `Control de osteointegración implante ${f.pieza}`, desde: f.fecha_colocacion, meses: 3 },
        ],
      });
    }
    if (f.estado === 'cargado' && f.fecha_carga) {
      await controles.programar(ctx.clinicaId, {
        pacienteId: f.paciente_id, origenTipo: 'implante', origenId: f.id, odontologoId: f.cirujano_id,
        controles: [
          { titulo: `Control periimplantario 6 meses implante ${f.pieza}`, desde: f.fecha_carga, meses: 6 },
          { titulo: `Control periimplantario 1 año implante ${f.pieza} (Rx)`, desde: f.fecha_carga, meses: 12 },
        ],
      });
      await recall(ctx, f.paciente_id, 'control_implante', { ultimaFecha: f.fecha_carga, odontologoId: f.cirujano_id });
    }
  },
}));

// Pasaporte del implante (datos para la tarjeta del paciente)
const extra = express.Router();
extra.use(authMiddleware, resolverClinicaMiddleware);
extra.get('/implantes-pasaporte/:pacienteId', requirePermiso(...VER), async (req, res, next) => {
  try {
    const [pac, imp, cli] = await Promise.all([
      query('SELECT nombre, apellido, ci, fecha_nacimiento FROM pacientes WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.pacienteId)]),
      query(`SELECT i.*, o.nombre AS cirujano_nombre, o.matricula AS cirujano_matricula FROM implantes i LEFT JOIN odontologos o ON o.id=i.cirujano_id
              WHERE i.clinica_id=$1 AND i.paciente_id=$2 AND i.estado NOT IN ('retirado','fracaso') ORDER BY i.pieza`, [req.clinicaId, Number(req.params.pacienteId)]),
      query('SELECT nombre, telefono, direccion FROM clinicas WHERE id=$1', [req.clinicaId]),
    ]);
    if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
    res.json({ paciente: pac.rows[0], implantes: imp.rows, clinica: cli.rows[0] });
  } catch (e) { next(e); }
});

// ================================ ENDODONCIA ================================
const DX_PULPAR = ['normal', 'pulpitis_reversible', 'pulpitis_irreversible_sintomatica', 'pulpitis_irreversible_asintomatica', 'necrosis', 'previamente_tratado', 'previamente_iniciado'];
const DX_PERIAPICAL = ['normal', 'periodontitis_apical_sintomatica', 'periodontitis_apical_asintomatica', 'absceso_apical_agudo', 'absceso_apical_cronico', 'osteitis_condensante'];

router.use('/endodoncias', crearRecurso({
  tabla: 'endodoncias', modulo: 'endodoncia', porPaciente: true, permisos: P, actualizadoEn: true, borrado: 'fisico',
  orden: 't.fecha_inicio DESC, t.id DESC', ...JOIN_ODONTO,
  selectExtra: "o.nombre AS odontologo_nombre, (SELECT COALESCE(json_agg(c ORDER BY c.id), '[]'::json) FROM endo_conductos c WHERE c.endodoncia_id=t.id) AS conductos",
  campos: {
    pieza: { tipo: 'pieza', requerido: true },
    tipo: { tipo: 'enum', valores: ['tratamiento', 'retratamiento', 'pulpotomia', 'pulpectomia', 'apicoformacion', 'regenerativa', 'cirugia_apical'], defecto: 'tratamiento' },
    fechaInicio: { tipo: 'fecha' },
    fechaFin: { tipo: 'fecha' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    diagnosticoPulpar: { tipo: 'enum', valores: DX_PULPAR },
    diagnosticoPeriapical: { tipo: 'enum', valores: DX_PERIAPICAL },
    pruebas: { tipo: 'json' },
    tecnicaInstrumentacion: { tipo: 'texto', max: 120 },
    sistemaLimas: { tipo: 'texto', max: 120 },
    irrigacion: { tipo: 'texto', max: 200 },
    medicacionIntraconducto: { tipo: 'texto', max: 120 },
    restauracionProvisoria: { tipo: 'texto', max: 120 },
    complicaciones: { tipo: 'texto' },
    estado: { tipo: 'enum', valores: ['en_curso', 'finalizada', 'fracaso', 'derivada', 'abandonada'], defecto: 'en_curso' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d, ctx) => {
    if (d.estado === 'finalizada' && !d.fecha_fin && !(ctx.previo && ctx.previo.fecha_fin)) d.fecha_fin = hoyIso();
    if (d.pruebas) {
      const permitidas = ['frio', 'calor', 'ept', 'percusion_vertical', 'percusion_horizontal', 'palpacion', 'movilidad', 'sondaje', 'mordida'];
      for (const k of Object.keys(d.pruebas)) if (!permitidas.includes(k)) delete d.pruebas[k];
    }
  },
  // Control del resultado del tratamiento de conducto a 6, 12 y 24 meses.
  despuesDeGuardar: async (f, ctx) => {
    if (f.estado === 'finalizada' && f.fecha_fin) {
      await controles.programar(ctx.clinicaId, {
        pacienteId: f.paciente_id, origenTipo: 'endodoncia', origenId: f.id, odontologoId: f.odontologo_id,
        controles: [6, 12, 24].map((m) => ({ titulo: `Control endodoncia ${f.pieza} — ${m} meses (clínico + Rx)`, desde: f.fecha_fin, meses: m })),
      });
    }
  },
}));

// Conductos de una endodoncia (se guardan todos juntos)
extra.put('/endodoncias/:id/conductos', requirePermiso(...EDITAR), async (req, res, next) => {
  const client = await getClient();
  try {
    const id = Number(req.params.id);
    const endo = await client.query('SELECT id FROM endodoncias WHERE clinica_id=$1 AND id=$2', [req.clinicaId, id]);
    if (!endo.rowCount) throw new ApiError(404, 'Endodoncia no encontrada');
    const lista = Array.isArray(req.body.conductos) ? req.body.conductos : [];
    const T = { texto: (n, v, max) => convertir(n, { tipo: 'texto', max }, v), mm: (n, v) => convertir(n, { tipo: 'numero', min: 0, maxNum: 40 }, v) };
    await client.query('BEGIN');
    await client.query('DELETE FROM endo_conductos WHERE endodoncia_id=$1', [id]);
    for (const c of lista) {
      const conducto = T.texto('conducto', c.conducto, 10);
      if (!conducto) throw new ApiError(400, 'Cada conducto necesita un nombre (MV, DV, P, M, D, MB2…)');
      await client.query(
        `INSERT INTO endo_conductos (endodoncia_id, conducto, referencia, longitud_tentativa_mm, longitud_trabajo_mm, localizador_apical, lima_inicial, lima_maestra, conicidad, tecnica_obturacion, cono_principal, sellador, longitud_obturacion_mm, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, conducto, T.texto('referencia', c.referencia, 40) ?? null, T.mm('longitudTentativaMm', c.longitudTentativaMm) ?? null, T.mm('longitudTrabajoMm', c.longitudTrabajoMm) ?? null,
          T.texto('localizadorApical', c.localizadorApical, 40) ?? null, T.texto('limaInicial', c.limaInicial, 20) ?? null, T.texto('limaMaestra', c.limaMaestra, 20) ?? null,
          T.texto('conicidad', c.conicidad, 10) ?? null, T.texto('tecnicaObturacion', c.tecnicaObturacion, 40) ?? null, T.texto('conoPrincipal', c.conoPrincipal, 40) ?? null,
          T.texto('sellador', c.sellador, 60) ?? null, T.mm('longitudObturacionMm', c.longitudObturacionMm) ?? null, T.texto('notas', c.notas) ?? null]
      );
    }
    await client.query('COMMIT');
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'guardar_conductos', modulo: 'endodoncia', entidadId: id, detalle: { cantidad: lista.length } });
    const r = await query('SELECT * FROM endo_conductos WHERE endodoncia_id=$1 ORDER BY id', [id]);
    res.json(r.rows);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { client.release(); }
});

// ================================ ORTODONCIA ================================
const CLASES = ['I', 'II', 'II_1', 'II_2', 'III', 'no_evaluable'];
router.use('/orto-casos', crearRecurso({
  tabla: 'orto_casos', modulo: 'ortodoncia', porPaciente: true, permisos: P, actualizadoEn: true, borrado: 'fisico', joinPaciente: true,
  orden: "(t.fase IN ('finalizada','abandonada')), t.fecha_instalacion DESC NULLS FIRST",
  selectExtra: `o.nombre AS odontologo_nombre,
    (SELECT count(*) FROM orto_visitas v WHERE v.caso_id=t.id) AS cantidad_visitas,
    (SELECT max(v.fecha) FROM orto_visitas v WHERE v.caso_id=t.id) AS ultima_visita,
    (SELECT max(v.alineador_actual) FROM orto_visitas v WHERE v.caso_id=t.id) AS alineador_actual,
    (SELECT COALESCE(sum(v.brackets_despegados),0) FROM orto_visitas v WHERE v.caso_id=t.id) AS total_brackets_despegados,
    (SELECT round(avg(v.colaboracion),1) FROM orto_visitas v WHERE v.caso_id=t.id) AS colaboracion_promedio,
    (SELECT round(avg(v.higiene),1) FROM orto_visitas v WHERE v.caso_id=t.id) AS higiene_promedio`,
  joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  filtros: { fase: { col: 'fase' } },
  campos: {
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    claseMolarDerecha: { tipo: 'enum', valores: CLASES }, claseMolarIzquierda: { tipo: 'enum', valores: CLASES },
    claseCaninaDerecha: { tipo: 'enum', valores: CLASES }, claseCaninaIzquierda: { tipo: 'enum', valores: CLASES },
    overjetMm: { tipo: 'numero', min: -15, maxNum: 20 }, overbiteMm: { tipo: 'numero', min: -15, maxNum: 20 },
    mordidaCruzada: { tipo: 'texto', max: 60 }, apinamiento: { tipo: 'texto', max: 60 }, lineaMedia: { tipo: 'texto', max: 60 },
    diagnostico: { tipo: 'texto' }, objetivos: { tipo: 'texto' },
    tipoAparatologia: { tipo: 'enum', valores: ['brackets_metalicos', 'brackets_esteticos', 'autoligado', 'linguales', 'alineadores', 'removible', 'funcional', 'expansor', 'otro'], defecto: 'brackets_metalicos' },
    marca: { tipo: 'texto', max: 80 },
    totalAlineadores: { tipo: 'entero', min: 1, maxNum: 200 },
    diasPorAlineador: { tipo: 'entero', min: 1, maxNum: 60 },
    fechaInstalacion: { tipo: 'fecha' }, fechaRetiroEstimada: { tipo: 'fecha' }, fechaRetiroReal: { tipo: 'fecha' },
    honorarioTotal: { tipo: 'numero', min: 0 }, entregaInicial: { tipo: 'numero', min: 0 }, cuotaMensual: { tipo: 'numero', min: 0 },
    fase: { tipo: 'enum', valores: ['diagnostico', 'activa', 'contencion', 'finalizada', 'abandonada'], defecto: 'diagnostico' },
    contencionSuperior: { tipo: 'texto', max: 80 }, contencionInferior: { tipo: 'texto', max: 80 },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d, ctx) => {
    if (d.fase === 'contencion' && !d.fecha_retiro_real && !(ctx.previo && ctx.previo.fecha_retiro_real)) d.fecha_retiro_real = hoyIso();
  },
  despuesDeGuardar: async (f, ctx) => {
    if (f.fase === 'activa') await recall(ctx, f.paciente_id, 'control_ortodoncia', { ultimaFecha: hoyIso(), odontologoId: f.odontologo_id });
    // Contención: controles a 1, 3, 6 y 12 meses del retiro + recall semestral.
    if (f.fase === 'contencion' && f.fecha_retiro_real) {
      await controles.programar(ctx.clinicaId, {
        pacienteId: f.paciente_id, origenTipo: 'ortodoncia', origenId: f.id, odontologoId: f.odontologo_id,
        controles: [1, 3, 6, 12].map((m) => ({ titulo: `Control de contención — ${m} ${m === 1 ? 'mes' : 'meses'} post-retiro`, desde: f.fecha_retiro_real, meses: m })),
      });
      await recall(ctx, f.paciente_id, 'contencion_ortodoncia', { ultimaFecha: f.fecha_retiro_real, odontologoId: f.odontologo_id });
      // La activación mensual ya no corresponde.
      await query(`UPDATE paciente_recalls SET estado='desactivado', motivo_estado='Fin de la fase activa de ortodoncia', actualizado_en=now()
                    WHERE clinica_id=$1 AND paciente_id=$2 AND recall_tipo_id=(SELECT id FROM recall_tipos WHERE clinica_id=$1 AND codigo='control_ortodoncia')`, [ctx.clinicaId, f.paciente_id]);
    }
  },
}));

router.use('/orto-visitas', crearRecurso({
  tabla: 'orto_visitas', modulo: 'ortodoncia', permisos: P, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC', ...JOIN_ODONTO,
  filtros: { casoId: { col: 'caso_id', tipo: 'id' } },
  campos: {
    casoId: { tipo: 'id', requerido: true, ref: 'orto_casos', soloCrear: true },
    fecha: { tipo: 'fecha' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    arcoSuperior: { tipo: 'texto', max: 60 }, arcoInferior: { tipo: 'texto', max: 60 },
    elasticos: { tipo: 'texto', max: 80 },
    alineadorActual: { tipo: 'entero', min: 0, maxNum: 200 },
    bracketsDespegados: { tipo: 'entero', min: 0, maxNum: 40, defecto: 0 },
    higiene: { tipo: 'entero', min: 1, maxNum: 5 },
    colaboracion: { tipo: 'entero', min: 1, maxNum: 5 },
    procedimiento: { tipo: 'texto' }, proximoPaso: { tipo: 'texto' }, notas: { tipo: 'texto' },
    turnoId: { tipo: 'id', ref: 'turnos' },
  },
  despuesDeGuardar: async (f, ctx) => {
    // Cada visita de ortodoncia completa el recall de control mensual.
    const c = await query('SELECT paciente_id FROM orto_casos WHERE id=$1', [f.caso_id]);
    if (c.rowCount) await recall(ctx, c.rows[0].paciente_id, 'control_ortodoncia', { ultimaFecha: String(f.fecha).slice(0, 10), odontologoId: f.odontologo_id });
  },
}));

// ================================ PREVENTIVOS ================================
router.use('/preventivos', crearRecurso({
  tabla: 'preventivos', modulo: 'prevencion', porPaciente: true, permisos: P, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC', ...JOIN_ODONTO,
  campos: {
    tipo: { tipo: 'enum', valores: ['sellante', 'fluor_barniz', 'fluor_gel', 'profilaxis', 'ionomero_preventivo', 'clorhexidina', 'diamino_fluoruro_plata', 'infiltracion_resina', 'otro'], requerido: true },
    pieza: { tipo: 'pieza' },
    producto: { tipo: 'texto', max: 120 },
    lote: { tipo: 'texto', max: 60 },
    fecha: { tipo: 'fecha' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    estadoRetencion: { tipo: 'enum', valores: ['completa', 'parcial', 'perdida'] },
    fechaRevision: { tipo: 'fecha' },
    notas: { tipo: 'texto' },
  },
  despuesDeGuardar: async (f, ctx) => {
    const fecha = String(f.fecha).slice(0, 10);
    if (f.tipo === 'sellante') await recall(ctx, f.paciente_id, 'sellantes', { ultimaFecha: fecha, odontologoId: f.odontologo_id });
    if (['fluor_barniz', 'fluor_gel', 'diamino_fluoruro_plata'].includes(f.tipo)) await recall(ctx, f.paciente_id, 'fluor', { ultimaFecha: fecha, odontologoId: f.odontologo_id });
    if (f.tipo === 'profilaxis') await recall(ctx, f.paciente_id, 'profilaxis', { ultimaFecha: fecha, odontologoId: f.odontologo_id });
  },
}));

// ============================ RIESGO DE CARIES ============================
// Evaluación simplificada tipo CAMBRA. Se calcula en el servidor.
const INDICADORES = ['cavidades_visibles', 'lesiones_en_dentina_rx', 'manchas_blancas', 'restauraciones_ultimos_3_anios'];
const RIESGO = ['placa_visible', 'fosas_profundas', 'snacks_frecuentes', 'bebidas_azucaradas', 'hiposalivacion', 'medicamentos_xerostomia', 'aparatologia_ortodoncia', 'raices_expuestas', 'recuento_bacteriano_alto', 'protesis_parcial', 'padres_con_caries'];
const PROTECCION = ['pasta_fluorada_2_veces', 'colutorio_fluor', 'barniz_fluor_ultimos_6m', 'agua_fluorada', 'xilitol', 'clorhexidina', 'saliva_normal'];

function evaluarRiesgoCaries(ind, rie, pro) {
  const nInd = INDICADORES.filter((k) => ind[k]).length;
  const nRie = RIESGO.filter((k) => rie[k]).length;
  const nPro = PROTECCION.filter((k) => pro[k]).length;
  let nivel = 'bajo';
  if (nInd > 0 && (rie.hiposalivacion || rie.medicamentos_xerostomia)) nivel = 'extremo';
  else if (nInd > 0 || nRie >= 3) nivel = 'alto';
  else if (nRie > nPro || nRie >= 1) nivel = 'moderado';
  const recall = { bajo: 12, moderado: 6, alto: 4, extremo: 3 }[nivel];
  const recomendaciones = {
    bajo: 'Control anual; pasta con flúor 1000-1450 ppm dos veces al día.',
    moderado: 'Control cada 6 meses; pasta con flúor; barniz de flúor en cada control; reducir frecuencia de azúcares.',
    alto: 'Control cada 3-4 meses; barniz de flúor cada 3-4 meses; pasta de alta concentración de flúor (5000 ppm) en adultos; sellantes en fosas profundas; asesoramiento dietético.',
    extremo: 'Control cada 3 meses; barniz de flúor y clorhexidina; pasta 5000 ppm; sustitutos salivales y manejo de la xerostomía; sellantes; asesoramiento dietético.',
  }[nivel];
  return { nivel, recall, recomendaciones, conteo: { indicadores: nInd, riesgo: nRie, proteccion: nPro } };
}

router.use('/riesgo-caries', crearRecurso({
  tabla: 'riesgo_caries', modulo: 'prevencion', porPaciente: true, permisos: P, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC', ...JOIN_ODONTO,
  campos: {
    fecha: { tipo: 'fecha' },
    indicadores: { tipo: 'json' }, factoresRiesgo: { tipo: 'json' }, factoresProteccion: { tipo: 'json' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d, ctx) => {
    const p = ctx.previo || {};
    const ev = evaluarRiesgoCaries(d.indicadores ?? p.indicadores ?? {}, d.factores_riesgo ?? p.factores_riesgo ?? {}, d.factores_proteccion ?? p.factores_proteccion ?? {});
    d.nivel = ev.nivel;
    d.recall_sugerido_meses = ev.recall;
    d.recomendaciones = ev.recomendaciones;
  },
  despuesDeGuardar: async (f, ctx) => {
    await recall(ctx, f.paciente_id, 'profilaxis', { intervaloMeses: f.recall_sugerido_meses, ultimaFecha: String(f.fecha).slice(0, 10), odontologoId: f.odontologo_id, notas: `Riesgo de caries ${f.nivel}` });
    if (['alto', 'extremo'].includes(f.nivel)) await recall(ctx, f.paciente_id, 'fluor', { intervaloMeses: f.nivel === 'extremo' ? 3 : 4, ultimaFecha: String(f.fecha).slice(0, 10), odontologoId: f.odontologo_id });
  },
}));

extra.get('/riesgo-caries-catalogo', requirePermiso(...VER), (req, res) => res.json({ indicadores: INDICADORES, riesgo: RIESGO, proteccion: PROTECCION }));

// ============================ EVALUACIONES ============================
// ASA (riesgo anestésico), Frankl (conducta infantil), EVA (dolor 0-10),
// Corah (ansiedad dental), O'Leary (índice de placa %), Mallampati.
const VALORES_EVAL = {
  asa: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  frankl: ['1', '2', '3', '4'],
  eva_dolor: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  corah: null, // 4-20
  oleary: null, // 0-100 %
  mallampati: ['I', 'II', 'III', 'IV'],
  bruxismo: ['ausente', 'posible', 'probable', 'definitivo'],
  apertura_bucal_mm: null,
};
router.use('/evaluaciones', crearRecurso({
  tabla: 'evaluaciones_clinicas', modulo: 'evaluaciones', porPaciente: true, permisos: P, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC', ...JOIN_ODONTO,
  filtros: { tipo: { col: 'tipo' } },
  campos: {
    tipo: { tipo: 'enum', valores: Object.keys(VALORES_EVAL), requerido: true },
    valor: { tipo: 'texto', requerido: true, max: 30 },
    detalle: { tipo: 'json' },
    fecha: { tipo: 'fecha' },
    turnoId: { tipo: 'id', ref: 'turnos' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d, ctx) => {
    const tipo = d.tipo || (ctx.previo && ctx.previo.tipo);
    const valor = d.valor !== undefined ? d.valor : ctx.previo && ctx.previo.valor;
    const permitidos = VALORES_EVAL[tipo];
    if (permitidos && !permitidos.includes(String(valor))) throw new ApiError(400, `Valor inválido para ${tipo}. Opciones: ${permitidos.join(', ')}`);
    const n = Number(valor);
    if (tipo === 'corah' && !(Number.isInteger(n) && n >= 4 && n <= 20)) throw new ApiError(400, 'La escala de Corah va de 4 a 20');
    if (tipo === 'oleary' && !(n >= 0 && n <= 100)) throw new ApiError(400, "El índice de O'Leary es un porcentaje de 0 a 100");
    if (tipo === 'apertura_bucal_mm' && !(n >= 0 && n <= 80)) throw new ApiError(400, 'Apertura bucal fuera de rango (0-80 mm)');
  },
}));

// ================================ BIOPSIAS ================================
router.use('/biopsias', crearRecurso({
  tabla: 'biopsias', modulo: 'biopsias', porPaciente: true, permisos: P, actualizadoEn: true, borrado: 'fisico', joinPaciente: true,
  orden: "(t.estado='cerrada'), t.fecha_toma DESC", selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  filtros: { estado: { col: 'estado' } },
  campos: {
    zona: { tipo: 'texto', requerido: true, max: 120 },
    tipo: { tipo: 'enum', valores: ['incisional', 'excisional', 'puncion', 'citologia', 'cepillado'], defecto: 'incisional' },
    descripcionLesion: { tipo: 'texto' },
    fechaToma: { tipo: 'fecha' },
    laboratorioPatologia: { tipo: 'texto', max: 150 },
    fechaEnvio: { tipo: 'fecha' },
    fechaResultado: { tipo: 'fecha' },
    diagnosticoHistopatologico: { tipo: 'texto' },
    requiereSeguimiento: { tipo: 'bool' },
    estado: { tipo: 'enum', valores: ['tomada', 'enviada', 'resultado_recibido', 'informada_paciente', 'cerrada'], defecto: 'tomada' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d) => {
    if (d.estado === 'enviada' && !d.fecha_envio) d.fecha_envio = hoyIso();
    if (d.estado === 'resultado_recibido' && !d.fecha_resultado) d.fecha_resultado = hoyIso();
  },
  despuesDeGuardar: async (f, ctx) => {
    if (f.requiere_seguimiento && f.fecha_resultado) {
      await controles.programar(ctx.clinicaId, {
        pacienteId: f.paciente_id, origenTipo: 'biopsia', origenId: f.id, odontologoId: f.odontologo_id,
        controles: [{ titulo: `Control de lesión biopsiada (${f.zona}) — 3 meses`, desde: f.fecha_resultado, meses: 3 }, { titulo: `Control de lesión biopsiada (${f.zona}) — 6 meses`, desde: f.fecha_resultado, meses: 6 }],
      });
    }
  },
}));

// ================================ ANESTESIA ================================
router.use('/anestesias', crearRecurso({
  tabla: 'anestesias', modulo: 'anestesia', porPaciente: true, permisos: P, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC', ...JOIN_ODONTO,
  campos: {
    fecha: { tipo: 'fecha' },
    turnoId: { tipo: 'id', ref: 'turnos' },
    anestesico: { tipo: 'enum', valores: ['lidocaina', 'articaina', 'mepivacaina', 'prilocaina', 'bupivacaina', 'topica', 'otro'], requerido: true },
    concentracion: { tipo: 'texto', max: 20 },
    vasoconstrictor: { tipo: 'texto', max: 40 },
    cartuchos: { tipo: 'numero', min: 0.25, maxNum: 15, defecto: 1 },
    tecnica: { tipo: 'enum', valores: ['infiltrativa', 'troncular_dentario_inferior', 'mentoniana', 'infraorbitaria', 'palatina', 'nasopalatina', 'intraligamentaria', 'intrapulpar', 'topica', 'otra'] },
    zona: { tipo: 'texto', max: 80 },
    lote: { tipo: 'texto', max: 60 },
    reaccionAdversa: { tipo: 'texto' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
  },
}));

// Dosis máxima orientativa de anestésico por peso (mg/kg y tope absoluto).
extra.get('/anestesia-dosis-maxima', requirePermiso(...VER), (req, res, next) => {
  try {
    const peso = Number(req.query.pesoKg);
    if (!(peso > 0 && peso < 300)) throw new ApiError(400, 'Indicá el peso en kg');
    // Cartucho de 1,8 ml. mg por cartucho según concentración habitual.
    const tabla = [
      { anestesico: 'Lidocaína 2% con epinefrina', mgKg: 7, max: 500, mgCartucho: 36 },
      { anestesico: 'Articaína 4% con epinefrina', mgKg: 7, max: 500, mgCartucho: 72 },
      { anestesico: 'Mepivacaína 3% sin vasoconstrictor', mgKg: 6.6, max: 400, mgCartucho: 54 },
      { anestesico: 'Mepivacaína 2% con vasoconstrictor', mgKg: 6.6, max: 400, mgCartucho: 36 },
      { anestesico: 'Prilocaína 3% con felipresina', mgKg: 8, max: 600, mgCartucho: 54 },
      { anestesico: 'Bupivacaína 0,5% con epinefrina', mgKg: 1.3, max: 90, mgCartucho: 9 },
    ];
    res.json({
      pesoKg: peso,
      dosis: tabla.map((t) => {
        const mg = Math.min(t.mgKg * peso, t.max);
        return { anestesico: t.anestesico, mgMaximos: Math.round(mg), cartuchosMaximos: Math.floor((mg / t.mgCartucho) * 10) / 10 };
      }),
      aviso: 'Valores orientativos para adultos sanos; reducir en niños, ancianos, cardiópatas y hepatópatas.',
    });
  } catch (e) { next(e); }
});

// ============================ PIEZAS EN OBSERVACIÓN ============================
router.use('/observaciones', crearRecurso({
  tabla: 'piezas_observacion', modulo: 'seguimiento', porPaciente: true,
  permisos: { ver: [...VER, 'seguimiento.view'], editar: ['especialidades.edit', 'pacientes.clinical.edit', 'odontograma.edit'] },
  actualizadoEn: true, borrado: 'fisico', joinPaciente: true, orden: "(t.estado <> 'en_observacion'), t.fecha_reevaluacion NULLS LAST",
  selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  filtros: { estado: { col: 'estado' }, hasta: { col: 'fecha_reevaluacion', op: '<=', tipo: 'fecha' } },
  campos: {
    pieza: { tipo: 'pieza', requerido: true },
    superficie: { tipo: 'texto', max: 30 },
    hallazgo: { tipo: 'texto', requerido: true, max: 120 },
    detalle: { tipo: 'texto' },
    fechaDeteccion: { tipo: 'fecha' },
    fechaReevaluacion: { tipo: 'fecha' },
    estado: { tipo: 'enum', valores: ['en_observacion', 'estable', 'progreso', 'tratada', 'descartada'], defecto: 'en_observacion' },
    resultado: { tipo: 'texto' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
  },
}));

// ============================ CONTROLES PROGRAMADOS ============================
router.use('/controles', crearRecurso({
  tabla: 'controles_programados', modulo: 'seguimiento', porPaciente: true,
  permisos: { ver: [...VER, 'seguimiento.view', 'recalls.view'], editar: ['especialidades.edit', 'seguimiento.manage'] },
  actualizadoEn: true, borrado: 'fisico', joinPaciente: true, orden: "(t.estado <> 'pendiente'), t.fecha_programada",
  selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  filtros: { estado: { col: 'estado' }, hasta: { col: 'fecha_programada', op: '<=', tipo: 'fecha' }, desde: { col: 'fecha_programada', op: '>=', tipo: 'fecha' }, origenTipo: { col: 'origen_tipo' } },
  campos: {
    origenTipo: { tipo: 'enum', valores: ['endodoncia', 'implante', 'ortodoncia', 'biopsia', 'periodoncia', 'protesis', 'cirugia', 'preventivo', 'observacion', 'otro'], defecto: 'otro' },
    origenId: { tipo: 'entero' },
    titulo: { tipo: 'texto', requerido: true, max: 150 },
    fechaProgramada: { tipo: 'fecha', requerido: true },
    fechaRealizada: { tipo: 'fecha' },
    estado: { tipo: 'enum', valores: ['pendiente', 'realizado', 'no_asistio', 'cancelado'], defecto: 'pendiente' },
    resultado: { tipo: 'enum', valores: ['sanado', 'en_curacion', 'no_sanado', 'incierto', 'sano', 'mucositis', 'periimplantitis', 'estable', 'progreso', 'recidiva', 'retencion_completa', 'retencion_parcial', 'perdido', 'requiere_tratamiento', 'normal'] },
    datos: { tipo: 'json' },
    notas: { tipo: 'texto' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    turnoId: { tipo: 'id', ref: 'turnos' },
  },
  antesDeGuardar: async (d) => {
    if (d.estado === 'realizado' && !d.fecha_realizada) d.fecha_realizada = hoyIso();
  },
}));

router.use('/', extra);
module.exports = router;
