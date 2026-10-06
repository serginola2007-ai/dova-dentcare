const bcrypt = require('bcryptjs');
const repo = require('./usuarios.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const sesiones = require('../../utils/sesiones');
const { query } = require('../../config/db');

/* Anti-escalada de privilegios (auditoría de seguridad):
   - nadie puede dar permisos que no tiene (salvo el administrador);
   - nadie puede cambiar su propio rol, sus propios permisos ni darse de baja;
   - solo un administrador puede tocar a otro administrador. */
const esAdmin = (actor) => actor && actor.rolCodigo === 'admin';
function exigirSubconjunto(actor, codigos, que) {
  if (esAdmin(actor)) return;
  const mios = new Set(actor.permisos || []);
  const faltan = codigos.filter((c) => !mios.has(c));
  if (faltan.length) throw new ApiError(403, `No podés ${que} con permisos que vos no tenés (${faltan.slice(0, 5).join(', ')}${faltan.length > 5 ? '…' : ''})`);
}
async function codigosDeRol(rolId) { return (await repo.permisosDeRol(rolId)).map((p) => p.codigo); }
function noSobreSiMismo(actor, id, que) { if (Number(actor.id) === Number(id)) throw new ApiError(403, `No podés ${que} sobre tu propio usuario`); }
function soloAdminSobreAdmin(actor, usuario) { if ((usuario.rol_codigo === 'admin' || usuario.es_admin_protegido) && !esAdmin(actor)) throw new ApiError(403, 'Solo un administrador puede modificar a otro administrador'); }
async function codigosValidos(codigos) {
  if (!Array.isArray(codigos) || codigos.some((c) => typeof c !== 'string')) throw new ApiError(400, 'Lista de permisos inválida');
  const unicos = [...new Set(codigos)];
  const ok = unicos.length ? (await query('SELECT codigo FROM permisos WHERE codigo = ANY($1::text[])', [unicos])).rows.map((r) => r.codigo) : [];
  if (ok.length !== unicos.length) throw new ApiError(400, 'Hay permisos que no existen');
  return unicos;
}

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
  const codigos = await codigosValidos(codigosPermisos || []);
  if (!esAdmin(actor)) {
    const yo = await repo.obtener(clinicaId, actor.id);
    if (yo && Number(yo.rol_id) === Number(rolId)) throw new ApiError(403, 'No podés cambiar los permisos de tu propio rol');
    // Solo se pueden agregar permisos que uno tiene; los que ya tenía el rol pueden quedar.
    const antes = new Set(await codigosDeRol(rolId));
    exigirSubconjunto(actor, codigos.filter((c) => !antes.has(c)), 'armar un rol');
  }
  const antesLista = await codigosDeRol(rolId);
  const permisos = await repo.actualizarPermisosRol(rolId, codigos);
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_permisos_rol', modulo: 'administracion', entidadId: rolId,
    detalle: { antes: { permisos: antesLista }, despues: { permisos: codigos } },
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
  sesiones.validarClaveFuerte(password, { username, nombre });
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(String(username))) throw new ApiError(400, 'El usuario solo puede tener letras, números, punto, guion y guion bajo (3 a 50)');
  const yaExiste = await repo.existeUsername(clinicaId, username);
  if (yaExiste) throw new ApiError(409, 'Ese nombre de usuario ya está en uso en esta clínica');

  const rol = await repo.obtenerRol(clinicaId, rolId);
  if (!rol) throw new ApiError(400, 'El rol indicado no existe');
  if (rol.codigo === 'admin' && !esAdmin(actor)) throw new ApiError(403, 'Solo un administrador puede crear administradores');
  exigirSubconjunto(actor, await codigosDeRol(rol.id), 'crear un usuario');

  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await repo.crear(clinicaId, { nombre, username, email, passwordHash, rolId, odontologoId });
  // La contraseña la eligió el administrador: la persona la cambia en su primer ingreso.
  await query('UPDATE usuarios SET debe_cambiar_clave=true WHERE id=$1', [usuario.id]);

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
  soloAdminSobreAdmin(actor, usuario);
  if (Number(actor.id) === Number(id) && ((datos.rolId !== undefined && Number(datos.rolId) !== Number(usuario.rol_id)) || (datos.activo !== undefined && datos.activo !== usuario.activo))) {
    throw new ApiError(403, 'No podés cambiar tu propio rol ni darte de baja');
  }

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
    if (rol.codigo === 'admin' && !esAdmin(actor)) throw new ApiError(403, 'Solo un administrador puede asignar el rol de administrador');
    exigirSubconjunto(actor, await codigosDeRol(rol.id), 'asignar un rol');
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
  // Cambio de rol o baja: las sesiones abiertas de ese usuario se cierran al instante.
  if (campos.rol_id !== undefined || campos.activo === false || campos.username !== undefined) await sesiones.invalidarSesiones(id, campos.activo === false ? 'baja' : 'cambio_rol');
  await auditoria.registrar({
    clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre,
    accion: 'actualizar_usuario', modulo: 'administracion', entidadId: id,
    detalle: { antes: Object.fromEntries(Object.keys(campos).map((k) => [k, usuario[k]])), despues: campos },
  });
  return obtenerConPermisos(clinicaId, id);
}

async function cambiarPassword(clinicaId, id, nuevaPassword, actor) {
  const usuario = await repo.obtener(clinicaId, id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  noSobreSiMismo(actor, id, 'blanquear la contraseña (usá "Cambiar mi contraseña", que pide la actual)');
  soloAdminSobreAdmin(actor, usuario);
  sesiones.validarClaveFuerte(nuevaPassword, { username: usuario.username, nombre: usuario.nombre });
  const hash = await bcrypt.hash(nuevaPassword, 10);
  await repo.cambiarPassword(id, hash);
  // Es una contraseña temporal: la persona la tiene que cambiar al entrar, y
  // cualquier sesión abierta con la contraseña anterior se cierra.
  await query('UPDATE usuarios SET debe_cambiar_clave=true WHERE id=$1', [id]);
  await sesiones.invalidarSesiones(id, 'blanqueo_clave');
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
  noSobreSiMismo(actor, usuarioId, 'cambiar permisos');
  soloAdminSobreAdmin(actor, usuario);
  await codigosValidos([codigoPermiso]);
  if (typeof allow !== 'boolean') throw new ApiError(400, 'allow tiene que ser verdadero o falso');
  if (allow) exigirSubconjunto(actor, [codigoPermiso], 'dar permisos');
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
  noSobreSiMismo(actor, usuarioId, 'cambiar permisos');
  soloAdminSobreAdmin(actor, usuario);
  // Quitar una prohibición equivale a dar el permiso.
  exigirSubconjunto(actor, [String(codigoPermiso)], 'dar permisos');
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
