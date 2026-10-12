/* Puesta en marcha: lista de lo que falta configurar para empezar a usar DOVA
   en la clínica (se calcula con los datos reales, no se marca a mano).
   Se ve en Inicio para quien configura la clínica, hasta completarla u ocultarla. */
const { query } = require('../../config/db');
const whatsapp = require('../../utils/whatsapp');

async function estado(clinicaId) {
  const n = async (sql) => Number((await query(sql, [clinicaId])).rows[0].n);
  const c = (await query('SELECT nombre, direccion, telefono, horario_atencion, config FROM clinicas WHERE id=$1', [clinicaId])).rows[0] || {};
  const faltanDatos = [['direccion', 'dirección'], ['telefono', 'teléfono'], ['horario_atencion', 'horario']].filter(([k]) => !c[k] || !String(c[k]).trim()).map(([, t]) => t);
  const odontologos = await n('SELECT count(*) n FROM odontologos WHERE clinica_id=$1 AND activo');
  const sinUsuario = await n(`SELECT count(*) n FROM odontologos o WHERE o.clinica_id=$1 AND o.activo
      AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.odontologo_id=o.id AND u.activo AND u.eliminado_en IS NULL)`);
  const personal = await n(`SELECT count(*) n FROM usuarios u JOIN roles r ON r.id=u.rol_id
      WHERE u.clinica_id=$1 AND u.activo AND u.eliminado_en IS NULL AND r.codigo <> 'admin'`);
  const tratamientos = await n('SELECT count(*) n FROM tratamientos WHERE clinica_id=$1 AND activo AND precio > 0');
  const sillones = await n('SELECT count(*) n FROM sillones WHERE clinica_id=$1 AND activo');
  const fact = (await query('SELECT ruc, razon_social, timbrado FROM facturacion_config WHERE clinica_id=$1', [clinicaId])).rows[0];
  const pacientes = await n('SELECT count(*) n FROM pacientes WHERE clinica_id=$1 AND activo');
  const items = [
    { id: 'datos', titulo: 'Datos de la clínica', ok: !faltanDatos.length, detalle: faltanDatos.length ? `Falta: ${faltanDatos.join(', ')}.` : 'Dirección, teléfono y horario cargados.', ruta: 'configuracion', ancla: 'cfg-clinica' },
    { id: 'odontologos', titulo: 'Odontólogos', ok: odontologos > 0, detalle: odontologos ? `${odontologos} activo${odontologos === 1 ? '' : 's'}.` : 'Cargá a los profesionales que atienden.', ruta: 'catalogo', sub: 'odo' },
    { id: 'tratamientos', titulo: 'Tratamientos y precios', ok: tratamientos > 0, detalle: tratamientos ? `${tratamientos} con precio.` : 'Cargá los tratamientos con su precio y duración.', ruta: 'catalogo', sub: 'trat' },
    { id: 'sillones', titulo: 'Sillones', ok: sillones > 0, detalle: sillones ? `${sillones} cargado${sillones === 1 ? '' : 's'}.` : 'Cargá los sillones o boxes para la agenda.', ruta: 'operaciones', sub: 'agendacfg' },
    { id: 'personal', titulo: 'Usuarios del personal', ok: personal > 0 && sinUsuario === 0, detalle: !personal ? 'Creá un usuario para cada persona (recepción, doctores, asistentes).' : (sinUsuario ? `${sinUsuario} odontólogo${sinUsuario === 1 ? '' : 's'} sin usuario para entrar a DOVA.` : `${personal} usuario${personal === 1 ? '' : 's'} además del administrador.`), ruta: 'usuarios' },
    { id: 'facturacion', titulo: 'Datos para facturar', ok: !!(fact && fact.ruc && fact.razon_social), detalle: fact && fact.ruc && fact.razon_social ? `RUC ${fact.ruc}${fact.timbrado ? ` · timbrado ${fact.timbrado}` : ''}.` : 'Cargá RUC y razón social para los comprobantes.', ruta: 'facturacion', sub: 'config' },
    { id: 'pacientes', titulo: 'Pacientes', ok: pacientes > 0, detalle: pacientes ? `${pacientes} paciente${pacientes === 1 ? '' : 's'}.` : 'Importá los pacientes que ya tenían (Excel o CSV) o cargalos de a uno.', ruta: 'pacientes' },
    { id: 'whatsapp', titulo: 'Recordatorios automáticos por WhatsApp', opcional: true, ok: whatsapp.configurado(), detalle: whatsapp.configurado() ? 'WhatsApp Business conectado.' : 'Opcional. Mientras tanto, los recordatorios se mandan con un toque desde tu WhatsApp.', ruta: 'seguimiento', sub: 'recordatorios' },
  ];
  const obligatorios = items.filter((i) => !i.opcional);
  return {
    items,
    listos: obligatorios.filter((i) => i.ok).length,
    total: obligatorios.length,
    completa: obligatorios.every((i) => i.ok),
    oculta: !!(c.config && c.config.puesta_en_marcha_oculta),
  };
}

async function ocultar(clinicaId, oculta) {
  await query("UPDATE clinicas SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('puesta_en_marcha_oculta', $2::boolean), actualizado_en=now() WHERE id=$1", [clinicaId, !!oculta]);
  return estado(clinicaId);
}

module.exports = { estado, ocultar };
