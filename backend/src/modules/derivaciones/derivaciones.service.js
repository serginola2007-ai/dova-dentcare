const repo = require('./derivaciones.repository');
const { ApiError } = require('../../middlewares/error.middleware');
const pacientesRepo = require('../pacientes/pacientes.repository');
const auditoria = require('../../utils/auditoria');
const { query } = require('../../config/db');
const { tipoReal } = require('../../utils/upload');

const ESTADOS_VALIDOS = ['pendiente', 'atendida', 'rechazada'];

async function listar(clinicaId, filtros) {
  return repo.listar(clinicaId, filtros);
}

async function obtener(clinicaId, id) {
  const derivacion = await repo.obtener(clinicaId, id);
  if (!derivacion) throw new ApiError(404, 'Derivación no encontrada');
  return derivacion;
}

async function crear(clinicaId, datos, usuario, archivo) {
  if (!datos.pacienteId || !datos.odontologoDestinoId || !String(datos.motivo || '').trim()) {
    throw new ApiError(400, 'Elegí el paciente, el profesional de destino y escribí el motivo');
  }
  const paciente = await pacientesRepo.obtenerPorId(clinicaId, datos.pacienteId);
  if (!paciente) throw new ApiError(404, 'Paciente no encontrado en esta clínica');
  for (const id of [datos.odontologoDestinoId, datos.odontologoOrigenId].filter(Boolean)) {
    const o = await query('SELECT id FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(id)]);
    if (!o.rowCount) throw new ApiError(400, 'El profesional no es de esta clínica');
  }
  let adj = {};
  if (archivo && archivo.buffer && archivo.buffer.length) {
    const mime = tipoReal(archivo.buffer);
    if (!mime) throw new ApiError(400, 'El adjunto tiene que ser una imagen (JPG, PNG, WEBP), un PDF o un DICOM');
    adj = { archivoNombre: String(archivo.originalname || 'adjunto').slice(0, 200), archivoDatos: archivo.buffer, archivoMime: mime, archivoTamano: archivo.buffer.length };
  }
  const derivacion = await repo.crear(clinicaId, { ...datos, ...adj }, usuario.id);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'crear', modulo: 'derivaciones', entidadId: derivacion.id,
    detalle: { pacienteId: datos.pacienteId, odontologoDestinoId: datos.odontologoDestinoId },
  });
  return derivacion;
}

async function cambiarEstado(clinicaId, id, estado, usuario) {
  const existente = await repo.obtener(clinicaId, id);
  if (!existente) throw new ApiError(404, 'Derivación no encontrada');
  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new ApiError(400, `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`);
  }
  const derivacion = await repo.cambiarEstado(clinicaId, id, estado);
  await auditoria.registrar({
    clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre,
    accion: 'cambiar_estado', modulo: 'derivaciones', entidadId: id, detalle: { estado },
  });
  return derivacion;
}

async function archivo(clinicaId, id, usuario) {
  const d = (await query('SELECT id, paciente_id, archivo, archivo_mime, archivo_nombre, archivo_path FROM derivaciones WHERE clinica_id=$1 AND id=$2', [clinicaId, id])).rows[0];
  if (!d) throw new ApiError(404, 'Derivación no encontrada');
  let datos = d.archivo; let mime = d.archivo_mime;
  if (!datos && d.archivo_path) { try { datos = require('fs').readFileSync(d.archivo_path); mime = tipoReal(datos); } catch (_e) { datos = null; } }
  if (!datos) throw new ApiError(404, d.archivo_nombre ? 'El adjunto ya no está disponible (se subió antes de guardar los archivos en la base). Volvé a subirlo.' : 'La derivación no tiene adjunto');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'ver_adjunto_derivacion', modulo: 'derivaciones', entidadId: id, detalle: { pacienteId: d.paciente_id } });
  return { datos, mime: mime || 'application/octet-stream', nombre: d.archivo_nombre };
}

module.exports = { listar, obtener, crear, cambiarEstado, archivo, ESTADOS_VALIDOS };
