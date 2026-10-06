const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

/* Fábrica de configuraciones multer reutilizable: nombre interno siempre
   aleatorio (nunca el original, evita path traversal/colisiones) y
   whitelist de MIME aplicada acá para rechazar antes de escribir a disco. */
// Carpeta de archivos subidos (fotos, estudios, adjuntos). En Render apunta
// al disco persistente (UPLOADS_DIR=/var/data/uploads) para que no se
// pierdan en cada actualización del servidor.
const RAIZ_UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

function crearUpload(subcarpeta, mimePermitidos, maxSizeMb = 15) {
  const destino = path.join(RAIZ_UPLOADS, subcarpeta);
  fs.mkdirSync(destino, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destino),
    filename: (req, file, cb) => {
      const nombreSeguro = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`;
      cb(null, nombreSeguro);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!mimePermitidos.includes(file.mimetype)) {
        return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
      }
      cb(null, true);
    },
  });
}

// Subida a memoria (el archivo se guarda en la base, no en el disco, que en
// Render se borra en cada actualización).
function crearUploadMemoria(mimePermitidos, maxSizeMb = 15) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!mimePermitidos.includes(file.mimetype)) return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
      cb(null, true);
    },
  });
}

// Tipo REAL del archivo según sus primeros bytes (no se confía en la extensión
// ni en lo que diga el navegador).
function tipoReal(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 132 && buf.slice(128, 132).toString('latin1') === 'DICM') return 'application/dicom';
  return null;
}

const MIME_IMAGENES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_ESTUDIOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/dicom'];

/* Archivos viejos guardados en disco: la ruta registrada en la base solo se usa
   si queda DENTRO de la carpeta de subidas (nunca ../, rutas absolutas ajenas
   ni enlaces fuera). Devuelve la ruta resuelta o null. */
function rutaSegura(p) {
  if (!p || typeof p !== 'string' || p.includes('\0')) return null;
  const raiz = path.resolve(RAIZ_UPLOADS);
  const r = path.resolve(raiz, p);
  if (r !== raiz && r.startsWith(raiz + path.sep)) {
    try { const real = require('fs').realpathSync(r); const raizReal = require('fs').realpathSync(raiz); return real.startsWith(raizReal + path.sep) ? real : null; } catch (_e) { return null; }
  }
  return null;
}

module.exports = { rutaSegura, RAIZ_UPLOADS, crearUpload, crearUploadMemoria, tipoReal, MIME_IMAGENES, MIME_ESTUDIOS };
