const { query } = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');
const { hoyIso } = require('../../utils/recurso');
const salud = require('../salud/salud.service');

/* "Preparar el día": para cada paciente con turno del odontólogo en la fecha,
   junta en un solo pedido lo que conviene saber antes de que entre al sillón:
   alertas médicas, si es primera vez, cumpleaños, última visita y próximo paso
   indicado, tratamiento en curso, presupuestos sin aceptar, consentimientos sin
   firmar, trabajos de laboratorio y si tiene pagos atrasados. Además lista los
   trabajos de laboratorio del odontólogo que tendrían que llegar en estos días.
   Todo sale de datos cargados; nada se inventa. */

const LAB_SIN_LLEGAR = ['solicitado', 'enviado', 'en_proceso', 'rehacer'];
const LAB_LLEGO = ['recibido', 'controlado'];

function validarFecha(fecha) {
  if (fecha === undefined || fecha === null || fecha === '') return hoyIso();
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha + 'T00:00:00Z'))) {
    throw new ApiError(400, 'Fecha inválida');
  }
  return fecha;
}

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null));

// Ejecuta fn sobre la lista de a pocos, para no acaparar el pool de conexiones.
async function deAPocos(lista, n, fn) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(...await Promise.all(lista.slice(i, i + n).map(fn)));
  return out;
}

async function preparar(clinicaId, odontologoId, fechaTxt, permisos) {
  const fecha = validarFecha(fechaTxt);
  const params = [clinicaId, fecha];
  let cond = "t.clinica_id=$1 AND t.fecha=$2 AND t.estado NOT IN ('cancelado','reprogramado')";
  if (odontologoId) { params.push(odontologoId); cond += ` AND t.odontologo_id=$${params.length}`; }
  const turnos = (await query(
    `SELECT t.id, t.paciente_id, t.odontologo_id, t.primera_vez
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id AND p.clinica_id = t.clinica_id
      WHERE ${cond}
      ORDER BY t.hora_inicio LIMIT 200`,
    params
  )).rows;

  const ids = [...new Set(turnos.map((t) => t.paciente_id))];
  const pacientes = {};
  const resumen = { pacientes: ids.length, conAlertaCritica: 0, primeraVez: 0, conPagosAtrasados: 0, laboratorioSinLlegar: 0, cumpleanos: 0 };

  const labParams = [clinicaId, fecha];
  let labCond = `l.clinica_id=$1 AND l.estado = ANY($3::text[]) AND l.fecha_estimada IS NOT NULL AND l.fecha_estimada <= ($2::date + 3)`;
  labParams.push(LAB_SIN_LLEGAR);
  if (odontologoId) { labParams.push(odontologoId); labCond += ` AND l.odontologo_id=$${labParams.length}`; }
  const laboratoriosPorLlegar = (await query(
    `SELECT l.id, l.trabajo, l.pieza, l.laboratorio_nombre, l.estado, l.fecha_estimada,
            (l.fecha_estimada < $2::date) AS atrasado,
            p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
       FROM laboratorio l JOIN pacientes p ON p.id = l.paciente_id AND p.clinica_id = l.clinica_id
      WHERE ${labCond} AND p.activo
      ORDER BY l.fecha_estimada ASC LIMIT 50`,
    labParams
  )).rows.map((l) => ({ ...l, fecha_estimada: iso(l.fecha_estimada) }));

  if (!ids.length) return { fecha, pacientes, resumen, laboratoriosPorLlegar };

  const verMontos = permisos.includes('pagos.view');
  const verSalud = permisos.includes('salud.view') || permisos.includes('pacientes.clinical.view');

  const [base, previas, ultimas, planes, presup, consent, labs, cuotas, saldos] = await Promise.all([
    query(`SELECT id, fecha_nacimiento FROM pacientes WHERE clinica_id=$1 AND id = ANY($2::int[])`, [clinicaId, ids]),
    // Primera vez real: no tiene ningún turno atendido antes de esta fecha.
    query(`SELECT DISTINCT paciente_id FROM turnos WHERE clinica_id=$1 AND paciente_id = ANY($2::int[]) AND fecha < $3 AND estado='atendido'`, [clinicaId, ids, fecha]),
    query(`SELECT DISTINCT ON (h.paciente_id) h.paciente_id, h.fecha, h.procedimiento, h.proxima_accion
             FROM historia_clinica h WHERE h.clinica_id=$1 AND h.paciente_id = ANY($2::int[]) AND h.fecha <= $3
            ORDER BY h.paciente_id, h.fecha DESC, h.creado_en DESC`, [clinicaId, ids, fecha]),
    query(`SELECT paciente_id, nombre, estado, sesiones_realizadas, sesiones_totales FROM planes_tratamiento
            WHERE clinica_id=$1 AND paciente_id = ANY($2::int[]) AND estado IN ('pendiente','aprobado','en_proceso')
            ORDER BY creado_en`, [clinicaId, ids]),
    query(`SELECT paciente_id, COUNT(*)::int AS n FROM presupuestos WHERE clinica_id=$1 AND paciente_id = ANY($2::int[]) AND estado IN ('borrador','enviado') GROUP BY paciente_id`, [clinicaId, ids]),
    query(`SELECT paciente_id, procedimiento FROM consentimientos WHERE clinica_id=$1 AND paciente_id = ANY($2::int[]) AND estado='pendiente' ORDER BY fecha`, [clinicaId, ids]),
    query(`SELECT paciente_id, trabajo, pieza, estado, fecha_estimada FROM laboratorio
            WHERE clinica_id=$1 AND paciente_id = ANY($2::int[]) AND estado = ANY($3::text[]) ORDER BY fecha_estimada NULLS LAST`,
    [clinicaId, ids, [...LAB_SIN_LLEGAR, ...LAB_LLEGO]]),
    query(`SELECT pp.paciente_id, COUNT(*)::int AS vencidas, COALESCE(SUM(c.monto),0) AS monto
             FROM cuotas c JOIN planes_pago pp ON pp.id = c.plan_pago_id
            WHERE pp.clinica_id=$1 AND pp.paciente_id = ANY($2::int[]) AND pp.estado='activo'
              AND c.estado IN ('pendiente','vencida') AND c.vencimiento < $3
            GROUP BY pp.paciente_id`, [clinicaId, ids, fecha]),
    // Saldo de cuenta: presupuestos aceptados − pagos − ajustes (igual que la ficha).
    query(`SELECT p.id AS paciente_id,
                  COALESCE((SELECT SUM(total) FROM presupuestos pr WHERE pr.clinica_id=$1 AND pr.paciente_id=p.id AND pr.estado='aceptado'),0)
                - COALESCE((SELECT SUM(monto) FROM pagos pg WHERE pg.clinica_id=$1 AND pg.paciente_id=p.id AND pg.estado='pagado'),0)
                - COALESCE((SELECT SUM(CASE WHEN a.tipo='recargo' THEN -a.monto ELSE a.monto END) FROM ajustes_cuenta a WHERE a.clinica_id=$1 AND a.paciente_id=p.id AND NOT a.anulado),0) AS saldo
             FROM pacientes p WHERE p.clinica_id=$1 AND p.id = ANY($2::int[])`, [clinicaId, ids]),
  ]);

  const conPrevia = new Set(previas.rows.map((r) => r.paciente_id));
  const [, mes, dia] = fecha.split('-');
  for (const id of ids) pacientes[id] = { alertas: [], planes: [], consentimientos: [], laboratorio: [] };
  for (const b of base.rows) {
    const nac = iso(b.fecha_nacimiento);
    const P = pacientes[b.id];
    if (nac) {
      P.edad = Number(fecha.slice(0, 4)) - Number(nac.slice(0, 4)) - ((fecha.slice(5) < nac.slice(5)) ? 1 : 0);
      if (nac.slice(5) === `${mes}-${dia}`) { P.cumple = true; resumen.cumpleanos += 1; }
    }
  }
  for (const t of turnos) {
    const P = pacientes[t.paciente_id];
    if (!conPrevia.has(t.paciente_id) && !P.primeraVez) { P.primeraVez = true; resumen.primeraVez += 1; }
  }
  for (const u of ultimas.rows) {
    pacientes[u.paciente_id].ultimaVisita = { fecha: iso(u.fecha), procedimiento: u.procedimiento || null, proximaAccion: u.proxima_accion || null };
  }
  for (const pl of planes.rows) pacientes[pl.paciente_id].planes.push({ nombre: pl.nombre, estado: pl.estado, sesiones: pl.sesiones_totales ? `${pl.sesiones_realizadas || 0}/${pl.sesiones_totales}` : null });
  for (const pr of presup.rows) pacientes[pr.paciente_id].presupuestosSinAceptar = pr.n;
  for (const c of consent.rows) pacientes[c.paciente_id].consentimientos.push(c.procedimiento);
  for (const l of labs.rows) {
    const llego = LAB_LLEGO.includes(l.estado);
    pacientes[l.paciente_id].laboratorio.push({ trabajo: l.trabajo, pieza: l.pieza, estado: l.estado, llego, fechaEstimada: iso(l.fecha_estimada) });
  }
  for (const id of ids) if (pacientes[id].laboratorio.some((l) => !l.llego)) resumen.laboratorioSinLlegar += 1;

  const saldoDe = new Map(saldos.rows.map((s) => [s.paciente_id, Math.round(Number(s.saldo) * 100) / 100]));
  const cuotasDe = new Map(cuotas.rows.map((c) => [c.paciente_id, c]));
  for (const id of ids) {
    const c = cuotasDe.get(id);
    const saldo = saldoDe.get(id) || 0;
    if (!c && saldo <= 0) continue;
    // Sin permiso de pagos solo se avisa que hay algo pendiente, sin montos.
    pacientes[id].pagos = verMontos
      ? { atrasado: !!c, cuotasVencidas: c ? c.vencidas : 0, montoVencido: c ? Number(c.monto) : 0, saldo }
      : { atrasado: !!c, cuotasVencidas: c ? c.vencidas : 0 };
    if (c) resumen.conPagosAtrasados += 1;
  }

  if (verSalud) {
    await deAPocos(ids, 4, async (id) => {
      const r = await salud.alertas(clinicaId, id).catch(() => null);
      if (!r) return;
      // Solo lo que cambia cómo se atiende: críticas y de atención (la medicación sola es informativa).
      pacientes[id].alertas = r.alertas
        .filter((a) => a.nivel === 'critica' || a.nivel === 'atencion')
        .slice(0, 6)
        .map((a) => ({ nivel: a.nivel, titulo: a.titulo, detalle: a.detalle || '' }));
      if (pacientes[id].alertas.some((a) => a.nivel === 'critica')) resumen.conAlertaCritica += 1;
    });
  }

  return { fecha, pacientes, resumen, laboratoriosPorLlegar };
}

module.exports = { preparar, validarFecha };
