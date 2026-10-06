const { ApiError } = require('../../middlewares/error.middleware');
const repo = require('./planes.repository');
const etapasRepo = require('./etapas.repository');
const historiaRepo = require('../historia-clinica/historia.repository');
const inventarioService = require('../inventario/inventario.service');
const presupuestosService = require('../presupuestos/presupuestos.service');
const pacientesRepo = require('../pacientes/pacientes.repository');
const odontologosRepo = require('../odontologos/odontologos.repository');
const auditoria = require('../../utils/auditoria');

async function listarPorPaciente(clinicaId, pacienteId) {
  return repo.listarPorPaciente(clinicaId, pacienteId);
}

async function obtener(clinicaId, id) {
  const plan = await repo.obtenerPorId(clinicaId, id);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  plan.sesiones = await repo.listarSesiones(id);
  plan.etapas = await etapasRepo.listarPorPlan(id);
  for (const etapa of plan.etapas) {
    etapa.materiales = await inventarioService.listarMaterialesDeEtapa(etapa.id);
  }
  for (const sesion of plan.sesiones) {
    sesion.materiales = await inventarioService.listarMaterialesDeSesion(sesion.id);
  }
  return plan;
}

// ---- Etapas de tratamiento (checklist, sección 11 del prompt maestro) ----
async function crearEtapa(clinicaId, planId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  if (!datos.nombre) throw new ApiError(400, 'El nombre de la etapa es obligatorio');
  const etapa = await etapasRepo.crearEtapa(planId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear_etapa', modulo: 'planes_tratamiento', entidadId: planId, detalle: { nombre: datos.nombre },
  });
  return etapa;
}

/* Aplica una lista de etapas de una sola vez -- se usa cuando el odontólogo
   elige una plantilla clínica para un procedimiento por etapas (ej.
   Endodoncia) y quiere generar todo el checklist junto. */
async function aplicarEtapas(clinicaId, planId, nombres, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  if (!Array.isArray(nombres) || nombres.length === 0) throw new ApiError(400, 'Se requiere al menos una etapa');
  const etapas = await etapasRepo.crearEtapasBatch(planId, nombres);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'aplicar_etapas', modulo: 'planes_tratamiento', entidadId: planId, detalle: { cantidad: nombres.length },
  });
  return etapas;
}

async function completarEtapa(clinicaId, planId, etapaId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const etapa = await etapasRepo.obtener(etapaId);
  if (!etapa || etapa.plan_id !== Number(planId)) throw new ApiError(404, 'Etapa no encontrada en este plan');
  const actualizada = await etapasRepo.completarEtapa(etapaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'completar_etapa', modulo: 'planes_tratamiento', entidadId: planId, detalle: { etapaId, nombre: etapa.nombre },
  });
  const progreso = await etapasRepo.contarProgreso(planId);
  return { etapa: actualizada, progreso };
}

async function reabrirEtapa(clinicaId, planId, etapaId, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const etapa = await etapasRepo.obtener(etapaId);
  if (!etapa || etapa.plan_id !== Number(planId)) throw new ApiError(404, 'Etapa no encontrada en este plan');
  const actualizada = await etapasRepo.reabrirEtapa(etapaId);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'reabrir_etapa', modulo: 'planes_tratamiento', entidadId: planId, detalle: { etapaId },
  });
  return actualizada;
}

const ESTADOS_ETAPA = ['pendiente', 'en_progreso', 'completado', 'cancelado'];
async function actualizarEtapa(clinicaId, planId, etapaId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const etapa = await etapasRepo.obtener(etapaId);
  if (!etapa || etapa.plan_id !== Number(planId)) throw new ApiError(404, 'Etapa no encontrada en este plan');
  const estado = datos.estado || etapa.estado;
  if (!ESTADOS_ETAPA.includes(estado)) throw new ApiError(400, 'Estado inválido (pendiente, en progreso, completado o cancelado)');
  if (['finalizado', 'cancelado'].includes(plan.estado) && estado !== etapa.estado) throw new ApiError(409, `El tratamiento está ${plan.estado}: no se pueden cambiar sus etapas`);
  let piezas = datos.piezas !== undefined ? datos.piezas : etapa.piezas;
  if (typeof piezas === 'string') piezas = piezas.split(/[\s,;]+/).filter(Boolean);
  if (Array.isArray(piezas)) {
    const malas = piezas.filter((x) => !/^[1-8][1-8]$/.test(String(x)));
    if (malas.length) throw new ApiError(400, `Pieza inválida: ${malas.join(', ')}`);
    piezas = piezas.length ? [...new Set(piezas.map(String))] : null;
  }
  for (const k of ['fecha', 'fechaInicio']) if (datos[k] && !/^\d{4}-\d{2}-\d{2}$/.test(datos[k])) throw new ApiError(400, 'Fecha inválida');
  const odontologoId = datos.odontologoId !== undefined ? (Number(datos.odontologoId) || null) : (etapa.odontologo_id || usuario.odontologoId || null);
  if (odontologoId) {
    const od = await odontologosRepo.obtenerPorId(clinicaId, odontologoId);
    if (!od) throw new ApiError(400, 'Profesional no encontrado');
  }
  const actualizada = await etapasRepo.actualizarEtapa(etapaId, {
    estado, fechaInicio: datos.fechaInicio, fecha: datos.fecha !== undefined ? datos.fecha : (etapa.fecha ? String(etapa.fecha).slice(0, 10) : null),
    odontologoId, observaciones: datos.observaciones !== undefined ? String(datos.observaciones || '').slice(0, 2000) : etapa.observaciones, piezas,
  });
  // El tratamiento arranca cuando arranca su primera etapa.
  if (['en_progreso', 'completado'].includes(estado) && plan.estado === 'pendiente') {
    await require('../../config/db').query("UPDATE planes_tratamiento SET estado='en_proceso', fecha_inicio=COALESCE(fecha_inicio, CURRENT_DATE), actualizado_en=now() WHERE id=$1", [plan.id]);
  }
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'editar_etapa', modulo: 'planes_tratamiento', entidadId: planId,
    detalle: { etapaId: Number(etapaId), nombre: etapa.nombre, antes: { estado: etapa.estado, observaciones: etapa.observaciones }, despues: { estado: actualizada.estado, observaciones: actualizada.observaciones } },
  });
  return { etapa: actualizada, progreso: await etapasRepo.contarProgreso(planId) };
}

async function crear(clinicaId, datos, usuario) {
  if (!datos.pacienteId || !datos.nombre) throw new ApiError(400, 'Paciente y nombre del tratamiento son obligatorios');
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  if (datos.odontologoId) {
    const odontologo = await odontologosRepo.obtenerPorId(clinicaId, datos.odontologoId);
    if (!odontologo) throw new ApiError(404, 'Odontólogo no encontrado en esta clínica');
  }
  const plan = await repo.crear(clinicaId, datos);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'planes_tratamiento', entidadId: plan.id, detalle: { nombre: plan.nombre },
  });
  return plan;
}

async function actualizar(clinicaId, id, datos, usuario) {
  const plan = await repo.actualizar(clinicaId, id, datos);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'editar', modulo: 'planes_tratamiento', entidadId: id, detalle: datos,
  });
  return plan;
}

/* Registrar una sesión: crea la sesión, actualiza automáticamente el progreso
   del plan (sesiones_realizadas + estado), y agrega entrada a historia clínica,
   tal como piden explícitamente los prompts maestros. */
async function registrarSesion(clinicaId, planId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  if (plan.estado === 'finalizado' || plan.estado === 'cancelado') {
    throw new ApiError(409, `No se pueden registrar sesiones en un plan ${plan.estado}`);
  }

  const numero = (await repo.contarSesiones(planId)) + 1;
  await repo.crearSesion(planId, numero, datos);
  await repo.incrementarSesionesRealizadas(planId);

  await historiaRepo.crear(clinicaId, {
    pacienteId: plan.paciente_id,
    odontologoId: datos.odontologoId || plan.odontologo_id,
    fecha: datos.fecha,
    procedimiento: datos.procedimiento,
    tratamientoId: plan.tratamiento_id,
    evolucion: datos.evolucion,
    observaciones: `Sesión ${numero}/${plan.sesiones_totales} del plan "${plan.nombre}". ${datos.observaciones || ''}`.trim(),
    proximaConsulta: datos.proximaSesion || null,
  }, usuario.id);

  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'registrar_sesion', modulo: 'planes_tratamiento', entidadId: planId,
    detalle: { numero, procedimiento: datos.procedimiento },
  });

  // La última sesión finaliza el plan: programar su recall (antes solo se
  // hacía con "completar", que la pantalla nunca llama).
  const despues = await repo.obtenerPorId(clinicaId, planId);
  if (despues && despues.estado === 'finalizado') {
    await programarRecallDeFin(clinicaId, planId, datos.fecha ? String(datos.fecha).slice(0, 10) : null, usuario);
  }

  return obtener(clinicaId, planId);
}

/* Seguimiento a largo plazo: al terminar un plan cuyo tratamiento tiene
   control periódico asociado (implante, endodoncia, prótesis…), queda
   programado el recall sin que nadie tenga que acordarse. Se llama tanto al
   completar el plan a mano como cuando la última sesión lo finaliza sola. */
async function programarRecallDeFin(clinicaId, id, fecha, usuario) {
  try {
    const previo = await repo.obtenerPorId(clinicaId, id);
    if (previo) {
      const recalls = require('../recalls/recalls.service');
      await recalls.registrarAtencion(clinicaId, { pacienteId: previo.paciente_id, tratamientoId: previo.tratamiento_id, odontologoId: previo.odontologo_id, fecha }, usuario);
    }
  } catch (e) { console.error('[recalls] no se pudo programar el recall del plan:', e.message); }
}

async function completar(clinicaId, id, usuario) {
  const plan = await actualizar(clinicaId, id, { estado: 'finalizado' }, usuario);
  await programarRecallDeFin(clinicaId, id, null, usuario);
  return plan;
}

async function cancelar(clinicaId, id, usuario) {
  return actualizar(clinicaId, id, { estado: 'cancelado' }, usuario);
}

// ---- Fase 5: Inventario ↔ procedimientos ----
// Catálogo de insumos activos, de solo lectura, para que el odontólogo
// pueda elegir qué material consumió sin necesitar el permiso de gestión
// de inventario (separación de responsabilidades: consumir ≠ administrar
// stock/proveedores). Se expone bajo el mismo permiso que ya tiene para
// registrar sesiones/etapas de un plan.
async function listarInsumosParaConsumo(clinicaId) {
  return inventarioService.listarInsumos(clinicaId, {});
}

// Registra el consumo de un insumo durante una etapa o sesión, descontando
// stock automáticamente, sin que el dentista tenga que salir del flujo
// clínico para ir a gestionar inventario.
async function registrarMaterialEtapa(clinicaId, planId, etapaId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const etapa = await etapasRepo.obtener(etapaId);
  if (!etapa || etapa.plan_id !== Number(planId)) throw new ApiError(404, 'Etapa no encontrada en este plan');
  const resultado = await inventarioService.registrarConsumoProcedimiento(clinicaId, 'etapa', etapaId, datos, usuario);
  return { ...resultado, materiales: await inventarioService.listarMaterialesDeEtapa(etapaId) };
}

async function registrarMaterialSesion(clinicaId, planId, sesionId, datos, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  const resultado = await inventarioService.registrarConsumoProcedimiento(clinicaId, 'sesion', sesionId, datos, usuario);
  return { ...resultado, materiales: await inventarioService.listarMaterialesDeSesion(sesionId) };
}

// ---- Fase 5: Tratamientos ↔ presupuesto ----
// Genera un presupuesto a partir de un plan de tratamiento existente (un
// único ítem con el precio/descuento ya cargados en el plan) y lo vincula,
// para que el odontólogo no tenga que recargar los datos a mano.
async function generarPresupuesto(clinicaId, planId, usuario) {
  const plan = await repo.obtenerPorId(clinicaId, planId);
  if (!plan) throw new ApiError(404, 'Plan de tratamiento no encontrado');
  if (plan.presupuesto_id) throw new ApiError(409, 'Este plan ya tiene un presupuesto asociado');

  const presupuesto = await presupuestosService.crear(clinicaId, {
    pacienteId: plan.paciente_id,
    odontologoId: plan.odontologo_id,
    descuento: plan.descuento,
    observaciones: `Generado automáticamente desde el plan de tratamiento "${plan.nombre}"`,
    items: [{
      tratamientoId: plan.tratamiento_id,
      descripcion: plan.nombre,
      pieza: plan.pieza,
      cantidad: 1,
      precioUnitario: plan.precio,
    }],
  }, usuario);

  const actualizado = await repo.vincularPresupuesto(clinicaId, planId, presupuesto.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'generar_presupuesto', modulo: 'planes_tratamiento', entidadId: planId,
    detalle: { presupuestoId: presupuesto.id },
  });
  return actualizado;
}

module.exports = {
  actualizarEtapa,
  listarPorPaciente, obtener, crear, actualizar, registrarSesion, completar, cancelar,
  crearEtapa, aplicarEtapas, completarEtapa, reabrirEtapa,
  registrarMaterialEtapa, registrarMaterialSesion, generarPresupuesto, listarInsumosParaConsumo,
};
