const express = require('express');
const { query } = require('../../config/db');
const { crearRecurso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const perio = require('./periodoncia.service');

const VER = ['periodoncia.edit', 'pacientes.clinical.view', 'odontograma.view'];
const EDITAR = ['periodoncia.edit'];
const router = express.Router();

async function edadPaciente(clinicaId, pacienteId) {
  const r = await query('SELECT fecha_nacimiento FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]);
  const f = r.rows[0] && r.rows[0].fecha_nacimiento;
  if (!f) return null;
  const [y, m, d] = String(f).split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--;
  return edad;
}

const rutasExtra = express.Router();
rutasExtra.use(authMiddleware, resolverClinicaMiddleware);

// Comparación entre dos exámenes del mismo paciente
rutasExtra.get('/examenes/comparar', requirePermiso(...VER), async (req, res, next) => {
  try {
    const ids = [Number(req.query.a), Number(req.query.b)];
    const r = await query('SELECT * FROM perio_examenes WHERE clinica_id=$1 AND id = ANY($2::int[])', [req.clinicaId, ids]);
    if (r.rowCount !== 2) throw new ApiError(404, 'Examen no encontrado');
    if (r.rows[0].paciente_id !== r.rows[1].paciente_id) throw new ApiError(400, 'Los exámenes son de pacientes distintos');
    const [a, b] = r.rows.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)) || x.id - y.id);
    res.json(perio.comparar(a, b));
  } catch (e) { next(e); }
});
// Evolución de índices en el tiempo (para gráfico)
rutasExtra.get('/paciente/:pacienteId/evolucion', requirePermiso(...VER), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, fecha, tipo, indices, estadio, grado, extension FROM perio_examenes WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha, id`,
      [req.clinicaId, Number(req.params.pacienteId)]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});
router.use('/', rutasExtra);

router.use('/examenes', crearRecurso({
  tabla: 'perio_examenes', modulo: 'periodoncia', porPaciente: true, permisos: { ver: VER, editar: EDITAR, borrar: EDITAR },
  creadoPor: 'creado_por', actualizadoEn: true, borrado: 'fisico', orden: 't.fecha DESC, t.id DESC',
  selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id = t.odontologo_id',
  campos: {
    fecha: { tipo: 'fecha' },
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    tipo: { tipo: 'enum', valores: ['completo', 'reevaluacion', 'mantenimiento', 'inicial'], defecto: 'completo' },
    datos: { tipo: 'json', requerido: true },
    estadio: { tipo: 'enum', valores: ['I', 'II', 'III', 'IV'] },
    grado: { tipo: 'enum', valores: ['A', 'B', 'C'] },
    extension: { tipo: 'enum', valores: ['localizada', 'generalizada', 'incisivo_molar'] },
    diagnostico: { tipo: 'texto' },
    fumador: { tipo: 'bool' },
    diabetes: { tipo: 'bool' },
    notas: { tipo: 'texto' },
  },
  // Los índices SIEMPRE se calculan en el servidor a partir de las mediciones.
  antesDeGuardar: async (d, ctx) => {
    const pacienteId = d.paciente_id || (ctx.previo && ctx.previo.paciente_id);
    if (d.datos !== undefined) d.datos = perio.normalizarDatos(d.datos);
    const datos = d.datos !== undefined ? d.datos : ctx.previo.datos;
    const fumador = d.fumador !== undefined ? d.fumador : ctx.previo && ctx.previo.fumador;
    const diabetes = d.diabetes !== undefined ? d.diabetes : ctx.previo && ctx.previo.diabetes;
    d.indices = perio.calcularIndices(datos, { fumador, diabetes, edad: await edadPaciente(ctx.clinicaId, pacienteId) });
  },
  // Si el odontólogo confirma periodontitis (estadio), queda programado el
  // mantenimiento periodontal (3 meses, o 4 si es estadio I).
  despuesDeGuardar: async (fila, ctx) => {
    if (fila.estadio) {
      try {
        const recalls = require('../recalls/recalls.service');
        await recalls.asignarPorCodigo(ctx.clinicaId, fila.paciente_id, 'perio_mantenimiento',
          { intervaloMeses: fila.estadio === 'I' ? 4 : 3, ultimaFecha: String(fila.fecha).slice(0, 10), odontologoId: fila.odontologo_id, notas: `Periodontitis estadio ${fila.estadio}${fila.grado ? ' grado ' + fila.grado : ''}` },
          ctx.usuario);
      } catch (e) { console.error('[perio] recall no programado:', e.message); }
    }
  },
}));

router.use('/psr', crearRecurso({
  tabla: 'psr_registros', modulo: 'periodoncia', porPaciente: true, permisos: { ver: VER, editar: EDITAR }, borrado: 'fisico', orden: 't.fecha DESC',
  campos: Object.fromEntries([
    ['fecha', { tipo: 'fecha' }], ['odontologoId', { tipo: 'id', ref: 'odontologos' }], ['notas', { tipo: 'texto' }],
    ...['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => [s, { tipo: 'enum', valores: ['0', '1', '2', '3', '4', '0*', '1*', '2*', '3*', '4*', 'X'] }]),
  ]),
}));

module.exports = router;
