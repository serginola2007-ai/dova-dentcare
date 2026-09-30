const { query } = require('../config/db');

async function registrar({ clinicaId, usuarioId, usuarioNombre, accion, modulo, entidadId, detalle }) {
  try {
    await query(
      `INSERT INTO auditoria (clinica_id, usuario_id, usuario_nombre, accion, modulo, entidad_id, detalle)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [clinicaId, usuarioId || null, usuarioNombre || null, accion, modulo, entidadId ? String(entidadId) : null, detalle ? JSON.stringify(detalle) : null]
    );
  } catch (err) {
    // La auditoría nunca debe tumbar la operación principal.
    console.error('[auditoria] error al registrar', err.message);
  }
}

module.exports = { registrar };
