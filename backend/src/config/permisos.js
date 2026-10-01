/* Catálogo central de permisos de DOVA.
   Se inserta en la tabla `permisos` por el seed y se referencia por código
   desde middlewares (requirePermiso('pacientes.view')) y desde la UI de
   administración de roles/usuarios. Agregar un permiso acá NO requiere
   una migración nueva: la tabla permisos ya existe, solo se insertan filas.

   Convención: "<modulo>.<accion>". */
const PERMISOS = [
  // Pacientes
  { codigo: 'pacientes.view', modulo: 'pacientes', descripcion: 'Ver pacientes' },
  { codigo: 'pacientes.create', modulo: 'pacientes', descripcion: 'Crear pacientes' },
  { codigo: 'pacientes.edit', modulo: 'pacientes', descripcion: 'Editar pacientes' },
  { codigo: 'pacientes.delete', modulo: 'pacientes', descripcion: 'Eliminar pacientes' },
  { codigo: 'pacientes.clinical.view', modulo: 'pacientes', descripcion: 'Ver información clínica sensible' },
  { codigo: 'pacientes.clinical.edit', modulo: 'pacientes', descripcion: 'Editar historia clínica / odontograma' },

  // Agenda
  { codigo: 'agenda.view', modulo: 'agenda', descripcion: 'Ver agenda' },
  { codigo: 'agenda.create', modulo: 'agenda', descripcion: 'Crear turnos' },
  { codigo: 'agenda.edit', modulo: 'agenda', descripcion: 'Editar/cambiar estado de turnos' },
  { codigo: 'agenda.delete', modulo: 'agenda', descripcion: 'Cancelar/eliminar turnos' },

  // Tratamientos / Planes / Sesiones
  { codigo: 'tratamientos.view', modulo: 'tratamientos', descripcion: 'Ver catálogo de tratamientos' },
  { codigo: 'tratamientos.manage', modulo: 'tratamientos', descripcion: 'Gestionar catálogo de tratamientos' },
  { codigo: 'planes_tratamiento.view', modulo: 'planes_tratamiento', descripcion: 'Ver planes de tratamiento' },
  { codigo: 'planes_tratamiento.manage', modulo: 'planes_tratamiento', descripcion: 'Crear/editar planes y sesiones' },

  // Odontograma
  { codigo: 'odontograma.view', modulo: 'odontograma', descripcion: 'Ver odontograma' },
  { codigo: 'odontograma.edit', modulo: 'odontograma', descripcion: 'Editar odontograma' },

  // Finanzas
  { codigo: 'presupuestos.view', modulo: 'finanzas', descripcion: 'Ver presupuestos' },
  { codigo: 'presupuestos.manage', modulo: 'finanzas', descripcion: 'Crear/editar presupuestos' },
  { codigo: 'pagos.view', modulo: 'finanzas', descripcion: 'Ver pagos' },
  { codigo: 'pagos.create', modulo: 'finanzas', descripcion: 'Registrar pagos' },
  { codigo: 'planes_pago.manage', modulo: 'finanzas', descripcion: 'Gestionar planes de pago y cuotas' },
  { codigo: 'caja.view', modulo: 'finanzas', descripcion: 'Ver caja' },
  { codigo: 'caja.manage', modulo: 'finanzas', descripcion: 'Abrir/cerrar caja, registrar movimientos' },

  // Inventario
  { codigo: 'inventario.view', modulo: 'inventario', descripcion: 'Ver inventario' },
  { codigo: 'inventario.manage', modulo: 'inventario', descripcion: 'Gestionar stock y movimientos' },
  { codigo: 'proveedores.manage', modulo: 'inventario', descripcion: 'Gestionar proveedores y compras' },

  // Reportes / Auditoría
  { codigo: 'reportes.view', modulo: 'reportes', descripcion: 'Ver reportes' },
  { codigo: 'auditoria.view', modulo: 'auditoria', descripcion: 'Ver auditoría del sistema' },

  // Usuarios y configuración
  { codigo: 'usuarios.manage', modulo: 'administracion', descripcion: 'Crear/editar usuarios y permisos' },
  { codigo: 'roles.manage', modulo: 'administracion', descripcion: 'Gestionar roles' },
  { codigo: 'clinica.config.manage', modulo: 'administracion', descripcion: 'Editar configuración/branding de la clínica' },
  { codigo: 'backup.manage', modulo: 'administracion', descripcion: 'Exportar/importar respaldo' },

  // WhatsApp / Seguimiento
  { codigo: 'whatsapp.send', modulo: 'comunicacion', descripcion: 'Preparar mensajes de WhatsApp' },
  { codigo: 'seguimiento.view', modulo: 'comunicacion', descripcion: 'Ver seguimiento/CRM de pacientes' },
  { codigo: 'lista_espera.manage', modulo: 'agenda', descripcion: 'Gestionar lista de espera' },

  // Helpdesk (fase futura, ya reservado)
  { codigo: 'helpdesk.view', modulo: 'helpdesk', descripcion: 'Ver pedidos de ayuda técnica' },
  { codigo: 'helpdesk.create', modulo: 'helpdesk', descripcion: 'Pedir ayuda técnica' },
  { codigo: 'helpdesk.view_all', modulo: 'helpdesk', descripcion: 'Ver todos los pedidos de ayuda (no solo los propios)' },
  { codigo: 'helpdesk.reply', modulo: 'helpdesk', descripcion: 'Responder pedidos de ayuda' },
  { codigo: 'helpdesk.assign', modulo: 'helpdesk', descripcion: 'Asignar pedidos de ayuda' },
  { codigo: 'helpdesk.resolve', modulo: 'helpdesk', descripcion: 'Marcar pedidos de ayuda como resueltos' },

  // Historia clínica / archivos clínicos
  { codigo: 'historia_clinica.view', modulo: 'pacientes', descripcion: 'Ver historia clínica' },
  { codigo: 'historia_clinica.edit', modulo: 'pacientes', descripcion: 'Registrar entradas de historia clínica' },
  { codigo: 'fotos_clinicas.manage', modulo: 'pacientes', descripcion: 'Gestionar fotos clínicas' },
  { codigo: 'estudios.manage', modulo: 'pacientes', descripcion: 'Gestionar estudios/radiografías' },
  { codigo: 'consentimientos.manage', modulo: 'pacientes', descripcion: 'Gestionar consentimientos informados' },
  { codigo: 'recetas.manage', modulo: 'pacientes', descripcion: 'Generar recetas' },
  { codigo: 'laboratorio.manage', modulo: 'clinica_ops', descripcion: 'Gestionar laboratorio dental' },

  // Núcleo clínico (Fase 1 del prompt maestro DOVA)
  { codigo: 'plantillas_clinicas.view', modulo: 'clinica_ops', descripcion: 'Ver plantillas clínicas' },
  { codigo: 'plantillas_clinicas.manage', modulo: 'clinica_ops', descripcion: 'Crear/editar plantillas clínicas' },
  { codigo: 'pacientes_revision.manage', modulo: 'pacientes', descripcion: 'Marcar y resolver pacientes para revisar' },
  { codigo: 'controles_postoperatorios.manage', modulo: 'pacientes', descripcion: 'Gestionar controles postoperatorios' },
  { codigo: 'derivaciones.manage', modulo: 'pacientes', descripcion: 'Derivar pacientes entre odontólogos' },

  // Seguimiento integral (migración 0020)
  { codigo: 'salud.view', modulo: 'salud', descripcion: 'Ver alergias, medicación, condiciones y alertas médicas' },
  { codigo: 'salud.edit', modulo: 'salud', descripcion: 'Registrar alergias, medicación, condiciones, anamnesis y signos vitales' },
  { codigo: 'recalls.view', modulo: 'seguimiento', descripcion: 'Ver controles periódicos de pacientes' },
  { codigo: 'recalls.manage', modulo: 'seguimiento', descripcion: 'Gestionar controles periódicos y registrar llamadas/mensajes' },
  { codigo: 'seguimiento.manage', modulo: 'seguimiento', descripcion: 'Registrar comunicaciones, encuestas, observaciones y controles programados' },
  { codigo: 'periodoncia.edit', modulo: 'especialidades', descripcion: 'Registrar periodontogramas y PSR' },
  { codigo: 'especialidades.edit', modulo: 'especialidades', descripcion: 'Registrar implantes, endodoncias, ortodoncia, preventivos, biopsias y anestesia' },
  { codigo: 'tareas.manage', modulo: 'seguimiento', descripcion: 'Crear y asignar tareas al equipo' },
  { codigo: 'agenda.config', modulo: 'agenda', descripcion: 'Configurar sillones y bloqueos de agenda' },
  { codigo: 'esterilizacion.manage', modulo: 'operaciones', descripcion: 'Registrar ciclos de esterilización y paquetes' },
  { codigo: 'equipos.manage', modulo: 'operaciones', descripcion: 'Gestionar equipos y mantenimientos' },
  { codigo: 'fichaje.use', modulo: 'operaciones', descripcion: 'Marcar su propia entrada y salida' },
  { codigo: 'fichaje.view_all', modulo: 'operaciones', descripcion: 'Ver la asistencia de todo el personal' },
  { codigo: 'aseguradoras.manage', modulo: 'finanzas', descripcion: 'Gestionar seguros, prepagas, convenios, coberturas y autorizaciones' },
  { codigo: 'listas_precios.manage', modulo: 'finanzas', descripcion: 'Gestionar listas de precios' },
  { codigo: 'cuenta_corriente.view', modulo: 'finanzas', descripcion: 'Ver cuenta corriente y antigüedad de deuda' },
  { codigo: 'ajustes.manage', modulo: 'finanzas', descripcion: 'Registrar ajustes de cuenta (descuentos, bonificaciones, incobrables)' },
  { codigo: 'comisiones.view', modulo: 'finanzas', descripcion: 'Ver comisiones y producción de odontólogos' },
  { codigo: 'comisiones.manage', modulo: 'finanzas', descripcion: 'Configurar reglas y liquidar comisiones' },
  { codigo: 'metas.manage', modulo: 'finanzas', descripcion: 'Configurar metas de producción' },
  { codigo: 'kpis.view', modulo: 'reportes', descripcion: 'Ver estadísticas de la clínica' },
  // Facturación (comprobantes internos; ver backend/src/modules/facturacion)
  { codigo: 'facturacion.ver', modulo: 'facturacion', descripcion: 'Ver todas las facturas' },
  { codigo: 'facturacion.ver_propias', modulo: 'facturacion', descripcion: 'Ver solo las facturas de sus propios pacientes (odontólogos)' },
  { codigo: 'facturacion.crear', modulo: 'facturacion', descripcion: 'Emitir facturas' },
  { codigo: 'facturacion.editar', modulo: 'facturacion', descripcion: 'Corregir datos del cliente y observaciones de una factura' },
  { codigo: 'facturacion.anular', modulo: 'facturacion', descripcion: 'Anular facturas y emitir notas de crédito' },
  { codigo: 'facturacion.descargar', modulo: 'facturacion', descripcion: 'Descargar facturas en PDF' },
  { codigo: 'facturacion.imprimir', modulo: 'facturacion', descripcion: 'Imprimir facturas' },
  { codigo: 'facturacion.configurar', modulo: 'facturacion', descripcion: 'Configurar datos de facturación, numeración y métodos de pago' },
  { codigo: 'facturacion.ver_reportes', modulo: 'facturacion', descripcion: 'Ver reportes de facturación' },
  { codigo: 'pacientes.export', modulo: 'pacientes', descripcion: 'Exportar el expediente completo de un paciente' },
];

// Permisos por defecto de cada rol de sistema. Sirven para poblar
// rol_permisos en el seed; el admin siempre recibe TODOS los permisos.
const PERMISOS_POR_ROL = {
  admin: '*', // especial: todos los permisos
  odontologo: [
    'pacientes.view', 'pacientes.clinical.view', 'pacientes.clinical.edit',
    'agenda.view',
    'tratamientos.view',
    'planes_tratamiento.view', 'planes_tratamiento.manage',
    'odontograma.view', 'odontograma.edit',
    // El odontólogo presupuesta lo que diagnostica y puede financiarlo.
    'presupuestos.view', 'presupuestos.manage', 'planes_pago.manage',
    'facturacion.ver_propias', 'facturacion.descargar', 'facturacion.imprimir',
    'reportes.view',
    'historia_clinica.view', 'historia_clinica.edit',
    'fotos_clinicas.manage', 'estudios.manage', 'consentimientos.manage',
    'recetas.manage', 'laboratorio.manage',
    'plantillas_clinicas.view', 'plantillas_clinicas.manage',
    'pacientes_revision.manage', 'controles_postoperatorios.manage', 'derivaciones.manage',
    'salud.view', 'salud.edit', 'recalls.view', 'recalls.manage', 'seguimiento.view', 'seguimiento.manage',
    'periodoncia.edit', 'especialidades.edit', 'tareas.manage', 'esterilizacion.manage',
    'fichaje.use', 'comisiones.view', 'kpis.view', 'laboratorio.manage',
  ],
  recepcion: [
    'pacientes.view', 'pacientes.create', 'pacientes.edit',
    'agenda.view', 'agenda.create', 'agenda.edit', 'agenda.delete',
    // Recepción cierra presupuestos con el paciente y arma los planes de pago;
    // para eso (y para dar turnos) necesita ver el catálogo de tratamientos.
    'presupuestos.view', 'presupuestos.manage', 'planes_pago.manage', 'tratamientos.view',
    // Facturación: emitir, ver y descargar/imprimir; NO anular ni configurar.
    'facturacion.ver', 'facturacion.crear', 'facturacion.descargar', 'facturacion.imprimir',
    'pagos.view', 'pagos.create',
    'caja.view', 'caja.manage',
    'whatsapp.send',
    'lista_espera.manage',
    'seguimiento.view',
    'salud.view', 'recalls.view', 'recalls.manage', 'seguimiento.manage', 'tareas.manage',
    'agenda.config', 'fichaje.use', 'aseguradoras.manage', 'cuenta_corriente.view', 'laboratorio.manage',
  ],
  asistente: [
    'pacientes.view',
    'agenda.view',
    'tratamientos.view',
    'inventario.view',
    'salud.view', 'esterilizacion.manage', 'equipos.manage', 'fichaje.use', 'laboratorio.manage',
  ],
  helpdesk: [
    'helpdesk.view', 'helpdesk.create', 'helpdesk.view_all',
    'helpdesk.reply', 'helpdesk.assign', 'helpdesk.resolve',
    'fichaje.use',
  ],
};

module.exports = { PERMISOS, PERMISOS_POR_ROL };
