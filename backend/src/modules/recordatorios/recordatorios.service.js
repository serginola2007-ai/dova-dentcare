/* Recordatorios de turnos por WhatsApp.
   - Cada recordatorio lleva un enlace privado: el paciente confirma o cancela
     su turno con un toque (página "Mi turno" de la web de la clínica).
   - Con WhatsApp Business configurado (utils/whatsapp.js), DOVA los manda
     solo el día anterior a la hora que elija la clínica, o al tocar "Enviar".
   - Sin configurar, la recepción los manda desde su WhatsApp con un click
     (enlace wa.me con el mensaje ya armado, enlace incluido).
   - Las respuestas por WhatsApp ("SÍ", "NO") y los avisos de entregado/leído
     llegan por el webhook firmado de Meta. */
const crypto = require('crypto');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const whatsapp = require('../../utils/whatsapp');
const { normalizarTelefonoPy, enlaceWhatsapp, PLANTILLAS } = require('../../utils/mensajes');
const { hoyIso } = require('../../utils/recurso');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nombreDia = (f) => new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));
const TZ = () => process.env.DOVA_TZ || 'America/Asuncion';
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

// Dirección pública de DOVA para los enlaces (Render la da sola en RENDER_EXTERNAL_URL).
function urlPublica() {
  return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
}

/* ------------------------------------------------------------ configuración */
async function configuracion(clinicaId) {
  const r = await query('SELECT nombre, recordatorio_auto, recordatorio_hora, recordatorio_dias FROM clinicas WHERE id=$1', [clinicaId]);
  const c = r.rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  return {
    whatsappConectado: whatsapp.configurado(),
    plantilla: whatsapp.cfg().plantilla,
    automatico: c.recordatorio_auto, hora: c.recordatorio_hora, dias: c.recordatorio_dias,
    ejemplo: textoRecordatorio({ nombre: 'Ana', clinica: c.nombre, fecha: sumarDias(hoyIso(), c.recordatorio_dias), hora: '09:30', odontologo: 'Dra. Pérez', enlace: `${urlPublica()}/web/mi-turno.html#t=…` }),
  };
}
async function guardarConfiguracion(clinicaId, d, actor) {
  const campos = {};
  if (d.automatico !== undefined) { if (typeof d.automatico !== 'boolean') throw new ApiError(400, 'automatico tiene que ser sí o no'); campos.recordatorio_auto = d.automatico; }
  if (d.hora !== undefined) { const h = Number(d.hora); if (!Number.isInteger(h) || h < 6 || h > 21) throw new ApiError(400, 'La hora de envío tiene que estar entre las 6 y las 21'); campos.recordatorio_hora = h; }
  if (d.dias !== undefined) { const n = Number(d.dias); if (![1, 2, 3].includes(n)) throw new ApiError(400, 'Se puede avisar con 1, 2 o 3 días de anticipación'); campos.recordatorio_dias = n; }
  const cols = Object.keys(campos);
  if (cols.length) {
    await query(`UPDATE clinicas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE id=$1`, [clinicaId, ...cols.map((c) => campos[c])]);
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'config_recordatorios', modulo: 'agenda', detalle: campos });
  }
  return configuracion(clinicaId);
}

/* ------------------------------------------------------------ texto y enlace */
function textoRecordatorio({ nombre, clinica, fecha, hora, odontologo, enlace }) {
  return `${PLANTILLAS.recordatorio_turno({ nombre, clinica, fecha, hora, odontologo }).replace(/ Por favor confirmá.*$/, '')} Confirmá o cancelá tu turno acá: ${enlace}`;
}

// Enlace privado del turno (vale hasta el día siguiente al turno). Solo se guarda su hash.
async function crearEnlace(turno) {
  const token = crypto.randomBytes(24).toString('base64url');
  await query("INSERT INTO turno_enlaces (turno_id, token_hash, expira_en) VALUES ($1,$2,($3::date + 2)::timestamptz)", [turno.id, hash(token), turno.fecha]);
  return `${urlPublica()}/web/mi-turno.html#t=${token}`;
}

const SELECT_TURNO = `SELECT t.id, t.clinica_id, t.odontologo_id, o.whatsapp_numero AS odo_wa_numero, o.whatsapp_phone_id AS odo_wa_phone, o.whatsapp_envia AS odo_wa_envia, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.estado, t.confirmacion, t.paciente_id,
    p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_recordatorios, p.acepta_whatsapp, o.nombre AS odontologo_nombre, c.nombre AS clinica_nombre
  FROM turnos t JOIN pacientes p ON p.id=t.paciente_id LEFT JOIN odontologos o ON o.id=t.odontologo_id JOIN clinicas c ON c.id=t.clinica_id`;

async function turnoDeLaClinica(clinicaId, turnoId, actor) {
  const r = await query(`${SELECT_TURNO} WHERE t.clinica_id=$1 AND t.id=$2`, [clinicaId, Number(turnoId)]);
  if (!r.rowCount) throw new ApiError(404, 'Turno no encontrado');
  const t = r.rows[0];
  // Un odontólogo con "recordatorios.propios" solo maneja los turnos de sus pacientes.
  if (actor && !puedeTodos(actor) && Number(t.odontologo_id) !== Number(actor.odontologoId)) throw new ApiError(403, 'Solo podés mandar los recordatorios de tus propios turnos');
  return t;
}
const puedeTodos = (actor) => (actor.permisos || []).some((p) => p === 'whatsapp.send' || p === 'agenda.edit');

// De qué número sale: el del odontólogo si está conectado a WhatsApp Business, si no el de la clínica.
function remitenteApi(t) {
  if (t.odo_wa_envia && t.odo_wa_phone) return { numeroId: t.odo_wa_phone, nombre: `${t.odontologo_nombre || 'Odontólogo'}${t.odo_wa_numero ? ` (${t.odo_wa_numero})` : ''}` };
  return { numeroId: null, nombre: 'Número de la clínica' };
}
function motivoNoEnviable(t) {
  if (!['reservado', 'confirmado'].includes(t.estado)) return 'El turno no está vigente';
  if (t.acepta_recordatorios === false || t.acepta_whatsapp === false) return 'El paciente no acepta recordatorios por WhatsApp';
  if (!normalizarTelefonoPy(t.whatsapp || t.telefono)) return 'El paciente no tiene un celular válido';
  return null;
}

/* ------------------------------------------------------------ listado del día */
async function listar(clinicaId, fecha, actor = null, { soloMios = false } = {}) {
  const f = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : sumarDias(hoyIso(), 1);
  // Sin permiso general, el odontólogo ve solo sus turnos.
  const filtroOdo = actor && actor.odontologoId && (soloMios || !puedeTodos(actor)) ? Number(actor.odontologoId) : (actor && !puedeTodos(actor) ? -1 : null);
  const r = await query(`${SELECT_TURNO.replace(' FROM turnos t', ', e.envio_estado, e.envio_error, e.envio_canal, e.envio_respuesta, e.envio_en, e.envio_remitente FROM turnos t')}
      LEFT JOIN LATERAL (SELECT e.estado AS envio_estado, e.error AS envio_error, e.canal AS envio_canal, e.respuesta AS envio_respuesta, e.actualizado_en AS envio_en, e.remitente AS envio_remitente
                           FROM recordatorios_envios e WHERE e.turno_id=t.id AND e.tipo='turno') e ON true
     WHERE t.clinica_id=$1 AND t.fecha=$2 AND t.estado IN ('reservado','confirmado') AND ($3::int IS NULL OR t.odontologo_id=$3::int)
     ORDER BY t.hora_inicio`, [clinicaId, f, filtroOdo]);
  return { fecha: f, whatsappConectado: whatsapp.configurado(), turnos: r.rows.map((t) => ({
    id: t.id, fecha: t.fecha, hora: t.hora, estado: t.estado, confirmacion: t.confirmacion, paciente_id: t.paciente_id, nombre: t.nombre, apellido: t.apellido,
    odontologo_nombre: t.odontologo_nombre, envio: t.envio_estado ? { estado: t.envio_estado, error: t.envio_error, canal: t.envio_canal, respuesta: t.envio_respuesta, en: t.envio_en } : null,
    noEnviable: motivoNoEnviable(t),
    odontologo_id: t.odontologo_id,
    remitente: t.envio_remitente || (whatsapp.configurado() ? remitenteApi(t).nombre : (t.odo_wa_numero ? `Celular de ${t.odontologo_nombre} (${t.odo_wa_numero})` : 'WhatsApp de la recepción')),
  })), soloMios: filtroOdo !== null };
}

/* ------------------------------------------------------------ envío */
// Reserva el envío (uno por turno) antes de mandar: dos procesos a la vez no lo duplican.
async function reservarEnvio(t, { canal, automatico, usuarioId, reintentar }) {
  const tel = normalizarTelefonoPy(t.whatsapp || t.telefono);
  const ins = await query(`INSERT INTO recordatorios_envios (clinica_id, turno_id, paciente_id, canal, telefono, automatico, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (turno_id, tipo) DO NOTHING RETURNING id`, [t.clinica_id, t.id, t.paciente_id, canal, tel, !!automatico, usuarioId || null]);
  if (ins.rowCount) return ins.rows[0].id;
  if (!reintentar) return null;
  // Reintento manual: solo si el anterior falló o quedó colgado.
  const up = await query(`UPDATE recordatorios_envios SET estado='enviando', error=NULL, canal=$2, telefono=$3, usuario_id=$4, automatico=false, actualizado_en=now()
      WHERE turno_id=$1 AND tipo='turno' AND (estado='fallo' OR (estado='enviando' AND actualizado_en < now() - interval '10 minutes')) RETURNING id`, [t.id, canal, tel, usuarioId || null]);
  return up.rowCount ? up.rows[0].id : null;
}

async function registrarComunicacion(t, contenido, usuarioId, resultado = 'enviado') {
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
     VALUES ($1,$2,'whatsapp','saliente','recordatorio_turno',$3,$4,'turno',$5,$6)`, [t.clinica_id, t.paciente_id, resultado, String(contenido).slice(0, 2000), t.id, usuarioId || null]);
  await query("UPDATE turnos SET confirmacion = CASE WHEN confirmacion='confirmado' THEN confirmacion ELSE 'recordatorio_enviado' END WHERE id=$1", [t.id]);
}

// Envío por la API de WhatsApp Business.
async function enviarPorApi(t, { automatico = false, usuarioId = null, reintentar = false } = {}) {
  const motivo = motivoNoEnviable(t);
  if (motivo) throw new ApiError(409, motivo);
  if (!whatsapp.configurado()) throw new ApiError(409, 'WhatsApp Business no está conectado: mandalo desde tu WhatsApp con el botón verde.');
  const envioId = await reservarEnvio(t, { canal: 'whatsapp_api', automatico, usuarioId, reintentar });
  if (!envioId) throw new ApiError(409, 'Ese recordatorio ya se envió');
  const enlace = await crearEnlace(t);
  const tel = normalizarTelefonoPy(t.whatsapp || t.telefono);
  // Valores de la plantilla: {{1}} nombre, {{2}} clínica, {{3}} día, {{4}} hora, {{5}} enlace.
  const valores = [t.nombre, t.clinica_nombre, nombreDia(t.fecha), t.hora, enlace];
  try {
    const rem = remitenteApi(t);
    const id = await whatsapp.enviarPlantilla(tel, valores, { numeroId: rem.numeroId });
    await query("UPDATE recordatorios_envios SET estado='enviado', proveedor_id=$2, remitente=$3, actualizado_en=now() WHERE id=$1", [envioId, id, rem.nombre.slice(0, 120)]);
    await registrarComunicacion(t, textoRecordatorio({ nombre: t.nombre, clinica: t.clinica_nombre, fecha: t.fecha, hora: t.hora, odontologo: t.odontologo_nombre, enlace: '(enlace privado)' }), usuarioId);
    return { ok: true, estado: 'enviado' };
  } catch (e) {
    await query("UPDATE recordatorios_envios SET estado='fallo', error=$2, actualizado_en=now() WHERE id=$1", [envioId, String(e.message).slice(0, 500)]);
    return { ok: false, estado: 'fallo', error: e.message };
  }
}

async function enviarAhora(clinicaId, turnoId, actor) {
  const t = await turnoDeLaClinica(clinicaId, turnoId, actor);
  const r = await enviarPorApi(t, { usuarioId: actor.id, reintentar: true });
  if (!r.ok) throw new ApiError(502, r.error);
  return r;
}

// Envío a mano: arma el mensaje con su enlace y devuelve el wa.me para abrir.
async function enlaceManual(clinicaId, turnoId, actor) {
  const t = await turnoDeLaClinica(clinicaId, turnoId, actor);
  const motivo = motivoNoEnviable(t);
  if (motivo) throw new ApiError(409, motivo);
  const enlace = await crearEnlace(t);
  const texto = textoRecordatorio({ nombre: t.nombre, clinica: t.clinica_nombre, fecha: t.fecha, hora: t.hora, odontologo: t.odontologo_nombre, enlace });
  const envioId = await reservarEnvio(t, { canal: 'whatsapp_manual', usuarioId: actor.id, reintentar: true });
  if (envioId) await query("UPDATE recordatorios_envios SET estado='enviado', remitente=$2, actualizado_en=now() WHERE id=$1", [envioId, `A mano: ${actor.nombre}`.slice(0, 120)]);
  await registrarComunicacion(t, texto.replace(enlace, '(enlace privado)'), actor.id);
  return { url: enlaceWhatsapp(t.whatsapp || t.telefono, texto) };
}

/* ------------------------------------------------------------ WhatsApp de cada odontólogo */
const telValido = (v) => { if (v === null || v === undefined || v === '') return null; if (typeof v !== 'string' || !normalizarTelefonoPy(v)) throw new ApiError(400, 'El número de celular no es válido (ej.: 0981 123 456)'); return v.trim().slice(0, 30); };
async function remitentes(clinicaId) {
  const r = await query(`SELECT o.id, o.nombre, o.whatsapp_numero, o.whatsapp_phone_id, o.whatsapp_envia,
      (SELECT u.nombre FROM usuarios u WHERE u.odontologo_id=o.id AND u.activo AND u.eliminado_en IS NULL LIMIT 1) AS usuario
    FROM odontologos o WHERE o.clinica_id=$1 AND o.activo ORDER BY o.nombre`, [clinicaId]);
  return { whatsappConectado: whatsapp.configurado(), odontologos: r.rows };
}
async function guardarRemitente(clinicaId, odontologoId, d, actor) {
  const o = await query('SELECT id, nombre FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(odontologoId)]);
  if (!o.rowCount) throw new ApiError(404, 'Odontólogo no encontrado');
  const campos = {};
  if (d.numero !== undefined) campos.whatsapp_numero = telValido(d.numero);
  if (d.phoneId !== undefined) {
    if (d.phoneId !== null && d.phoneId !== '' && (typeof d.phoneId !== 'string' || !/^\d{5,30}$/.test(d.phoneId.trim()))) throw new ApiError(400, 'El "Phone number ID" de Meta son solo números');
    campos.whatsapp_phone_id = d.phoneId ? d.phoneId.trim() : null;
  }
  if (d.envia !== undefined) { if (typeof d.envia !== 'boolean') throw new ApiError(400, 'envia tiene que ser sí o no'); campos.whatsapp_envia = d.envia; }
  const cols = Object.keys(campos);
  if (cols.length) await query(`UPDATE odontologos SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(', ')} WHERE clinica_id=$1 AND id=$2`, [clinicaId, o.rows[0].id, ...cols.map((c) => campos[c])]);
  const r = (await query('SELECT id, nombre, whatsapp_numero, whatsapp_phone_id, whatsapp_envia FROM odontologos WHERE id=$1', [o.rows[0].id])).rows[0];
  if (r.whatsapp_envia && !r.whatsapp_phone_id) {
    await query('UPDATE odontologos SET whatsapp_envia=false WHERE id=$1', [r.id]);
    throw new ApiError(400, 'Para mandar desde su número, cargá primero el "Phone number ID" que da Meta al conectar ese número');
  }
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'whatsapp_odontologo', modulo: 'agenda', entidadId: r.id, detalle: { numero: r.whatsapp_numero, envia: r.whatsapp_envia } });
  return r;
}
// El propio odontólogo registra su celular.
async function miWhatsapp(clinicaId, actor) {
  if (!actor.odontologoId) throw new ApiError(404, 'Tu usuario no está vinculado a un odontólogo');
  const r = await query('SELECT id, nombre, whatsapp_numero, whatsapp_envia, (whatsapp_phone_id IS NOT NULL) AS conectado FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(actor.odontologoId)]);
  if (!r.rowCount) throw new ApiError(404, 'Odontólogo no encontrado');
  return { ...r.rows[0], whatsappConectado: whatsapp.configurado() };
}
async function guardarMiWhatsapp(clinicaId, actor, d) {
  if (!actor.odontologoId) throw new ApiError(404, 'Tu usuario no está vinculado a un odontólogo');
  const numero = telValido(d.numero);
  const antes = await query('SELECT whatsapp_numero FROM odontologos WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(actor.odontologoId)]);
  // Si cambia el número, deja de enviarse desde el número viejo conectado a Meta.
  await query(`UPDATE odontologos SET whatsapp_numero=$3::varchar,
      whatsapp_envia = CASE WHEN whatsapp_numero IS DISTINCT FROM $3::varchar THEN false ELSE whatsapp_envia END,
      whatsapp_phone_id = CASE WHEN whatsapp_numero IS DISTINCT FROM $3::varchar THEN NULL ELSE whatsapp_phone_id END
    WHERE clinica_id=$1 AND id=$2`, [clinicaId, Number(actor.odontologoId), numero]);
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'mi_whatsapp', modulo: 'agenda', entidadId: actor.odontologoId, detalle: { antes: antes.rows[0] && antes.rows[0].whatsapp_numero, despues: numero } });
  if (numero && (!antes.rows[0] || antes.rows[0].whatsapp_numero !== numero)) {
    await avisarRecepcion(clinicaId, { titulo: `${actor.nombre} registró su WhatsApp para recordatorios`, mensaje: `Número: ${numero}. Para que los recordatorios automáticos salgan de ese número, conectalo en Meta y cargá su "Phone number ID" en Seguimiento → Recordatorios.`, permisos: ['agenda.config', 'clinica.config.manage'], ruta: 'seguimiento' });
  }
  return miWhatsapp(clinicaId, actor);
}

/* ------------------------------------------------------------ automático */
let corriendo = false;
async function ejecutarAutomaticos({ ignorarHora = false } = {}) {
  if (corriendo || !whatsapp.configurado()) return { enviados: 0, fallidos: 0, omitido: !whatsapp.configurado() ? 'sin_whatsapp' : 'en_curso' };
  corriendo = true;
  let enviados = 0; let fallidos = 0;
  try {
    // Un solo proceso a la vez aunque haya varias instancias del servidor
    // (candado de sesión en una conexión propia: se toma y se suelta en la misma).
    const cliente = await require('../../config/db').getClient();
    const lock = await cliente.query("SELECT pg_try_advisory_lock(hashtext('dova:recordatorios')) AS ok");
    if (!lock.rows[0].ok) { cliente.release(); return { enviados, fallidos, omitido: 'en_curso' }; }
    try {
      const hora = horaLocal();
      const clinicas = await query('SELECT id, recordatorio_hora, recordatorio_dias, plan, modulos_extra, modulos_quitar FROM clinicas WHERE activa AND recordatorio_auto');
      for (const c of require('../../config/planes').conModulo(clinicas.rows, 'whatsapp_auto')) {
        if (!ignorarHora && hora < c.recordatorio_hora) continue;
        // Nunca de noche: si el servidor estuvo dormido, no se manda después de las 21 h.
        if (!ignorarHora && hora >= 21) continue;
        const fecha = sumarDias(hoyIso(), c.recordatorio_dias);
        const pend = await query(`${SELECT_TURNO} WHERE t.clinica_id=$1 AND t.fecha=$2 AND t.estado IN ('reservado','confirmado') AND t.confirmacion <> 'confirmado'
            AND NOT EXISTS (SELECT 1 FROM recordatorios_envios e WHERE e.turno_id=t.id AND e.tipo='turno') ORDER BY t.hora_inicio LIMIT 300`, [c.id, fecha]);
        let fallC = 0;
        for (const t of pend.rows) {
          if (motivoNoEnviable(t)) continue;
          try { const r = await enviarPorApi(t, { automatico: true }); if (r.ok) enviados += 1; else fallC += 1; } catch (_e) { fallC += 1; }
        }
        fallidos += fallC;
        if (fallC) await avisarRecepcion(c.id, { titulo: `${fallC} recordatorio${fallC === 1 ? '' : 's'} de turno no se pudo enviar`, mensaje: 'Revisalos en Seguimiento → Recordatorios de turnos y mandalos a mano.' });
      }
    } finally { await cliente.query("SELECT pg_advisory_unlock(hashtext('dova:recordatorios'))").catch(() => {}); cliente.release(); }
  } finally { corriendo = false; }
  return { enviados, fallidos };
}

/* ------------------------------------------------------------ webhook de Meta */
async function avisarRecepcion(clinicaId, { titulo, mensaje, turnoId, permisos = ['agenda.edit', 'agenda.view'], ruta = 'agenda' }) {
  try {
    const noti = require('../notificaciones/notificaciones.service');
    const authRepo = require('../auth/auth.repository');
    const us = await query('SELECT id, rol_id FROM usuarios WHERE clinica_id=$1 AND activo AND eliminado_en IS NULL', [clinicaId]);
    for (const u of us.rows) {
      const p = await authRepo.getPermisosEfectivos(u.id, u.rol_id);
      if (permisos.some((x) => p.includes(x))) await noti.notificar(clinicaId, u.id, { tipo: 'recordatorio', titulo: String(titulo).slice(0, 150), mensaje: String(mensaje || '').slice(0, 500), entidad: turnoId ? 'turno' : null, entidadId: turnoId || null, ruta });
    }
  } catch (e) { console.error('[recordatorios] no se pudo avisar:', e.message); }
}

const ESTADO_META = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallo' };
const ORDEN = { enviando: 0, enviado: 1, entregado: 2, leido: 3, respondido: 4, fallo: 1 };

async function procesarWebhook(cuerpo) {
  let procesados = 0;
  for (const entry of (cuerpo && Array.isArray(cuerpo.entry) ? cuerpo.entry : [])) {
    for (const ch of (Array.isArray(entry.changes) ? entry.changes : [])) {
      const v = ch && ch.value ? ch.value : {};
      for (const st of (Array.isArray(v.statuses) ? v.statuses : [])) {
        const nuevo = ESTADO_META[st.status];
        if (!nuevo || typeof st.id !== 'string') continue;
        const e = await query('SELECT id, estado FROM recordatorios_envios WHERE proveedor_id=$1', [st.id.slice(0, 120)]);
        if (!e.rowCount) {
          // ¿Es un aviso de cobro?
          const err = nuevo === 'fallo' && Array.isArray(st.errors) && st.errors[0] ? String(st.errors[0].title || st.errors[0].message || 'falló').slice(0, 300) : null;
          if (await require('../cobranza/cobranza.service').actualizarEstadoMeta(st.id.slice(0, 120), nuevo, err, ORDEN)
            || await require('../mensajes/mensajes.service').actualizarEstadoMeta(st.id.slice(0, 120), nuevo, err, ORDEN)) procesados += 1;
          continue;
        }
        // Los avisos pueden llegar desordenados: nunca se retrocede (leído no vuelve a entregado).
        if (nuevo !== 'fallo' && ORDEN[nuevo] <= ORDEN[e.rows[0].estado]) continue;
        const err = nuevo === 'fallo' && Array.isArray(st.errors) && st.errors[0] ? String(st.errors[0].title || st.errors[0].message || 'falló').slice(0, 300) : null;
        await query('UPDATE recordatorios_envios SET estado=$2, error=COALESCE($3, error), actualizado_en=now() WHERE id=$1', [e.rows[0].id, nuevo, err]);
        procesados += 1;
      }
      for (const m of (Array.isArray(v.messages) ? v.messages : [])) {
        const tel = normalizarTelefonoPy(m.from);
        const texto = String((m.text && m.text.body) || (m.button && (m.button.text || m.button.payload)) || (m.interactive && m.interactive.button_reply && m.interactive.button_reply.title) || '').trim().slice(0, 500);
        if (!tel || !texto) continue;
        // La respuesta corresponde al último recordatorio enviado a ese número (últimos 4 días).
        const e = await query(`SELECT e.id, e.turno_id, e.clinica_id, e.paciente_id, e.creado_en FROM recordatorios_envios e
            WHERE e.telefono=$1 AND e.creado_en > now() - interval '4 days' ORDER BY e.creado_en DESC LIMIT 1`, [tel]);
        // Si lo último que se le mandó fue un aviso de cobro, la respuesta es para ese aviso
        // (un "sí" no tiene que confirmar un turno por error).
        // Lo mismo con los demás mensajes (turno liberado, control, encuesta): manda el más reciente.
        const cob = require('../cobranza/cobranza.service'); const men = require('../mensajes/mensajes.service');
        const otros = [[cob, await cob.ultimoAvisoA(tel)], [men, await men.ultimoAvisoA(tel)]].filter(([, a]) => a).sort(([, a], [, b]) => new Date(b.creado_en) - new Date(a.creado_en));
        if (otros.length && (!e.rowCount || new Date(otros[0][1].creado_en) > new Date(e.rows[0].creado_en))) { await otros[0][0].registrarRespuesta(otros[0][1], texto); procesados += 1; continue; }
        if (!e.rowCount) continue;
        const env = e.rows[0];
        const t = await query(`${SELECT_TURNO} WHERE t.id=$1`, [env.turno_id]);
        if (!t.rowCount) continue;
        const turno = t.rows[0];
        const normal = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        let accion = 'otro';
        if (/^(si|sii+|confirm|ok|dale|claro|voy|asisto|de acuerdo|perfecto|listo|👍)/.test(normal)) accion = 'confirma';
        else if (/^(no\b|cancel|reprogram|cambiar|no puedo|no voy|otro dia)/.test(normal)) accion = 'reprograma';
        await query("UPDATE recordatorios_envios SET estado='respondido', respuesta=$2, actualizado_en=now() WHERE id=$1", [env.id, texto]);
        await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id)
            VALUES ($1,$2,'whatsapp','entrante','recordatorio_turno',$3,$4,'turno',$5)`, [env.clinica_id, env.paciente_id, accion === 'confirma' ? 'confirmado' : accion === 'reprograma' ? 'pide_reprogramar' : 'respondio', texto, env.turno_id]);
        const quien = `${turno.nombre} ${turno.apellido || ''}`.trim();
        if (accion === 'confirma' && ['reservado', 'confirmado'].includes(turno.estado)) {
          await query("UPDATE turnos SET confirmacion='confirmado', confirmado_en=now(), estado=CASE WHEN estado='reservado' THEN 'confirmado' ELSE estado END, actualizado_en=now() WHERE id=$1", [turno.id]);
          await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [turno.id, JSON.stringify({ confirmacion: 'confirmado por el paciente respondiendo el WhatsApp' })]);
        } else if (accion === 'reprograma') {
          await query("UPDATE turnos SET confirmacion='pide_reprogramar', actualizado_en=now() WHERE id=$1", [turno.id]);
          await avisarRecepcion(env.clinica_id, { turnoId: turno.id, titulo: `${quien} pide reprogramar su turno`, mensaje: `${nombreDia(turno.fecha)} ${turno.hora}. Respondió: «${texto.slice(0, 120)}». Llamalo para darle otro horario.` });
        } else {
          await avisarRecepcion(env.clinica_id, { turnoId: turno.id, titulo: `${quien} respondió el recordatorio`, mensaje: `«${texto.slice(0, 200)}» (turno ${nombreDia(turno.fecha)} ${turno.hora}). Contestale desde el WhatsApp de la clínica.` });
        }
        procesados += 1;
      }
    }
  }
  return { procesados };
}

module.exports = { remitentes, guardarRemitente, miWhatsapp, guardarMiWhatsapp, configuracion, guardarConfiguracion, listar, enviarAhora, enlaceManual, ejecutarAutomaticos, procesarWebhook, textoRecordatorio, hash, urlPublica };
