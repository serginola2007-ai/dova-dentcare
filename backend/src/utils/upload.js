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

const MIME_IMAGENES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_ESTUDIOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/dicom'];

module.exports = { RAIZ_UPLOADS, crearUpload, MIME_IMAGENES, MIME_ESTUDIOS };
