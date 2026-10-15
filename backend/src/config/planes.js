/* Planes de DOVA y módulos que incluye cada uno.
   La regla se aplica en UN solo lugar: los permisos efectivos de cada usuario
   (auth.repository.getPermisosEfectivos). Un permiso que pertenece a un módulo que el
   plan de la clínica no incluye se saca de la lista, así que el menú, las pantallas y
   la API se cierran juntos. Los permisos que no están en ningún módulo (agenda, fichas,
   caja, presupuestos, informes, usuarios…) valen para todos los planes.
   Lo que no tiene permiso propio (página web, mensajes automáticos) se controla con
   moduloActivo(). */
const PLANES = ['esencial', 'base', 'completo', 'premium'];
const NOMBRE_PLAN = { esencial: 'Esencial', base: 'Base', completo: 'Completo', premium: 'Premium' };
const NIVEL = { esencial: 0, base: 1, completo: 2, premium: 3 };

// clave: { nombre, desde: primer plan que lo incluye, permisos: [...] }
const MODULOS = {
  lista_espera: { nombre: 'Lista de espera', desde: 'base', permisos: ['lista_espera.manage'] },
  derivaciones: { nombre: 'Derivaciones y controles después del tratamiento', desde: 'base', permisos: ['derivaciones.manage', 'controles_postoperatorios.manage'] },
  facturacion: { nombre: 'Facturación', desde: 'base', permisos: ['facturacion.anular', 'facturacion.configurar', 'facturacion.crear', 'facturacion.descargar', 'facturacion.editar', 'facturacion.imprimir', 'facturacion.ver', 'facturacion.ver_propias', 'facturacion.ver_reportes'] },
  seguimiento: { nombre: 'Seguimiento de pacientes', desde: 'base', permisos: ['seguimiento.manage', 'seguimiento.view', 'recalls.manage', 'recalls.view', 'tareas.manage'] },
  web_portal: { nombre: 'Página web, reserva online y portal del paciente', desde: 'base', permisos: ['web.configurar', 'web.ver', 'pacientes_revision.manage'] },
  inventario: { nombre: 'Inventario y proveedores', desde: 'base', permisos: ['inventario.manage', 'inventario.view', 'proveedores.manage'] },
  estadisticas: { nombre: 'Estadísticas e indicadores', desde: 'base', permisos: ['kpis.view'] },
  ayuda_tecnica: { nombre: 'Ayuda técnica dentro del sistema', desde: 'base', permisos: ['helpdesk.assign', 'helpdesk.create', 'helpdesk.reply', 'helpdesk.resolve', 'helpdesk.view', 'helpdesk.view_all'] },
  cuentas_cobrar: { nombre: 'Quién debe y desde cuándo', desde: 'completo', permisos: ['cuenta_corriente.view'] },
  convenios: { nombre: 'Seguros, convenios y listas de precios', desde: 'completo', permisos: ['aseguradoras.manage', 'listas_precios.manage'] },
  comisiones: { nombre: 'Comisiones y metas', desde: 'completo', permisos: ['comisiones.manage', 'comisiones.view', 'metas.manage', 'rentabilidad.view'] },
  whatsapp_auto: { nombre: 'WhatsApp automático (recordatorios, cobros, mensajes y resumen del día)', desde: 'completo', permisos: ['cobranza.manage'] },
  gestion_clinica: { nombre: 'Laboratorio, esterilización, equipos y asistencia del personal', desde: 'completo', permisos: ['equipos.manage', 'esterilizacion.manage', 'laboratorio.manage', 'fichaje.use', 'fichaje.view_all'] },
  ortodoncia: { nombre: 'Ortodoncia', desde: 'completo', permisos: ['ortodoncia.manage', 'ortodoncia.view'] },
  cobro_online: { nombre: 'Cobro online', desde: 'completo', permisos: ['cobro_online.manage'] },
  sedes: { nombre: 'Varias sedes', desde: 'premium', permisos: [] },
};
const PERMISO_A_MODULO = {};
for (const [k, m] of Object.entries(MODULOS)) for (const p of m.permisos) PERMISO_A_MODULO[p] = k;

const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

// Módulos que tiene una clínica: los de su plan, más los extra, menos los quitados.
function modulosHabilitados({ plan, modulos_extra: extra, modulos_quitar: quitar } = {}) {
  const nivel = NIVEL[plan] === undefined ? NIVEL.premium : NIVEL[plan];
  const out = new Set(Object.entries(MODULOS).filter(([, m]) => NIVEL[m.desde] <= nivel).map(([k]) => k));
  for (const k of lista(extra)) if (MODULOS[k]) out.add(k);
  for (const k of lista(quitar)) out.delete(k);
  return out;
}

function filtrarPermisos(permisos, clinica) {
  const hab = modulosHabilitados(clinica);
  return permisos.filter((p) => { const m = PERMISO_A_MODULO[p]; return !m || hab.has(m); });
}

// Estado completo para mostrar en pantalla (Mi plan y panel de plataforma).
function detallePlan(clinica) {
  const hab = modulosHabilitados(clinica);
  return {
    plan: clinica.plan || 'premium', nombrePlan: NOMBRE_PLAN[clinica.plan] || 'Premium',
    modulos: Object.entries(MODULOS).map(([clave, m]) => ({ clave, nombre: m.nombre, desde: m.desde, nombreDesde: NOMBRE_PLAN[m.desde], incluido: hab.has(clave) })),
  };
}

// Filas de clínicas (con plan, modulos_extra y modulos_quitar) que tienen el módulo.
const conModulo = (filas, clave) => filas.filter((c) => modulosHabilitados(c).has(clave));

module.exports = { conModulo, PLANES, NOMBRE_PLAN, MODULOS, PERMISO_A_MODULO, modulosHabilitados, filtrarPermisos, detallePlan };
