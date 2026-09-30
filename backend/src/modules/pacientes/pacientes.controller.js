const { validationResult } = require('express-validator');
const { ApiError } = require('../../middlewares/error.middleware');
const service = require('./pacientes.service');

function checkValidation(req) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    throw new ApiError(400, 'Datos inválidos', errores.array());
  }
}

async function listar(req, res, next) {
  try {
    checkValidation(req);
    const { q, page, pageSize, incluirInactivos } = req.query;
    const resultado = await service.listar(req.clinicaId, {
      q, page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      incluirInactivos: incluirInactivos === 'true',
    });
    res.json(resultado);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const paciente = await service.obtener(req.clinicaId, req.params.id);
    res.json(paciente);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    checkValidation(req);
    const paciente = await service.crear(req.clinicaId, req.body, req.usuario);
    res.status(201).json(paciente);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    checkValidation(req);
    const paciente = await service.actualizar(req.clinicaId, req.params.id, req.body, req.usuario);
    res.json(paciente);
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    await service.eliminar(req.clinicaId, req.params.id, req.usuario);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
