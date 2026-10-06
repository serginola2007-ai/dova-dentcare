const { validationResult } = require('express-validator');
const { ApiError } = require('../../middlewares/error.middleware');
const service = require('./pacientes.service');

/* Mínimo privilegio sobre datos de salud: quien no tiene permisos clínicos
   (p. ej. recepción) no recibe alergias, medicación ni antecedentes, y
   tampoco los puede modificar desde la ficha administrativa. */
const CLINICOS_BD = ['alergias', 'medicamentos', 'antecedentes_medicos', 'antecedentes_odontologicos', 'grupo_sanguineo'];
const CLINICOS_IN = ['alergias', 'medicamentos', 'antecedentesMedicos', 'antecedentesOdontologicos', 'grupoSanguineo'];
const tiene = (req, ...c) => c.some((x) => (req.usuario.permisos || []).includes(x));
const veClinico = (req) => tiene(req, 'pacientes.clinical.view', 'historia_clinica.view', 'historia_clinica.edit', 'pacientes.clinical.edit');
const editaClinico = (req) => tiene(req, 'pacientes.clinical.edit', 'historia_clinica.edit');
function filtrar(req, p) {
  if (!p || typeof p !== 'object' || veClinico(req)) return p;
  const out = { ...p }; for (const k of CLINICOS_BD) delete out[k];
  out.datosClinicosOcultos = true;
  return out;
}
function limpiarEntrada(req) {
  if (editaClinico(req) || !req.body) return;
  for (const k of CLINICOS_IN) delete req.body[k];
}

function checkValidation(req) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    throw new ApiError(400, 'Datos inválidos', errores.array());
  }
}

async function listar(req, res, next) {
  try {
    checkValidation(req);
    const { q, page, pageSize, incluirInactivos, eliminados } = req.query;
    const resultado = await service.listar(req.clinicaId, {
      q, page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      incluirInactivos: incluirInactivos === 'true',
      soloEliminados: eliminados === 'true',
    });
    if (resultado && Array.isArray(resultado.data)) resultado.data = resultado.data.map((p) => filtrar(req, p));
    else if (Array.isArray(resultado)) { res.json(resultado.map((p) => filtrar(req, p))); return; }
    res.json(resultado);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const paciente = await service.obtener(req.clinicaId, req.params.id);
    res.json(filtrar(req, paciente));
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    checkValidation(req);
    limpiarEntrada(req);
    const paciente = await service.crear(req.clinicaId, req.body, req.usuario);
    res.status(201).json(filtrar(req, paciente));
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    checkValidation(req);
    limpiarEntrada(req);
    const paciente = await service.actualizar(req.clinicaId, req.params.id, req.body, req.usuario);
    res.json(filtrar(req, paciente));
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const r = await service.eliminar(req.clinicaId, req.params.id, req.usuario);
    res.json({ ok: true, ...r });
  } catch (err) { next(err); }
}

async function resumenBaja(req, res, next) {
  try { res.json(await service.resumenBaja(req.clinicaId, req.params.id)); } catch (err) { next(err); }
}
async function restaurar(req, res, next) {
  try { res.json(await service.restaurar(req.clinicaId, req.params.id, req.usuario)); } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar, resumenBaja, restaurar };
