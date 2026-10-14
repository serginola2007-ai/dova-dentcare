/* Resumen del día al dueño.
   A la hora elegida (de 12 a 23, por defecto 20 h) manda por correo y/o
   WhatsApp lo que pasó en el día: cobrado (por método), facturado, pacientes
   atendidos, quién faltó, cancelaciones, pacientes nuevos, presupuestos
   aceptados, egresos y estado de la caja, y cuántos turnos hay mañana.
   Un resumen por clínica y día (tabla resumenes_diarios): nunca se repite. */
const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const auditoria = require('../../utils/auditoria');
const whatsapp = require('../../utils/whatsapp');
const correo = require('../../utils/correo');
const { normalizarTelefonoPy, enlaceWhatsapp } = require('../../utils/mensajes');
const { hoyIso } = require('../../utils/recurso');
const informes = require('../reportes/informes');

const TZ = () => process.env.DOVA_TZ || 'America/Asuncion';
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const PLANTILLA = () => process.env.WHATSAPP_PLANTILLA_RESUMEN || 'resumen_diario';
const gs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fechaLarga = (iso) => { const t = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)); return t.charAt(0).toUpperCase() + t.slice(1); };
const EMAIL = /^[^\s@<>"',;]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;
const esc = correo.esc;

/* ------------------------------------------------------------ configuración */
async function configuracion(clinicaId) {
  const c = (await query('SELECT resumen_activo, resumen_hora, resumen_correos, resumen_whatsapp FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  if (!c) throw new ApiError(404, 'Clínica no encontrada');
  const ult = (await query('SELECT fecha::text AS fecha, estado, canales, error, creado_en FROM resumenes_diarios WHERE clinica_id=$1 ORDER BY fecha DESC LIMIT 1', [clinicaId])).rows[0] || null;
  return {
    activo: c.resumen_activo, hora: c.resumen_hora, correos: c.resumen_correos || [], whatsapp: c.resumen_whatsapp || '',
    correoConfigurado: correo.configurado(), whatsappConectado: whatsapp.configurado(), plantilla: PLANTILLA(), ultimo: ult,
  };
}
async function guardarConfiguracion(clinicaId, d, actor) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ApiError(400, 'Datos inválidos');
  const campos = {};
  if (d.activo !== undefined) { if (typeof d.activo !== 'boolean') throw new ApiError(400, '"activo" tiene que ser sí o no'); campos.resumen_activo = d.activo; }
  if (d.hora !== undefined) { const h = Number(d.hora); if (!Number.isInteger(h) || h < 12 || h > 23) throw new ApiError(400, 'La hora tiene que estar entre las 12 y las 23'); campos.resumen_hora = h; }
  if (d.correos !== undefined) {
    if (!Array.isArray(d.correos) || d.correos.length > 3) throw new ApiError(400, 'Hasta 3 correos');
    const lista = [...new Set(d.correos.map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : '')).filter(Boolean))];
    for (const e of lista) if (e.length > 200 || !EMAIL.test(e)) throw new ApiError(400, `Correo inválido: ${e.slice(0, 60)}`);
    campos.resumen_correos = lista;
  }
  if (d.whatsapp !== undefined) {
    if (d.whatsapp === null || d.whatsapp === '') campos.resumen_whatsapp = null;
    else { const n = typeof d.whatsapp === 'string' ? normalizarTelefonoPy(d.whatsapp) : null; if (!n) throw new ApiError(400, 'El celular no es válido (ej.: 0981 123 456)'); campos.resumen_whatsapp = n; }
  }
  const actual = (await query('SELECT resumen_activo, resumen_correos, resumen_whatsapp FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  const activo = campos.resumen_activo !== undefined ? campos.resumen_activo : actual.resumen_activo;
  const correos = campos.resumen_correos !== undefined ? campos.resumen_correos : actual.resumen_correos;
  const wa = campos.resumen_whatsapp !== undefined ? campos.resumen_whatsapp : actual.resumen_whatsapp;
  if (activo && !(correos || []).length && !wa) throw new ApiError(400, 'Para activarlo cargá al menos un correo o un celular.');
  const cols = Object.keys(campos);
  if (cols.length) {
    await query(`UPDATE clinicas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, actualizado_en=now() WHERE id=$1`, [clinicaId, ...cols.map((c) => campos[c])]);
    await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'config_resumen_diario', modulo: 'clinica', detalle: campos });
  }
  return configuracion(clinicaId);
}

/* ------------------------------------------------------------ contenido */
async function datos(clinicaId, fechaTxt) {
  const fecha = fechaTxt || hoyIso();
  const r = await informes.periodo(clinicaId, 'dia', fecha);
  const [clin, faltaron, caja, manana] = await Promise.all([
    query('SELECT nombre FROM clinicas WHERE id=$1', [clinicaId]),
    query(`SELECT p.nombre, p.apellido FROM turnos t JOIN pacientes p ON p.id=t.paciente_id WHERE t.clinica_id=$1 AND t.fecha=$2 AND t.estado='no_asistio' ORDER BY t.hora_inicio LIMIT 6`, [clinicaId, fecha]),
    query("SELECT estado FROM caja_aperturas WHERE clinica_id=$1 ORDER BY id DESC LIMIT 1", [clinicaId]),
    query("SELECT count(*)::int n FROM turnos WHERE clinica_id=$1 AND fecha=$2 AND estado IN ('reservado','confirmado')", [clinicaId, sumarDias(fecha, 1)]),
  ]);
  return {
    clinica: (clin.rows[0] || {}).nombre || 'la clínica', fecha, fechaTexto: fechaLarga(fecha),
    ...r.actual, metodos: r.metodos,
    faltaron: faltaron.rows.map((x) => `${x.nombre} ${String(x.apellido || '').charAt(0)}.`.trim()),
    cajaAbierta: !!(caja.rows[0] && caja.rows[0].estado === 'abierta'), turnosManana: manana.rows[0].n,
  };
}
function lineas(d) {
  const l = [];
  l.push(`Cobrado: ${gs(d.cobrado)}${d.cobros ? ` (${d.cobros} cobro${d.cobros === 1 ? '' : 's'}${d.metodos.length ? `: ${d.metodos.map((m) => `${m.metodo.toLowerCase()} ${gs(m.total)}`).join(', ')}` : ''})` : ''}`);
  if (d.facturado) l.push(`Facturado: ${gs(d.facturado)} (${d.facturas} comprobante${d.facturas === 1 ? '' : 's'})`);
  l.push(`Atendidos: ${d.atendidos} de ${d.turnos} turno${d.turnos === 1 ? '' : 's'}`);
  if (d.ausencias) l.push(`Faltaron: ${d.ausencias}${d.faltaron.length ? ` (${d.faltaron.join(', ')}${d.ausencias > d.faltaron.length ? '…' : ''})` : ''}`);
  if (d.cancelados) l.push(`Cancelaron: ${d.cancelados}`);
  l.push(`Pacientes nuevos: ${d.pacientesNuevos}`);
  if (d.aceptados) l.push(`Presupuestos aceptados: ${d.aceptados} por ${gs(d.aceptado)}`);
  if (d.egresos) l.push(`Egresos de caja: ${gs(d.egresos)}`);
  l.push(d.cajaAbierta ? 'La caja sigue abierta' : 'Caja cerrada');
  l.push(`Mañana: ${d.turnosManana} turno${d.turnosManana === 1 ? '' : 's'}`);
  return l;
}
function texto(d) {
  return `Resumen del día de ${d.clinica}\n${d.fechaTexto}\n\n${lineas(d).map((x) => `• ${x}`).join('\n')}\n\nEnviado por DOVA.`;
}
function htmlCorreo(d) {
  return `<div style="background:#F7EEE1;padding:24px;font-family:Arial,sans-serif;color:#2B241E">
    <div style="max-width:520px;margin:0 auto;background:#FBF6EE;border-radius:12px;padding:26px">
      <p style="margin:0 0 4px;color:#8F4F32">${esc(d.clinica)}</p>
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 4px">Resumen del día</h1>
      <p style="margin:0 0 16px;color:#5B5148">${esc(d.fechaTexto)}</p>
      <p style="font-size:26px;margin:0 0 14px"><strong>${esc(gs(d.cobrado))}</strong> <span style="font-size:14px;color:#5B5148">cobrado</span></p>
      <ul style="padding-left:18px;margin:0;line-height:1.7">${lineas(d).slice(1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p style="margin-top:22px;font-size:12px;color:#5B5148">Enviado por DOVA. Lo podés apagar o cambiar en Configuración → Resumen del día.</p>
    </div></div>`;
}
// Variables de la plantilla de WhatsApp (sin saltos de línea: Meta no los acepta).
function valoresPlantilla(d) {
  return [d.clinica, d.fechaTexto, gs(d.cobrado), `${d.atendidos} de ${d.turnos}`, String(d.ausencias), String(d.pacientesNuevos), d.aceptados ? `${d.aceptados} por ${gs(d.aceptado)}` : 'ninguno', String(d.turnosManana)];
}

async function vistaPrevia(clinicaId, fecha) {
  if (fecha !== undefined && fecha !== '' && (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) throw new ApiError(400, 'Fecha inválida');
  const d = await datos(clinicaId, fecha || undefined);
  return { ...d, texto: texto(d) };
}

/* ------------------------------------------------------------ envío */
async function mandarA(clinicaId, d, cfg) {
  const canales = []; const errores = [];
  if ((cfg.resumen_correos || []).length) {
    if (!correo.configurado()) errores.push('correo: el envío de correos no está configurado');
    else {
      for (const para of cfg.resumen_correos) {
        try { await correo.enviar({ para, asunto: `Resumen del día · ${d.clinica} · ${d.fechaTexto}`, texto: texto(d), htmlCuerpo: htmlCorreo(d) }); canales.push(`correo:${para}`); } catch (e) { errores.push(`correo ${para}: ${String(e.message).slice(0, 150)}`); }
      }
    }
  }
  if (cfg.resumen_whatsapp) {
    if (!whatsapp.configurado()) errores.push('whatsapp: WhatsApp Business no está conectado');
    else {
      try { await whatsapp.enviarPlantilla(cfg.resumen_whatsapp, valoresPlantilla(d), { plantilla: PLANTILLA() }); canales.push('whatsapp'); } catch (e) { errores.push(`whatsapp: ${String(e.message).slice(0, 200)}`); }
    }
  }
  return { canales, errores };
}

// "Mandar ahora" desde Configuración (vuelve a mandar el de hoy aunque ya haya salido).
async function enviarAhora(clinicaId, actor) {
  const cfg = (await query('SELECT resumen_correos, resumen_whatsapp FROM clinicas WHERE id=$1', [clinicaId])).rows[0];
  if (!(cfg.resumen_correos || []).length && !cfg.resumen_whatsapp) throw new ApiError(400, 'Cargá al menos un correo o un celular.');
  const d = await datos(clinicaId);
  const r = await mandarA(clinicaId, d, cfg);
  await query(`INSERT INTO resumenes_diarios (clinica_id, fecha, estado, canales, error, automatico, usuario_id) VALUES ($1,$2,$3,$4,$5,false,$6)
      ON CONFLICT (clinica_id, fecha) DO UPDATE SET estado=EXCLUDED.estado, canales=EXCLUDED.canales, error=EXCLUDED.error, automatico=false, usuario_id=EXCLUDED.usuario_id, actualizado_en=now()`,
  [clinicaId, d.fecha, r.canales.length ? 'enviado' : 'fallo', r.canales.join(', ') || null, r.errores.join(' · ') || null, actor.id]);
  await auditoria.registrar({ clinicaId, usuarioId: actor.id, usuarioNombre: actor.nombre, accion: 'enviar_resumen_diario', modulo: 'clinica', detalle: { canales: r.canales, errores: r.errores } });
  // Si WhatsApp Business no está conectado, se puede mandar a mano desde el celular.
  const manual = cfg.resumen_whatsapp && !whatsapp.configurado() ? enlaceWhatsapp(cfg.resumen_whatsapp, texto(d)) : null;
  return { ...r, whatsappManual: manual };
}

let corriendo = false;
async function ejecutarAutomaticos({ ignorarHora = false } = {}) {
  if (corriendo) return { enviados: 0, fallidos: 0, omitido: 'en_curso' };
  corriendo = true;
  let enviados = 0; let fallidos = 0;
  try {
    const hora = horaLocal(); const hoy = hoyIso();
    const clinicas = await query('SELECT id, resumen_hora, resumen_correos, resumen_whatsapp FROM clinicas WHERE activa AND resumen_activo');
    for (const c of clinicas.rows) {
      if (!ignorarHora && hora < c.resumen_hora) continue;
      // Reserva el resumen de hoy (si otro servidor ya lo tomó, no se repite). Uno fallido se reintenta a la media hora.
      const r = await query(`INSERT INTO resumenes_diarios (clinica_id, fecha) VALUES ($1,$2) ON CONFLICT (clinica_id, fecha) DO UPDATE SET estado='enviando', actualizado_en=now()
          WHERE resumenes_diarios.estado='fallo' AND resumenes_diarios.automatico AND resumenes_diarios.actualizado_en < now() - interval '30 minutes' RETURNING id`, [c.id, hoy]);
      if (!r.rowCount) continue;
      try {
        const d = await datos(c.id, hoy);
        const x = await mandarA(c.id, d, c);
        await query('UPDATE resumenes_diarios SET estado=$2, canales=$3, error=$4, actualizado_en=now() WHERE id=$1', [r.rows[0].id, x.canales.length ? 'enviado' : 'fallo', x.canales.join(', ') || null, x.errores.join(' · ') || null]);
        if (x.canales.length) enviados += 1; else fallidos += 1;
      } catch (e) {
        await query("UPDATE resumenes_diarios SET estado='fallo', error=$2, actualizado_en=now() WHERE id=$1", [r.rows[0].id, String(e.message).slice(0, 500)]);
        fallidos += 1;
      }
    }
  } finally { corriendo = false; }
  return { enviados, fallidos };
}

module.exports = { configuracion, guardarConfiguracion, vistaPrevia, enviarAhora, ejecutarAutomaticos, texto, lineas, datos };
