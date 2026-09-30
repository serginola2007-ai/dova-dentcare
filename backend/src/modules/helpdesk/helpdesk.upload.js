const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const { RAIZ_UPLOADS } = require('../../utils/upload');
const DESTINO = path.join(RAIZ_UPLOADS, 'tickets');
require('fs').mkdirSync(DESTINO, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DESTINO),
  filename: (req, file, cb) => {
    // Nombre interno nunca es el original: evita path traversal y colisiones.
    const nombreSeguro = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`;
    cb(null, nombreSeguro);
  },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

module.exports = { upload };
