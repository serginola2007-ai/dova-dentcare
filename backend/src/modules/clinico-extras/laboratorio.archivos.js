/* Archivos de un trabajo de laboratorio (fotos de color, PDF de la orden,
   modelos STL del escaneo). Se guardan en la base. */
const express = require('express');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { requirePermiso } = require('../../middlewares/rbac.middleware');
const { crearUploadMemoria, tipoReal } = require('../../utils/upload');
const auditoria = require('../../utils/auditoria');

const router = express.Router();
const subir = crearUploadMemoria(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'model/stl', 'application/sla', 'application/vnd.ms-pki.stl', 'application/octet-stream'], 30);
const VER = ['laboratorio.manage', 'pacientes.clinical.view'];
const h = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };

async function trabajo(req) {
  const t = (await query('SELECT id, paciente_id FROM laboratorio WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.id)])).rows[0];
  if (!t) throw new ApiError(404, 'Trabajo de laboratorio no encontrado');
  return t;
}
// STL: binario (cabecera de 80 bytes + cantidad de triángulos) o texto que empieza con "solid".
function esStl(buf, nombre) {
  if (!/\.stl$/i.test(nombre || '')) return false;
  if (buf.slice(0, 5).toString('latin1').toLowerCase() === 'solid') return true;
  if (buf.length >= 84) { const n = buf.readUInt32LE(80); return buf.length === 84 + n * 50; }
  return false;
}

router.get('/laboratorio/:id/archivos', requirePermiso(...VER), h(async (req) => {
  await trabajo(req);
  return (await query(`SELECT a.id, a.nombre, a.mime, a.tamano, a.creado_en, a.subido_por, u.nombre AS subido_por_nombre FROM laboratorio_archivos a
                        LEFT JOIN usuarios u ON u.id=a.subido_por WHERE a.clinica_id=$1 AND a.laboratorio_id=$2 ORDER BY a.id DESC`, [req.clinicaId, Number(req.params.id)])).rows;
}));

router.post('/laboratorio/:id/archivos', requirePermiso('laboratorio.manage'), subir.single('archivo'), h(async (req) => {
  const t = await trabajo(req);
  const f = req.file;
  if (!f || !f.buffer || !f.buffer.length) throw new ApiError(400, 'Elegí el archivo');
  const mime = tipoReal(f.buffer) || (esStl(f.buffer, f.originalname) ? 'model/stl' : null);
  if (!mime || mime === 'application/dicom') throw new ApiError(400, 'El archivo tiene que ser una imagen (JPG, PNG, WEBP), un PDF o un modelo STL');
  const nombre = String(f.originalname || 'archivo').replace(/[^\w.\- ]/g, '_').slice(0, 200);
  const r = (await query(`INSERT INTO laboratorio_archivos (clinica_id, laboratorio_id, nombre, mime, tamano, archivo, subido_por)
                           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nombre, mime, tamano, creado_en`, [req.clinicaId, t.id, nombre, mime, f.buffer.length, f.buffer, req.usuario.id])).rows[0];
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'subir_archivo_laboratorio', modulo: 'laboratorio', entidadId: t.id, detalle: { archivoId: r.id, nombre, mime } });
  return r;
}));

router.get('/laboratorio/archivos/:archivoId', requirePermiso(...VER), async (req, res, next) => {
  try {
    const a = (await query('SELECT nombre, mime, archivo FROM laboratorio_archivos WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.archivoId)])).rows[0];
    if (!a) throw new ApiError(404, 'Archivo no encontrado');
    const inline = /^image\/|application\/pdf/.test(a.mime);
    res.set({ 'Content-Type': a.mime, 'Content-Length': a.archivo.length, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${a.nombre.replace(/"/g, '')}"` });
    res.end(a.archivo);
  } catch (e) { next(e); }
});

router.delete('/laboratorio/archivos/:archivoId', requirePermiso('laboratorio.manage'), h(async (req) => {
  const a = (await query('SELECT id, laboratorio_id, nombre, subido_por FROM laboratorio_archivos WHERE clinica_id=$1 AND id=$2', [req.clinicaId, Number(req.params.archivoId)])).rows[0];
  if (!a) throw new ApiError(404, 'Archivo no encontrado');
  // Solo quien lo subió o un administrador puede quitarlo.
  const permisos = req.usuario.permisos || [];
  if (a.subido_por !== req.usuario.id && !permisos.includes('usuarios.manage')) throw new ApiError(403, 'Solo quien subió el archivo o un administrador puede quitarlo');
  await query('DELETE FROM laboratorio_archivos WHERE id=$1', [a.id]);
  await auditoria.registrar({ clinicaId: req.clinicaId, usuarioId: req.usuario.id, usuarioNombre: req.usuario.nombre, accion: 'eliminar_archivo_laboratorio', modulo: 'laboratorio', entidadId: a.laboratorio_id, detalle: { archivoId: a.id, nombre: a.nombre } });
  return { ok: true };
}));

module.exports = router;
