/* Portal del paciente (página web con cuenta).
   - Sin email ni SMS (Render gratis bloquea el SMTP):
     · personas nuevas: crean su cuenta al instante; su ficha queda "sin
       verificar" y no ven pagos ni comprobantes hasta que recepción vea su cédula;
     · pacientes que ya tienen ficha: entran con un código que les da
       recepción desde DOVA (por WhatsApp o en persona). Saber una cédula no
       alcanza para entrar a la cuenta de otro.
   - El token del portal se firma con una clave distinta a la de DOVA: no
     sirve para entrar al sistema de la clínica.
   - Cada consulta filtra por el paciente del token: nadie ve datos ajenos.
   - Los pagos por transferencia/QR quedan "pendientes" hasta que recepción
     revisa el comprobante; recién ahí se registra el cobro (y entra a la caja). */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { query, conCandado } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso } = require('../../utils/recurso');
const auditoria = require('../../utils/auditoria');
const correo = require('../../utils/correo');
const w = require('./web.service');

const CLAVE_PORTAL = () => `${env.jwtSecret}|portal-paciente`;
const AUD = 'portal-paciente';
const txt = w.txt;
const hashCodigo = (pacienteId, codigo) => crypto.createHash('sha256').update(`${pacienteId}:${codigo}:${env.jwtSecret}`).digest('hex');
const ciLimpia = (v) => String(v || '').replace(/[.\s]/g, '').slice(0, 30);
const NOMBRE_METODO = { transferencia: 'Transferencia', qr: 'QR' };
const HASH_FALSO = bcrypt.hashSync('no-existe-esta-cuenta', 10); // para que no se note por tiempo si una cuenta existe

const SIN_VERIFICAR = () => new ApiError(403, 'Para ver tus pagos y comprobantes, la clínica tiene que confirmar tu identidad: mostrá tu cédula en recepción en tu próxima visita.');

async function contextoClinica() {
  const c = await w.clinicaPublica();
  const cfg = await w.obtenerConfig(c.id);
  return { c, cfg };
}

// ---------------------------------------------------------------- código por email
const fichaPorCi = async (clinicaId, doc) => (await query('SELECT id, nombre, apellido, email, activo, web_verificado FROM pacientes WHERE clinica_id=$1 AND ci=$2 ORDER BY activo DESC, id LIMIT 1', [clinicaId, doc])).rows[0];

async function clinicaConCuentas() {
  const { c, cfg } = await contextoClinica();
  if (!cfg.cuentas_activas) throw new ApiError(409, 'Las cuentas online no están activas. Consultá en recepción.');
  return { c, cfg };
}

function validarClave(clave) {
  const c = String(clave || '');
  if (c.length < 8) throw new ApiError(400, 'La contraseña tiene que tener al menos 8 caracteres');
  if (c.length > 100) throw new ApiError(400, 'La contraseña es demasiado larga');
  if (!/[A-Za-z]/.test(c) || !/\d/.test(c)) throw new ApiError(400, 'La contraseña tiene que tener letras y números');
  return c;
}

async function guardarCuenta(clinicaId, pacienteId, email, clave) {
  const claveHash = await bcrypt.hash(clave, 10);
  const r = await query(`INSERT INTO web_cuentas (clinica_id, paciente_id, email, clave_hash) VALUES ($1,$2,$3,$4)
                         ON CONFLICT (paciente_id) DO UPDATE SET clave_hash=EXCLUDED.clave_hash, email=EXCLUDED.email, version_token=web_cuentas.version_token+1,
                           intentos_fallidos=0, bloqueada_hasta=NULL, activa=true RETURNING *, (xmax = 0) AS nueva`, [clinicaId, pacienteId, email || '', claveHash]);
  return r.rows[0];
}

async function avisarCuentaNueva(c, p, { ci, telefono, email, nuevo, fechaNacimiento }, ip) {
  const sol = await query(`INSERT INTO web_solicitudes (clinica_id, tipo, nombre, ci, telefono, email, mensaje, datos, paciente_id, paciente_nuevo, ip)
                           VALUES ($1,'registro',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
  [c.id, `${p.nombre} ${p.apellido}`, ci, telefono || null, email || null, 'Creó su cuenta en la página web.', JSON.stringify({ fechaNacimiento: fechaNacimiento || null }), p.id, nuevo, ip]);
  await w.notificarRecepcion(c.id, { tipo: 'registro_web', titulo: `${nuevo ? 'Paciente nuevo' : 'Cuenta nueva'} en la web: ${p.nombre} ${p.apellido}`, mensaje: nuevo ? 'Se creó la ficha. Verificá su identidad cuando venga (cédula).' : 'Un paciente activó su cuenta en la página web.', entidad: 'web_solicitud', entidadId: sol.rows[0].id, ruta: 'web' });
}

// "Crear mi cuenta" para personas que todavía no son pacientes: se crea la
// ficha (sin verificar) y la cuenta al instante, sin email ni SMS. Ven y
// reservan turnos; pagos y comprobantes, cuando recepción verifica su cédula.
// Si la cédula ya es paciente, no se puede tomar su ficha desde la web: tiene
// que pedir un código a la clínica.
async function registrarse(d, ip) {
  if (d.sitio) throw new ApiError(400, 'No se pudo enviar');
  w.limitar(ip, 'portal-registro', 5, 30);
  const { c } = await clinicaConCuentas();
  const persona = w.validarPersona(d);
  const clave = validarClave(d.clave);
  const res = await conCandado([`web:ci:${c.id}:${persona.ci}`], async () => {
    if (await fichaPorCi(c.id, persona.ci)) {
      throw new ApiError(409, 'Esa cédula ya está registrada en la clínica. Para entrar, pedí tu código de activación por WhatsApp o en recepción.', { codigo: 'YA_PACIENTE' });
    }
    const r = await w.pacientePorCi(c.id, persona);
    const p = (await query('SELECT id, nombre, apellido FROM pacientes WHERE id=$1', [r.id])).rows[0];
    const cuenta = await guardarCuenta(c.id, p.id, persona.email, clave);
    return { p, cuenta };
  });
  await auditoria.registrar({ clinicaId: c.id, usuarioId: null, usuarioNombre: 'Página web', accion: 'crear_cuenta_paciente', modulo: 'web', entidadId: res.p.id, detalle: { ip, pacienteNuevo: true } });
  await avisarCuentaNueva(c, res.p, { ...persona, nuevo: true }, ip);
  return sesion(res.cuenta, res.p);
}

// Pacientes de la clínica (o quien se olvidó la contraseña): entran con el
// código que les da recepción desde DOVA.
async function activar({ ci, codigo, clave }, ip) {
  w.limitar(ip, 'portal-activar', 10, 30);
  const { c } = await clinicaConCuentas();
  const doc = ciLimpia(ci); const cod = String(codigo || '').replace(/\D/g, '');
  const nueva = validarClave(clave);
  const error = new ApiError(400, 'El código no es correcto o ya venció. Pedí uno nuevo a la clínica.');
  if (!/^\d{6}$/.test(cod) || !/^[0-9A-Za-z-]{4,20}$/.test(doc)) throw error;
  const res = await conCandado([`web:ci:${c.id}:${doc}`], async () => {
    const k = (await query('SELECT * FROM web_codigos WHERE clinica_id=$1 AND ci=$2 AND NOT usado AND expira_en > now() AND paciente_id IS NOT NULL ORDER BY id DESC LIMIT 1', [c.id, doc])).rows[0];
    if (!k) throw error;
    if (k.intentos >= 5) { await query('UPDATE web_codigos SET usado=true WHERE id=$1', [k.id]); throw new ApiError(429, 'Demasiados intentos con ese código. Pedí uno nuevo a la clínica.'); }
    if (k.codigo_hash !== hashCodigo(`${c.id}:${doc}`, cod)) { await query('UPDATE web_codigos SET intentos=intentos+1 WHERE id=$1', [k.id]); throw error; }
    await query('UPDATE web_codigos SET usado=true WHERE id=$1', [k.id]);
    const p = (await query('SELECT id, nombre, apellido, email, telefono, activo FROM pacientes WHERE id=$1 AND clinica_id=$2', [k.paciente_id, c.id])).rows[0];
    if (!p || !p.activo) throw error;
    const cuenta = await guardarCuenta(c.id, p.id, p.email, nueva);
    return { p, cuenta };
  });
  const { cuenta, p } = res;
  await auditoria.registrar({ clinicaId: c.id, usuarioId: null, usuarioNombre: 'Página web', accion: cuenta.nueva ? 'crear_cuenta_paciente' : 'cambiar_clave_paciente', modulo: 'web', entidadId: p.id, detalle: { ip } });
  if (cuenta.nueva) await avisarCuentaNueva(c, p, { ci: doc, telefono: p.telefono, email: p.email, nuevo: false }, ip);
  return sesion(cuenta, p);
}

// ---------------------------------------------------------------- recepción: accesos a la web
async function listarAccesos(clinicaId, { buscar }) {
  const b = String(buscar || '').trim();
  if (b.length < 2) return [];
  const r = await query(`SELECT p.id, p.nombre, p.apellido, p.ci, p.telefono, p.whatsapp, p.web_verificado,
                                wc.id AS cuenta_id, wc.activa AS cuenta_activa, wc.ultimo_ingreso
                           FROM pacientes p LEFT JOIN web_cuentas wc ON wc.paciente_id=p.id
                          WHERE p.clinica_id=$1 AND p.activo AND (p.ci ILIKE $2 OR (p.nombre || ' ' || p.apellido) ILIKE $3)
                          ORDER BY p.apellido, p.nombre LIMIT 20`, [clinicaId, `${b.replace(/[.\s]/g, '')}%`, `%${b}%`]);
  return r.rows;
}

// Genera un código de 6 números (vale 48 h, 5 intentos) para que el paciente
// cree su cuenta o cambie la contraseña. Recepción se lo pasa por WhatsApp.
async function generarCodigo(clinicaId, pacienteId, usuario) {
  const p = (await query('SELECT id, nombre, apellido, ci, telefono, whatsapp, activo FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, Number(pacienteId)])).rows[0];
  if (!p || !p.activo) throw new ApiError(404, 'Paciente no encontrado');
  const doc = ciLimpia(p.ci);
  if (!/^[0-9A-Za-z-]{4,20}$/.test(doc)) throw new ApiError(400, 'El paciente no tiene cédula cargada en la ficha. Cargala primero: con la cédula entra a la web.');
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await query('UPDATE web_codigos SET usado=true WHERE clinica_id=$1 AND ci=$2 AND NOT usado', [clinicaId, doc]);
  const r = await query(`INSERT INTO web_codigos (clinica_id, paciente_id, ci, codigo_hash, expira_en, usuario_id)
                         VALUES ($1,$2,$3,$4, now() + interval '48 hours', $5) RETURNING expira_en`, [clinicaId, p.id, doc, hashCodigo(`${clinicaId}:${doc}`, codigo), usuario.id]);
  const tieneCuenta = (await query('SELECT 1 FROM web_cuentas WHERE paciente_id=$1', [p.id])).rowCount > 0;
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre || usuario.username, accion: 'codigo_web_paciente', modulo: 'web', entidadId: p.id, detalle: { tieneCuenta } });
  return { codigo, expira: r.rows[0].expira_en, ci: doc, nombre: p.nombre, apellido: p.apellido, telefono: p.whatsapp || p.telefono, tieneCuenta };
}

async function desactivarCuenta(clinicaId, pacienteId, usuario) {
  const r = await query('UPDATE web_cuentas SET activa=false, version_token=version_token+1 WHERE clinica_id=$1 AND paciente_id=$2 RETURNING id', [clinicaId, Number(pacienteId)]);
  if (!r.rowCount) throw new ApiError(404, 'Ese paciente no tiene cuenta en la web');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre || usuario.username, accion: 'desactivar_cuenta_web', modulo: 'web', entidadId: Number(pacienteId) });
  return { ok: true };
}

function sesion(cuenta, p) {
  const token = jwt.sign({ sub: cuenta.id, pid: cuenta.paciente_id, cid: cuenta.clinica_id, v: cuenta.version_token }, CLAVE_PORTAL(), { expiresIn: '7d', audience: AUD });
  return { token, paciente: { nombre: p.nombre, apellido: p.apellido } };
}

async function ingresar({ usuario, clave }, ip) {
  w.limitar(ip, 'portal-ingresar', 15, 15);
  const { c } = await contextoClinica();
  const u = String(usuario || '').trim().toLowerCase();
  const error = new ApiError(401, 'Cédula/email o contraseña incorrectos');
  if (!u || !clave) throw error;
  const cuenta = (await query(`SELECT wc.*, p.nombre, p.apellido, p.activo AS paciente_activo FROM web_cuentas wc JOIN pacientes p ON p.id=wc.paciente_id
                                WHERE wc.clinica_id=$1 AND (lower(wc.email)=$2 OR p.ci=$3) ORDER BY wc.id LIMIT 1`, [c.id, u, ciLimpia(usuario)])).rows[0];
  if (!cuenta) { await bcrypt.compare(String(clave), HASH_FALSO); throw error; }
  if (cuenta.bloqueada_hasta && new Date(cuenta.bloqueada_hasta) > new Date()) throw new ApiError(429, 'Por seguridad, la cuenta quedó bloqueada unos minutos por varios intentos fallidos. Probá más tarde o cambiá tu contraseña.');
  if (!cuenta.activa || !cuenta.paciente_activo) throw error;
  const ok = await bcrypt.compare(String(clave), cuenta.clave_hash);
  if (!ok) {
    await query("UPDATE web_cuentas SET intentos_fallidos=intentos_fallidos+1, bloqueada_hasta=CASE WHEN intentos_fallidos+1 >= 5 THEN now() + interval '15 minutes' ELSE bloqueada_hasta END WHERE id=$1", [cuenta.id]);
    throw error;
  }
  await query('UPDATE web_cuentas SET intentos_fallidos=0, bloqueada_hasta=NULL, ultimo_ingreso=now() WHERE id=$1', [cuenta.id]);
  return sesion(cuenta, cuenta);
}

// Middleware: identifica al paciente del token del portal.
async function autenticar(req, res, next) {
  try {
    const [esquema, token] = String(req.headers.authorization || '').split(' ');
    if (esquema !== 'Bearer' || !token) throw new ApiError(401, 'Iniciá sesión para continuar');
    let pl;
    try { pl = jwt.verify(token, CLAVE_PORTAL(), { audience: AUD }); } catch (_e) { throw new ApiError(401, 'Tu sesión venció. Volvé a ingresar.'); }
    const r = (await query(`SELECT wc.id, wc.paciente_id, wc.clinica_id, wc.version_token, wc.activa, p.activo, p.nombre, p.apellido, p.ci, p.web_verificado
                              FROM web_cuentas wc JOIN pacientes p ON p.id=wc.paciente_id WHERE wc.id=$1`, [pl.sub])).rows[0];
    if (!r || !r.activa || !r.activo || r.version_token !== pl.v || r.paciente_id !== pl.pid) throw new ApiError(401, 'Tu sesión venció. Volvé a ingresar.');
    req.portal = { cuentaId: r.id, pacienteId: r.paciente_id, clinicaId: r.clinica_id, nombre: r.nombre, apellido: r.apellido, ci: r.ci, verificado: r.web_verificado };
    next();
  } catch (e) { next(e); }
}

async function cambiarClave(pt, { actual, nueva }) {
  const c = (await query('SELECT * FROM web_cuentas WHERE id=$1', [pt.cuentaId])).rows[0];
  if (!(await bcrypt.compare(String(actual || ''), c.clave_hash))) throw new ApiError(400, 'La contraseña actual no es correcta');
  const h = await bcrypt.hash(validarClave(nueva), 10);
  const r = (await query('UPDATE web_cuentas SET clave_hash=$2, version_token=version_token+1 WHERE id=$1 RETURNING *', [c.id, h])).rows[0];
  return sesion(r, pt);
}

// ---------------------------------------------------------------- datos y turnos
async function yo(pt) {
  const p = (await query('SELECT nombre, apellido, ci, telefono, email, direccion, ciudad, fecha_nacimiento::text AS fecha_nacimiento FROM pacientes WHERE id=$1', [pt.pacienteId])).rows[0];
  return { ...p, verificado: pt.verificado !== false };
}

async function turnos(pt) {
  const { cfg } = await contextoClinica();
  const r = await query(`SELECT t.id, t.fecha::text AS fecha, to_char(t.hora_inicio,'HH24:MI') AS hora, t.duracion_minutos, t.estado, t.confirmacion, t.motivo,
                                o.nombre AS odontologo, tr.nombre AS tratamiento
                           FROM turnos t JOIN odontologos o ON o.id=t.odontologo_id LEFT JOIN tratamientos tr ON tr.id=t.tratamiento_id
                          WHERE t.clinica_id=$1 AND t.paciente_id=$2 ORDER BY t.fecha DESC, t.hora_inicio DESC LIMIT 60`, [pt.clinicaId, pt.pacienteId]);
  const items = r.rows.map((t) => {
    const faltan = w.minutosHasta(t.fecha, t.hora);
    const vigente = !['cancelado', 'no_asistio', 'atendido', 'reprogramado'].includes(t.estado) && faltan > 0;
    return { ...t, motivo: t.tratamiento || t.motivo, vigente, confirmado: t.confirmacion === 'confirmado', puedeCancelar: vigente && faltan >= cfg.cancelacion_horas * 60 };
  });
  return { proximos: items.filter((t) => t.vigente).reverse(), anteriores: items.filter((t) => !t.vigente).slice(0, 20), cancelacionHoras: cfg.cancelacion_horas };
}

async function accionTurno(pt, id, accion) {
  const t = (await query("SELECT id, fecha::text AS fecha, to_char(hora_inicio,'HH24:MI') AS hora, estado FROM turnos WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3", [Number(id), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!t) throw new ApiError(404, 'Turno no encontrado');
  const lista = await turnos(pt);
  const v = lista.proximos.find((x) => x.id === t.id);
  if (!v) throw new ApiError(409, 'Este turno ya no está vigente');
  if (accion === 'cancelar') {
    if (!v.puedeCancelar) throw new ApiError(409, `Falta poco para el turno: para cancelarlo comunicate con la clínica (se puede cancelar online hasta ${lista.cancelacionHoras} h antes).`);
    await query("UPDATE turnos SET estado='cancelado', actualizado_en=now() WHERE id=$1", [t.id]);
    await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.id, JSON.stringify({ estado: { antes: t.estado, despues: 'cancelado' }, por: 'el paciente desde su cuenta web' })]);
    await w.notificarRecepcion(pt.clinicaId, { tipo: 'turno_web', titulo: `Turno cancelado desde la web: ${pt.nombre} ${pt.apellido}`, mensaje: `${w.nombreDia(t.fecha)} ${t.hora}. El horario quedó libre.`, entidad: 'turno', entidadId: t.id, ruta: 'agenda' });
  } else if (accion === 'confirmar') {
    await query("UPDATE turnos SET confirmacion='confirmado', confirmado_en=now(), estado=CASE WHEN estado='reservado' THEN 'confirmado' ELSE estado END, actualizado_en=now() WHERE id=$1", [t.id]);
    await query('INSERT INTO turno_historial (turno_id, usuario_id, cambio) VALUES ($1,NULL,$2)', [t.id, JSON.stringify({ confirmacion: 'confirmado por el paciente desde su cuenta web' })]);
  } else throw new ApiError(400, 'Acción inválida');
  return turnos(pt);
}

async function reservar(pt, d) {
  const fecha = txt(d.fecha, 10); const hora = txt(d.hora, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora || '')) throw new ApiError(400, 'Elegí un día y un horario');
  const k = await w.contexto(d.tratamientoId, d.odontologoId);
  const hoy = hoyIso();
  const lim = new Date(`${hoy}T12:00:00Z`); lim.setUTCDate(lim.getUTCDate() + k.cfg.dias_adelante);
  if (fecha < hoy || fecha > lim.toISOString().slice(0, 10)) throw new ApiError(400, 'Ese día no está disponible para reservar online');
  const comentario = txt(d.comentario, 500);
  const token = crypto.randomBytes(24).toString('base64url');
  const res = await conCandado([`web:ci:${k.clinicaId}:${pt.ci || pt.pacienteId}`], () => w.ocuparHorario(k, { id: pt.pacienteId }, { fecha, hora, comentario, tokenHash: w.hash(token) }));
  const odo = k.odos.find((o) => o.id === res.odontologoId);
  await query(`INSERT INTO web_solicitudes (clinica_id, tipo, nombre, ci, mensaje, datos, paciente_id, turno_id) VALUES ($1,'turno',$2,$3,$4,$5,$6,$7)`,
    [k.clinicaId, `${pt.nombre} ${pt.apellido}`, pt.ci, comentario, JSON.stringify({ fecha, hora, tratamiento: k.trat ? k.trat.nombre : null, odontologo: odo ? odo.nombre : null, conCuenta: true }), pt.pacienteId, res.turnoId]);
  await auditoria.registrar({ clinicaId: k.clinicaId, usuarioId: null, usuarioNombre: 'Página web (cuenta del paciente)', accion: 'reservar_turno_web', modulo: 'agenda', entidadId: res.turnoId, detalle: { pacienteId: pt.pacienteId, fecha, hora } });
  await w.notificarRecepcion(k.clinicaId, { tipo: 'turno_web', titulo: `Turno nuevo desde la web: ${pt.nombre} ${pt.apellido}`, mensaje: `${w.nombreDia(fecha)} ${hora} · ${k.trat ? k.trat.nombre : 'Consulta'}${odo ? ` · ${odo.nombre}` : ''}`, entidad: 'turno', entidadId: res.turnoId, ruta: 'web' });
  return { token, turnos: await turnos(pt) };
}

// ---------------------------------------------------------------- estado de cuenta
async function cuenta(pt) {
  const { cfg } = await contextoClinica();
  // Identidad sin confirmar (se registró solo en la web): todavía no ve datos de pagos.
  if (pt.verificado === false) {
    return { sinVerificar: true, resumen: { pendiente: 0, cuotasVencidas: 0, enRevision: 0 }, presupuestos: [], cuotas: [], pagos: [], facturas: [], enviados: [], pagosActivos: false, datosPago: null };
  }
  const fac = require('../facturacion/facturacion.service');
  const [press, cuotas, pagos, facturas, enviados] = await Promise.all([
    query("SELECT id, fecha::text AS fecha, total, estado FROM presupuestos WHERE clinica_id=$1 AND paciente_id=$2 AND estado IN ('aceptado','enviado') ORDER BY fecha DESC", [pt.clinicaId, pt.pacienteId]),
    query(`SELECT c.id, c.numero, c.monto, c.vencimiento::text AS vencimiento, c.estado, pp.id AS plan_id, pp.cantidad_cuotas
             FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id
            WHERE pp.clinica_id=$1 AND pp.paciente_id=$2 AND pp.estado <> 'cancelado' AND c.estado <> 'pagada' ORDER BY c.vencimiento`, [pt.clinicaId, pt.pacienteId]),
    query(`SELECT p.id, p.fecha, p.monto, p.metodo, p.concepto, f.id AS factura_id, f.numero_completo AS factura_numero
             FROM pagos p LEFT JOIN factura_pagos fp ON fp.pago_id=p.id AND fp.activo LEFT JOIN facturas f ON f.id=fp.factura_id AND f.estado<>'anulada'
            WHERE p.clinica_id=$1 AND p.paciente_id=$2 AND p.estado='pagado' ORDER BY p.fecha DESC LIMIT 40`, [pt.clinicaId, pt.pacienteId]),
    query("SELECT id, numero_completo, fecha::text AS fecha, total, estado FROM facturas WHERE clinica_id=$1 AND paciente_id=$2 AND estado<>'anulada' ORDER BY fecha DESC, id DESC LIMIT 40", [pt.clinicaId, pt.pacienteId]),
    query('SELECT id, monto, metodo, referencia, estado, motivo_rechazo, creado_en, cuota_id, presupuesto_id FROM web_pagos WHERE paciente_id=$1 ORDER BY id DESC LIMIT 20', [pt.pacienteId]),
  ]);
  const presupuestos = [];
  // Los presupuestos financiados en cuotas se pagan por cuota (no se ofrecen dos veces).
  const conPlan = new Set((await query("SELECT presupuesto_id FROM planes_pago WHERE clinica_id=$1 AND paciente_id=$2 AND estado <> 'cancelado' AND presupuesto_id IS NOT NULL", [pt.clinicaId, pt.pacienteId])).rows.map((x) => x.presupuesto_id));
  for (const p of press.rows) { const r = await fac.resumenPresupuesto(pt.clinicaId, p.id); presupuestos.push({ id: p.id, fecha: p.fecha, estado: p.estado, total: r.total, pagado: r.pagado, pendiente: r.pendiente, enCuotas: conPlan.has(p.id) }); }
  const hoy = hoyIso();
  const enRevision = enviados.rows.filter((x) => x.estado === 'pendiente').reduce((s, x) => s + Number(x.monto), 0);
  const pendientePres = presupuestos.filter((p) => p.estado === 'aceptado').reduce((s, p) => s + p.pendiente, 0);
  return {
    resumen: { pendiente: pendientePres, cuotasVencidas: cuotas.rows.filter((c) => c.vencimiento < hoy).length, enRevision },
    presupuestos,
    cuotas: cuotas.rows.map((c) => ({ ...c, monto: Number(c.monto), vencida: c.vencimiento < hoy })),
    pagos: pagos.rows.map((p) => ({ ...p, monto: Number(p.monto) })),
    facturas: facturas.rows.map((f) => ({ ...f, total: Number(f.total) })),
    enviados: enviados.rows.map((x) => ({ ...x, monto: Number(x.monto) })),
    pagosActivos: cfg.pagos_activos,
    datosPago: cfg.pagos_activos ? {
      banco: cfg.banco, titular: cfg.titular, cuenta: cfg.numero_cuenta, documento: cfg.documento_titular, alias: cfg.alias_pago,
      instrucciones: cfg.instrucciones_pago, tieneQr: !!cfg.qr_mime,
    } : null,
  };
}

async function reciboPdf(pt, pagoId, res) {
  if (pt.verificado === false) throw SIN_VERIFICAR();
  const p = (await query("SELECT id FROM pagos WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND estado='pagado'", [Number(pagoId), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!p) throw new ApiError(404, 'Pago no encontrado');
  return require('../comprobantes/comprobantes.service').pago(pt.clinicaId, p.id, res);
}
async function facturaPdf(pt, facturaId, res) {
  if (pt.verificado === false) throw SIN_VERIFICAR();
  const f = (await query("SELECT id FROM facturas WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3 AND estado<>'anulada'", [Number(facturaId), pt.clinicaId, pt.pacienteId])).rows[0];
  if (!f) throw new ApiError(404, 'Comprobante no encontrado');
  const fac = require('../facturacion/facturacion.service'); const pdf = require('../facturacion/facturacion.pdf');
  const [factura, config, logo, metodos] = await Promise.all([fac.obtener(pt.clinicaId, f.id, { todas: true }), fac.obtenerConfig(pt.clinicaId), fac.obtenerLogo(pt.clinicaId), fac.metodosPago(pt.clinicaId, { incluirInactivos: true })]);
  pdf.generar(res, { factura, config, logo, metodos, disposicion: 'attachment' });
}

// ---------------------------------------------------------------- pagos con comprobante
function tipoArchivo(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function informarPago(pt, d, archivo) {
  if (pt.verificado === false) throw SIN_VERIFICAR();
  const { cfg } = await contextoClinica();
  if (!cfg.pagos_activos) throw new ApiError(409, 'Los pagos online no están activos. Consultá en recepción.');
  const metodo = ['transferencia', 'qr'].includes(d.metodo) ? d.metodo : null;
  if (!metodo) throw new ApiError(400, 'Elegí cómo pagaste (transferencia o QR)');
  if (!archivo || !archivo.buffer) throw new ApiError(400, 'Adjuntá el comprobante del pago (foto o PDF)');
  const mime = tipoArchivo(archivo.buffer);
  if (!mime) throw new ApiError(400, 'El comprobante tiene que ser una foto (JPG, PNG) o un PDF');
  let monto = Math.round(Number(String(d.monto || '').replace(/[^\d]/g, '')));
  let cuotaId = d.cuotaId ? Number(d.cuotaId) : null; let presupuestoId = d.presupuestoId ? Number(d.presupuestoId) : null;
  if (cuotaId) {
    const c = (await query(`SELECT c.id, c.monto, c.estado, pp.presupuesto_id FROM cuotas c JOIN planes_pago pp ON pp.id=c.plan_pago_id WHERE c.id=$1 AND pp.clinica_id=$2 AND pp.paciente_id=$3`, [cuotaId, pt.clinicaId, pt.pacienteId])).rows[0];
    if (!c) throw new ApiError(400, 'Esa cuota no es tuya');
    if (c.estado === 'pagada') throw new ApiError(409, 'Esa cuota ya está pagada');
    monto = Math.round(Number(c.monto)); presupuestoId = c.presupuesto_id || presupuestoId;
    const ya = (await query("SELECT 1 FROM web_pagos WHERE cuota_id=$1 AND estado='pendiente'", [cuotaId])).rowCount;
    if (ya) throw new ApiError(409, 'Ya enviaste un comprobante para esa cuota: está en revisión.');
  }
  if (presupuestoId && !(await query('SELECT 1 FROM presupuestos WHERE id=$1 AND clinica_id=$2 AND paciente_id=$3', [presupuestoId, pt.clinicaId, pt.pacienteId])).rowCount) throw new ApiError(400, 'Ese presupuesto no es tuyo');
  if (!(monto > 0) || monto > 500000000) throw new ApiError(400, 'Escribí el monto que pagaste');
  const pend = (await query("SELECT count(*)::int n FROM web_pagos WHERE paciente_id=$1 AND estado='pendiente'", [pt.pacienteId])).rows[0].n;
  if (pend >= 5) throw new ApiError(409, 'Tenés varios pagos en revisión. Esperá a que la clínica los revise.');
  const r = (await query(`INSERT INTO web_pagos (clinica_id, paciente_id, monto, metodo, referencia, nota, cuota_id, presupuesto_id, comprobante, comprobante_mime)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, monto, metodo, estado, creado_en`,
  [pt.clinicaId, pt.pacienteId, monto, metodo, txt(d.referencia, 100), txt(d.nota, 500), cuotaId, presupuestoId, archivo.buffer, mime])).rows[0];
  await auditoria.registrar({ clinicaId: pt.clinicaId, usuarioId: null, usuarioNombre: 'Página web (cuenta del paciente)', accion: 'informar_pago_web', modulo: 'pagos', entidadId: r.id, detalle: { pacienteId: pt.pacienteId, monto, metodo } });
  await w.notificarRecepcion(pt.clinicaId, { tipo: 'pago_web', titulo: `Pago para revisar: ${pt.nombre} ${pt.apellido}`, mensaje: `Gs. ${monto.toLocaleString('es-PY')} por ${NOMBRE_METODO[metodo]}. Revisá el comprobante.`, entidad: 'web_pago', entidadId: r.id, ruta: 'web' });
  return { ...r, monto: Number(r.monto) };
}

// ---------------------------------------------------------------- DOVA: revisar pagos
async function listarPagos(clinicaId, { estado }) {
  const p = [clinicaId]; let c = '';
  if (estado) { p.push(estado); c = ` AND wp.estado=$${p.length}`; }
  const r = await query(`SELECT wp.id, wp.paciente_id, wp.monto, wp.metodo, wp.referencia, wp.nota, wp.cuota_id, wp.presupuesto_id, wp.comprobante_mime, wp.estado, wp.motivo_rechazo,
                                wp.pago_id, wp.factura_id, wp.creado_en, wp.revisado_en, u.nombre AS revisado_por_nombre, pa.nombre || ' ' || pa.apellido AS paciente, pa.ci,
                                c.numero AS cuota_numero, f.numero_completo AS factura_numero
                           FROM web_pagos wp JOIN pacientes pa ON pa.id=wp.paciente_id LEFT JOIN usuarios u ON u.id=wp.revisado_por
                           LEFT JOIN cuotas c ON c.id=wp.cuota_id LEFT JOIN facturas f ON f.id=wp.factura_id
                          WHERE wp.clinica_id=$1${c} ORDER BY (wp.estado='pendiente') DESC, wp.creado_en DESC LIMIT 100`, p);
  const n = (await query("SELECT count(*)::int n FROM web_pagos WHERE clinica_id=$1 AND estado='pendiente'", [clinicaId])).rows[0].n;
  return { items: r.rows.map((x) => ({ ...x, monto: Number(x.monto) })), pendientes: n };
}
async function comprobante(clinicaId, id) {
  const r = (await query('SELECT comprobante, comprobante_mime FROM web_pagos WHERE id=$1 AND clinica_id=$2', [Number(id), clinicaId])).rows[0];
  if (!r) throw new ApiError(404, 'Comprobante no encontrado');
  return r;
}
async function avisarPaciente(pacienteId, clinicaId, asunto, parrafos) {
  if (!correo.configurado()) return;
  try {
    const p = (await query('SELECT p.nombre, wc.email FROM pacientes p LEFT JOIN web_cuentas wc ON wc.paciente_id=p.id WHERE p.id=$1', [pacienteId])).rows[0];
    if (!p || !p.email) return;
    const { c, cfg } = await contextoClinica(); void clinicaId;
    await correo.enviar({ para: p.email, asunto, texto: parrafos.map((x) => x.replace(/<[^>]+>/g, '')).join('\n'), htmlCuerpo: correo.html(asunto, parrafos.map((x) => `<p>${x}</p>`), cfg.titulo || c.nombre) });
  } catch (e) { console.error('[portal] aviso por email:', e.message); }
}
async function aprobarPago(clinicaId, id, { facturar }, usuario) {
  const pagosService = require('../pagos/pagos.service');
  const r = await conCandado([`webpago:${Number(id)}`], async () => {
    const wp = (await query('SELECT * FROM web_pagos WHERE id=$1 AND clinica_id=$2', [Number(id), clinicaId])).rows[0];
    if (!wp) throw new ApiError(404, 'Pago no encontrado');
    if (wp.estado !== 'pendiente') throw new ApiError(409, `Este pago ya fue ${wp.estado}`);
    const pago = await pagosService.crear(clinicaId, {
      pacienteId: wp.paciente_id, monto: Number(wp.monto), metodo: wp.metodo, cuotaId: wp.cuota_id || undefined, presupuestoId: wp.presupuesto_id || undefined,
      concepto: `Pago online por ${NOMBRE_METODO[wp.metodo] || wp.metodo}${wp.referencia ? ` (ref. ${wp.referencia})` : ''}`.slice(0, 200),
    }, usuario);
    await query("UPDATE web_pagos SET estado='aprobado', pago_id=$2, revisado_por=$3, revisado_en=now() WHERE id=$1", [wp.id, pago.id, usuario.id]);
    return { wp, pago };
  });
  let factura = null;
  if (facturar && (usuario.permisos || []).includes('facturacion.crear')) {
    try { factura = (await require('../facturacion/facturacion.service').facturarCobro(clinicaId, r.pago.id, {}, usuario)).factura; await query('UPDATE web_pagos SET factura_id=$2 WHERE id=$1', [r.wp.id, factura.id]); } catch (e) { console.error('[portal] factura:', e.message); }
  }
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'aprobar_pago_web', modulo: 'pagos', entidadId: r.wp.id, detalle: { pagoId: r.pago.id, monto: Number(r.wp.monto) } });
  await avisarPaciente(r.wp.paciente_id, clinicaId, 'Recibimos tu pago', [`Confirmamos tu pago de <b>Gs. ${Number(r.wp.monto).toLocaleString('es-PY')}</b>. ¡Gracias!`, 'Podés ver el recibo en tu cuenta de la página web.']);
  return { ok: true, pagoId: r.pago.id, cajaReflejada: r.pago.cajaReflejada, factura: factura ? { id: factura.id, numero: factura.numero_completo } : null };
}
async function rechazarPago(clinicaId, id, { motivo }, usuario) {
  const m = txt(motivo, 500);
  if (!m || m.length < 5) throw new ApiError(400, 'Escribí el motivo (el paciente lo va a ver)');
  const r = (await query("UPDATE web_pagos SET estado='rechazado', motivo_rechazo=$3, revisado_por=$4, revisado_en=now() WHERE id=$1 AND clinica_id=$2 AND estado='pendiente' RETURNING *", [Number(id), clinicaId, m, usuario.id])).rows[0];
  if (!r) throw new ApiError(409, 'Este pago ya fue revisado');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'rechazar_pago_web', modulo: 'pagos', entidadId: r.id, detalle: { motivo: m } });
  await avisarPaciente(r.paciente_id, clinicaId, 'Revisamos tu comprobante', [`No pudimos confirmar tu pago de Gs. ${Number(r.monto).toLocaleString('es-PY')}.`, `<b>Motivo:</b> ${correo.esc(m)}`, 'Podés enviar otro comprobante desde tu cuenta o escribirnos.']);
  return { ok: true };
}
async function verificarPaciente(clinicaId, pacienteId, usuario) {
  const r = await query('UPDATE pacientes SET web_verificado=true, actualizado_en=now() WHERE clinica_id=$1 AND id=$2 RETURNING id', [clinicaId, Number(pacienteId)]);
  if (!r.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  await auditoria.registrar({ clinicaId, usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'verificar_identidad_web', modulo: 'pacientes', entidadId: pacienteId });
  return { ok: true };
}

module.exports = {
  registrarse, activar, listarAccesos, generarCodigo, desactivarCuenta, ingresar, autenticar, cambiarClave, yo, turnos, accionTurno, reservar, cuenta, reciboPdf, facturaPdf, informarPago,
  listarPagos, comprobante, aprobarPago, rechazarPago, verificarPaciente, tipoArchivo,
};
