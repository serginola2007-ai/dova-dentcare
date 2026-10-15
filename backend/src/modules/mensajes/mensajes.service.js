/* Mensajes automáticos por WhatsApp (además de recordatorios y cobranza):
   - Turno liberado: cuando se cancela un turno futuro, el horario se ofrece a
     la lista de espera. Lo toma el primero que acepta desde su enlace.
   - Controles periódicos: a quien le toca su control (y no tiene turno) le
     llega un enlace para reservar directo con los horarios libres reales.
   - Encuesta: al día siguiente de atenderse, "del 0 al 10". Con 9 o 10 se le
     ofrece dejar una reseña en Google; con 6 o menos, se avisa a la clínica.
   Con WhatsApp Business salen solos; sin él, la recepción los manda con un
   toque (mensaje armado). Nunca a quien no acepta WhatsApp, nunca de noche,
   nunca dos veces lo mismo (clave única en la base). */
const crypto = require('crypto');
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const whatsapp = require('../../utils/whatsapp');
const { normalizarTelefonoPy, enlaceWhatsapp } = require('../../utils/mensajes');
const { hoyIso } = require('../../utils/recurso');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TZ = () => process.env.DOVA_TZ || 'America/Asuncion';
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const urlPublica = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const nombreDia = (f) => new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${String(f).slice(0, 10)}T12:00:00Z`));
const hhmm = (h) => String(h || '').slice(0, 5);
const PLANTILLA = () => ({
  oferta: process.env.WHATSAPP_PLANTILLA_LISTA_ESPERA || 'turno_liberado',
  control: process.env.WHATSAPP_PLANTILLA_CONTROL || 'control_periodico',
  encuesta: process.env.WHATSAPP_PLANTILLA_ENCUESTA || 'encuesta_atencion',
  indicaciones: process.env.WHATSAPP_PLANTILLA_INDICACIONES || 'indicaciones_tratamiento',
});
const PAGINA = { oferta: 'tomar-turno.html', control: 'reservar.html', encuesta: 'encuesta.html', indicaciones: 'indicaciones.html' };
const DIAS_ENLACE = { oferta: 3, control: 30, encuesta: 7, indicaciones: 30 };
const MAX_OFERTAS = 5; // a cuántos de la lista de espera se ofrece cada horario
const DIAS_ENTRE_ENCUESTAS = 60;

/* ------------------------------------------------------------ configuración */
function validarResena(u) {
  if (u === null || u === undefined || u === '') return null;
  if (typeof u !== 'string' || u.length > 500 || !/^https:\/\/(g\.page\/|www\.google\.[a-z.]+\/maps|maps\.google\.[a-z.]+\/|search\.google\.com\/local\/writereview|maps\.app\.goo\.gl\/|g\.co\/kgs\/)/.test(u.trim())) {
    throw new ApiError(400, 'El enlace de reseña tiene que ser de Google (por ejemplo https://g.page/r/… o https://search.google.com/local/writereview?placeid=…)');
  }
  return u.trim();
}
async function configuracion(clinicaId) {
  const c = (await query('SELECT nombre, lista_espera_auto, controles_auto, encuesta_auto, indicaciones_auto, mensajes_hora, resena_url FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  const ej = `${urlPublica()}/web/…#t=…`;
  return {
    whatsappConectado: whatsapp.configurado(), plantillas: PLANTILLA(),
    listaEspera: c.lista_espera_auto, controles: c.controles_auto, encuesta: c.encuesta_auto, indicaciones: c.indicaciones_auto, hora: c.mensajes_hora, resenaUrl: c.resena_url,
    tratamientosConIndicaciones: Number((await query("SELECT count(*) n FROM tratamientos WHERE clinica_id=$1 AND activo AND indicaciones IS NOT NULL AND btrim(indicaciones) <> ''", [clinicaId])).rows[0].n),
    ejemplos: {
      oferta: textoOferta({ nombre: 'Ana', clinica: c.nombre, fecha: sumarDias(hoyIso(), 2), hora: '10:00', odontologo: 'Dra. Pérez', enlace: ej }),
      control: textoControl({ nombre: 'Ana', clinica: c.nombre, tipo: 'Limpieza y control', enlace: ej }),
      encuesta: textoEncuesta({ nombre: 'Ana', clinica: c.nombre, enlace: ej }),
      indicaciones: textoIndicaciones({ nombre: 'Ana', clinica: c.nombre, tratamiento: 'Extracción simple', enlace: ej }),
    },
  };
}
async function guardarConfiguracion(clinicaId, d, actor) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ApiError(400, 'Datos inválidos');
  const campos = {};
  for (const [k, col] of [['listaEspera', 'lista_espera_auto'], ['controles', 'controles_auto'], ['encuesta', 'encuesta_auto'], ['indicaciones', 'indicaciones_auto']]) {
    if (d[k] === undefined) continue;
    if (typeof d[k] !== 'boolean') throw new ApiError(400, `"${k}" tiene que ser sí o no`);
    campos[col] = d[k];
  }
  if (d.hora !== undefined) { const h = Number(d.hora); if (!Number.isInteger(h) || h < 8 || h > 20) throw new ApiError(400, 'La hora de envío tiene que estar entre las 8 y las 20'); campos.mensajes_hora = h; }
  if (d.resenaUrl !== undefined) campos.resena_url = validarResena(d.resenaUrl);
  const cols = Object.keys(campos);
  if (cols.length) {
    await query(`UPDATE clinicas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE id=$1`, [clinicaId, ...cols.map((c) => campos[c])]);
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'config_mensajes', modulo: 'seguimiento', detalle: campos });
  }
  return configuracion(clinicaId);
}

/* ------------------------------------------------------------ textos */
function textoOferta({ nombre, clinica, fecha, hora, odontologo, enlace }) {
  return `Hola ${nombre}, te escribimos de ${clinica}. Se liberó un turno el ${nombreDia(fecha)} a las ${hhmm(hora)}${odontologo ? ` con ${odontologo}` : ''}. Si lo querés, tomalo acá (es para el primero que lo confirme): ${enlace}`;
}
function textoControl({ nombre, clinica, tipo, enlace }) {
  return `Hola ${nombre}, te escribimos de ${clinica}. Ya te toca tu ${String(tipo).toLowerCase()}. Elegí el día y la hora que te queden mejor acá: ${enlace}`;
}
function textoEncuesta({ nombre, clinica, enlace }) {
  return `Hola ${nombre}, gracias por atenderte en ${clinica}. ¿Nos ayudás con una pregunta? Del 0 al 10, ¿qué tan probable es que nos recomiendes? Respondé acá: ${enlace}`;
}
function textoIndicaciones({ nombre, clinica, tratamiento, enlace, indicaciones }) {
  const base = `Hola ${nombre}, te escribimos de ${clinica}. Te dejamos los cuidados para después de tu ${String(tratamiento).toLowerCase()}`;
  // A mano (desde el WhatsApp del doctor) va el texto completo; con WhatsApp Business, el enlace.
  return indicaciones ? `${base}:\n\n${indicaciones}\n\nTambién los podés ver acá: ${enlace}` : `${base}. Leelos acá: ${enlace}`;
}
const detalle = {
  indicaciones: (x) => `te dejamos los cuidados para después de tu ${String(x.tratamiento).toLowerCase()}`,
  oferta: (x) => `se liberó un turno el ${nombreDia(x.fecha)} a las ${hhmm(x.hora)}${x.odontologo ? ` con ${x.odontologo}` : ''}`,
  control: (x) => `ya te toca tu ${String(x.tipo).toLowerCase()}`,
  encuesta: () => 'queremos saber cómo te atendimos',
};

/* ------------------------------------------------------------ enlaces */
async function crearEnlace(tipo, clinicaId, pacienteId, referenciaId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await query(`INSERT INTO avisos_enlaces (clinica_id, paciente_id, tipo, referencia_id, token_hash, expira_en) VALUES ($1,$2,$3,$4,$5, now() + ($6::int * interval '1 day'))`,
    [clinicaId, pacienteId, tipo, referenciaId, hash(token), DIAS_ENLACE[tipo]]);
  return `${urlPublica()}/web/${PAGINA[tipo]}#${tipo === 'control' ? 'c' : 't'}=${token}`;
}
async function porToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new ApiError(404, 'Este enlace no es válido o ya venció');
  const r = await query(`SELECT e.*, p.nombre, p.apellido, p.telefono, p.whatsapp, c.nombre AS clinica_nombre, c.resena_url
      FROM avisos_enlaces e JOIN pacientes p ON p.id=e.paciente_id JOIN clinicas c ON c.id=e.clinica_id
     WHERE e.token_hash=$1 AND e.expira_en > now() AND p.activo`, [hash(token)]);
  if (!r.rowCount) throw new ApiError(404, 'Este enlace no es válido o ya venció. Comunicate con la clínica.');
  return r.rows[0];
}

/* ------------------------------------------------------------ envío */
const noAcepta = (p) => p.acepta_whatsapp === false || !normalizarTelefonoPy(p.whatsapp || p.telefono);
async function reservarEnvio({ clinicaId, pacienteId, tipo, referenciaId, clave, telefono, canal, automatico, usuarioId }) {
  const ins = await query(`INSERT INTO avisos_envios (clinica_id, paciente_id, tipo, referencia_id, clave, canal, telefono, automatico, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (clave) DO NOTHING RETURNING id`,
  [clinicaId, pacienteId, tipo, referenciaId, clave, canal, telefono, !!automatico, usuarioId || null]);
  if (ins.rowCount) return ins.rows[0].id;
  // Un envío que falló se puede reintentar.
  const up = await query(`UPDATE avisos_envios SET estado='enviando', error=NULL, canal=$2, automatico=$3, usuario_id=$4, creado_en=now(), actualizado_en=now()
      WHERE clave=$1 AND (estado='fallo' OR (estado='enviando' AND actualizado_en < now() - interval '10 minutes')) RETURNING id`, [clave, canal, !!automatico, usuarioId || null]);
  return up.rowCount ? up.rows[0].id : null;
}
async function registrarComunicacion(clinicaId, pacienteId, tipo, referenciaId, contenido, usuarioId) {
  const motivo = { oferta: 'otro', control: 'recall', encuesta: 'otro', indicaciones: 'otro' }[tipo];
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
     VALUES ($1,$2,'whatsapp','saliente',$3,'enviado',$4,$5,$6,$7)`, [clinicaId, pacienteId, motivo, String(contenido).slice(0, 2000), tipo === 'control' ? 'recall' : tipo, referenciaId, usuarioId || null]);
}
/* Manda un mensaje (API o a mano). datos: { clinicaId, paciente, tipo, referenciaId, clave, textoCon(enlace), detalle } */
async function mandar(datos, { manual = false, automatico = false, usuario = null } = {}) {
  const { clinicaId, paciente, tipo, referenciaId, clave } = datos;
  if (noAcepta(paciente)) throw new ApiError(409, paciente.acepta_whatsapp === false ? 'El paciente no acepta mensajes de WhatsApp' : 'El paciente no tiene un celular válido cargado');
  if (!manual && !whatsapp.configurado()) throw new ApiError(409, 'WhatsApp Business no está conectado: mandalo desde tu WhatsApp con el botón verde.');
  const tel = normalizarTelefonoPy(paciente.whatsapp || paciente.telefono);
  const envioId = await reservarEnvio({ clinicaId, pacienteId: paciente.id, tipo, referenciaId, clave, telefono: tel, canal: manual ? 'whatsapp_manual' : 'whatsapp_api', automatico, usuarioId: usuario && usuario.id });
  if (!envioId) throw new ApiError(409, 'Ese mensaje ya se envió');
  const enlace = await crearEnlace(tipo, clinicaId, paciente.id, referenciaId);
  const texto = datos.textoCon(enlace);
  if (manual) {
    await query("UPDATE avisos_envios SET estado='enviado', actualizado_en=now() WHERE id=$1", [envioId]);
    await registrarComunicacion(clinicaId, paciente.id, tipo, referenciaId, texto.replace(enlace, '(enlace privado)'), usuario && usuario.id);
    return { ok: true, url: enlaceWhatsapp(paciente.whatsapp || paciente.telefono, texto) };
  }
  try {
    const id = await whatsapp.enviarPlantilla(tel, [paciente.nombre, datos.clinicaNombre, datos.detalle, enlace], { plantilla: PLANTILLA()[tipo] });
    await query("UPDATE avisos_envios SET estado='enviado', proveedor_id=$2, actualizado_en=now() WHERE id=$1", [envioId, id]);
    await registrarComunicacion(clinicaId, paciente.id, tipo, referenciaId, texto.replace(enlace, '(enlace privado)'), usuario && usuario.id);
    return { ok: true };
  } catch (e) {
    await query("UPDATE avisos_envios SET estado='fallo', error=$2, actualizado_en=now() WHERE id=$1", [envioId, String(e.message).slice(0, 500)]);
    return { ok: false, error: e.message };
  }
}

// Avisos internos (campanita) a quien tenga alguno de los permisos.
async function avisar(clinicaId, permisos, { titulo, mensaje, ruta = 'agenda', entidad = null, entidadId = null }) {
  try {
    const noti = require('../notificaciones/notificaciones.service');
    const authRepo = require('../auth/auth.repository');
    const us = await query('SELECT id, rol_id FROM usuarios WHERE clinica_id=$1 AND activo AND eliminado_en IS NULL', [clinicaId]);
    for (const u of us.rows) {
      const p = await authRepo.getPermisosEfectivos(u.id, u.rol_id);
      if (permisos.some((x) => p.includes(x))) await noti.notificar(clinicaId, u.id, { tipo: 'mensajes', titulo: String(titulo).slice(0, 150), mensaje: String(mensaje || '').slice(0, 500), entidad, entidadId, ruta });
    }
  } catch (e) { console.error('[mensajes] no se pudo avisar:', e.message); }
}

/* ============================================================ 1. TURNO LIBERADO */
const SELECT_OFERTA = `SELECT f.*, f.fecha::text AS fecha_txt, to_char(f.hora,'HH24:MI') AS hora_txt, o.nombre AS odontologo_nombre, c.nombre AS clinica_nombre
  FROM ofertas_turno f JOIN odontologos o ON o.id=f.odontologo_id JOIN clinicas c ON c.id=f.clinica_id`;
function minutosHasta(fecha, hora) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hoy = `${p.year}-${p.month}-${p.day}`;
  const [h, m] = hhmm(hora).split(':').map(Number);
  return Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86400000) * 1440 + h * 60 + m - (Number(p.hour) * 60 + Number(p.minute));
}
// Candidatos de la lista de espera para un horario (los que esperan a ese profesional o a cualquiera).
async function candidatos(clinicaId, odontologoId) {
  const r = await query(`SELECT le.id AS lista_espera_id, le.prioridad, p.id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp
      FROM lista_espera le JOIN pacientes p ON p.id=le.paciente_id
     WHERE le.clinica_id=$1 AND le.estado IN ('esperando','contactado') AND p.activo AND (le.odontologo_id IS NULL OR le.odontologo_id=$2)
       AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=p.id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado') AND t.origen IS NOT NULL AND t.creado_en > le.creado_en)
     ORDER BY CASE le.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'normal' THEN 2 ELSE 3 END, le.creado_en
     LIMIT 20`, [clinicaId, odontologoId]);
  return r.rows;
}

/* Se llama al cancelarse un turno (agenda, web o portal). Nunca rompe la cancelación. */
async function turnoLiberado(clinicaId, turnoId) {
  try {
    const t = (await query(`SELECT t.id, t.odontologo_id, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.duracion_minutos, t.sillon_id, t.motivo
        FROM turnos t WHERE t.id=$1 AND t.clinica_id=$2 AND t.estado='cancelado'`, [turnoId, clinicaId])).rows[0];
    if (!t) return null;
    const faltan = minutosHasta(t.fecha, t.hora);
    if (faltan < 120 || faltan > 21 * 1440) return null; // muy pronto para avisar, o muy lejos
    const cand = await candidatos(clinicaId, t.odontologo_id);
    if (!cand.length) return null;
    const ya = await query("SELECT id FROM ofertas_turno WHERE turno_origen_id=$1", [t.id]);
    if (ya.rowCount) return ya.rows[0].id;
    const f = (await query(`INSERT INTO ofertas_turno (clinica_id, odontologo_id, fecha, hora, duracion_minutos, sillon_id, motivo, turno_origen_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [clinicaId, t.odontologo_id, t.fecha, t.hora, t.duracion_minutos, t.sillon_id, t.motivo, t.id])).rows[0];
    const c = (await query('SELECT nombre, lista_espera_auto FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
    let enviados = 0;
    if (c.lista_espera_auto && whatsapp.configurado()) {
      const oferta = (await query(`${SELECT_OFERTA} WHERE f.id=$1`, [f.id])).rows[0];
      for (const p of cand.filter((x) => !noAcepta(x)).slice(0, MAX_OFERTAS)) {
        try { const r = await mandar(datosOferta(oferta, p), { automatico: true }); if (r.ok) enviados += 1; } catch (_e) { /* siguiente */ }
      }
    }
    await avisar(clinicaId, ['agenda.edit', 'lista_espera.manage'], {
      titulo: `Se liberó un turno: ${nombreDia(t.fecha)} ${t.hora}`,
      mensaje: enviados ? `Se lo ofrecimos por WhatsApp a ${enviados} paciente${enviados === 1 ? '' : 's'} de la lista de espera. El primero que lo tome queda agendado.` : `Hay ${cand.length} paciente${cand.length === 1 ? '' : 's'} en lista de espera para ofrecérselo (Agenda → Lista de espera).`,
      ruta: 'agenda',
    });
    return f.id;
  } catch (e) { console.error('[mensajes] turno liberado:', e.message); return null; }
}
function datosOferta(o, p) {
  const x = { fecha: o.fecha_txt, hora: o.hora_txt, odontologo: o.odontologo_nombre };
  return {
    clinicaId: o.clinica_id, clinicaNombre: o.clinica_nombre, paciente: p, tipo: 'oferta', referenciaId: o.id, clave: `oferta:${o.id}:${p.id}`,
    detalle: detalle.oferta(x), textoCon: (enlace) => textoOferta({ nombre: p.nombre, clinica: o.clinica_nombre, ...x, enlace }),
  };
}
async function listarOfertas(clinicaId) {
  // Las que ya pasaron se cierran solas.
  await query("UPDATE ofertas_turno SET estado='vencida', cerrada_en=now() WHERE clinica_id=$1 AND estado='abierta' AND (fecha + hora) < (now() AT TIME ZONE $2)", [clinicaId, TZ()]);
  const r = await query(`${SELECT_OFERTA} WHERE f.clinica_id=$1 AND (f.estado='abierta' OR f.cerrada_en > now() - interval '3 days') ORDER BY f.fecha, f.hora LIMIT 50`, [clinicaId]);
  const out = [];
  for (const o of r.rows) {
    const env = (await query("SELECT paciente_id, estado, canal, creado_en FROM avisos_envios WHERE tipo='oferta' AND referencia_id=$1", [o.id])).rows;
    const cand = o.estado === 'abierta' ? await candidatos(clinicaId, o.odontologo_id) : [];
    const tomo = o.paciente_id ? (await query('SELECT nombre, apellido FROM pacientes WHERE id=$1', [o.paciente_id])).rows[0] : null;
    out.push({
      id: o.id, fecha: o.fecha_txt, hora: o.hora_txt, odontologo: o.odontologo_nombre, estado: o.estado, motivo: o.motivo,
      tomadoPor: tomo ? `${tomo.nombre} ${tomo.apellido}` : null,
      candidatos: cand.map((p) => ({ pacienteId: p.id, nombre: `${p.nombre} ${p.apellido}`, prioridad: p.prioridad, noEnviable: noAcepta(p) ? (p.acepta_whatsapp === false ? 'No acepta WhatsApp' : 'Sin celular válido') : null, enviado: env.find((e) => e.paciente_id === p.id) || null })),
    });
  }
  return { whatsappConectado: whatsapp.configurado(), ofertas: out };
}
async function ofrecerManual(clinicaId, ofertaId, pacienteId, actor) {
  const o = (await query(`${SELECT_OFERTA} WHERE f.id=$1 AND f.clinica_id=$2`, [Number(ofertaId), clinicaId])).rows[0];
  if (!o) throw new ApiError(404, 'Turno liberado no encontrado');
  if (o.estado !== 'abierta') throw new ApiError(409, 'Ese turno ya no está disponible');
  const p = (await candidatos(clinicaId, o.odontologo_id)).find((x) => x.id === Number(pacienteId));
  if (!p) throw new ApiError(404, 'Ese paciente no está en la lista de espera para este turno');
  return mandar(datosOferta(o, p), { manual: true, usuario: actor });
}
async function cancelarOferta(clinicaId, ofertaId, actor) {
  const r = await query("UPDATE ofertas_turno SET estado='cancelada', cerrada_en=now() WHERE id=$1 AND clinica_id=$2 AND estado='abierta' RETURNING id", [Number(ofertaId), clinicaId]);
  if (!r.rowCount) throw new ApiError(409, 'Ese turno liberado ya no está abierto');
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'cancelar_oferta_turno', modulo: 'agenda', entidadId: ofertaId });
  return { ok: true };
}

/* ============================================================ 2. CONTROLES PERIÓDICOS */
const SELECT_CONTROL = `SELECT r.id, r.clinica_id, r.paciente_id, r.proxima_fecha::text AS proxima_fecha, r.odontologo_id, r.recall_tipo_id, rt.nombre AS tipo,
    p.id AS pid, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp, p.acepta_recordatorios, c.nombre AS clinica_nombre
  FROM paciente_recalls r JOIN recall_tipos rt ON rt.id=r.recall_tipo_id JOIN pacientes p ON p.id=r.paciente_id JOIN clinicas c ON c.id=r.clinica_id`;
const pacienteDe = (x) => ({ id: x.pid, nombre: x.nombre, apellido: x.apellido, telefono: x.telefono, whatsapp: x.whatsapp, acepta_whatsapp: x.acepta_whatsapp === false || x.acepta_recordatorios === false ? false : x.acepta_whatsapp });
function datosControl(x, etapa) {
  return {
    clinicaId: x.clinica_id, clinicaNombre: x.clinica_nombre, paciente: pacienteDe(x), tipo: 'control', referenciaId: x.id, clave: `control:${x.id}:${x.proxima_fecha}:${etapa}`,
    detalle: detalle.control(x), textoCon: (enlace) => textoControl({ nombre: x.nombre, clinica: x.clinica_nombre, tipo: x.tipo, enlace }),
  };
}
// Controles a avisar: a partir de 7 días antes de la fecha, sin turno futuro; segundo aviso 21 días después del primero.
async function controlesPendientes(clinicaId) {
  // En la consulta misma se descartan los ya avisados (si no, con muchos pendientes, los ya avisados taparían al resto).
  const r = await query(`SELECT * FROM (${SELECT_CONTROL.replace('FROM paciente_recalls r', `, e.n_avisos, e.ultimo_aviso FROM paciente_recalls r
       LEFT JOIN LATERAL (SELECT count(*)::int AS n_avisos, max(x.creado_en) AS ultimo_aviso FROM avisos_envios x
                           WHERE x.tipo='control' AND x.referencia_id=r.id AND x.clave LIKE ('control:' || r.id || ':' || r.proxima_fecha || ':%') AND x.estado <> 'fallo') e ON true`)}
     WHERE r.clinica_id=$1 AND p.activo AND (r.estado='activo' OR (r.estado='pausado' AND r.pausado_hasta IS NOT NULL AND r.pausado_hasta <= current_date))
       AND r.proxima_fecha <= current_date + 7
       AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.paciente_id=r.paciente_id AND t.fecha >= current_date AND t.estado IN ('reservado','confirmado'))) q
     WHERE q.n_avisos = 0 OR (q.n_avisos = 1 AND q.ultimo_aviso < now() - interval '21 days')
     ORDER BY q.proxima_fecha DESC LIMIT 500`, [clinicaId]);
  return r.rows.map((x) => ({ ...x, etapa: x.n_avisos + 1 }));
}
async function controlManual(clinicaId, recallId, actor) {
  const x = (await query(`${SELECT_CONTROL} WHERE r.id=$1 AND r.clinica_id=$2 AND p.activo`, [Number(recallId), clinicaId])).rows[0];
  if (!x) throw new ApiError(404, 'Control periódico no encontrado');
  const env = (await query("SELECT count(*)::int n, max(creado_en) ult FROM avisos_envios WHERE tipo='control' AND referencia_id=$1 AND clave LIKE $2 AND estado <> 'fallo'", [x.id, `control:${x.id}:${x.proxima_fecha}:%`])).rows[0];
  if (env.ult && Date.now() - new Date(env.ult).getTime() < 20 * 3600 * 1000) throw new ApiError(409, 'Ya se le mandó el enlace hoy');
  const r = await mandar(datosControl(x, env.n + 1), { manual: true, usuario: actor });
  await query('UPDATE paciente_recalls SET intentos_contacto=intentos_contacto+1, ultimo_contacto_en=now(), ultimo_contacto_resultado=$2, actualizado_en=now() WHERE id=$1', [x.id, 'mensaje_dejado']);
  return r;
}

/* ============================================================ 3. ENCUESTA */
const SELECT_ENCUESTA = `SELECT t.id, t.clinica_id, t.fecha::text AS fecha, t.odontologo_id, o.nombre AS odontologo,
    p.id AS pid, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp, c.nombre AS clinica_nombre
  FROM turnos t JOIN pacientes p ON p.id=t.paciente_id JOIN clinicas c ON c.id=t.clinica_id LEFT JOIN odontologos o ON o.id=t.odontologo_id`;
async function encuestasPendientes(clinicaId) {
  const hoy = hoyIso();
  const r = await query(`${SELECT_ENCUESTA}
     WHERE t.clinica_id=$1 AND t.estado='atendido' AND t.fecha BETWEEN $2 AND $3 AND p.activo
       AND NOT EXISTS (SELECT 1 FROM avisos_envios e WHERE e.tipo='encuesta' AND e.paciente_id=p.id AND e.creado_en > now() - ($4::int * interval '1 day'))
       AND NOT EXISTS (SELECT 1 FROM encuestas_satisfaccion s WHERE s.paciente_id=p.id AND s.creado_en > now() - ($4::int * interval '1 day'))
     ORDER BY t.fecha DESC, t.id LIMIT 300`, [clinicaId, sumarDias(hoy, -3), sumarDias(hoy, -1), DIAS_ENTRE_ENCUESTAS]);
  // Una sola por paciente (si tuvo dos turnos, la del último).
  const vistos = new Set();
  return r.rows.filter((x) => (vistos.has(x.pid) ? false : vistos.add(x.pid)));
}
function datosEncuesta(x) {
  return {
    clinicaId: x.clinica_id, clinicaNombre: x.clinica_nombre, paciente: pacienteDe(x), tipo: 'encuesta', referenciaId: x.id, clave: `encuesta:${x.id}`,
    detalle: detalle.encuesta(), textoCon: (enlace) => textoEncuesta({ nombre: x.nombre, clinica: x.clinica_nombre, enlace }),
  };
}

/* ============================================================ 4. INDICACIONES DESPUÉS DEL TRATAMIENTO */
const SELECT_INDIC = `SELECT t.id, t.clinica_id, t.fecha::text AS fecha, t.odontologo_id, o.nombre AS odontologo, tr.nombre AS tratamiento, tr.indicaciones,
    p.id AS pid, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp, c.nombre AS clinica_nombre
  FROM turnos t JOIN tratamientos tr ON tr.id=t.tratamiento_id AND tr.clinica_id=t.clinica_id
  JOIN pacientes p ON p.id=t.paciente_id JOIN clinicas c ON c.id=t.clinica_id LEFT JOIN odontologos o ON o.id=t.odontologo_id`;
function datosIndicaciones(x) {
  return {
    clinicaId: x.clinica_id, clinicaNombre: x.clinica_nombre, paciente: pacienteDe(x), tipo: 'indicaciones', referenciaId: x.id, clave: `indicaciones:${x.id}`,
    detalle: detalle.indicaciones(x), textoCon: (enlace) => textoIndicaciones({ nombre: x.nombre, clinica: x.clinica_nombre, tratamiento: x.tratamiento, enlace }),
  };
}
// Turnos atendidos hoy (o ayer, si terminó tarde) cuyo tratamiento tiene indicaciones y todavía no se mandaron.
async function indicacionesPendientes(clinicaId) {
  const hoy = hoyIso();
  const r = await query(`${SELECT_INDIC}
     WHERE t.clinica_id=$1 AND t.estado='atendido' AND t.fecha BETWEEN $2 AND $3 AND p.activo
       AND tr.indicaciones IS NOT NULL AND btrim(tr.indicaciones) <> ''
       AND NOT EXISTS (SELECT 1 FROM avisos_envios e WHERE e.tipo='indicaciones' AND e.referencia_id=t.id AND e.estado <> 'fallo')
     ORDER BY t.fecha DESC, t.id LIMIT 300`, [clinicaId, sumarDias(hoy, -1), hoy]);
  return r.rows;
}
// A mano: el texto completo para mandar desde el WhatsApp de quien atendió.
async function indicacionesManual(clinicaId, turnoId, actor) {
  const x = (await query(`${SELECT_INDIC} WHERE t.id=$1 AND t.clinica_id=$2 AND p.activo`, [Number(turnoId), clinicaId])).rows[0];
  if (!x) throw new ApiError(404, 'Turno no encontrado');
  if (!x.indicaciones || !x.indicaciones.trim()) throw new ApiError(409, `El tratamiento "${x.tratamiento}" no tiene indicaciones cargadas (Tratamientos → editar).`);
  const d = datosIndicaciones(x);
  d.clave = `indicaciones:${x.id}:manual:${Date.now()}`; // a mano se puede volver a mandar
  d.textoCon = (enlace) => textoIndicaciones({ nombre: x.nombre, clinica: x.clinica_nombre, tratamiento: x.tratamiento, enlace, indicaciones: x.indicaciones });
  return mandar(d, { manual: true, usuario: actor });
}
// Lo que se puede mandar de un turno (para mostrar el botón solo cuando corresponde).
async function indicacionesDeTurno(clinicaId, turnoId) {
  const x = (await query(`${SELECT_INDIC} WHERE t.id=$1 AND t.clinica_id=$2`, [Number(turnoId), clinicaId])).rows[0];
  if (!x) return { disponible: false };
  const env = (await query("SELECT canal, estado, creado_en FROM avisos_envios WHERE tipo='indicaciones' AND referencia_id=$1 AND estado <> 'fallo' ORDER BY creado_en DESC LIMIT 1", [x.id])).rows[0] || null;
  return { disponible: !!(x.indicaciones && x.indicaciones.trim()), tratamiento: x.tratamiento, indicaciones: x.indicaciones || null, enviado: env };
}

/* ============================================================ automático */
let corriendo = false;
async function ejecutarAutomaticos({ ignorarHora = false } = {}) {
  if (corriendo || !whatsapp.configurado()) return { enviados: 0, fallidos: 0, omitido: !whatsapp.configurado() ? 'sin_whatsapp' : 'en_curso' };
  corriendo = true;
  let enviados = 0; let fallidos = 0;
  try {
    const cliente = await require('../../config/db').getClient();
    const lock = await cliente.query("SELECT pg_try_advisory_lock(hashtext('dova:mensajes')) AS ok");
    if (!lock.rows[0].ok) { cliente.release(); return { enviados: 0, fallidos: 0, omitido: 'en_curso' }; }
    try {
      const hora = horaLocal();
      const clinicas = await query('SELECT id, mensajes_hora, controles_auto, encuesta_auto, indicaciones_auto, plan, modulos_extra, modulos_quitar FROM clinicas WHERE activa AND (controles_auto OR encuesta_auto OR indicaciones_auto)');
      for (const c of require('../../config/planes').conModulo(clinicas.rows, 'whatsapp_auto')) {
        const lote = [];
        // Las indicaciones salen enseguida de la atención (de 8 a 21), no esperan la hora de los mensajes.
        if (c.indicaciones_auto && (ignorarHora || (hora >= 8 && hora < 21))) for (const x of (await indicacionesPendientes(c.id)).slice(0, 200)) lote.push(datosIndicaciones(x));
        if (!ignorarHora && (hora < c.mensajes_hora || hora >= 20)) {
          for (const d of lote) { if (noAcepta(d.paciente)) continue; try { const r = await mandar(d, { automatico: true }); if (r.ok) enviados += 1; else fallidos += 1; } catch (e) { if (e.status !== 409) fallidos += 1; } }
          continue;
        }
        if (c.controles_auto) for (const x of (await controlesPendientes(c.id)).slice(0, 200)) lote.push(datosControl(x, x.etapa));
        if (c.encuesta_auto) for (const x of (await encuestasPendientes(c.id)).slice(0, 200)) lote.push(datosEncuesta(x));
        for (const d of lote) {
          if (noAcepta(d.paciente)) continue;
          try { const r = await mandar(d, { automatico: true }); if (r.ok) enviados += 1; else fallidos += 1; } catch (e) { if (e.status !== 409) fallidos += 1; }
        }
      }
      // Ofertas de turnos que ya pasaron: se cierran.
      await query("UPDATE ofertas_turno SET estado='vencida', cerrada_en=now() WHERE estado='abierta' AND (fecha + hora) < (now() AT TIME ZONE $1)", [TZ()]);
    } finally { await cliente.query("SELECT pg_advisory_unlock(hashtext('dova:mensajes'))").catch(() => {}); cliente.release(); }
  } finally { corriendo = false; }
  return { enviados, fallidos };
}

/* ============================================================ páginas públicas (con el enlace) */
async function infoEnlace(token) {
  const e = await porToken(token);
  if (e.tipo === 'oferta') {
    const o = (await query(`${SELECT_OFERTA} WHERE f.id=$1`, [e.referencia_id])).rows[0];
    if (!o) throw new ApiError(404, 'Este turno ya no está disponible');
    const disponible = o.estado === 'abierta' && minutosHasta(o.fecha_txt, o.hora_txt) > 0;
    return { tipo: 'oferta', nombre: e.nombre, clinica: e.clinica_nombre, fecha: o.fecha_txt, fechaTexto: nombreDia(o.fecha_txt), hora: o.hora_txt, duracion: o.duracion_minutos, odontologo: o.odontologo_nombre, disponible, tuyo: o.paciente_id === e.paciente_id };
  }
  if (e.tipo === 'control') {
    const x = (await query(`${SELECT_CONTROL} WHERE r.id=$1`, [e.referencia_id])).rows[0];
    if (!x) throw new ApiError(404, 'Este control ya no está vigente');
    // Tratamiento que corresponde al control (si se reserva online) y su profesional habitual.
    const web = require('../web/web.service');
    const cfg = await web.obtenerConfig(e.clinica_id);
    const trat = (await query('SELECT id FROM tratamientos WHERE clinica_id=$1 AND activo AND recall_tipo_id=$2 ORDER BY id LIMIT 1', [e.clinica_id, x.recall_tipo_id])).rows[0];
    const tratamientoId = trat && (!cfg.tratamientos_web || cfg.tratamientos_web.includes(trat.id)) ? trat.id : null;
    const odontologoId = x.odontologo_id && (!cfg.odontologos_web || cfg.odontologos_web.includes(x.odontologo_id)) ? x.odontologo_id : null;
    return { tipo: 'control', nombre: e.nombre, clinica: e.clinica_nombre, control: x.tipo, tratamientoId, odontologoId, reservasActivas: cfg.reservas_activas };
  }
  if (e.tipo === 'indicaciones') {
    const x = (await query(`${SELECT_INDIC} WHERE t.id=$1`, [e.referencia_id])).rows[0];
    if (!x) throw new ApiError(404, 'Estas indicaciones ya no están disponibles');
    const tel = (await query('SELECT telefono FROM clinicas WHERE id=$1', [e.clinica_id])).rows[0];
    return { tipo: 'indicaciones', nombre: e.nombre, clinica: e.clinica_nombre, tratamiento: x.tratamiento, fecha: x.fecha, odontologo: x.odontologo, indicaciones: x.indicaciones || '', telefonoClinica: tel ? tel.telefono : null };
  }
  const t = (await query(`${SELECT_ENCUESTA} WHERE t.id=$1`, [e.referencia_id])).rows[0];
  return { tipo: 'encuesta', nombre: e.nombre, clinica: e.clinica_nombre, fecha: t ? t.fecha : null, odontologo: t ? t.odontologo : null, respondida: !!e.usado_en };
}

// Tomar un turno liberado: el primero que lo confirma se lo queda.
async function tomarOferta(token) {
  const e = await porToken(token);
  if (e.tipo !== 'oferta') throw new ApiError(400, 'Este enlace no es para tomar un turno');
  const web = require('../web/web.service');
  const tokenTurno = crypto.randomBytes(24).toString('base64url');
  const o0 = (await query('SELECT odontologo_id, fecha::text AS fecha, sillon_id FROM ofertas_turno WHERE id=$1', [e.referencia_id])).rows[0];
  if (!o0) throw new ApiError(404, 'Este turno ya no está disponible');
  const claves = [`oferta:${e.referencia_id}`, `agenda:odo:${e.clinica_id}:${o0.odontologo_id}:${o0.fecha}`, `web:sillones:${e.clinica_id}:${o0.fecha}`];
  if (o0.sillon_id) claves.push(`agenda:sillon:${e.clinica_id}:${o0.sillon_id}:${o0.fecha}`);
  const res = await conCandado(claves, async () => {
    const o = (await query(`${SELECT_OFERTA} WHERE f.id=$1 FOR UPDATE OF f`, [e.referencia_id])).rows[0];
    if (o.estado !== 'abierta' || minutosHasta(o.fecha_txt, o.hora_txt) <= 0) throw new ApiError(409, o.estado === 'tomada' ? 'Lo siento, otra persona ya tomó este turno. Te avisamos cuando se libere otro.' : 'Este turno ya no está disponible');
    const choca = await query(`SELECT 1 FROM turnos WHERE clinica_id=$1 AND odontologo_id=$2 AND fecha=$3 AND estado <> ALL($6::text[])
        AND hora_inicio < ($4::time + ($5::int * interval '1 minute')) AND $4::time < (hora_inicio + (duracion_minutos * interval '1 minute')) LIMIT 1`,
    [e.clinica_id, o.odontologo_id, o.fecha_txt, o.hora_txt, o.duracion_minutos, web.ESTADOS_LIBRES]);
    if (choca.rowCount) {
      await query("UPDATE ofertas_turno SET estado='cancelada', cerrada_en=now() WHERE id=$1", [o.id]);
      throw new ApiError(409, 'Lo siento, ese horario ya se ocupó. Te avisamos cuando se libere otro.');
    }
    const t = (await query(`INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, motivo, sillon_id, observaciones, origen, web_token_hash, estado, confirmacion, confirmado_en)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Tomó un turno liberado desde la lista de espera.','web',$9,'confirmado','confirmado', now()) RETURNING id`,
    [e.clinica_id, e.paciente_id, o.odontologo_id, o.fecha_txt, o.hora_txt, o.duracion_minutos, o.motivo || 'Consulta', o.sillon_id, hash(tokenTurno)])).rows[0];
    await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.id, JSON.stringify({ accion: 'tomó un turno liberado (lista de espera)' })]);
    const le = (await query("UPDATE lista_espera SET estado='asignado' WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('esperando','contactado') RETURNING id", [e.clinica_id, e.paciente_id])).rows[0];
    await query("UPDATE ofertas_turno SET estado='tomada', paciente_id=$2, turno_nuevo_id=$3, lista_espera_id=$4, cerrada_en=now() WHERE id=$1", [o.id, e.paciente_id, t.id, le ? le.id : null]);
    await query("UPDATE avisos_envios SET estado='respondido', respuesta='Tomó el turno', actualizado_en=now() WHERE tipo='oferta' AND referencia_id=$1 AND paciente_id=$2", [o.id, e.paciente_id]);
    await query('UPDATE avisos_enlaces SET usado_en=now() WHERE id=$1', [e.id]);
    return { turnoId: t.id, o };
  });
  await auditoria.registrar({ clinicaId: e.clinica_id, usuarioId: null, usuarioNombre: 'Página web (turno liberado)', accion: 'tomar_turno_liberado', modulo: 'agenda', entidadId: res.turnoId, detalle: { ofertaId: e.referencia_id } });
  await avisar(e.clinica_id, ['agenda.edit', 'lista_espera.manage'], { titulo: `${e.nombre} ${e.apellido} tomó el turno liberado`, mensaje: `${nombreDia(res.o.fecha_txt)} ${res.o.hora_txt} con ${res.o.odontologo_nombre}. Ya está en la agenda, confirmado.`, entidad: 'turno', entidadId: res.turnoId });
  return { token: tokenTurno };
}

// Reservar el control desde su enlace (sin cargar datos: el enlace identifica al paciente).
async function reservarControl(token, d) {
  const e = await porToken(token);
  if (e.tipo !== 'control') throw new ApiError(400, 'Este enlace no es para reservar un control');
  const web = require('../web/web.service');
  const fecha = typeof d.fecha === 'string' ? d.fecha : ''; const hora = typeof d.hora === 'string' ? d.hora : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new ApiError(400, 'Elegí un día y un horario');
  const k = await web.contexto(d.tratamientoId || null, d.odontologoId || null);
  if (k.clinicaId !== e.clinica_id) throw new ApiError(400, 'Este enlace no es de esta clínica');
  const tokenTurno = crypto.randomBytes(24).toString('base64url');
  const r = await web.ocuparHorario(k, { id: e.paciente_id, nuevo: false }, { fecha, hora, comentario: 'Reservó su control periódico desde el enlace de WhatsApp.', tokenHash: hash(tokenTurno) });
  await query('UPDATE paciente_recalls SET turno_id=$2, ultimo_contacto_resultado=$3, actualizado_en=now() WHERE id=$1', [e.referencia_id, r.turnoId, 'agendado']);
  await query("UPDATE avisos_envios SET estado='respondido', respuesta='Reservó su turno', actualizado_en=now() WHERE tipo='control' AND referencia_id=$1", [e.referencia_id]);
  await auditoria.registrar({ clinicaId: e.clinica_id, usuarioId: null, usuarioNombre: 'Página web (control)', accion: 'reservar_control_web', modulo: 'agenda', entidadId: r.turnoId, detalle: { recallId: e.referencia_id, fecha, hora } });
  await avisar(e.clinica_id, ['agenda.edit', 'web.ver'], { titulo: `${e.nombre} ${e.apellido} reservó su control`, mensaje: `${nombreDia(fecha)} ${hora}. Lo hizo desde el enlace del mensaje.`, entidad: 'turno', entidadId: r.turnoId });
  return { token: tokenTurno };
}

async function responderEncuesta(token, d) {
  const e = await porToken(token);
  if (e.tipo !== 'encuesta') throw new ApiError(400, 'Este enlace no es de una encuesta');
  if (e.usado_en) throw new ApiError(409, 'Ya respondiste esta encuesta. ¡Gracias!');
  const nps = Number(d.nps);
  if (!Number.isInteger(nps) || nps < 0 || nps > 10) throw new ApiError(400, 'Elegí un número del 0 al 10');
  const comentario = typeof d.comentario === 'string' ? d.comentario.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 1000) : null; // eslint-disable-line no-control-regex
  const t = (await query('SELECT id, odontologo_id FROM turnos WHERE id=$1', [e.referencia_id])).rows[0];
  const u = await query('UPDATE avisos_enlaces SET usado_en=now() WHERE id=$1 AND usado_en IS NULL RETURNING id', [e.id]);
  if (!u.rowCount) throw new ApiError(409, 'Ya respondiste esta encuesta. ¡Gracias!');
  await query(`INSERT INTO encuestas_satisfaccion (clinica_id, paciente_id, turno_id, odontologo_id, fecha, nps, comentario, canal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'web')`, [e.clinica_id, e.paciente_id, t ? t.id : null, t ? t.odontologo_id : null, hoyIso(), nps, comentario || null]);
  await query("UPDATE avisos_envios SET estado='respondido', respuesta=$2, actualizado_en=now() WHERE tipo='encuesta' AND referencia_id=$1", [e.referencia_id, `Puntaje ${nps}`]);
  if (nps <= 6) {
    await avisar(e.clinica_id, ['seguimiento.manage', 'seguimiento.view'], {
      titulo: `${e.nombre} ${e.apellido} puso ${nps}/10 en la encuesta`, ruta: 'seguimiento',
      mensaje: `${comentario ? `Escribió: «${comentario.slice(0, 200)}». ` : ''}Conviene llamarlo hoy para saber qué pasó.`, entidad: 'paciente', entidadId: e.paciente_id,
    });
  }
  return { ok: true, resenaUrl: nps >= 9 && e.resena_url ? e.resena_url : null };
}

/* ============================================================ webhook (lo llama recordatorios) */
async function actualizarEstadoMeta(proveedorId, nuevo, err, ORDEN) {
  const e = await query('SELECT id, estado FROM avisos_envios WHERE proveedor_id=$1', [proveedorId]);
  if (!e.rowCount) return false;
  if (nuevo !== 'fallo' && ORDEN[nuevo] <= ORDEN[e.rows[0].estado]) return true;
  await query('UPDATE avisos_envios SET estado=$2, error=COALESCE($3, error), actualizado_en=now() WHERE id=$1', [e.rows[0].id, nuevo, err]);
  return true;
}
async function ultimoAvisoA(tel) {
  const r = await query("SELECT id, clinica_id, paciente_id, tipo, referencia_id, creado_en FROM avisos_envios WHERE telefono=$1 AND creado_en > now() - interval '4 days' ORDER BY creado_en DESC LIMIT 1", [tel]);
  return r.rows[0] || null;
}
async function registrarRespuesta(env, texto) {
  await query("UPDATE avisos_envios SET estado='respondido', respuesta=$2, actualizado_en=now() WHERE id=$1", [env.id, texto]);
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id)
      VALUES ($1,$2,'whatsapp','entrante',$3,'respondio',$4,$5,$6)`, [env.clinica_id, env.paciente_id, env.tipo === 'control' ? 'recall' : 'otro', texto, env.tipo === 'control' ? 'recall' : env.tipo, env.referencia_id]);
  const p = (await query('SELECT nombre, apellido FROM pacientes WHERE id=$1', [env.paciente_id])).rows[0] || {};
  const que = { oferta: 'el turno liberado', control: 'el aviso de su control', encuesta: 'la encuesta', indicaciones: 'las indicaciones' }[env.tipo];
  await avisar(env.clinica_id, ['agenda.edit', 'seguimiento.manage'], { titulo: `${p.nombre || ''} ${p.apellido || ''} respondió ${que}`.trim(), mensaje: `«${texto.slice(0, 200)}». Contestale desde el WhatsApp de la clínica.`, entidad: 'paciente', entidadId: env.paciente_id });
}

module.exports = {
  configuracion, guardarConfiguracion, turnoLiberado, listarOfertas, ofrecerManual, cancelarOferta, controlManual,
  controlesPendientes, encuestasPendientes, indicacionesPendientes, indicacionesManual, indicacionesDeTurno, ejecutarAutomaticos,
  infoEnlace, tomarOferta, reservarControl, responderEncuesta, actualizarEstadoMeta, ultimoAvisoA, registrarRespuesta,
};
