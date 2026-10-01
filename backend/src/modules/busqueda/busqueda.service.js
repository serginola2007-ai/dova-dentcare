const repo = require('./busqueda.repository');
const { ApiError } = require('../../middlewares/error.middleware');

/* Cada categoría requiere su propio permiso: el usuario nunca ve, por medio
   de la búsqueda global, algo que no podría ver entrando al módulo
   correspondiente (sección 26/33: nunca confiar solo en frontend). */
const CATEGORIAS = [
  { key: 'pacientes', permiso: 'pacientes.view', fn: repo.pacientes },
  { key: 'citas', permiso: 'agenda.view', fn: repo.citas },
  { key: 'tratamientos', permiso: 'tratamientos.view', fn: repo.tratamientos },
  { key: 'presupuestos', permiso: 'presupuestos.view', fn: repo.presupuestos },
  { key: 'pagos', permiso: 'pagos.view', fn: repo.pagos },
  { key: 'evoluciones', permiso: 'historia_clinica.view', fn: repo.evoluciones },
  { key: 'tickets', permiso: 'helpdesk.view', fn: repo.tickets },
  { key: 'usuarios', permiso: 'usuarios.manage', fn: repo.usuarios },
];

async function buscar(clinicaId, q, permisos, usuario) {
  if (!q || q.trim().length < 2) {
    throw new ApiError(400, 'La búsqueda requiere al menos 2 caracteres');
  }
  const termino = q.trim().toLowerCase();
  const categoriasPermitidas = CATEGORIAS.filter((c) => permisos.includes(c.permiso));

  const resultados = await Promise.all(
    categoriasPermitidas.map((c) => c.fn(clinicaId, termino))
  );

  const respuesta = {};
  categoriasPermitidas.forEach((c, i) => { respuesta[c.key] = resultados[i]; });
  // Facturas: por número, paciente, documento, RUC o concepto, respetando
  // si el usuario ve todas o solo las de sus pacientes.
  if (usuario && (permisos.includes('facturacion.ver') || permisos.includes('facturacion.ver_propias'))) {
    const fact = require('../facturacion/facturacion.service');
    respuesta.facturas = await fact.buscarGlobal(clinicaId, q.trim(), usuario);
  }
  respuesta.total = Object.values(respuesta).reduce((acc, r) => acc + (Array.isArray(r) ? r.length : 0), 0);
  return respuesta;
}

module.exports = { buscar, CATEGORIAS };
