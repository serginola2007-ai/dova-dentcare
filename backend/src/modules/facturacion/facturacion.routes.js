/* API de facturación. Cada ruta valida el permiso en el servidor (ocultar
   botones en la pantalla no alcanza). Ver facturacion.service.js. */
const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { resolverClinicaMiddleware } = require('../../middlewares/clinica.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const s = require('./facturacion.service');
const pdf = require('./facturacion.pdf');

const router = express.Router();
router.use(authMiddleware, resolverClinicaMiddleware);
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req, res)); } catch (e) { next(e); } };
const VER = ['facturacion.ver', 'facturacion.ver_propias'];
const tiene = (req, p) => (req.usuario.permisos || []).includes(p);
// Reportes: con facturacion.ver_propias solo sus pacientes; si no, toda la clínica.
const alcanceReportes = (req) => (tiene(req, 'facturacion.ver') || !tiene(req, 'facturacion.ver_propias') ? { todas: true } : s.alcance(req.usuario));
const subirLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 } }).single('logo');

// ---------------- Configuración ----------------
router.get('/config', requirePermiso(...VER, 'facturacion.crear', 'facturacion.configurar'), h((req) => s.obtenerConfig(req.clinicaId)));
router.put('/config', requirePermiso('facturacion.configurar'), h((req) => s.guardarConfig(req.clinicaId, req.body || {}, req.usuario)));
router.put('/config/numeracion', requirePermiso('facturacion.configurar'), h((req) => s.cambiarNumeracion(req.clinicaId, req.body || {}, req.usuario)));
router.post('/config/logo', requirePermiso('facturacion.configurar'), (req, res, next) => subirLogo(req, res, (err) => {
  if (err) return next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El logo no puede pesar más de 500 KB' : 'No se pudo leer la imagen'));
  s.guardarLogo(req.clinicaId, req.file, req.usuario).then((r) => res.json(r)).catch(next);
}));
router.delete('/config/logo', requirePermiso('facturacion.configurar'), h((req) => s.quitarLogo(req.clinicaId, req.usuario)));
router.get('/config/logo', requirePermiso(...VER, 'facturacion.crear', 'facturacion.configurar'), async (req, res, next) => {
  try {
    const l = await s.obtenerLogo(req.clinicaId);
    if (!l) return res.status(404).end();
    res.type(l.logo_mime).set('Cache-Control', 'private, max-age=60').send(l.logo);
  } catch (e) { next(e); }
});
// Métodos de pago (los usa también la pantalla de cobros).
router.get('/metodos-pago', requirePermiso(...VER, 'facturacion.crear', 'facturacion.configurar', 'pagos.create', 'pagos.view', 'caja.manage'), h((req) => s.metodosPago(req.clinicaId)));

// ---------------- Tablero y reportes ----------------
router.get('/estadisticas', requirePermiso(...VER), h((req) => s.estadisticas(req.clinicaId, s.alcance(req.usuario))));
router.get('/reporte', requirePermiso('facturacion.ver_reportes'), h((req) => s.reporte(req.clinicaId, req.query, alcanceReportes(req))));
router.get('/reporte/pdf', requirePermiso('facturacion.ver_reportes'), async (req, res, next) => {
  try {
    const a = alcanceReportes(req);
    const rep = await s.reporte(req.clinicaId, req.query, a);
    const cfg = await s.obtenerConfig(req.clinicaId);
    const TIT = { dia: 'Facturación por día', mes: 'Facturación por mes', odontologo: 'Facturación por odontólogo', tratamiento: 'Facturación por tratamiento', paciente: 'Facturación por paciente', metodo: 'Facturación por método de pago', estado: 'Facturas por estado' };
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'exportar_reporte_facturacion', modulo: 'facturacion', entidadId: rep.agrupar, detalle: { desde: rep.desde, hasta: rep.hasta, formato: 'pdf' } });
    pdf.reporte(res, { config: cfg, rep, titulo: TIT[rep.agrupar] || 'Reporte de facturación' });
  } catch (e) { next(e); }
});

// ---------------- Datos para emitir (no cargar nada dos veces) ----------------
router.get('/borrador', requirePermiso('facturacion.crear'), h((req) => s.borrador(req.clinicaId, { pagoId: req.query.pagoId, presupuestoId: req.query.presupuestoId, pacienteId: req.query.pacienteId })));

// ---------------- Consultas ----------------
router.get('/', requirePermiso(...VER), h((req) => s.listar(req.clinicaId, req.query, s.alcance(req.usuario))));
router.get('/paciente/:pacienteId/resumen', requirePermiso(...VER), h((req) => s.resumenPaciente(req.clinicaId, Number(req.params.pacienteId), s.alcance(req.usuario))));
router.get('/presupuesto/:presupuestoId/resumen', requirePermiso(...VER, 'presupuestos.view'), h(async (req) => {
  const r = await s.resumenPresupuesto(req.clinicaId, Number(req.params.presupuestoId));
  if (!r) throw new ApiError(404, 'Presupuesto no encontrado');
  // Sin permiso de facturación se ven los importes, no la lista de facturas.
  if (!tiene(req, 'facturacion.ver') && !tiene(req, 'facturacion.ver_propias')) r.facturas = [];
  return r;
}));
// Quiénes emitieron facturas (para el filtro "usuario" del listado).
router.get('/emisores', requirePermiso(...VER), h(async (req) => {
  const { query } = require('../../config/db');
  return (await query('SELECT DISTINCT u.id, u.nombre FROM facturas f JOIN usuarios u ON u.id=f.creado_por WHERE f.clinica_id=$1 ORDER BY u.nombre', [req.clinicaId])).rows;
}));
router.get('/pago/:pagoId', requirePermiso(...VER), h((req) => s.listar(req.clinicaId, { pagoId: req.params.pagoId }, s.alcance(req.usuario))));
router.get('/:id', requirePermiso(...VER), h((req) => s.obtener(req.clinicaId, req.params.id, s.alcance(req.usuario))));
router.get('/:id/historial', requirePermiso(...VER), h(async (req) => (await s.obtener(req.clinicaId, req.params.id, s.alcance(req.usuario))).eventos));

// PDF: ver (inline), descargar (attachment) o imprimir. Cada uno con su permiso.
router.get('/:id/pdf', requirePermiso('facturacion.descargar', 'facturacion.imprimir'), async (req, res, next) => {
  try {
    const modo = ['ver', 'descargar', 'imprimir'].includes(req.query.modo) ? req.query.modo : 'ver';
    if (modo === 'descargar' && !tiene(req, 'facturacion.descargar')) throw new ApiError(403, 'No tenés permiso para descargar facturas');
    if (modo === 'imprimir' && !tiene(req, 'facturacion.imprimir')) throw new ApiError(403, 'No tenés permiso para imprimir facturas');
    // Para ver/descargar también hay que poder ver ESA factura.
    const a = s.alcance(req.usuario); // 403 si no puede ver facturas (o esa factura no es de sus pacientes → 404)
    const factura = await s.obtener(req.clinicaId, req.params.id, a);
    const [config, logo, metodos] = await Promise.all([s.obtenerConfig(req.clinicaId), s.obtenerLogo(req.clinicaId), s.metodosPago(req.clinicaId, { incluirInactivos: true })]);
    await s.evento(factura.id, modo === 'descargar' ? 'pdf_descargado' : modo === 'imprimir' ? 'pdf_impreso' : 'pdf_generado', null, req.usuario);
    await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: `factura_pdf_${modo}`, modulo: 'facturacion', entidadId: factura.id, detalle: { numero: factura.numero_completo } });
    pdf.generar(res, { factura, config, logo, metodos, disposicion: modo === 'descargar' ? 'attachment' : 'inline' });
  } catch (e) { next(e); }
});

// ---------------- Acciones ----------------
router.post('/', requirePermiso('facturacion.crear'), async (req, res, next) => {
  try { res.status(201).json(await s.crear(req.clinicaId, req.body || {}, req.usuario)); } catch (e) { next(e); }
});
router.put('/:id', requirePermiso('facturacion.editar'), h((req) => s.editar(req.clinicaId, req.params.id, req.body || {}, req.usuario, { todas: true })));
router.post('/:id/anular', requirePermiso('facturacion.anular'), h((req) => s.anular(req.clinicaId, req.params.id, (req.body || {}).motivo, req.usuario, { todas: true })));
router.post('/:id/pagos', requirePermiso('facturacion.crear'), h((req) => s.asociarPago(req.clinicaId, req.params.id, Number((req.body || {}).pagoId), req.usuario, { todas: true })));
router.post('/:id/notas-credito', requirePermiso('facturacion.anular'), h((req) => s.crearNotaCredito(req.clinicaId, req.params.id, req.body || {}, req.usuario, { todas: true })));
// Una factura emitida nunca se borra: se anula.
router.delete('/:id', (req, res, next) => next(new ApiError(405, 'No se puede eliminar una factura emitida. Debe anularse.')));

module.exports = router;
