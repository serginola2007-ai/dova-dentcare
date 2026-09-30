const express = require('express');
const { crearRecurso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const service = require('./salud.service');
const { CONDICIONES, FAMILIAS } = require('./salud.reglas');

const VER = ['salud.view', 'salud.edit', 'pacientes.clinical.view'];
const EDITAR = ['salud.edit'];
const P = { ver: VER, editar: EDITAR };

const router = express.Router();

router.use('/alergias', crearRecurso({
  tabla: 'paciente_alergias', modulo: 'salud', porPaciente: true, permisos: P, creadoPor: 'creado_por', actualizadoEn: true, borrado: 'fisico',
  orden: 't.activa DESC, t.sustancia',
  campos: {
    sustancia: { tipo: 'texto', requerido: true, max: 120 },
    tipo: { tipo: 'enum', valores: ['medicamento', 'alimento', 'material', 'ambiental', 'otro'], defecto: 'medicamento' },
    reaccion: { tipo: 'texto', max: 200 },
    severidad: { tipo: 'enum', valores: ['leve', 'moderada', 'severa', 'anafilaxia'], defecto: 'moderada' },
    activa: { tipo: 'bool' },
    notas: { tipo: 'texto' },
  },
  // Evita cargar dos veces la misma alergia activa (se edita la existente),
  // también si dos personas la cargan al mismo tiempo.
  candado: (d) => d.sustancia && `${d.paciente_id}:${String(d.sustancia).toLowerCase().trim()}`,
  antesDeGuardar: async (d, ctx) => {
    if (!ctx.creando || !d.sustancia) return;
    const { query } = require('../../config/db');
    const { ApiError } = require('../../middlewares/error.middleware');
    const ya = await query('SELECT id FROM paciente_alergias WHERE clinica_id=$1 AND paciente_id=$2 AND activa AND lower(sustancia)=lower($3)', [ctx.clinicaId, d.paciente_id, d.sustancia]);
    if (ya.rowCount) throw new ApiError(409, `La alergia a "${d.sustancia}" ya está registrada: editá la existente.`);
  },
}));

router.use('/medicacion', crearRecurso({
  tabla: 'paciente_medicacion', modulo: 'salud', porPaciente: true, permisos: P, creadoPor: 'creado_por', actualizadoEn: true, borrado: 'fisico',
  orden: 't.activa DESC, t.medicamento',
  campos: {
    medicamento: { tipo: 'texto', requerido: true, max: 150 },
    dosis: { tipo: 'texto', max: 80 },
    frecuencia: { tipo: 'texto', max: 80 },
    indicacion: { tipo: 'texto', max: 200 },
    fechaInicio: { tipo: 'fecha' },
    fechaFin: { tipo: 'fecha' },
    activa: { tipo: 'bool' },
    notas: { tipo: 'texto' },
  },
}));

router.use('/condiciones', crearRecurso({
  tabla: 'paciente_condiciones', modulo: 'salud', porPaciente: true, permisos: P, creadoPor: 'creado_por', actualizadoEn: true, borrado: 'fisico',
  orden: "(t.estado='resuelta'), t.condicion",
  campos: {
    condicion: { tipo: 'enum', valores: Object.keys(CONDICIONES), requerido: true },
    detalle: { tipo: 'texto', max: 250 },
    estado: { tipo: 'enum', valores: ['activa', 'controlada', 'resuelta'], defecto: 'activa' },
    fechaDiagnostico: { tipo: 'fecha' },
    requierePremedicacion: { tipo: 'bool' },
    notas: { tipo: 'texto' },
  },
}));

// Preguntas estándar del cuestionario de salud (se guardan como respuestas jsonb).
const PREGUNTAS_ANAMNESIS = [
  ['tratamiento_medico', '¿Está bajo tratamiento médico actualmente?'],
  ['internaciones', '¿Estuvo internado u operado en los últimos 5 años?'],
  ['sangrado', '¿Sangra mucho cuando se corta o después de una extracción?'],
  ['reaccion_anestesia', '¿Tuvo alguna reacción a la anestesia dental?'],
  ['presion', '¿Tiene presión alta o baja?'],
  ['corazon', '¿Tiene problemas cardíacos, soplo o válvula artificial?'],
  ['diabetes', '¿Tiene diabetes?'],
  ['respiratorio', '¿Tiene asma u otro problema respiratorio?'],
  ['convulsiones', '¿Tuvo convulsiones o desmayos?'],
  ['hepatitis', '¿Tuvo hepatitis u otra enfermedad del hígado?'],
  ['rinon', '¿Tiene problemas renales?'],
  ['infecciosas', '¿Tiene alguna enfermedad infecciosa (VIH, tuberculosis, etc.)?'],
  ['huesos', '¿Toma o tomó medicación para los huesos (bifosfonatos)?'],
  ['radioterapia', '¿Recibió radioterapia o quimioterapia?'],
  ['embarazo', '¿Está embarazada o puede estarlo?'],
  ['lactancia', '¿Está amamantando?'],
  ['fuma', '¿Fuma? ¿Cuánto?'],
  ['alcohol', '¿Consume alcohol con frecuencia?'],
  ['bruxismo', '¿Aprieta o rechina los dientes?'],
  ['atm', '¿Siente dolor o ruidos al abrir la boca?'],
  ['sangrado_encias', '¿Le sangran las encías al cepillarse?'],
  ['sensibilidad', '¿Tiene sensibilidad al frío o al calor?'],
  ['ultima_visita', '¿Cuándo fue su última visita al dentista?'],
  ['cepillado', '¿Cuántas veces al día se cepilla? ¿Usa hilo dental?'],
];

router.use('/anamnesis', crearRecurso({
  tabla: 'anamnesis', modulo: 'salud', porPaciente: true, permisos: P, creadoPor: 'registrado_por', borrado: false,
  orden: 't.fecha DESC, t.id DESC',
  campos: {
    fecha: { tipo: 'fecha' },
    respuestas: { tipo: 'json' },
    observaciones: { tipo: 'texto' },
    firmada: { tipo: 'bool' },
    firma: { tipo: 'texto', max: 400000 },
    vigenciaMeses: { tipo: 'entero', min: 1, maxNum: 60 },
  },
}));

router.use('/signos', crearRecurso({
  tabla: 'signos_vitales', modulo: 'salud', porPaciente: true, permisos: P, creadoPor: 'registrado_por', borrado: 'fisico',
  orden: 't.fecha DESC',
  campos: {
    fecha: { tipo: 'fechahora' },
    turnoId: { tipo: 'id', ref: 'turnos' },
    presionSistolica: { tipo: 'entero', min: 50, maxNum: 300 },
    presionDiastolica: { tipo: 'entero', min: 20, maxNum: 200 },
    pulso: { tipo: 'entero', min: 20, maxNum: 250 },
    temperatura: { tipo: 'numero', min: 30, maxNum: 45 },
    spo2: { tipo: 'entero', min: 50, maxNum: 100 },
    frecuenciaRespiratoria: { tipo: 'entero', min: 4, maxNum: 80 },
    glucemia: { tipo: 'entero', min: 20, maxNum: 800 },
    pesoKg: { tipo: 'numero', min: 1, maxNum: 400 },
    tallaCm: { tipo: 'numero', min: 30, maxNum: 250 },
    notas: { tipo: 'texto' },
  },
  // IMC calculado en el servidor (nunca confiado al cliente).
  antesDeGuardar: async (d, ctx) => {
    const peso = d.peso_kg ?? (ctx.previo && ctx.previo.peso_kg);
    const talla = d.talla_cm ?? (ctx.previo && ctx.previo.talla_cm);
    if (peso && talla) d.imc = Math.round((Number(peso) / ((Number(talla) / 100) ** 2)) * 10) / 10;
  },
}));

router.use('/alertas-manuales', crearRecurso({
  tabla: 'paciente_alertas', modulo: 'salud', porPaciente: true,
  permisos: { ver: [...VER, 'pacientes.view'], editar: ['salud.edit', 'seguimiento.manage'] },
  creadoPor: 'creado_por', actualizadoEn: true, borrado: 'fisico',
  campos: {
    texto: { tipo: 'texto', requerido: true, max: 300 },
    nivel: { tipo: 'enum', valores: ['info', 'atencion', 'critica'], defecto: 'atencion' },
    emergente: { tipo: 'bool' },
    activa: { tipo: 'bool' },
  },
}));

const extra = express.Router();
extra.use(authMiddleware, resolverClinicaMiddleware);
extra.get('/catalogos', requirePermiso(...VER, 'pacientes.view'), (req, res) => {
  res.json({
    condiciones: Object.entries(CONDICIONES).map(([codigo, c]) => ({ codigo, nombre: c.nombre, nivel: c.nivel, mensaje: c.mensaje })),
    familias: Object.keys(FAMILIAS),
    preguntasAnamnesis: PREGUNTAS_ANAMNESIS.map(([codigo, texto]) => ({ codigo, texto })),
  });
});
// Alertas: las ve cualquiera que atienda al paciente (recepción incluida),
// porque una alergia grave o un anticoagulante importan desde el turno.
extra.get('/paciente/:pacienteId/alertas', requirePermiso(...VER, 'pacientes.view'), async (req, res, next) => {
  try { res.json(await service.alertas(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
});
extra.get('/paciente/:pacienteId/resumen', requirePermiso(...VER), async (req, res, next) => {
  try { res.json(await service.resumen(req.clinicaId, Number(req.params.pacienteId))); } catch (e) { next(e); }
});
extra.post('/verificar-medicamentos', requirePermiso(...VER, 'recetas.manage'), async (req, res, next) => {
  try { res.json(await service.verificarMedicamentos(req.clinicaId, Number(req.body.pacienteId), req.body.medicamentos)); } catch (e) { next(e); }
});
router.use('/', extra);

module.exports = router;
