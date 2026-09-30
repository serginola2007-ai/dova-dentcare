const bcrypt = require('bcryptjs');
const repo = require('./usuarios.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');

const ROLES_SISTEMA = ['admin', 'odontologo', 'recepcion', 'asistente', 'helpdesk'];
const DISENOS_VALIDOS = ['moderno', 'minimalista', 'tecnico'];

// ---- Roles ----
async function listarRoles(clinicaId) {
  return repo.listarRoles(clinicaId);
}

async function detalleRol(clinicaId, id) {
  const rol = await repo.obtenerRol(clinicaId, id);
  if (!rol) throw new ApiError(404, 'Rol no encontrado');
  const permisos = await repo.permisosDeRol(id);
  return { ...rol, permisos };
}

async function crearRol(clinicaId, { codigo, nombre }) {
  if (!codigo || !nombre) throw new ApiError(400, 'codigo y nombre son requeridos');
  const codigoNorm = codigo.toLowerCase().trim().replace(/\s+/g, '_');
  if (ROLES_SISTEMA.includes(codigoNorm)) {
    throw new ApiError(409, 'Ese código de rol está reservado para roles de sistema');
  }
  const existente = await repo.obtenerRolPorCodigo(clinicaId, codigoNorm);
  if (existente) {
    throw new ApiError(409, `Ya existe un rol con el código "${codigoNorm}"`);
  }
  return repo.crearRol(clinicaId, { codigo: codigoNorm, nombre });
}

async function actualizarPermisosRol(clinicaId, rolId, codigosPermisos, actor) {
  const rol = await repo.obtenerRol(clinicaId, rolId);
  if (!rol) throw new ApiError(404, 'Rol no encontrado');
  if (rol.codigo === 'admin') {
    throw new ApiError(403, 'El rol admin siempre tiene todos los permisos y no puede modificarse');
  }
  const permisos = await repo.actualizarPermisosRol(rolId, codigosPermisos || []);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_permisos_rol', modulo: 'administracion', entidadId: rolId,
    detalle: { codigos: codigosPermisos },
  });
  return permisos;
}

async function listarPermisos() {
  return repo.listarPermisos();
}

// ---- Usuarios ----
async function listar(clinicaId, opts) {
  return repo.listar(clinicaId, opts);
}

async function obtenerConPermisos(clinicaId, id) {
  const usuario = await repo.obtener(clinicaId, id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  const overrides = await repo.overridesDeUsuario(id);
  const permisosRol = await repo.permisosDeRol(usuario.rol_id);
  return { ...usuario, permisosRol, overrides };
}

async function crear(clinicaId, datos, actor) {
  const { nombre, username, email, password, rolId, odontologoId } = datos;
  if (!nombre || !username || !password || !rolId) {
    throw new ApiError(400, 'nombre, username, password y rolId son requeridos');
  }
  if (password.length < 6) throw new ApiError(400, 'La contraseña debe tener al menos 6 caracteres');
  const yaExiste = await repo.existeUsername(clinicaId, username);
  if (yaExiste) throw new ApiError(409, 'Ese nombre de usuario ya está en uso en esta clínica');

  const rol = await repo.obtenerRol(clinicaId, rolId);
  if (!rol) throw new ApiError(400, 'El rol indicado no existe');

  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await repo.crear(clinicaId, { nombre, username, email, passwordHash, rolId, odontologoId });

  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'crear_usuario', modulo: 'administracion', entidadId: usuario.id,
    detalle: { username, rol: rol.codigo },
  });
  return usuario;
}

async function actualizar(clinicaId, id, datos, actor) {
  const usuario = await repo.obtener(clinicaId, id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');

  const campos = {};
  if (datos.nombre !== undefined) campos.nombre = datos.nombre;
  if (datos.email !== undefined) campos.email = datos.email;
  if (datos.odontologoId !== undefined) campos.odontologo_id = datos.odontologoId;

  if (datos.username !== undefined && datos.username !== usuario.username) {
    const yaExiste = await repo.existeUsername(clinicaId, datos.username, id);
    if (yaExiste) throw new ApiError(409, 'Ese nombre de usuario ya está en uso en esta clínica');
    campos.username = datos.username;
  }

  if (datos.rolId !== undefined && datos.rolId !== usuario.rol_id) {
    const rol = await repo.obtenerRol(clinicaId, datos.rolId);
    if (!rol) throw new ApiError(400, 'El rol indicado no existe');
    if (usuario.es_admin_protegido && rol.codigo !== 'admin') {
      throw new ApiError(403, 'No se puede cambiar el rol del administrador protegido');
    }
    // Si el usuario deja de ser admin, la clínica no puede quedar sin ningún admin activo.
    if (usuario.rol_codigo === 'admin' && rol.codigo !== 'admin' && usuario.activo) {
      const admins = await repo.contarAdminsActivos(clinicaId, id);
      if (admins === 0) {
        throw new ApiError(403, 'No se puede cambiar el rol: la clínica quedaría sin administradores activos');
      }
    }
    campos.rol_id = datos.rolId;
  }

  if (datos.activo !== undefined && datos.activo !== usuario.activo) {
    if (usuario.es_admin_protegido && datos.activo === false) {
      throw new ApiError(403, 'No se puede desactivar al administrador protegido');
    }
    if (datos.activo === false && usuario.rol_codigo === 'admin') {
      const admins = await repo.contarAdminsActivos(clinicaId, id);
      if (admins === 0) {
        throw new ApiError(403, 'No se puede desactivar: la clínica quedaría sin administradores activos');
      }
    }
    campos.activo = datos.activo;
  }

  if (Object.keys(campos).length === 0) return obtenerConPermisos(clinicaId, id);

  await repo.actualizar(clinicaId, id, campos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_usuario', modulo: 'administracion', entidadId: id, detalle: campos,
  });
  return obtenerConPermisos(clinicaId, id);
}

async function cambiarPassword(clinicaId, id, nuevaPassword, actor) {
  const usuario = await repo.obtener(clinicaId, id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  if (!nuevaPassword || nuevaPassword.length < 6) {
    throw new ApiError(400, 'La contraseña debe tener al menos 6 caracteres');
  }
  const hash = await bcrypt.hash(nuevaPassword, 10);
  await repo.cambiarPassword(id, hash);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'cambiar_password', modulo: 'administracion', entidadId: id,
  });
  return { ok: true };
}

async function setOverride(clinicaId, usuarioId, codigoPermiso, allow, actor) {
  const usuario = await repo.obtener(clinicaId, usuarioId);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  if (usuario.es_admin_protegido) {
    throw new ApiError(403, 'El administrador protegido siempre tiene todos los permisos; no admite overrides');
  }
  const overrides = await repo.setOverride(usuarioId, codigoPermiso, allow);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'set_override_permiso', modulo: 'administracion', entidadId: usuarioId,
    detalle: { codigoPermiso, allow },
  });
  return overrides;
}

async function quitarOverride(clinicaId, usuarioId, codigoPermiso, actor) {
  const usuario = await repo.obtener(clinicaId, usuarioId);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  const overrides = await repo.quitarOverride(usuarioId, codigoPermiso);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'quitar_override_permiso', modulo: 'administracion', entidadId: usuarioId,
    detalle: { codigoPermiso },
  });
  return overrides;
}

// ---- Preferencia de diseño propia (self-service, cualquier usuario logueado) ----
async function actualizarMiDisenoPreferido(usuarioId, disenoPreferido) {
  if (!DISENOS_VALIDOS.includes(disenoPreferido)) {
    throw new ApiError(400, `disenoPreferido debe ser uno de: ${DISENOS_VALIDOS.join(', ')}`);
  }
  const actualizado = await repo.actualizarDisenoPreferido(usuarioId, disenoPreferido);
  if (!actualizado) throw new ApiError(404, 'Usuario no encontrado');
  return { disenoPreferido: actualizado.diseno_preferido };
}

// Baja de un usuario o cambio de permisos: se aplica al instante (el control
// de sesión guarda el estado del usuario unos segundos).
const { olvidarUsuario } = require('../../middlewares/auth.middleware');
const conOlvido = (fn, idArg) => async (...args) => {
  const r = await fn(...args);
  olvidarUsuario(idArg === null ? undefined : args[idArg]);
  return r;
};

module.exports = {
  listarRoles, detalleRol, crearRol, actualizarPermisosRol: conOlvido(actualizarPermisosRol, null), listarPermisos,
  listar, obtenerConPermisos, crear, actualizar: conOlvido(actualizar, 1), cambiarPassword,
  setOverride: conOlvido(setOverride, 1), quitarOverride: conOlvido(quitarOverride, 1),
  actualizarMiDisenoPreferido,
};
