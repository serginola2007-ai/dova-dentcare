const { query } = require('../config/db');
const contexto = require('./contexto');

/* Registro de auditoría: quién, qué, sobre qué recurso, cuándo, desde qué IP
   y con qué resultado ('ok', 'fallido', 'denegado'). "detalle" guarda los
   datos relevantes (antes/después, motivo). */
async function registrar({ clinicaId, usuarioId, usuarioNombre, accion, modulo, entidadId, detalle, resultado, ip }) {
  try {
    await query(
      `INSERT INTO auditoria (clinica_id, usuario_id, usuario_nombre, accion, modulo, entidad_id, detalle, ip, resultado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [clinicaId, usuarioId || null, usuarioNombre || null, accion, modulo, entidadId ? String(entidadId) : null,
        detalle ? JSON.stringify(detalle) : null, (ip || contexto.actual().ip || null), resultado || 'ok']
    );
  } catch (err) {
    // La auditoría nunca debe tumbar la operación principal.
    console.error('[auditoria] error al registrar', err.message);
  }
}

module.exports = { registrar };
