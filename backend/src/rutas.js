/* Mapa de la API: qué dirección atiende cada módulo.
   Cada fila es [dirección, archivo del módulo, parte exportada (solo si el módulo exporta varios routers)].
   EL ORDEN IMPORTA: las direcciones más específicas van antes que las generales
   (por ejemplo /api/web/publico/pago antes que /api/web/publico, y esta antes que /api/web).
   Para agregar un módulo nuevo: crear modules/<nombre>/<nombre>.routes.js y sumar su fila acá. */
const RUTAS = [
  // Sesión, clínica y plataforma
  ['/api/auth', './modules/auth/auth.routes'],
  ['/api/clinica', './modules/clinica/clinica.routes'],
  ['/api/plataforma', './modules/plataforma/plataforma.routes'],
  ['/api/usuarios', './modules/usuarios/usuarios.routes'],

  // Pacientes y clínica
  ['/api/pacientes', './modules/pacientes/pacientes.routes'],
  ['/api/odontologos', './modules/odontologos/odontologos.routes'],
  ['/api/agenda', './modules/agenda/agenda.routes'],
  ['/api/tratamientos', './modules/tratamientos/tratamientos.routes'],
  ['/api/planes-tratamiento', './modules/planes-tratamiento/planes.routes'],
  ['/api/historia-clinica', './modules/historia-clinica/historia.routes'],
  ['/api/odontograma', './modules/odontograma/odontograma.routes'],
  ['/api/clinico', './modules/clinico-extras/extras.routes'],
  ['/api/plantillas-clinicas', './modules/plantillas-clinicas/plantillas.routes'],
  ['/api/controles-postoperatorios', './modules/controles-postoperatorios/controles.routes'],
  ['/api/derivaciones', './modules/derivaciones/derivaciones.routes'],
  ['/api/salud', './modules/salud/salud.routes'],
  ['/api/periodoncia', './modules/periodoncia/periodoncia.routes'],
  ['/api/especialidades', './modules/especialidades/especialidades.routes'],
  ['/api/ortodoncia', './modules/ortodoncia/ortodoncia.routes'],

  // Plata: presupuestos, caja, cobros y facturación
  ['/api/presupuestos', './modules/presupuestos/presupuestos.routes'],
  ['/api/caja', './modules/caja/caja.routes'],
  ['/api/planes-pago', './modules/planes-pago/planespago.routes'],
  ['/api/pagos', './modules/pagos/pagos.routes'],
  ['/api/facturacion', './modules/facturacion/facturacion.routes'],
  ['/api/finanzas', './modules/finanzas-ext/finanzas.routes'],
  ['/api/cobro-online', './modules/cobro-online/cobro-online.routes'],
  ['/api/comprobantes', './modules/comprobantes/comprobantes.routes'],

  // Operación de la clínica
  ['/api/inventario', './modules/inventario/inventario.routes'],
  ['/api/operaciones', './modules/operaciones/operaciones.routes'],
  ['/api/helpdesk', './modules/helpdesk/helpdesk.routes'],

  // Seguimiento, avisos y comunicación
  ['/api/seguimiento', './modules/seguimiento/seguimiento.routes'],
  ['/api/recalls', './modules/recalls/recalls.routes'],
  ['/api/pendientes', './modules/pendientes/pendientes.routes'],
  ['/api/notificaciones', './modules/notificaciones/notificaciones.routes'],
  ['/api/push', './modules/push/push.routes'],
  ['/api/recordatorios/cron', './modules/recordatorios/recordatorios.routes', 'cron'],
  ['/api/recordatorios', './modules/recordatorios/recordatorios.routes', 'interno'],
  ['/api/whatsapp/webhook', './modules/recordatorios/recordatorios.routes', 'webhook'],
  ['/api/cobranza', './modules/cobranza/cobranza.routes', 'interno'],
  ['/api/mensajes', './modules/mensajes/mensajes.routes', 'interno'],
  ['/api/resumen', './modules/resumen/resumen.routes'],

  // Reportes y búsqueda
  ['/api/reportes', './modules/reportes/reportes.routes'],
  ['/api/kpis', './modules/kpis/kpis.routes'],
  ['/api/busqueda', './modules/busqueda/busqueda.routes'],

  // Página web pública (sin sesión), portal del paciente y su panel en DOVA
  ['/api/web/publico/pago', './modules/cobranza/cobranza.routes', 'publico'],
  ['/api/web/publico/aviso', './modules/mensajes/mensajes.routes', 'publico'],
  ['/api/web/publico', './modules/web/web.routes', 'publico'],
  ['/api/web/cuenta', './modules/web/web.routes', 'cuenta'],
  ['/api/web', './modules/web/web.routes', 'interno'],
];

function montarRutas(app) {
  app.get('/api/health', (req, res) => res.json({ ok: true, producto: 'DOVA', version: '0.1.0' }));

  // Eventos en tiempo real (la pantalla queda conectada y se entera de los cambios al instante).
  const tiempoReal = require('./utils/tiempoReal');
  const { authMiddleware } = require('./middlewares/auth.middleware');
  const { resolverClinicaMiddleware } = require('./middlewares/clinica.middleware');
  app.get('/api/eventos', authMiddleware, resolverClinicaMiddleware, tiempoReal.suscribir);

  for (const [direccion, archivo, parte] of RUTAS) {
    const modulo = require(archivo);
    app.use(direccion, parte ? modulo[parte] : modulo);
  }
}

module.exports = { montarRutas, RUTAS };
