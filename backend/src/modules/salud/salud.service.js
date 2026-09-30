const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso, sumarMeses } = require('../../utils/recurso');
const R = require('./salud.reglas');

const ORDEN_NIVEL = { critica: 0, atencion: 1, info: 2 };

async function datosSalud(clinicaId, pacienteId) {
  const [pac, alergias, medicacion, condiciones, anamnesis, signos, manuales] = await Promise.all([
    query('SELECT id, nombre, apellido, alergias, medicamentos, antecedentes_medicos, fecha_nacimiento FROM pacientes WHERE clinica_id=$1 AND id=$2', [clinicaId, pacienteId]),
    query('SELECT * FROM paciente_alergias WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY severidad DESC, sustancia', [clinicaId, pacienteId]),
    query('SELECT * FROM paciente_medicacion WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY medicamento', [clinicaId, pacienteId]),
    query("SELECT * FROM paciente_condiciones WHERE clinica_id=$1 AND paciente_id=$2 AND estado <> 'resuelta' ORDER BY condicion", [clinicaId, pacienteId]),
    query('SELECT * FROM anamnesis WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha DESC, id DESC LIMIT 1', [clinicaId, pacienteId]),
    query('SELECT * FROM signos_vitales WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha DESC LIMIT 1', [clinicaId, pacienteId]),
    query('SELECT * FROM paciente_alertas WHERE clinica_id=$1 AND paciente_id=$2 AND activa ORDER BY creado_en DESC', [clinicaId, pacienteId]),
  ]);
  if (!pac.rowCount) throw new ApiError(404, 'Paciente no encontrado');
  return {
    paciente: pac.rows[0], alergias: alergias.rows, medicacion: medicacion.rows, condiciones: condiciones.rows,
    anamnesis: anamnesis.rows[0] || null, signos: signos.rows[0] || null, manuales: manuales.rows,
  };
}

/* Alertas médicas del paciente: se calculan en el momento a partir de todo
   lo registrado. Se muestran como banner en la ficha, en el modo consulta y
   al abrir un turno. */
async function alertas(clinicaId, pacienteId) {
  const d = await datosSalud(clinicaId, pacienteId);
  const lista = [];

  for (const a of d.alergias) {
    lista.push({
      tipo: 'alergia', nivel: ['severa', 'anafilaxia'].includes(a.severidad) ? 'critica' : 'atencion',
      titulo: `Alergia: ${a.sustancia}`,
      detalle: [a.severidad, a.reaccion].filter(Boolean).join(' — '),
    });
  }
  for (const c of d.condiciones) {
    const info = R.CONDICIONES[c.condicion] || R.CONDICIONES.otra;
    lista.push({ tipo: 'condicion', nivel: info.nivel, titulo: c.condicion === 'otra' ? (c.detalle || 'Otra condición') : info.nombre, detalle: [c.detalle && c.condicion !== 'otra' ? c.detalle : null, info.mensaje].filter(Boolean).join(' · ') });
    if (c.requiere_premedicacion) lista.push({ tipo: 'premedicacion', nivel: 'critica', titulo: 'Requiere premedicación antibiótica', detalle: `Por: ${info.nombre}${c.detalle ? ' (' + c.detalle + ')' : ''}` });
  }
  if (d.medicacion.length) {
    lista.push({ tipo: 'medicacion', nivel: 'info', titulo: `Medicación actual (${d.medicacion.length})`, detalle: d.medicacion.map((m) => m.medicamento + (m.dosis ? ' ' + m.dosis : '')).join(', ') });
    // Medicación que por sí sola implica una condición de riesgo aunque no se haya cargado la condición.
    const fams = new Set(d.medicacion.flatMap((m) => R.familiasDe(m.medicamento)));
    const tieneCond = (c) => d.condiciones.some((x) => x.condicion === c);
    if (fams.has('anticoagulantes') && !tieneCond('anticoagulado')) lista.push({ tipo: 'medicacion', nivel: 'critica', titulo: 'Toma anticoagulantes', detalle: R.CONDICIONES.anticoagulado.mensaje });
    if (fams.has('bifosfonatos') && !tieneCond('bifosfonatos')) lista.push({ tipo: 'medicacion', nivel: 'critica', titulo: 'Toma antirresortivos (bifosfonatos/denosumab)', detalle: R.CONDICIONES.bifosfonatos.mensaje });
    if (fams.has('antiagregantes') && !tieneCond('antiagregado') && !fams.has('anticoagulantes')) lista.push({ tipo: 'medicacion', nivel: 'atencion', titulo: 'Toma antiagregantes', detalle: R.CONDICIONES.antiagregado.mensaje });
  }

  // Anamnesis: debe renovarse periódicamente (por defecto cada 12 meses).
  if (!d.anamnesis) {
    lista.push({ tipo: 'anamnesis', nivel: 'atencion', titulo: 'Sin cuestionario de salud', detalle: 'Completar y firmar la anamnesis antes de tratamientos invasivos.' });
  } else {
    const vence = sumarMeses(String(d.anamnesis.fecha instanceof Date ? d.anamnesis.fecha.toISOString() : d.anamnesis.fecha).slice(0, 10), d.anamnesis.vigencia_meses || 12);
    if (vence < hoyIso()) lista.push({ tipo: 'anamnesis', nivel: 'atencion', titulo: 'Cuestionario de salud vencido', detalle: `Última actualización: ${String(d.anamnesis.fecha instanceof Date ? d.anamnesis.fecha.toISOString() : d.anamnesis.fecha).slice(0, 10)}. Pedir al paciente que lo actualice.` });
    else if (!d.anamnesis.firmada) lista.push({ tipo: 'anamnesis', nivel: 'info', titulo: 'Anamnesis sin firmar', detalle: 'La última anamnesis no tiene firma del paciente.' });
  }

  // Últimos signos vitales
  const s = d.signos;
  if (s) {
    if ((s.presion_sistolica >= 180) || (s.presion_diastolica >= 110)) lista.push({ tipo: 'signos', nivel: 'critica', titulo: `Presión muy alta (${s.presion_sistolica}/${s.presion_diastolica})`, detalle: 'Posponer procedimientos electivos y derivar a control médico.' });
    else if ((s.presion_sistolica >= 140) || (s.presion_diastolica >= 90)) lista.push({ tipo: 'signos', nivel: 'atencion', titulo: `Presión elevada (${s.presion_sistolica}/${s.presion_diastolica})`, detalle: 'Registrar de nuevo antes de procedimientos; limitar vasoconstrictor.' });
    if (s.glucemia && s.glucemia >= 250) lista.push({ tipo: 'signos', nivel: 'critica', titulo: `Glucemia muy alta (${s.glucemia} mg/dL)`, detalle: 'Evitar procedimientos invasivos hasta compensar.' });
    else if (s.glucemia && s.glucemia < 70) lista.push({ tipo: 'signos', nivel: 'critica', titulo: `Hipoglucemia (${s.glucemia} mg/dL)`, detalle: 'Dar hidratos de carbono antes de continuar.' });
    if (s.spo2 && s.spo2 < 92) lista.push({ tipo: 'signos', nivel: 'critica', titulo: `Saturación baja (${s.spo2}%)`, detalle: 'Evaluar antes de continuar.' });
  }

  for (const m of d.manuales) lista.push({ tipo: 'manual', nivel: m.nivel, titulo: m.texto, detalle: '', emergente: m.emergente, id: m.id });

  // Datos cargados como texto libre en la ficha vieja (compatibilidad)
  const p = d.paciente;
  if (p.alergias && p.alergias.trim() && !d.alergias.length) lista.push({ tipo: 'alergia', nivel: 'atencion', titulo: 'Alergias (texto de la ficha)', detalle: p.alergias });

  lista.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
  return {
    alertas: lista,
    resumen: {
      criticas: lista.filter((a) => a.nivel === 'critica').length,
      atencion: lista.filter((a) => a.nivel === 'atencion').length,
      emergentes: lista.filter((a) => a.emergente),
    },
  };
}

/* Verificación de receta: recibe los medicamentos a indicar y devuelve
   advertencias por alergia, alergia cruzada, interacción con la
   medicación actual e interacción con condiciones del paciente. */
async function verificarMedicamentos(clinicaId, pacienteId, medicamentos) {
  if (!Array.isArray(medicamentos) || !medicamentos.length) throw new ApiError(400, 'Enviá al menos un medicamento');
  const d = await datosSalud(clinicaId, pacienteId);
  const advertencias = [];
  const alergiasTexto = [...d.alergias.map((a) => a.sustancia), ...(d.paciente.alergias ? [d.paciente.alergias] : [])];

  for (const nombre of medicamentos) {
    const fams = R.familiasDe(nombre);
    const n = R.normalizar(nombre);
    for (const alergia of alergiasTexto) {
      const na = R.normalizar(alergia);
      const famsAlergia = R.familiasDe(alergia);
      if (na && (n.includes(na) || na.includes(n.split(' ')[0]) || famsAlergia.some((f) => fams.includes(f) && f !== 'aine'))) {
        advertencias.push({ medicamento: nombre, nivel: 'critica', tipo: 'alergia', mensaje: `El paciente es alérgico a "${alergia}".` });
        continue;
      }
      for (const [fa, fm, nivel, msg] of R.ALERGIA_CRUZADA) {
        if (famsAlergia.includes(fa) && fams.includes(fm)) advertencias.push({ medicamento: nombre, nivel, tipo: 'alergia_cruzada', mensaje: msg });
      }
    }
    for (const med of d.medicacion) {
      const famsMed = R.familiasDe(med.medicamento);
      for (const [a, b, nivel, msg] of R.INTERACCIONES) {
        if ((fams.includes(a) && famsMed.includes(b)) || (fams.includes(b) && famsMed.includes(a))) {
          advertencias.push({ medicamento: nombre, nivel, tipo: 'interaccion', mensaje: `${msg} (toma: ${med.medicamento})` });
        }
      }
    }
    for (const c of d.condiciones) {
      for (const [f, cond, nivel, msg] of R.FARMACO_CONDICION) {
        if (fams.includes(f) && c.condicion === cond) advertencias.push({ medicamento: nombre, nivel, tipo: 'condicion', mensaje: msg });
      }
    }
  }
  // Interacciones entre los fármacos de la misma receta
  for (let i = 0; i < medicamentos.length; i++) {
    for (let j = i + 1; j < medicamentos.length; j++) {
      const fa = R.familiasDe(medicamentos[i]); const fb = R.familiasDe(medicamentos[j]);
      for (const [a, b, nivel, msg] of R.INTERACCIONES) {
        if ((fa.includes(a) && fb.includes(b)) || (fa.includes(b) && fb.includes(a))) {
          advertencias.push({ medicamento: `${medicamentos[i]} + ${medicamentos[j]}`, nivel, tipo: 'interaccion', mensaje: msg });
        }
      }
    }
  }
  // Sin duplicados
  const vistos = new Set();
  const unicas = advertencias.filter((a) => { const k = a.medicamento + a.mensaje; if (vistos.has(k)) return false; vistos.add(k); return true; });
  unicas.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
  return { advertencias: unicas, aviso: 'Ayuda automática basada en reglas fijas: no reemplaza el criterio profesional ni un vademécum completo.' };
}

async function resumen(clinicaId, pacienteId) {
  const d = await datosSalud(clinicaId, pacienteId);
  const [historialSignos, historialAnamnesis] = await Promise.all([
    query('SELECT * FROM signos_vitales WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha DESC LIMIT 20', [clinicaId, pacienteId]),
    query('SELECT id, fecha, firmada, vigencia_meses, observaciones FROM anamnesis WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY fecha DESC LIMIT 10', [clinicaId, pacienteId]),
  ]);
  const { alertas: al } = await alertas(clinicaId, pacienteId);
  return { ...d, historialSignos: historialSignos.rows, historialAnamnesis: historialAnamnesis.rows, alertas: al };
}

module.exports = { alertas, verificarMedicamentos, resumen };
