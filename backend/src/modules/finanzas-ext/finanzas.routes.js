const express = require('express');
const { query, conCandado } = require('../../config/db');
const { crearRecurso, hoyIso } = require('../../utils/recurso');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const s = require('./cuentas.service');

const router = express.Router();
const ASEG = { ver: ['aseguradoras.manage', 'presupuestos.view', 'pagos.view'], editar: ['aseguradoras.manage'] };

router.use('/aseguradoras', crearRecurso({
  tabla: 'aseguradoras', modulo: 'aseguradoras', permisos: ASEG, borrado: 'logico:activa', orden: 't.nombre',
  selectExtra: '(SELECT count(*) FROM aseguradora_planes ap WHERE ap.aseguradora_id=t.id AND ap.activo) AS planes',
  campos: {
    nombre: { tipo: 'texto', requerido: true, max: 150 },
    tipo: { tipo: 'enum', valores: ['seguro', 'prepaga', 'convenio', 'mutual', 'empresa', 'ips'], defecto: 'prepaga' },
    ruc: { tipo: 'texto', max: 30 }, contacto: { tipo: 'texto', max: 120 }, telefono: { tipo: 'texto', max: 40 }, email: { tipo: 'texto', max: 150 },
    notas: { tipo: 'texto' }, activa: { tipo: 'bool' },
  },
}));

router.use('/planes-cobertura', crearRecurso({
  tabla: 'aseguradora_planes', modulo: 'aseguradoras', permisos: ASEG, borrado: 'logico:activo', orden: 'a.nombre, t.nombre',
  selectExtra: 'a.nombre AS aseguradora_nombre', joins: 'JOIN aseguradoras a ON a.id=t.aseguradora_id',
  filtros: { aseguradoraId: { col: 'aseguradora_id', tipo: 'id' } },
  campos: {
    aseguradoraId: { tipo: 'id', requerido: true, ref: 'aseguradoras', soloCrear: true },
    nombre: { tipo: 'texto', requerido: true, max: 120 },
    coberturaGeneral: { tipo: 'numero', min: 0, maxNum: 100, defecto: 0 },
    cobertura: { tipo: 'json' },
    topeAnual: { tipo: 'numero', min: 0 }, copagoFijo: { tipo: 'numero', min: 0 },
    requiereAutorizacion: { tipo: 'bool' }, activo: { tipo: 'bool' },
  },
  antesDeGuardar: async (d) => {
    if (d.cobertura) for (const [k, v] of Object.entries(d.cobertura)) {
      const n = Number(v);
      if (!(n >= 0 && n <= 100)) throw new ApiError(400, `Cobertura de "${k}" debe ser un porcentaje de 0 a 100`);
      d.cobertura[k] = n;
    }
  },
}));

router.use('/coberturas', crearRecurso({
  tabla: 'paciente_coberturas', modulo: 'aseguradoras', porPaciente: true,
  permisos: { ver: [...ASEG.ver, 'pacientes.view'], editar: ['aseguradoras.manage', 'pacientes.edit'] }, borrado: 'fisico',
  orden: 't.principal DESC, t.id DESC',
  selectExtra: 'ap.nombre AS plan_nombre, ap.cobertura_general, ap.requiere_autorizacion, a.nombre AS aseguradora_nombre, a.tipo AS aseguradora_tipo',
  joins: 'JOIN aseguradora_planes ap ON ap.id=t.plan_id JOIN aseguradoras a ON a.id=ap.aseguradora_id',
  campos: {
    planId: { tipo: 'id', requerido: true, ref: 'aseguradora_planes' },
    numeroAfiliado: { tipo: 'texto', max: 60 }, titular: { tipo: 'texto', max: 150 }, parentesco: { tipo: 'texto', max: 40 },
    vigenciaDesde: { tipo: 'fecha' }, vigenciaHasta: { tipo: 'fecha' },
    principal: { tipo: 'bool', defecto: true }, activa: { tipo: 'bool', defecto: true },
  },
  despuesDeGuardar: async (f) => {
    // Solo una cobertura principal por paciente.
    if (f.principal) await query('UPDATE paciente_coberturas SET principal=false WHERE paciente_id=$1 AND id<>$2', [f.paciente_id, f.id]);
  },
}));

router.use('/autorizaciones', crearRecurso({
  tabla: 'autorizaciones', modulo: 'aseguradoras', porPaciente: true, permisos: ASEG, borrado: 'fisico', joinPaciente: true,
  orden: "(t.estado IN ('aprobada','rechazada','vencida')), t.fecha_solicitud DESC",
  selectExtra: 'a.nombre AS aseguradora_nombre, pc.numero_afiliado',
  joins: 'LEFT JOIN paciente_coberturas pc ON pc.id=t.cobertura_id LEFT JOIN aseguradora_planes ap ON ap.id=pc.plan_id LEFT JOIN aseguradoras a ON a.id=ap.aseguradora_id',
  filtros: { estado: { col: 'estado' } },
  campos: {
    coberturaId: { tipo: 'id', ref: 'paciente_coberturas' }, presupuestoId: { tipo: 'id', ref: 'presupuestos' },
    numero: { tipo: 'texto', max: 60 }, descripcion: { tipo: 'texto', max: 250 },
    fechaSolicitud: { tipo: 'fecha' }, fechaRespuesta: { tipo: 'fecha' },
    montoSolicitado: { tipo: 'numero', min: 0 }, montoAprobado: { tipo: 'numero', min: 0 },
    estado: { tipo: 'enum', valores: ['solicitada', 'aprobada', 'parcial', 'rechazada', 'vencida'], defecto: 'solicitada' },
    notas: { tipo: 'texto' },
  },
  antesDeGuardar: async (d) => { if (d.estado && d.estado !== 'solicitada' && !d.fecha_respuesta) d.fecha_respuesta = hoyIso(); },
}));

router.use('/listas-precios', crearRecurso({
  tabla: 'listas_precios', modulo: 'listas_precios', permisos: { ver: ['listas_precios.manage', 'presupuestos.view', 'tratamientos.view'], editar: ['listas_precios.manage'] },
  borrado: 'logico:activa', orden: 't.nombre',
  selectExtra: 'a.nombre AS aseguradora_nombre, (SELECT count(*) FROM lista_precio_items i WHERE i.lista_id=t.id) AS items',
  joins: 'LEFT JOIN aseguradoras a ON a.id=t.aseguradora_id',
  campos: { nombre: { tipo: 'texto', requerido: true, max: 120 }, aseguradoraId: { tipo: 'id', ref: 'aseguradoras' }, activa: { tipo: 'bool' } },
}));

router.use('/lista-precio-items', crearRecurso({
  tabla: 'lista_precio_items', modulo: 'listas_precios', permisos: { ver: ['listas_precios.manage', 'presupuestos.view'], editar: ['listas_precios.manage'] },
  borrado: 'fisico', orden: 'tr.nombre', selectExtra: 'tr.nombre AS tratamiento_nombre, tr.precio AS precio_base, tr.categoria',
  joins: 'JOIN tratamientos tr ON tr.id=t.tratamiento_id', filtros: { listaId: { col: 'lista_id', tipo: 'id' } },
  campos: {
    listaId: { tipo: 'id', requerido: true, ref: 'listas_precios', soloCrear: true },
    tratamientoId: { tipo: 'id', requerido: true, ref: 'tratamientos', soloCrear: true },
    precio: { tipo: 'numero', requerido: true, min: 0 },
  },
  antesDeGuardar: async (d, ctx) => {
    if (ctx.creando) {
      const ya = await query('SELECT 1 FROM lista_precio_items WHERE lista_id=$1 AND tratamiento_id=$2', [d.lista_id, d.tratamiento_id]);
      if (ya.rowCount) throw new ApiError(409, 'Ese tratamiento ya está en la lista: editá su precio');
    }
  },
}));

router.use('/ajustes', crearRecurso({
  tabla: 'ajustes_cuenta', modulo: 'cuenta_corriente', porPaciente: true,
  permisos: { ver: ['cuenta_corriente.view', 'ajustes.manage', 'pagos.view'], editar: ['ajustes.manage'] },
  borrado: false, creadoPor: 'usuario_id', orden: 't.fecha DESC, t.id DESC', joinPaciente: true,
  selectExtra: 'u.nombre AS usuario_nombre', joins: 'LEFT JOIN usuarios u ON u.id=t.usuario_id',
  campos: {
    tipo: { tipo: 'enum', valores: [...s.AJUSTES_CREDITO, ...s.AJUSTES_DEBITO], requerido: true, soloCrear: true },
    monto: { tipo: 'numero', requerido: true, min: 1, soloCrear: true },
    motivo: { tipo: 'texto', requerido: true, max: 250 },
    fecha: { tipo: 'fecha', soloCrear: true },
    anulado: { tipo: 'bool' },
  },
  // Un ajuste nunca se borra: se anula (queda el rastro). Respeta el cierre contable.
  antesDeGuardar: async (d, ctx) => {
    const fecha = d.fecha || (ctx.previo && ctx.previo.fecha) || hoyIso();
    await s.verificarBloqueoContable(ctx.clinicaId, fecha);
    if (!ctx.creando && ctx.previo.anulado && d.anulado === false) throw new ApiError(409, 'Un ajuste anulado no se puede reactivar: registrá uno nuevo');
  },
}));

router.use('/comision-reglas', crearRecurso({
  tabla: 'comision_reglas', modulo: 'comisiones', permisos: { ver: ['comisiones.view', 'comisiones.manage'], editar: ['comisiones.manage'] },
  borrado: 'fisico', orden: 'o.nombre, t.tratamiento_id NULLS FIRST',
  selectExtra: 'o.nombre AS odontologo_nombre, tr.nombre AS tratamiento_nombre',
  joins: 'JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id',
  campos: {
    odontologoId: { tipo: 'id', requerido: true, ref: 'odontologos' },
    tratamientoId: { tipo: 'id', ref: 'tratamientos' },
    porcentaje: { tipo: 'numero', requerido: true, min: 0, maxNum: 100 },
    descontarLaboratorio: { tipo: 'bool', defecto: true },
    activa: { tipo: 'bool', defecto: true },
  },
}));

router.use('/comision-liquidaciones', crearRecurso({
  tabla: 'comision_liquidaciones', modulo: 'comisiones', permisos: { ver: ['comisiones.view', 'comisiones.manage'], editar: ['comisiones.manage'] },
  borrado: false, orden: 't.creado_en DESC', selectExtra: 'o.nombre AS odontologo_nombre', joins: 'JOIN odontologos o ON o.id=t.odontologo_id',
  filtros: { odontologoId: { col: 'odontologo_id', tipo: 'id' } },
  campos: { estado: { tipo: 'enum', valores: ['borrador', 'aprobada', 'pagada', 'anulada'] } },
  antesDeGuardar: async (d, ctx) => {
    if (ctx.creando) throw new ApiError(400, 'Las liquidaciones se generan con /finanzas/comisiones/liquidar');
    if (ctx.previo.estado === 'pagada' && d.estado && d.estado !== 'pagada') throw new ApiError(409, 'Una liquidación pagada no puede cambiar de estado');
    if (d.estado === 'pagada') d.pagada_en = new Date().toISOString();
  },
}));

router.use('/metas', crearRecurso({
  tabla: 'metas', modulo: 'metas', permisos: { ver: ['metas.manage', 'kpis.view', 'comisiones.view'], editar: ['metas.manage'] },
  borrado: 'fisico', orden: 't.periodo DESC, t.tipo', selectExtra: 'o.nombre AS odontologo_nombre', joins: 'LEFT JOIN odontologos o ON o.id=t.odontologo_id',
  filtros: { periodo: { col: 'periodo' } },
  campos: {
    odontologoId: { tipo: 'id', ref: 'odontologos' },
    periodo: { tipo: 'texto', requerido: true, max: 7 },
    tipo: { tipo: 'enum', valores: ['produccion', 'cobranza', 'pacientes_nuevos', 'turnos_atendidos', 'tasa_aceptacion'], requerido: true },
    objetivo: { tipo: 'numero', requerido: true, min: 0 },
  },
  antesDeGuardar: async (d) => { if (d.periodo && !/^\d{4}-\d{2}$/.test(d.periodo)) throw new ApiError(400, 'Periodo inválido (AAAA-MM)'); },
}));

const r = express.Router();
r.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

r.get('/cuenta-corriente/:pacienteId', requirePermiso('cuenta_corriente.view', 'pagos.view'), h((req) => s.cuentaCorriente(req.clinicaId, Number(req.params.pacienteId))));
r.get('/antiguedad-deuda', requirePermiso('cuenta_corriente.view', 'reportes.view'), h((req) => s.reporteAntiguedad(req.clinicaId)));
r.get('/precio', requirePermiso('presupuestos.view', 'presupuestos.manage', 'tratamientos.view'), h((req) => s.precioParaPaciente(req.clinicaId, Number(req.query.pacienteId), Number(req.query.tratamientoId))));

// Cada odontólogo ve solo lo suyo; con comisiones.manage se ve a todos.
r.get('/comisiones', requirePermiso('comisiones.view', 'comisiones.manage'), h(async (req) => {
  let odontologoId = req.query.odontologoId;
  if (!(req.usuario.permisos || []).includes('comisiones.manage')) {
    if (!req.usuario.odontologoId) throw new ApiError(403, 'Tu usuario no está vinculado a un odontólogo');
    odontologoId = req.usuario.odontologoId;
  }
  return s.calcularComisiones(req.clinicaId, { odontologoId, desde: req.query.desde, hasta: req.query.hasta });
}));
r.post('/comisiones/liquidar', requirePermiso('comisiones.manage'), h(async (req) => {
  const { odontologoId, desde, hasta } = req.body || {};
  if (!odontologoId) throw new ApiError(400, 'Indicá el odontólogo');
  // Bajo candado por odontólogo: dos clics simultáneos no liquidan dos veces.
  const ins = await conCandado(`comision:${req.clinicaId}:${Number(odontologoId)}`, async () => {
  const solap = await query(`SELECT id FROM comision_liquidaciones WHERE clinica_id=$1 AND odontologo_id=$2 AND estado <> 'anulada' AND desde <= $4 AND hasta >= $3`, [req.clinicaId, Number(odontologoId), desde, hasta]);
  if (solap.rowCount) throw new ApiError(409, `Ya existe una liquidación que cubre parte de ese período (#${solap.rows[0].id}). Anulala primero si querés rehacerla.`);
  const calc = await s.calcularComisiones(req.clinicaId, { odontologoId, desde, hasta });
  const o = calc.odontologos[0] || { produccion: 0, costoLaboratorio: 0, comision: 0, detalle: [] };
  const ins = await query(
    `INSERT INTO comision_liquidaciones (clinica_id, odontologo_id, desde, hasta, produccion, costo_laboratorio, comision, detalle, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.clinicaId, Number(odontologoId), desde, hasta, o.produccion, o.costoLaboratorio, o.comision, JSON.stringify(o.detalle), req.usuario.id]
  );
  ins.o = o;
  return ins;
  });
  const o = ins.o;
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'liquidar_comision', modulo: 'comisiones', entidadId: ins.rows[0].id, detalle: { odontologoId, desde, hasta, comision: o.comision } });
  return ins.rows[0];
}));
r.get('/metas-progreso', requirePermiso('metas.manage', 'kpis.view', 'comisiones.view'), h((req) => s.progresoMetas(req.clinicaId, req.query.periodo || hoyIso().slice(0, 7))));

// Cierre contable: nadie puede registrar/modificar movimientos hasta esa fecha.
r.get('/bloqueo-contable', requirePermiso('pagos.view', 'clinica.config.manage'), h(async (req) => {
  const x = await query('SELECT fecha_bloqueo_contable FROM clinicas WHERE id=$1', [req.clinicaId]);
  return { fechaBloqueo: x.rows[0].fecha_bloqueo_contable };
}));
r.put('/bloqueo-contable', requirePermiso('clinica.config.manage'), h(async (req) => {
  const f = req.body.fechaBloqueo;
  if (f !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(f))) throw new ApiError(400, 'Fecha inválida');
  if (f && f > hoyIso()) throw new ApiError(400, 'No se puede cerrar un período futuro');
  await query('UPDATE clinicas SET fecha_bloqueo_contable=$2 WHERE id=$1', [req.clinicaId, f]);
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'cierre_contable', modulo: 'finanzas', entidadId: req.clinicaId, detalle: { fechaBloqueo: f } });
  return { fechaBloqueo: f };
}));

router.use('/', r);
module.exports = router;
