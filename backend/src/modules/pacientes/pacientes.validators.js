const { body, query, param } = require('express-validator');

const crearPacienteValidators = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email inválido'),
  body('fechaNacimiento').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha de nacimiento inválida'),
];

const actualizarPacienteValidators = [
  param('id').isInt().withMessage('ID inválido'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email inválido'),
  body('fechaNacimiento').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha de nacimiento inválida'),
];

const listarPacientesValidators = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { crearPacienteValidators, actualizarPacienteValidators, listarPacientesValidators };
