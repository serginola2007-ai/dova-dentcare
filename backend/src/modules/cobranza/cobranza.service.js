/* Avisos de cobro por WhatsApp.
   - Cuotas: un aviso antes del vencimiento (opcional, N días antes) y, si
     vence sin pagarse, hasta "max avisos" recordatorios separados por
     "repetir cada" días. Si el paciente ya mandó un comprobante que está en
     revisión, no se le avisa.
   - Presupuestos enviados sin respuesta: un aviso a los N días y otro una
     semana después. Nunca más que eso.
   - Cada aviso lleva un enlace privado (página "Mi pago" de la web): ve lo
     que tiene pendiente, los datos para pagar, puede mandar el comprobante y,
     en un presupuesto, avisar que quiere empezar o que tiene una consulta.
   - Con WhatsApp Business conectado salen solos a la hora elegida; sin él,
     la recepción los manda desde su WhatsApp con un toque (mensaje armado).
   - Nunca a quien no acepta WhatsApp, nunca de noche, nunca dos veces la
     misma etapa (restricción única en la base). */
const crypto = require('crypto');
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const whatsapp = require('../../utils/whatsapp');
const { normalizarTelefonoPy, enlaceWhatsapp, fmtDia } = require('../../utils/mensajes');
const { hoyIso } = require('../../utils/recurso');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const gs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
const TZ = () => process.env.DOVA_TZ || 'America/Asuncion';
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const urlPublica = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const PRESUPUESTO_SEGUNDO = 7; // el segundo aviso de un presupuesto, una semana después del primero

/* ------------------------------------------------------------ configuración */
const CFG_COLS = 'nombre, cobranza_auto, cobranza_hora, cobranza_dias_antes, cobranza_repetir_dias, cobranza_max_avisos, presupuesto_seguimiento, presupuesto_dias';
async function cfgClinica(clinicaId) {
  const c = (await query(`SELECT ${CFG_COLS} FROM clinicas WHERE id=$1`, [clinicaId])).rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  return c;
}
async function configuracion(clinicaId) {
  const c = await cfgClinica(clinicaId);
  return {
    whatsappConectado: whatsapp.configurado(),
    plantillas: { pago: whatsapp.cfg().plantillaPago, presupuesto: whatsapp.cfg().plantillaPresupuesto },
    automatico: c.cobranza_auto, hora: c.cobranza_hora, diasAntes: c.cobranza_dias_antes, repetirDias: c.cobranza_repetir_dias,
    maxAvisos: c.cobranza_max_avisos, presupuestos: c.presupuesto_seguimiento, presupuestoDias: c.presupuesto_dias,
    ejemplos: {
      cuota: textoCuota({ nombre: 'Ana', clinica: c.nombre, numero: 2, de: 6, monto: 350000, vencimiento: sumarDias(hoyIso(), -3), vencida: true, enlace: `${urlPublica()}/web/mi-pago.html#t=…` }),
      presupuesto: textoPresupuesto({ nombre: 'Ana', clinica: c.nombre, total: 2500000, enlace: `${urlPublica()}/web/mi-pago.html#t=…` }),
    },
  };
}
async function guardarConfiguracion(clinicaId, d, actor) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ApiError(400, 'Datos inválidos');
  const campos = {};
  const bool = (k, col) => { if (d[k] === undefined) return; if (typeof d[k] !== 'boolean') throw new ApiError(400, `"${k}" tiene que ser sí o no`); campos[col] = d[k]; };
  const num = (k, col, min, max, msg) => { if (d[k] === undefined) return; const n = Number(d[k]); if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, msg); campos[col] = n; };
  bool('automatico', 'cobranza_auto'); bool('presupuestos', 'presupuesto_seguimiento');
  num('hora', 'cobranza_hora', 8, 20, 'La hora de envío tiene que estar entre las 8 y las 20');
  num('diasAntes', 'cobranza_dias_antes', 0, 7, 'El aviso previo va de 0 (no avisar) a 7 días antes');
  num('repetirDias', 'cobranza_repetir_dias', 3, 30, 'Repetir cada 3 a 30 días');
  num('maxAvisos', 'cobranza_max_avisos', 1, 5, 'De 1 a 5 avisos por cuota vencida');
  num('presupuestoDias', 'presupuesto_dias', 1, 30, 'El aviso de un presupuesto va de 1 a 30 días después de enviado');
  const cols = Object.keys(campos);
  if (cols.length) {
    await query(`UPDATE clinicas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE id=$1`, [clinicaId, ...cols.map((c) => campos[c])]);
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'config_cobranza', modulo: 'finanzas', detalle: campos });
  }
  return configuracion(clinicaId);
}

/* ------------------------------------------------------------ textos */
function textoCuota({ nombre, clinica, numero, de, monto, vencimiento, vencida, enlace }) {
  const cuota = `la cuota ${numero} de ${de} por ${gs(monto)}`;
  return vencida
    ? `Hola ${nombre}, te escribimos de ${clinica}. Te recordamos que ${cuota} venció el ${fmtDia(vencimiento)}. Si ya la pagaste, no tengas en cuenta este mensaje. Acá podés ver los datos para pagar y mandarnos el comprobante: ${enlace}`
    : `Hola ${nombre}, te escribimos de ${clinica}. Te recordamos que ${cuota} vence el ${fmtDia(vencimiento)}. Acá podés ver los datos para pagar y mandarnos el comprobante: ${enlace}`;
}
function textoPresupuesto({ nombre, clinica, total, enlace }) {
  return `Hola ${nombre}, te escribimos de ${clinica}. ¿Pudiste ver el presupuesto de tu tratamiento (${gs(total)})? Acá lo podés revisar y avisarnos si querés empezar o si tenés alguna consulta: ${enlace}`;
}
// Detalle ({{3}}) para la plantilla de WhatsApp Business.
const detalleCuota = (x, vencida) => `la cuota ${x.numero} de ${x.cantidad_cuotas} por ${gs(x.monto)} ${vencida ? 'venció' : 'vence'} el ${fmtDia(x.vencimiento)}`;
const detallePresupuesto = (x) => `el presupuesto de tu tratamiento por ${gs(x.total)} está esperando tu respuesta`;

/* ------------------------------------------------------------ qué toca avisar */
const SELECT_CUOTAS = `SELECT c.id, c.numero, c.monto, c.vencimiento::text AS vencimiento, pp.cantidad_cuotas, pp.id AS plan_id,
    p.id AS paciente_id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp, cl.nombre AS clinica_nombre, pp.clinica_id,
    EXISTS (SELECT 1 FROM web_pagos w WHERE w.cuota_id=c.id AND w.estado='pendiente') AS en_revision,
    (SELECT COALESCE(json_agg(json_build_object('etapa', e.etapa, 'estado', e.estado, 'canal', e.canal, 'en', e.creado_en, 'automatico', e.automatico, 'error', e.error) ORDER BY e.etapa), '[]'::json)
       FROM cobranza_envios e WHERE e.tipo='cuota' AND e.referencia_id=c.id) AS avisos
  FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id JOIN pacientes p ON p.id=pp.paciente_id JOIN clinicas cl ON cl.id=pp.clinica_id
  WHERE pp.clinica_id=$1 AND c.estado <> 'pagada' AND pp.estado NOT IN ('cancelado','cancelada','anulado') AND p.activo`;
const SELECT_PRESUPUESTOS = `SELECT pr.id, pr.fecha::text AS fecha, pr.total, pr.vencimiento::text AS vencimiento, pr.clinica_id,
    p.id AS paciente_id, p.nombre, p.apellido, p.telefono, p.whatsapp, p.acepta_whatsapp, cl.nombre AS clinica_nombre, o.nombre AS odontologo_nombre,
    GREATEST(pr.fecha, pr.actualizado_en::date)::text AS enviado_desde,
    (SELECT COALESCE(json_agg(json_build_object('etapa', e.etapa, 'estado', e.estado, 'canal', e.canal, 'en', e.creado_en, 'automatico', e.automatico, 'error', e.error) ORDER BY e.etapa), '[]'::json)
       FROM cobranza_envios e WHERE e.tipo='presupuesto' AND e.referencia_id=pr.id) AS avisos
  FROM presupuestos pr JOIN pacientes p ON p.id=pr.paciente_id JOIN clinicas cl ON cl.id=pr.clinica_id LEFT JOIN odontologos o ON o.id=pr.odontologo_id
  WHERE pr.clinica_id=$1 AND pr.estado='enviado' AND p.activo`;

function motivoNoEnviable(x) {
  if (x.acepta_whatsapp === false) return 'El paciente no acepta mensajes de WhatsApp';
  if (!normalizarTelefonoPy(x.whatsapp || x.telefono)) return 'El paciente no tiene un celular válido cargado';
  return null;
}
const enviados = (x) => (x.avisos || []).filter((a) => a.estado !== 'fallo' && a.estado !== 'enviando');

/* Próxima etapa de una cuota hoy: 0 = aviso previo; 1..max = vencida.
   Devuelve { etapa, toca, motivo } (toca: corresponde mandarla hoy). */
function etapaCuota(x, c, hoy) {
  const env = enviados(x);
  const hechas = new Set(env.map((a) => a.etapa));
  if (x.en_revision) return { etapa: null, toca: false, motivo: 'Mandó el comprobante: está en revisión' };
  if (x.vencimiento >= hoy) {
    if (!c.cobranza_dias_antes) return { etapa: null, toca: false, motivo: 'Sin aviso previo (configuración)' };
    if (hechas.has(0)) return { etapa: null, toca: false, motivo: 'Ya se avisó que vence' };
    const falta = diasEntre(hoy, x.vencimiento);
    return { etapa: 0, toca: falta <= c.cobranza_dias_antes, motivo: falta <= c.cobranza_dias_antes ? null : `Se avisa ${c.cobranza_dias_antes} día${c.cobranza_dias_antes === 1 ? '' : 's'} antes` };
  }
  const vencidas = env.filter((a) => a.etapa >= 1).sort((a, b) => b.etapa - a.etapa);
  const n = vencidas.length ? vencidas[0].etapa : 0;
  if (n >= c.cobranza_max_avisos) return { etapa: null, toca: false, motivo: `Ya se mandaron los ${c.cobranza_max_avisos} avisos: conviene llamarlo` };
  if (vencidas.length) {
    const ult = new Date(vencidas[0].en).toISOString().slice(0, 10);
    const dias = diasEntre(ult, hoy);
    if (dias < c.cobranza_repetir_dias) return { etapa: n + 1, toca: false, motivo: `Próximo aviso en ${c.cobranza_repetir_dias - dias} día${c.cobranza_repetir_dias - dias === 1 ? '' : 's'}` };
  }
  return { etapa: n + 1, toca: true, motivo: null };
}
function etapaPresupuesto(x, c, hoy) {
  if (!c.presupuesto_seguimiento) return { etapa: null, toca: false, motivo: 'Seguimiento de presupuestos apagado' };
  const env = enviados(x);
  if (x.vencimiento && x.vencimiento < hoy) return { etapa: null, toca: false, motivo: 'El presupuesto ya venció' };
  if (env.some((a) => a.etapa === 2)) return { etapa: null, toca: false, motivo: 'Ya se mandaron los 2 avisos' };
  const dias = diasEntre(x.enviado_desde, hoy);
  if (!env.some((a) => a.etapa === 1)) return { etapa: 1, toca: dias >= c.presupuesto_dias, motivo: dias >= c.presupuesto_dias ? null : `Se avisa a los ${c.presupuesto_dias} días de enviado` };
  const ult = new Date(env.find((a) => a.etapa === 1).en).toISOString().slice(0, 10);
  const d2 = diasEntre(ult, hoy);
  return { etapa: 2, toca: d2 >= PRESUPUESTO_SEGUNDO, motivo: d2 >= PRESUPUESTO_SEGUNDO ? null : `Segundo aviso en ${PRESUPUESTO_SEGUNDO - d2} día${PRESUPUESTO_SEGUNDO - d2 === 1 ? '' : 's'}` };
}

async function listar(clinicaId, { soloHoy } = {}) {
  const c = await cfgClinica(clinicaId);
  const hoy = hoyIso();
  const hasta = sumarDias(hoy, Math.max(c.cobranza_dias_antes, 7));
  const [cuotas, press] = await Promise.all([
    query(`${SELECT_CUOTAS} AND c.vencimiento <= $2 ORDER BY c.vencimiento, p.apellido LIMIT 500`, [clinicaId, hasta]),
    query(`${SELECT_PRESUPUESTOS} ORDER BY pr.fecha LIMIT 300`, [clinicaId]),
  ]);
  const fmt = (x, e, tipo) => ({
    tipo, id: x.id, pacienteId: x.paciente_id, paciente: `${x.nombre} ${x.apellido}`, telefono: x.whatsapp || x.telefono || null,
    noEnviable: motivoNoEnviable(x), etapa: e.etapa, toca: e.toca && !motivoNoEnviable(x), motivo: e.motivo,
    avisos: (x.avisos || []).map((a) => ({ etapa: a.etapa, estado: a.estado, canal: a.canal, en: a.en, automatico: a.automatico, error: a.error })),
  });
  let lc = cuotas.rows.map((x) => ({ ...fmt(x, etapaCuota(x, c, hoy), 'cuota'), numero: x.numero, de: x.cantidad_cuotas, monto: Number(x.monto), vencimiento: x.vencimiento, diasAtraso: Math.max(0, diasEntre(x.vencimiento, hoy)), enRevision: x.en_revision }));
  let lp = press.rows.map((x) => ({ ...fmt(x, etapaPresupuesto(x, c, hoy), 'presupuesto'), fecha: x.fecha, total: Number(x.total), odontologo: x.odontologo_nombre, dias: diasEntre(x.enviado_desde, hoy) }));
  if (soloHoy) { lc = lc.filter((x) => x.toca); lp = lp.filter((x) => x.toca); }
  return { whatsappConectado: whatsapp.configurado(), automatico: c.cobranza_auto, cuotas: lc, presupuestos: lp, tocanHoy: lc.filter((x) => x.toca).length + lp.filter((x) => x.toca).length };
}

/* ------------------------------------------------------------ enlace privado */
async function crearEnlace(clinicaId, pacienteId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await query("INSERT INTO cobranza_enlaces (clinica_id, paciente_id, token_hash, expira_en) VALUES ($1,$2,$3, now() + interval '30 days')", [clinicaId, pacienteId, hash(token)]);
  return `${urlPublica()}/web/mi-pago.html#t=${token}`;
}

/* ------------------------------------------------------------ envío */
async function cargar(clinicaId, tipo, id) {
  if (!['cuota', 'presupuesto'].includes(tipo)) throw new ApiError(400, 'Tipo inválido');
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Identificador inválido');
  const r = tipo === 'cuota'
    ? await query(`${SELECT_CUOTAS} AND c.id=$2`, [clinicaId, n])
    : await query(`${SELECT_PRESUPUESTOS} AND pr.id=$2`, [clinicaId, n]);
  if (!r.rowCount) throw new ApiError(404, tipo === 'cuota' ? 'Cuota no encontrada o ya pagada' : 'Presupuesto no encontrado o ya respondido');
  return r.rows[0];
}

// Reserva la etapa (una sola vez) antes de mandar. Un fallo previo se puede reintentar.
async function reservarEnvio(x, tipo, etapa, { canal, automatico, usuarioId }) {
  const tel = normalizarTelefonoPy(x.whatsapp || x.telefono);
  const ins = await query(`INSERT INTO cobranza_envios (clinica_id, paciente_id, tipo, referencia_id, etapa, canal, telefono, automatico, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tipo, referencia_id, etapa) DO NOTHING RETURNING id`,
  [x.clinica_id, x.paciente_id, tipo, x.id, etapa, canal, tel, !!automatico, usuarioId || null]);
  if (ins.rowCount) return ins.rows[0].id;
  const up = await query(`UPDATE cobranza_envios SET estado='enviando', error=NULL, canal=$4, telefono=$5, automatico=$6, usuario_id=$7, creado_en=now(), actualizado_en=now()
      WHERE tipo=$1 AND referencia_id=$2 AND etapa=$3 AND (estado='fallo' OR (estado='enviando' AND actualizado_en < now() - interval '10 minutes')) RETURNING id`,
  [tipo, x.id, etapa, canal, tel, !!automatico, usuarioId || null]);
  return up.rowCount ? up.rows[0].id : null;
}
async function registrarComunicacion(x, tipo, contenido, usuarioId) {
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id, usuario_id)
     VALUES ($1,$2,'whatsapp','saliente','cobranza','enviado',$3,$4,$5,$6)`, [x.clinica_id, x.paciente_id, String(contenido).slice(0, 2000), tipo, x.id, usuarioId || null]);
}
function etapaDe(x, tipo, c, hoy, { manual }) {
  const e = tipo === 'cuota' ? etapaCuota(x, c, hoy) : etapaPresupuesto(x, c, hoy);
  if (e.etapa === null) throw new ApiError(409, e.motivo || 'No corresponde avisar');
  if (!e.toca) {
    if (!manual) throw new ApiError(409, e.motivo || 'Todavía no corresponde avisar');
    // A mano se puede adelantar un aviso, pero no mandar dos el mismo día.
    const hoyMs = Date.now();
    if ((x.avisos || []).some((a) => a.estado !== 'fallo' && hoyMs - new Date(a.en).getTime() < 20 * 3600 * 1000)) throw new ApiError(409, 'Ya se le mandó un aviso hoy');
  }
  return e.etapa;
}
function textoDe(x, tipo, enlace) {
  return tipo === 'cuota'
    ? textoCuota({ nombre: x.nombre, clinica: x.clinica_nombre, numero: x.numero, de: x.cantidad_cuotas, monto: x.monto, vencimiento: x.vencimiento, vencida: x.vencimiento < hoyIso(), enlace })
    : textoPresupuesto({ nombre: x.nombre, clinica: x.clinica_nombre, total: x.total, enlace });
}

async function enviarPorApi(x, tipo, { automatico = false, usuarioId = null, manual = false } = {}) {
  const motivo = motivoNoEnviable(x);
  if (motivo) throw new ApiError(409, motivo);
  if (!whatsapp.configurado()) throw new ApiError(409, 'WhatsApp Business no está conectado: mandalo desde tu WhatsApp con el botón verde.');
  const c = await cfgClinica(x.clinica_id);
  const etapa = etapaDe(x, tipo, c, hoyIso(), { manual });
  const envioId = await reservarEnvio(x, tipo, etapa, { canal: 'whatsapp_api', automatico, usuarioId });
  if (!envioId) throw new ApiError(409, 'Ese aviso ya se envió');
  const enlace = await crearEnlace(x.clinica_id, x.paciente_id);
  const tel = normalizarTelefonoPy(x.whatsapp || x.telefono);
  const detalle = tipo === 'cuota' ? detalleCuota(x, x.vencimiento < hoyIso()) : detallePresupuesto(x);
  try {
    const id = await whatsapp.enviarPlantilla(tel, [x.nombre, x.clinica_nombre, detalle, enlace], { plantilla: tipo === 'cuota' ? whatsapp.cfg().plantillaPago : whatsapp.cfg().plantillaPresupuesto });
    await query("UPDATE cobranza_envios SET estado='enviado', proveedor_id=$2, remitente='Número de la clínica', actualizado_en=now() WHERE id=$1", [envioId, id]);
    await registrarComunicacion(x, tipo, textoDe(x, tipo, '(enlace privado)'), usuarioId);
    return { ok: true, estado: 'enviado', etapa };
  } catch (e) {
    await query("UPDATE cobranza_envios SET estado='fallo', error=$2, actualizado_en=now() WHERE id=$1", [envioId, String(e.message).slice(0, 500)]);
    return { ok: false, estado: 'fallo', error: e.message };
  }
}

async function enviarAhora(clinicaId, tipo, id, actor) {
  const x = await cargar(clinicaId, tipo, id);
  const r = await enviarPorApi(x, tipo, { usuarioId: actor.id, manual: true });
  if (!r.ok) throw new ApiError(502, r.error);
  return r;
}

// A mano: arma el mensaje con su enlace y devuelve el wa.me para abrir.
async function enlaceManual(clinicaId, tipo, id, actor) {
  const x = await cargar(clinicaId, tipo, id);
  const motivo = motivoNoEnviable(x);
  if (motivo) throw new ApiError(409, motivo);
  const c = await cfgClinica(clinicaId);
  const etapa = etapaDe(x, tipo, c, hoyIso(), { manual: true });
  const enlace = await crearEnlace(clinicaId, x.paciente_id);
  const texto = textoDe(x, tipo, enlace);
  const envioId = await reservarEnvio(x, tipo, etapa, { canal: 'whatsapp_manual', usuarioId: actor.id });
  if (envioId) await query("UPDATE cobranza_envios SET estado='enviado', remitente=$2, actualizado_en=now() WHERE id=$1", [envioId, `A mano: ${actor.nombre}`.slice(0, 120)]);
  await registrarComunicacion(x, tipo, texto.replace(enlace, '(enlace privado)'), actor.id);
  return { url: enlaceWhatsapp(x.whatsapp || x.telefono, texto), etapa };
}

/* ------------------------------------------------------------ automático */
let corriendo = false;
async function ejecutarAutomaticos({ ignorarHora = false } = {}) {
  if (corriendo || !whatsapp.configurado()) return { enviados: 0, fallidos: 0, omitido: !whatsapp.configurado() ? 'sin_whatsapp' : 'en_curso' };
  corriendo = true;
  let enviadosN = 0; let fallidos = 0;
  try {
    const cliente = await require('../../config/db').getClient();
    const lock = await cliente.query("SELECT pg_try_advisory_lock(hashtext('dova:cobranza')) AS ok");
    if (!lock.rows[0].ok) { cliente.release(); return { enviados: 0, fallidos: 0, omitido: 'en_curso' }; }
    try {
      const hora = horaLocal();
      const clinicas = await query('SELECT id, cobranza_hora FROM clinicas WHERE activa AND cobranza_auto');
      for (const c of clinicas.rows) {
        // A la hora elegida y nunca de noche (si el servidor estuvo dormido, no se manda tarde).
        if (!ignorarHora && (hora < c.cobranza_hora || hora >= 20)) continue;
        const l = await listar(c.id, { soloHoy: true });
        let fallC = 0;
        for (const x of [...l.cuotas, ...l.presupuestos].slice(0, 300)) {
          try {
            const det = await cargar(c.id, x.tipo, x.id);
            const r = await enviarPorApi(det, x.tipo, { automatico: true });
            if (r.ok) enviadosN += 1; else fallC += 1;
          } catch (e) { if (e.status !== 409) fallC += 1; }
        }
        fallidos += fallC;
        if (fallC) await avisar(c.id, { titulo: `${fallC} aviso${fallC === 1 ? '' : 's'} de cobro no se pudo enviar`, mensaje: 'Revisalos en Finanzas → Avisos de cobro y mandalos a mano.' });
      }
    } finally { await cliente.query("SELECT pg_advisory_unlock(hashtext('dova:cobranza'))").catch(() => {}); cliente.release(); }
  } finally { corriendo = false; }
  return { enviados: enviadosN, fallidos };
}

// Avisos internos (campanita) a quien gestiona la cobranza.
async function avisar(clinicaId, { titulo, mensaje, entidad = null, entidadId = null }) {
  try {
    const noti = require('../notificaciones/notificaciones.service');
    const authRepo = require('../auth/auth.repository');
    const us = await query('SELECT id, rol_id FROM usuarios WHERE clinica_id=$1 AND activo AND eliminado_en IS NULL', [clinicaId]);
    for (const u of us.rows) {
      const p = await authRepo.getPermisosEfectivos(u.id, u.rol_id);
      if (p.includes('cobranza.manage')) await noti.notificar(clinicaId, u.id, { tipo: 'cobranza', titulo: String(titulo).slice(0, 150), mensaje: String(mensaje || '').slice(0, 500), entidad, entidadId, ruta: 'finanzas' });
    }
  } catch (e) { console.error('[cobranza] no se pudo avisar:', e.message); }
}

/* ------------------------------------------------------------ página "Mi pago" (pública, con el enlace) */
async function pacientePorToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new ApiError(404, 'Este enlace no es válido o ya venció');
  const r = await query(`SELECT e.id AS enlace_id, e.clinica_id, e.paciente_id, p.nombre, p.apellido, p.web_verificado
      FROM cobranza_enlaces e JOIN pacientes p ON p.id=e.paciente_id WHERE e.token_hash=$1 AND e.expira_en > now() AND p.activo`, [hash(token)]);
  if (!r.rowCount) throw new ApiError(404, 'Este enlace no es válido o ya venció. Pedile uno nuevo a la clínica.');
  return r.rows[0];
}
async function miPago(token) {
  const pt = await pacientePorToken(token);
  await query('UPDATE cobranza_enlaces SET abierto_en=COALESCE(abierto_en, now()) WHERE id=$1', [pt.enlace_id]);
  const web = require('../web/web.service');
  const cfg = await web.obtenerConfig(pt.clinica_id);
  const clin = (await query('SELECT nombre, whatsapp, telefono FROM clinicas WHERE id=$1', [pt.clinica_id])).rows[0];
  const hoy = hoyIso();
  const [cuotas, press] = await Promise.all([
    query(`SELECT c.id, c.numero, c.monto, c.vencimiento::text AS vencimiento, pp.cantidad_cuotas,
             EXISTS (SELECT 1 FROM web_pagos w WHERE w.cuota_id=c.id AND w.estado='pendiente') AS en_revision
             FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
            WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND c.estado <> 'pagada' AND pp.estado NOT IN ('cancelado','cancelada','anulado') ORDER BY c.vencimiento LIMIT 60`, [pt.clinica_id, pt.paciente_id]),
    query("SELECT id, fecha::text AS fecha, total FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado='enviado' ORDER BY fecha DESC LIMIT 10", [pt.clinica_id, pt.paciente_id]),
  ]);
  const items = press.rowCount ? (await query('SELECT presupuesto_id, descripcion, pieza, cantidad, precio_unitario FROM presupuesto_items WHERE presupuesto_id = ANY($1::int[]) ORDER BY id', [press.rows.map((p) => p.id)])).rows : [];
  return {
    nombre: pt.nombre, clinica: cfg.titulo || clin.nombre,
    whatsappClinica: normalizarTelefonoPy(cfg.whatsapp || clin.whatsapp || clin.telefono) || null,
    cuotas: cuotas.rows.map((c) => ({ id: c.id, numero: c.numero, de: c.cantidad_cuotas, monto: Number(c.monto), vencimiento: c.vencimiento, vencida: c.vencimiento < hoy, enRevision: c.en_revision })),
    presupuestos: press.rows.map((p) => ({ id: p.id, fecha: p.fecha, total: Number(p.total), items: items.filter((i) => i.presupuesto_id === p.id).map((i) => ({ descripcion: i.descripcion, pieza: i.pieza, cantidad: Number(i.cantidad), subtotal: Number(i.cantidad) * Number(i.precio_unitario) })) })),
    puedeInformar: !!cfg.pagos_activos && pt.web_verificado !== false,
    datosPago: cfg.pagos_activos ? { banco: cfg.banco, titular: cfg.titular, cuenta: cfg.numero_cuenta, documento: cfg.documento_titular, alias: cfg.alias_pago, instrucciones: cfg.instrucciones_pago, tieneQr: !!cfg.qr_mime } : null,
  };
}
async function informarPagoConEnlace(token, d, archivo) {
  const pt = await pacientePorToken(token);
  const portal = require('../web/portal.service');
  return portal.informarPago({ clinicaId: pt.clinica_id, pacienteId: pt.paciente_id, nombre: pt.nombre, apellido: pt.apellido, verificado: pt.web_verificado !== false }, d, archivo);
}
async function responderPresupuesto(token, presupuestoId, d) {
  const pt = await pacientePorToken(token);
  const respuesta = d && d.respuesta;
  if (!['quiero_empezar', 'consulta'].includes(respuesta)) throw new ApiError(400, 'Respuesta inválida');
  const pr = (await query("SELECT id, total FROM presupuestos WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND estado='enviado'", [Number(presupuestoId), pt.clinica_id, pt.paciente_id])).rows[0];
  if (!pr) throw new ApiError(404, 'Ese presupuesto ya no está esperando respuesta');
  const nota = typeof d.nota === 'string' ? d.nota.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 500) : ''; // eslint-disable-line no-control-regex
  const texto = respuesta === 'quiero_empezar' ? 'Quiere empezar el tratamiento' : 'Tiene una consulta sobre el presupuesto';
  await query("UPDATE cobranza_envios SET estado='respondido', respuesta=$3, actualizado_en=now() WHERE tipo='presupuesto' AND referencia_id=$1 AND clinica_id=$2 AND estado <> 'fallo'", [pr.id, pt.clinica_id, `${texto}${nota ? `: ${nota}` : ''}`.slice(0, 600)]);
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id)
      VALUES ($1,$2,'web','entrante','cobranza',$3,$4,'presupuesto',$5)`, [pt.clinica_id, pt.paciente_id, respuesta, `${texto}${nota ? `: ${nota}` : ''}`, pr.id]);
  await auditoria.registrar({ clinicaId: pt.clinica_id, usuarioId: null, usuarioNombre: 'Página web (enlace de pago)', accion: 'responder_presupuesto_web', modulo: 'presupuestos', entidadId: pr.id, detalle: { respuesta } });
  await avisar(pt.clinica_id, {
    titulo: `${pt.nombre} ${pt.apellido}: ${texto.toLowerCase()}`,
    mensaje: `Presupuesto de ${gs(pr.total)}.${nota ? ` Escribió: «${nota.slice(0, 200)}».` : ''} Comunicate para ${respuesta === 'quiero_empezar' ? 'darle el turno y cerrar el presupuesto' : 'responderle'}.`,
    entidad: 'presupuesto', entidadId: pr.id,
  });
  return { ok: true };
}

/* ------------------------------------------------------------ webhook (lo llama recordatorios) */
// Estado de entrega de un aviso de cobro. Devuelve true si el id era de un aviso de cobro.
async function actualizarEstadoMeta(proveedorId, nuevo, err, ORDEN) {
  const e = await query('SELECT id, estado FROM cobranza_envios WHERE proveedor_id=$1', [proveedorId]);
  if (!e.rowCount) return false;
  if (nuevo !== 'fallo' && ORDEN[nuevo] <= ORDEN[e.rows[0].estado]) return true;
  await query('UPDATE cobranza_envios SET estado=$2, error=COALESCE($3, error), actualizado_en=now() WHERE id=$1', [e.rows[0].id, nuevo, err]);
  return true;
}
// Último aviso de cobro mandado a un número (para saber a qué responde el paciente).
async function ultimoAvisoA(tel) {
  const r = await query("SELECT id, clinica_id, paciente_id, tipo, referencia_id, creado_en FROM cobranza_envios WHERE telefono=$1 AND creado_en > now() - interval '4 days' ORDER BY creado_en DESC LIMIT 1", [tel]);
  return r.rows[0] || null;
}
async function registrarRespuesta(env, texto) {
  await query("UPDATE cobranza_envios SET estado='respondido', respuesta=$2, actualizado_en=now() WHERE id=$1", [env.id, texto]);
  await query(`INSERT INTO comunicaciones (clinica_id, paciente_id, canal, direccion, motivo, resultado, contenido, referencia_tipo, referencia_id)
      VALUES ($1,$2,'whatsapp','entrante','cobranza','respondio',$3,$4,$5)`, [env.clinica_id, env.paciente_id, texto, env.tipo, env.referencia_id]);
  const p = (await query('SELECT nombre, apellido FROM pacientes WHERE id=$1', [env.paciente_id])).rows[0] || {};
  await avisar(env.clinica_id, { titulo: `${p.nombre || ''} ${p.apellido || ''} respondió el aviso de ${env.tipo === 'cuota' ? 'pago' : 'presupuesto'}`.trim(), mensaje: `«${texto.slice(0, 200)}». Contestale desde el WhatsApp de la clínica.`, entidad: env.tipo, entidadId: env.referencia_id });
}

module.exports = {
  configuracion, guardarConfiguracion, listar, enviarAhora, enlaceManual, ejecutarAutomaticos,
  miPago, informarPagoConEnlace, responderPresupuesto, actualizarEstadoMeta, ultimoAvisoA, registrarRespuesta,
  _internos: { etapaCuota, etapaPresupuesto, textoCuota, textoPresupuesto },
};
