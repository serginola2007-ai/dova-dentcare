/* Página web pública conectada a DOVA.
   Reglas de seguridad:
   - La web nunca muestra datos de pacientes: solo horarios libres y los
     datos que la propia persona cargó.
   - Lo que escribe un visitante nunca pisa una ficha existente: si la C.I.
     ya existe, el turno se asocia a ese paciente pero los datos nuevos quedan
     en la solicitud para que recepción los revise.
   - El turno se reserva bajo el mismo candado que usa la agenda, así un
     turno web y uno de recepción nunca pueden quedar en el mismo horario.
   - El enlace "mi turno" lleva un código aleatorio; en la base solo se
     guarda su huella (sha256). */
const crypto = require('crypto');
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso } = require('../../utils/recurso');
const auditoria = require('../../utils/auditoria');

const TZ = process.env.DOVA_TZ || 'America/Asuncion';
const ESTADOS_LIBRES = ['cancelado', 'no_asistio']; // estos no ocupan el horario (igual que la agenda)
const txt = (v, max) => { const s = v === undefined || v === null ? '' : String(v).trim(); return s ? s.slice(0, max) : null; };
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
function ahoraLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}
// Minutos desde "ahora" hasta una fecha/hora local (puede ser negativo).
function minutosHasta(fecha, hora) {
  const a = ahoraLocal();
  const dias = Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${a.fecha}T12:00:00Z`)) / 86400000);
  return dias * 1440 + aMin(hora) - a.minutos;
}

// La clínica que atiende la página (una instalación = una clínica).
async function clinicaPublica() {
  const id = Number(process.env.WEB_CLINICA_ID) || null;
  const r = await query(id ? 'SELECT * FROM clinicas WHERE id=$1' : 'SELECT * FROM clinicas WHERE activa IS NOT FALSE ORDER BY id LIMIT 1', id ? [id] : []);
  if (!r.rowCount) throw new ApiError(503, 'La página todavía no está configurada');
  return r.rows[0];
}

// ---------------------------------------------------------------- configuración
async function obtenerConfig(clinicaId) {
  await query(`INSERT INTO web_config (clinica_id, titulo, direccion, telefono, whatsapp, email, instagram, facebook)
               SELECT id, nombre, direccion, telefono, whatsapp, email, instagram, facebook FROM clinicas WHERE id=$1
               ON CONFLICT (clinica_id) DO NOTHING`, [clinicaId]);
  const r = await query(`SELECT w.*, u.nombre AS actualizado_por_nombre FROM web_config w LEFT JOIN usuarios u ON u.id=w.actualizado_por WHERE w.clinica_id=$1`, [clinicaId]);
  const cfg = r.rows[0];
  delete cfg.qr; // la imagen se sirve aparte
  cfg.correo_configurado = require('../../utils/correo').configurado();
  return cfg;
}

const CAMPOS_TEXTO = { titulo: 150, eslogan: 250, presentacion: 3000, direccion: 300, telefono: 60, whatsapp: 60, email: 150, instagram: 150, facebook: 150, mapaUrl: 1000,
  banco: 100, titular: 150, numeroCuenta: 60, documentoTitular: 40, aliasPago: 100, instruccionesPago: 1000 };
const snake = (k) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
function validarHorarios(h) {
  if (!h || typeof h !== 'object') throw new ApiError(400, 'Horarios inválidos');
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const rangos = Array.isArray(h[d]) ? h[d] : Array.isArray(h[String(d)]) ? h[String(d)] : [];
    out[d] = [];
    for (const r of rangos.slice(0, 4)) {
      if (!Array.isArray(r) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r[0]) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r[1])) throw new ApiError(400, 'Horario inválido: usá el formato HH:MM');
      if (aMin(r[1]) <= aMin(r[0])) throw new ApiError(400, 'En un horario, la hora de cierre tiene que ser posterior a la de apertura');
      out[d].push([r[0], r[1]]);
    }
  }
  return out;
}
async function guardarConfig(clinicaId, d, usuario) {
  await obtenerConfig(clinicaId);
  const sets = []; const params = [clinicaId];
  const set = (col, v) => { params.push(v); sets.push(`${col}=$${params.length}`); };
  for (const [k, max] of Object.entries(CAMPOS_TEXTO)) if (d[k] !== undefined) set(snake(k), txt(d[k], max));
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new ApiError(400, 'El email no es válido');
  if (d.mapaUrl && !/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/.test(d.mapaUrl)) throw new ApiError(400, 'El mapa tiene que ser un enlace "Insertar mapa" de Google Maps (empieza con https://www.google.com/maps/embed)');
  for (const k of ['reservasActivas', 'mostrarPrecios', 'cuentasActivas', 'pagosActivos']) if (d[k] !== undefined) set(snake(k), d[k] === true || d[k] === 'true');
  const NUM = { intervaloMinutos: [10, 120], diasAdelante: [1, 180], anticipacionHoras: [0, 168], cancelacionHoras: [0, 168], maxTurnosPorPersona: [1, 10] };
  for (const [k, [mn, mx]] of Object.entries(NUM)) {
    if (d[k] === undefined) continue;
    const v = Number(d[k]);
    if (!Number.isInteger(v) || v < mn || v > mx) throw new ApiError(400, `Valor fuera de rango (${mn} a ${mx})`);
    set(snake(k), v);
  }
  if (d.horarios !== undefined) { params.push(JSON.stringify(validarHorarios(d.horarios))); sets.push(`horarios=$${params.length}::jsonb`); }
  for (const [k, tabla] of [['tratamientosWeb', 'tratamientos'], ['odontologosWeb', 'odontologos']]) {
    if (d[k] === undefined) continue;
    if (d[k] === null) { set(snake(k), null); continue; }
    const ids = [...new Set((Array.isArray(d[k]) ? d[k] : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length) {
      const ok = await query(`SELECT count(*)::int n FROM ${tabla} WHERE clinica_id=$1 AND id = ANY($2::int[])`, [clinicaId, ids]);
      if (ok.rows[0].n !== ids.length) throw new ApiError(400, 'Hay elementos que no son de esta clínica');
    }
    set(snake(k), ids);
  }
  if (!sets.length) return obtenerConfig(clinicaId);
  set('actualizado_por', usuario.id);
  await query(`UPDATE web_config SET ${sets.join(', ')}, actualizado_en=now() WHERE clinica_id=$1`, params);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'configurar_pagina_web', modulo: 'web', entidadId: 'config', detalle: Object.keys(d) });
  return obtenerConfig(clinicaId);
}

// QR de pago (imagen que la clínica sube; el paciente la ve en su cuenta).
async function guardarQr(clinicaId, archivo, usuario) {
  if (!archivo) throw new ApiError(400, 'Elegí una imagen');
  const tipo = require('./portal.service').tipoArchivo(archivo.buffer);
  if (!tipo || !tipo.startsWith('image/')) throw new ApiError(400, 'El QR tiene que ser una imagen (PNG o JPG)');
  await obtenerConfig(clinicaId);
  await query('UPDATE web_config SET qr=$2, qr_mime=$3, actualizado_en=now(), actualizado_por=$4 WHERE clinica_id=$1', [clinicaId, archivo.buffer, tipo, usuario ? usuario.id : null]);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'cambiar_qr_pago', modulo: 'web', entidadId: 'config' });
  return { ok: true };
}
async function obtenerQr(clinicaId) {
  return (await query('SELECT qr, qr_mime FROM web_config WHERE clinica_id=$1 AND qr IS NOT NULL', [clinicaId])).rows[0] || null;
}

// ---------------------------------------------------------------- catálogo público
async function tratamientosPublicos(clinicaId, cfg) {
  const r = await query(`SELECT id, nombre, categoria, descripcion, precio, duracion_minutos FROM tratamientos
                          WHERE clinica_id=$1 AND activo ${cfg.tratamientos_web ? 'AND id = ANY($2::int[])' : ''} ORDER BY categoria NULLS LAST, nombre`,
  cfg.tratamientos_web ? [clinicaId, cfg.tratamientos_web] : [clinicaId]);
  return r.rows.map((t) => ({ id: t.id, nombre: t.nombre, categoria: t.categoria, descripcion: t.descripcion, duracion: t.duracion_minutos || cfg.intervalo_minutos, precio: cfg.mostrar_precios && Number(t.precio) > 0 ? Number(t.precio) : null }));
}
async function odontologosPublicos(clinicaId, cfg) {
  const r = await query(`SELECT id, nombre, especialidad, color_agenda FROM odontologos
                          WHERE clinica_id=$1 AND activo ${cfg.odontologos_web ? 'AND id = ANY($2::int[])' : ''} ORDER BY nombre`,
  cfg.odontologos_web ? [clinicaId, cfg.odontologos_web] : [clinicaId]);
  return r.rows.map((o) => ({ id: o.id, nombre: o.nombre, especialidad: o.especialidad, color: o.color_agenda }));
}

async function infoPublica() {
  const c = await clinicaPublica();
  const cfg = await obtenerConfig(c.id);
  const [tratamientos, odontologos] = await Promise.all([tratamientosPublicos(c.id, cfg), odontologosPublicos(c.id, cfg)]);
  return {
    nombre: cfg.titulo || c.nombre, eslogan: cfg.eslogan, presentacion: cfg.presentacion,
    direccion: cfg.direccion, telefono: cfg.telefono, whatsapp: cfg.whatsapp, email: cfg.email,
    instagram: cfg.instagram, facebook: cfg.facebook, mapaUrl: cfg.mapa_url,
    horarios: cfg.horarios, reservasActivas: cfg.reservas_activas,
    cuentasActivas: cfg.cuentas_activas, pagosActivos: cfg.pagos_activos, diasAdelante: cfg.dias_adelante,
    cancelacionHoras: cfg.cancelacion_horas,
    tieneLogo: (await query('SELECT 1 FROM facturacion_config WHERE clinica_id=$1 AND logo IS NOT NULL', [c.id])).rowCount > 0,
    tratamientos, odontologos,
  };
}

// ---------------------------------------------------------------- disponibilidad
/* Horarios libres entre dos fechas. Para cada odontólogo ofrecido y cada
   franja del horario de atención, arma inicios cada "intervalo" minutos y
   descarta los que chocan con un turno, con un bloqueo de agenda o que ya
   no respetan la anticipación mínima. */
async function calcularLibres(clinicaId, cfg, { desde, hasta, duracion, odontologoIds }) {
  if (!odontologoIds.length) return {};
  const [turnos, bloqueos] = await Promise.all([
    query(`SELECT odontologo_id, fecha::text AS fecha, to_char(hora_inicio,'HH24:MI') AS hora, duracion_minutos FROM turnos
            WHERE clinica_id=$1 AND fecha BETWEEN $2 AND $3 AND odontologo_id = ANY($4::int[]) AND estado <> ALL($5::text[])`,
    [clinicaId, desde, hasta, odontologoIds, ESTADOS_LIBRES]),
    query(`SELECT fecha::text AS fecha, COALESCE(fecha_hasta, fecha)::text AS fecha_hasta, odontologo_id,
                  to_char(hora_desde,'HH24:MI') AS hora_desde, to_char(hora_hasta,'HH24:MI') AS hora_hasta FROM agenda_bloqueos
            WHERE clinica_id=$1 AND fecha <= $3 AND COALESCE(fecha_hasta, fecha) >= $2 AND sillon_id IS NULL`, [clinicaId, desde, hasta]),
  ]);
  const ocupado = {};
  for (const t of turnos.rows) (ocupado[`${t.odontologo_id}|${t.fecha}`] ||= []).push([aMin(t.hora), aMin(t.hora) + t.duracion_minutos]);
  const minAnt = cfg.anticipacion_horas * 60;
  const out = {};
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const franjas = cfg.horarios[String(diaSemana(f))] || [];
    for (const [ini, fin] of franjas) {
      for (let m = aMin(ini); m + duracion <= aMin(fin); m += cfg.intervalo_minutos) {
        if (minutosHasta(f, aHora(m)) < minAnt) continue;
        for (const oid of odontologoIds) {
          const choca = (ocupado[`${oid}|${f}`] || []).some(([a, b]) => m < b && a < m + duracion);
          if (choca) continue;
          const bloq = bloqueos.rows.some((b) => f >= b.fecha && f <= b.fecha_hasta && (b.odontologo_id === null || b.odontologo_id === oid)
            && (!b.hora_desde || (m < aMin(b.hora_hasta) && aMin(b.hora_desde) < m + duracion)));
          if (bloq) continue;
          ((out[f] ||= {})[aHora(m)] ||= []).push(oid);
        }
      }
    }
  }
  return out; // { fecha: { "HH:MM": [odontologoIds libres] } }
}

async function contexto(tratamientoId, odontologoId) {
  const c = await clinicaPublica();
  const cfg = await obtenerConfig(c.id);
  if (!cfg.reservas_activas) throw new ApiError(409, 'Las reservas online están pausadas. Comunicate con la clínica por teléfono o WhatsApp.');
  const trats = await tratamientosPublicos(c.id, cfg);
  const odos = await odontologosPublicos(c.id, cfg);
  let trat = null;
  if (tratamientoId) { trat = trats.find((t) => t.id === Number(tratamientoId)); if (!trat) throw new ApiError(400, 'Ese tratamiento no se reserva online'); }
  let ids = odos.map((o) => o.id);
  if (odontologoId) { if (!ids.includes(Number(odontologoId))) throw new ApiError(400, 'Ese profesional no atiende turnos online'); ids = [Number(odontologoId)]; }
  return { clinicaId: c.id, cfg, trat, odos, ids, duracion: trat ? trat.duracion : cfg.intervalo_minutos };
}

// Días con lugar (para el calendario) y horarios de un día.
async function disponibilidad({ tratamientoId, odontologoId, fecha }) {
  const k = await contexto(tratamientoId, odontologoId);
  const hoy = hoyIso(); const ultimo = sumarDias(hoy, k.cfg.dias_adelante);
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy || fecha > ultimo) return { fecha, horarios: [] };
    const l = await calcularLibres(k.clinicaId, k.cfg, { desde: fecha, hasta: fecha, duracion: k.duracion, odontologoIds: k.ids });
    return { fecha, duracion: k.duracion, horarios: Object.keys(l[fecha] || {}).sort() };
  }
  const l = await calcularLibres(k.clinicaId, k.cfg, { desde: hoy, hasta: ultimo, duracion: k.duracion, odontologoIds: k.ids });
  return { desde: hoy, hasta: ultimo, dias: Object.fromEntries(Object.entries(l).map(([f, hs]) => [f, Object.keys(hs).length])) };
}

// ---------------------------------------------------------------- límites por IP
const ventanas = new Map();
function limitar(ip, accion, max, minutos) {
  const clave = `${accion}|${ip}`; const ahora = Date.now();
  const l = (ventanas.get(clave) || []).filter((t) => ahora - t < minutos * 60000);
  if (l.length >= max) throw new ApiError(429, 'Hiciste muchos intentos seguidos. Esperá unos minutos o comunicate con la clínica.');
  l.push(ahora); ventanas.set(clave, l);
  if (ventanas.size > 5000) ventanas.clear();
}

// ---------------------------------------------------------------- datos personales
function validarPersona(d) {
  const p = {
    nombre: txt(d.nombre, 120), apellido: txt(d.apellido, 120), ci: txt(d.ci, 30) && String(d.ci).replace(/[.\s]/g, '').slice(0, 30),
    telefono: txt(d.telefono, 60), email: txt(d.email, 150), fechaNacimiento: txt(d.fechaNacimiento, 10),
  };
  if (!p.nombre || !p.apellido) throw new ApiError(400, 'Escribí tu nombre y tu apellido');
  if (!p.ci || !/^[0-9A-Za-z-]{4,20}$/.test(p.ci)) throw new ApiError(400, 'Escribí tu número de cédula (solo números)');
  if (!p.telefono || p.telefono.replace(/\D/g, '').length < 6) throw new ApiError(400, 'Escribí un teléfono o WhatsApp para poder avisarte');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new ApiError(400, 'El email no es válido');
  if (p.fechaNacimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaNacimiento) || p.fechaNacimiento > hoyIso() || p.fechaNacimiento < '1900-01-01') throw new ApiError(400, 'La fecha de nacimiento no es válida');
  } else p.fechaNacimiento = null;
  if (d.acepta !== true && d.acepta !== 'true') throw new ApiError(400, 'Tenés que aceptar que la clínica use tus datos para darte el turno');
  return p;
}
// Busca por C.I. o crea el paciente. Nunca modifica una ficha existente.
async function pacientePorCi(clinicaId, p) {
  const ex = (await query('SELECT id, activo FROM pacientes WHERE clinica_id=$1 AND ci=$2 ORDER BY activo DESC, id LIMIT 1', [clinicaId, p.ci])).rows[0];
  if (ex) return { id: ex.id, nuevo: false };
  // web_verificado=false: hasta que recepción confirme su identidad, no puede abrir una cuenta en la web.
  const r = await query(`INSERT INTO pacientes (clinica_id, nombre, apellido, ci, fecha_nacimiento, telefono, whatsapp, email, fuente_referencia, observaciones, web_verificado)
                         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,'pagina_web','Se registró desde la página web.', false) RETURNING id`,
  [clinicaId, p.nombre, p.apellido, p.ci, p.fechaNacimiento, p.telefono, p.email]);
  return { id: r.rows[0].id, nuevo: true };
}

async function notificarRecepcion(clinicaId, datos) {
  try {
    const noti = require('../notificaciones/notificaciones.service');
    const authRepo = require('../auth/auth.repository');
    const us = await query('SELECT id, rol_id FROM usuarios WHERE clinica_id=$1 AND activo', [clinicaId]);
    for (const u of us.rows) {
      const permisos = await authRepo.getPermisosEfectivos(u.id, u.rol_id);
      if (permisos.includes('web.ver')) await noti.notificar(clinicaId, u.id, datos);
    }
  } catch (e) { console.error('[web] no se pudo notificar:', e.message); }
}
const nombreDia = (f) => new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));

// ---------------------------------------------------------------- reservar
// Ocupa el horario (con el candado de la agenda) para un paciente ya identificado.
async function ocuparHorario(k, pac, { fecha, hora, comentario, tokenHash }) {
  const hoy = hoyIso();
  // Tope de turnos web futuros por persona (evita que alguien llene la agenda).
  const futuros = await query(`SELECT count(*)::int n FROM turnos WHERE clinica_id=$1 AND paciente_id=$2 AND origen='web' AND fecha >= $3 AND estado NOT IN ('cancelado','no_asistio','atendido')`, [k.clinicaId, pac.id, hoy]);
  if (futuros.rows[0].n >= k.cfg.max_turnos_por_persona) throw new ApiError(409, 'Ya tenés turnos reservados desde la web. Para otro turno, comunicate con la clínica.');
  // Recalcular con candado por odontólogo y día (el mismo de la agenda).
  const libres = await calcularLibres(k.clinicaId, k.cfg, { desde: fecha, hasta: fecha, duracion: k.duracion, odontologoIds: k.ids });
  const candidatos = (libres[fecha] || {})[hora] || [];
  if (!candidatos.length) throw new ApiError(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.');
  // "Cualquier profesional": el que tenga menos turnos ese día.
  const carga = await query(`SELECT odontologo_id, count(*)::int n FROM turnos WHERE clinica_id=$1 AND fecha=$2 AND odontologo_id = ANY($3::int[]) AND estado <> ALL($4::text[]) GROUP BY 1`, [k.clinicaId, fecha, candidatos, ESTADOS_LIBRES]);
  const n = Object.fromEntries(carga.rows.map((r) => [r.odontologo_id, r.n]));
  const orden = [...candidatos].sort((a, b) => (n[a] || 0) - (n[b] || 0));
  for (const oid of orden) {
    const r = await conCandado([`agenda:odo:${k.clinicaId}:${oid}:${fecha}`], async () => {
      const choca = await query(`SELECT 1 FROM turnos WHERE clinica_id=$1 AND odontologo_id=$2 AND fecha=$3 AND estado <> ALL($6::text[])
                                   AND hora_inicio < ($4::time + ($5::int * interval '1 minute')) AND $4::time < (hora_inicio + (duracion_minutos * interval '1 minute')) LIMIT 1`,
      [k.clinicaId, oid, fecha, hora, k.duracion, ESTADOS_LIBRES]);
      if (choca.rowCount) return null;
      const motivo = k.trat ? k.trat.nombre : 'Consulta (reservado desde la web)';
      const t = await query(`INSERT INTO turnos (clinica_id, paciente_id, odontologo_id, fecha, hora_inicio, duracion_minutos, motivo, tratamiento_id, observaciones, origen, web_token_hash, confirmacion, primera_vez)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'web',$10,'sin_confirmar', NOT EXISTS (SELECT 1 FROM turnos x WHERE x.paciente_id=$2 AND x.estado='atendido')) RETURNING id`,
      [k.clinicaId, pac.id, oid, fecha, hora, k.duracion, motivo, k.trat ? k.trat.id : null, comentario ? `Comentario del paciente: ${comentario}` : 'Reservado desde la página web.', tokenHash]);
      await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.rows[0].id, JSON.stringify({ accion: 'reservado desde la página web' })]);
      return { turnoId: t.rows[0].id, odontologoId: oid };
    });
    if (r) return { ...r, pac };
  }
  throw new ApiError(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.');
}

async function reservar(d, ip) {
  if (d.sitio) throw new ApiError(400, 'No se pudo enviar'); // campo trampa para robots
  limitar(ip, 'reservar', 6, 30);
  const persona = validarPersona(d);
  const fecha = txt(d.fecha, 10); const hora = txt(d.hora, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora || '')) throw new ApiError(400, 'Elegí un día y un horario');
  const k = await contexto(d.tratamientoId, d.odontologoId);
  const hoy = hoyIso();
  if (fecha < hoy || fecha > sumarDias(hoy, k.cfg.dias_adelante)) throw new ApiError(400, 'Ese día no está disponible para reservar online');
  const comentario = txt(d.comentario, 500);

  const token = crypto.randomBytes(24).toString('base64url');
  const res = await conCandado([`web:ci:${k.clinicaId}:${persona.ci}`], async () => {
    const pac = await pacientePorCi(k.clinicaId, persona);
    return ocuparHorario(k, pac, { fecha, hora, comentario, tokenHash: hash(token) });
  });

  const odo = k.odos.find((o) => o.id === res.odontologoId);
  const sol = await query(`INSERT INTO web_solicitudes (clinica_id, tipo, nombre, ci, telefono, email, mensaje, datos, paciente_id, paciente_nuevo, turno_id, ip)
                           VALUES ($1,'turno',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
  [k.clinicaId, `${persona.nombre} ${persona.apellido}`, persona.ci, persona.telefono, persona.email, comentario,
    JSON.stringify({ fecha, hora, tratamiento: k.trat ? k.trat.nombre : null, odontologo: odo ? odo.nombre : null, fechaNacimiento: persona.fechaNacimiento }),
    res.pac.id, res.pac.nuevo, res.turnoId, ip]);
  await auditoria.registrar({ clinicaId: k.clinicaId, usuarioId: null, usuarioNombre: 'Página web', accion: 'reservar_turno_web', modulo: 'agenda', entidadId: res.turnoId, detalle: { pacienteNuevo: res.pac.nuevo, fecha, hora } });
  await notificarRecepcion(k.clinicaId, {
    tipo: 'turno_web', titulo: `Turno nuevo desde la web: ${persona.nombre} ${persona.apellido}`,
    mensaje: `${nombreDia(fecha)} ${hora} · ${k.trat ? k.trat.nombre : 'Consulta'}${odo ? ` · ${odo.nombre}` : ''}${res.pac.nuevo ? ' · paciente nuevo' : ''}`,
    entidad: 'web_solicitud', entidadId: sol.rows[0].id, ruta: 'web',
  });
  return { token, turno: await turnoPublico(token) };
}

// ---------------------------------------------------------------- mi turno (enlace privado)
async function turnoPorToken(token) {
  if (!token || String(token).length < 20) throw new ApiError(404, 'No encontramos ese turno');
  const r = await query(`SELECT t.id, t.clinica_id, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.duracion_minutos, t.estado, t.confirmacion, t.motivo,
                                o.nombre AS odontologo, p.nombre AS paciente_nombre
                           FROM turnos t JOIN odontologos o ON o.id=t.odontologo_id JOIN pacientes p ON p.id=t.paciente_id
                          WHERE t.web_token_hash=$1`, [hash(token)]);
  if (!r.rowCount) throw new ApiError(404, 'No encontramos ese turno');
  return r.rows[0];
}
async function turnoPublico(token) {
  const t = await turnoPorToken(token);
  const cfg = await obtenerConfig(t.clinica_id);
  const faltan = minutosHasta(t.fecha, t.hora);
  const vigente = !['cancelado', 'no_asistio', 'atendido'].includes(t.estado) && faltan > 0;
  return {
    fecha: t.fecha, fechaTexto: nombreDia(t.fecha), hora: t.hora, duracion: t.duracion_minutos, motivo: t.motivo, odontologo: t.odontologo,
    nombre: t.paciente_nombre, estado: t.estado, confirmado: t.confirmacion === 'confirmado',
    puedeCancelar: vigente && faltan >= cfg.cancelacion_horas * 60, cancelacionHoras: cfg.cancelacion_horas, vigente,
  };
}
async function accionTurno(token, accion, ip) {
  limitar(ip, 'mi-turno', 20, 10);
  const t = await turnoPorToken(token);
  const p = await turnoPublico(token);
  if (accion === 'cancelar') {
    if (!p.vigente) throw new ApiError(409, 'Este turno ya no se puede cancelar');
    if (!p.puedeCancelar) throw new ApiError(409, `Falta poco para el turno: para cancelarlo comunicate con la clínica (se puede cancelar online hasta ${p.cancelacionHoras} h antes).`);
    await query("UPDATE turnos SET estado='cancelado', actualizado_en=now() WHERE id=$1", [t.id]);
    await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.id, JSON.stringify({ estado: { antes: t.estado, despues: 'cancelado' }, por: 'el paciente desde la página web' })]);
    await auditoria.registrar({ clinicaId: t.clinica_id, usuarioId: null, usuarioNombre: 'Página web', accion: 'cancelar_turno_web', modulo: 'agenda', entidadId: t.id, detalle: { fecha: t.fecha, hora: t.hora } });
    await notificarRecepcion(t.clinica_id, { tipo: 'turno_web', titulo: `Turno cancelado desde la web: ${t.paciente_nombre}`, mensaje: `${nombreDia(t.fecha)} ${t.hora} · ${t.odontologo}. El horario quedó libre.`, entidad: 'turno', entidadId: t.id, ruta: 'agenda' });
  } else if (accion === 'confirmar') {
    if (!p.vigente) throw new ApiError(409, 'Este turno ya no está vigente');
    await query("UPDATE turnos SET confirmacion='confirmado', confirmado_en=now(), estado=CASE WHEN estado='reservado' THEN 'confirmado' ELSE estado END, actualizado_en=now() WHERE id=$1", [t.id]);
    await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.id, JSON.stringify({ confirmacion: 'confirmado por el paciente desde la página web' })]);
  } else throw new ApiError(400, 'Acción inválida');
  return turnoPublico(token);
}

// ---------------------------------------------------------------- registro y consulta
const PREGUNTAS_SALUD = ['alergias', 'medicacion', 'enfermedades', 'embarazo', 'anticoagulantes', 'corazon', 'diabetes'];
async function registrar(d, ip) {
  if (d.sitio) throw new ApiError(400, 'No se pudo enviar');
  limitar(ip, 'registro', 5, 30);
  const c = await clinicaPublica();
  const persona = validarPersona(d);
  const extra = { direccion: txt(d.direccion, 300), ciudad: txt(d.ciudad, 100), sexo: ['F', 'M', 'X'].includes(d.sexo) ? d.sexo : null, comoNosConocio: txt(d.comoNosConocio, 60), contactoEmergencia: txt(d.contactoEmergencia, 200) };
  const salud = {};
  for (const k of PREGUNTAS_SALUD) {
    const v = d.salud && d.salud[k];
    if (v && typeof v === 'object') salud[k] = { r: ['si', 'no'].includes(v.r) ? v.r : null, d: txt(v.d, 300) };
  }
  const pac = await conCandado([`web:ci:${c.id}:${persona.ci}`], () => pacientePorCi(c.id, persona));
  // Paciente nuevo: se completan los datos básicos en la ficha. Existente: queda solo en la solicitud.
  if (pac.nuevo) {
    await query(`UPDATE pacientes SET direccion=$3, ciudad=$4, sexo=$5, contacto_emergencia=$6,
                   alergias=$7, medicamentos=$8, actualizado_en=now() WHERE clinica_id=$1 AND id=$2`,
    [c.id, pac.id, extra.direccion, extra.ciudad, extra.sexo, extra.contactoEmergencia,
      salud.alergias && salud.alergias.r === 'si' ? (salud.alergias.d || 'Sí (sin detalle)') : null,
      salud.medicacion && salud.medicacion.r === 'si' ? (salud.medicacion.d || 'Sí (sin detalle)') : null]);
  }
  const sol = await query(`INSERT INTO web_solicitudes (clinica_id, tipo, nombre, ci, telefono, email, mensaje, datos, paciente_id, paciente_nuevo, ip)
                           VALUES ($1,'registro',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
  [c.id, `${persona.nombre} ${persona.apellido}`, persona.ci, persona.telefono, persona.email, txt(d.comentario, 1000),
    JSON.stringify({ ...extra, fechaNacimiento: persona.fechaNacimiento, salud }), pac.id, pac.nuevo, ip]);
  await notificarRecepcion(c.id, { tipo: 'registro_web', titulo: `${pac.nuevo ? 'Paciente nuevo' : 'Actualización de datos'} desde la web: ${persona.nombre} ${persona.apellido}`, mensaje: pac.nuevo ? 'Se creó la ficha. Revisá el cuestionario de salud.' : 'Ya era paciente: revisá los datos antes de pasarlos a la ficha.', entidad: 'web_solicitud', entidadId: sol.rows[0].id, ruta: 'web' });
  return { ok: true, nuevo: pac.nuevo };
}

async function consultar(d, ip) {
  if (d.sitio) throw new ApiError(400, 'No se pudo enviar');
  limitar(ip, 'consulta', 5, 30);
  const c = await clinicaPublica();
  const nombre = txt(d.nombre, 200); const mensaje = txt(d.mensaje, 2000); const telefono = txt(d.telefono, 60); const email = txt(d.email, 150);
  if (!nombre) throw new ApiError(400, 'Escribí tu nombre');
  if (!mensaje || mensaje.length < 5) throw new ApiError(400, 'Escribí tu consulta');
  if (!telefono && !email) throw new ApiError(400, 'Dejanos un teléfono o un email para responderte');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'El email no es válido');
  const sol = await query(`INSERT INTO web_solicitudes (clinica_id, tipo, nombre, telefono, email, mensaje, ip) VALUES ($1,'consulta',$2,$3,$4,$5,$6) RETURNING id`, [c.id, nombre, telefono, email, mensaje, ip]);
  await notificarRecepcion(c.id, { tipo: 'consulta_web', titulo: `Consulta desde la web: ${nombre}`, mensaje: mensaje.slice(0, 140), entidad: 'web_solicitud', entidadId: sol.rows[0].id, ruta: 'web' });
  return { ok: true };
}

// ---------------------------------------------------------------- panel interno
async function listarSolicitudes(clinicaId, { estado, tipo, page = 1 }) {
  const c = ['s.clinica_id=$1']; const p = [clinicaId];
  if (estado) { p.push(estado); c.push(`s.estado=$${p.length}`); }
  if (tipo) { p.push(tipo); c.push(`s.tipo=$${p.length}`); }
  const lim = 30; const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const r = await query(`SELECT s.*, u.nombre AS resuelta_por_nombre, t.fecha::text AS turno_fecha, to_char(t.hora_inicio,'HH24:MI') AS turno_hora, t.estado AS turno_estado,
                                o.nombre AS turno_odontologo, pa.nombre || ' ' || pa.apellido AS paciente_nombre, pa.web_verificado
                           FROM web_solicitudes s LEFT JOIN usuarios u ON u.id=s.resuelta_por LEFT JOIN turnos t ON t.id=s.turno_id
                           LEFT JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN pacientes pa ON pa.id=s.paciente_id
                          WHERE ${c.join(' AND ')} ORDER BY (s.estado='pendiente') DESC, s.creado_en DESC LIMIT ${lim} OFFSET ${off}`, p);
  const tot = await query(`SELECT count(*)::int n, count(*) FILTER (WHERE estado='pendiente')::int pendientes FROM web_solicitudes s WHERE s.clinica_id=$1`, [clinicaId]);
  return { items: r.rows, total: tot.rows[0].n, pendientes: tot.rows[0].pendientes };
}
async function resolverSolicitud(clinicaId, id, { estado, nota }, usuario) {
  if (!['resuelta', 'descartada', 'pendiente'].includes(estado)) throw new ApiError(400, 'Estado inválido');
  const r = await query(`UPDATE web_solicitudes SET estado=$3::text, nota_interna=COALESCE($4::text, nota_interna), resuelta_en=CASE WHEN $3::text='pendiente' THEN NULL ELSE now() END,
                           resuelta_por=CASE WHEN $3::text='pendiente' THEN NULL ELSE $5::int END WHERE clinica_id=$1 AND id=$2 RETURNING *`,
  [clinicaId, Number(id), estado, txt(nota, 1000), usuario.id]);
  if (!r.rowCount) throw new ApiError(404, 'Solicitud no encontrada');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: `solicitud_web_${estado}`, modulo: 'web', entidadId: id, detalle: { tipo: r.rows[0].tipo } });
  return r.rows[0];
}
// Pasar a la ficha los datos que mandó un paciente que ya existía (lo decide recepción).
async function aplicarAFicha(clinicaId, id, campos, usuario) {
  const s = (await query('SELECT * FROM web_solicitudes WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(id)])).rows[0];
  if (!s || !s.paciente_id) throw new ApiError(404, 'Solicitud no encontrada');
  const d = s.datos || {};
  const MAPA = { telefono: ['telefono', s.telefono], email: ['email', s.email], direccion: ['direccion', d.direccion], ciudad: ['ciudad', d.ciudad], fechaNacimiento: ['fecha_nacimiento', d.fechaNacimiento], contactoEmergencia: ['contacto_emergencia', d.contactoEmergencia] };
  const sets = []; const p = [clinicaId, s.paciente_id];
  for (const k of (Array.isArray(campos) ? campos : [])) {
    if (!MAPA[k] || !MAPA[k][1]) continue;
    p.push(MAPA[k][1]); sets.push(`${MAPA[k][0]}=$${p.length}`);
  }
  if (!sets.length) throw new ApiError(400, 'Elegí qué datos pasar a la ficha');
  await query(`UPDATE pacientes SET ${sets.join(', ')}, actualizado_en=now() WHERE clinica_id=$1 AND id=$2`, p);
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'aplicar_datos_web', modulo: 'pacientes', entidadId: s.paciente_id, detalle: { solicitud: s.id, campos } });
  return resolverSolicitud(clinicaId, id, { estado: 'resuelta', nota: `Datos pasados a la ficha: ${campos.join(', ')}` }, usuario);
}

module.exports = {
  guardarQr, obtenerQr,
  ocuparHorario, validarHorarios,
  calcularLibres, contexto, minutosHasta, nombreDia, limitar, notificarRecepcion, hash, txt, ESTADOS_LIBRES,
  infoPublica, disponibilidad, reservar, turnoPublico, accionTurno, registrar, consultar,
  obtenerConfig, guardarConfig, listarSolicitudes, resolverSolicitud, aplicarAFicha, clinicaPublica, PREGUNTAS_SALUD,
  validarPersona, pacientePorCi,
};
