/* DOVA — Estadísticas (Reportes → Estadísticas): indicadores y gráficos de la clínica.
   Uso: DovaEstadisticas.indicadores(contenedor, navegar). */
const DovaEstadisticas = (() => {
  const X = DovaExt;
  const { esc, fmtGs, etiqueta } = X;
  const { kpi, montar } = DovaSeccionBase;

  // ================================ INDICADORES ================================
  async function indicadores(root, nav) {
    montar(root, nav);
    const hoy = X.hoy();
    root.innerHTML = `<h2 class="dova-view-title">Estadísticas de la clínica</h2>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${hoy.slice(0, 7)}-01"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${hoy}"/></div>
      <div><label>Período rápido</label><select name="rapido"><option value="">—</option><option value="mes">Este mes</option><option value="3m">Últimos 3 meses</option><option value="anio">Este año</option><option value="12m">Últimos 12 meses</option></select></div><button class="dova-btn-primary">Ver</button></form>
      <div data-k></div><h3 class="dova-section-title">Tendencia mensual (últimos 12 meses)</h3><div class="dova-ext-graficos" data-g></div>`;
    const f = root.querySelector('[data-f]');
    f.rapido.addEventListener('change', () => {
      const v = f.rapido.value; if (!v) return;
      f.hasta.value = hoy;
      f.desde.value = v === 'mes' ? `${hoy.slice(0, 7)}-01` : v === 'anio' ? `${hoy.slice(0, 4)}-01-01` : X.sumarDias(hoy, v === '3m' ? -90 : -365);
    });
    const cargar = async () => {
      const k = await DOVA.get(`/kpis?desde=${f.desde.value}&hasta=${f.hasta.value}`);
      const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
      root.querySelector('[data-k]').innerHTML = `
        <h3 class="dova-section-title">Dinero</h3><div class="dova-ext-kpis">
          ${kpi(fmtGs(k.produccion.total), 'Trabajos realizados (Gs.)')}${kpi(fmtGs(k.cobranza.total), 'Cobrado', { sub: `${k.cobranza.pagos} pagos` })}
          ${kpi(pct(k.cobranza.tasaCobranza), 'Cobrado sobre lo realizado')}${kpi(k.cobranza.ticketPromedio ? fmtGs(k.cobranza.ticketPromedio) : '—', 'Cobro promedio por paciente')}
          ${kpi(k.agenda.produccionPorHora ? fmtGs(k.agenda.produccionPorHora) : '—', 'Ingreso por hora de atención')}</div>
        <h3 class="dova-section-title">Presupuestos</h3><div class="dova-ext-kpis">
          ${kpi(pct(k.presupuestos.tasaAceptacion), 'Presupuestos aceptados', { sub: `${k.presupuestos.aceptados} de ${k.presupuestos.presentados}` })}
          ${kpi(pct(k.presupuestos.tasaAceptacionMonto), 'Presupuestos aceptados (en Gs.)', { sub: `${fmtGs(k.presupuestos.montoAceptado)} de ${fmtGs(k.presupuestos.montoPresentado)}` })}</div>
        <h3 class="dova-section-title">Agenda</h3><div class="dova-ext-kpis">
          ${kpi(k.agenda.atendidos, 'Turnos atendidos', { sub: `de ${k.agenda.turnos} agendados` })}
          ${kpi(pct(k.agenda.tasaInasistencia), 'Pacientes que faltaron', { alerta: k.agenda.tasaInasistencia > 10, sub: `${k.agenda.noAsistio} no vinieron` })}
          ${kpi(pct(k.agenda.tasaCancelacion), 'Turnos cancelados', { sub: k.agenda.cancelacionesTardias !== null ? `${k.agenda.cancelacionesTardias} con < 24 h de aviso` : '' })}
          ${kpi(pct(k.agenda.tasaConfirmacion), 'Turnos confirmados')}
          ${kpi(k.agenda.sinCerrar, 'Turnos pasados sin cerrar', { alerta: k.agenda.sinCerrar > 0, sub: 'marcar atendido o no asistió' })}
          ${kpi(k.agenda.horasAtendidas, 'Horas de atención')}
          ${kpi(k.agenda.esperaPromedioMin !== null ? `${k.agenda.esperaPromedioMin} min` : '—', 'Espera promedio en sala')}
          ${kpi(k.agenda.atencionPromedioMin !== null ? `${k.agenda.atencionPromedioMin} min` : '—', 'Duración real promedio')}</div>
        <h3 class="dova-section-title">Pacientes</h3><div class="dova-ext-kpis">
          ${kpi(k.pacientes.nuevos, 'Pacientes nuevos', { sub: `${k.pacientes.primerasVisitas} primeras visitas atendidas` })}
          ${kpi(k.pacientes.activos, 'Pacientes activos (vinieron en los últimos 18 meses)')}${kpi(k.pacientes.inactivos, 'Pacientes inactivos')}
          ${kpi(pct(k.recalls.tasaAlDia), 'Controles periódicos al día', { sub: `${k.recalls.vencidos} vencidos de ${k.recalls.activos}` })}
          ${k.satisfaccion ? kpi(k.satisfaccion.nps, 'Satisfacción de pacientes', { sub: `${k.satisfaccion.encuestas} encuestas` }) : ''}</div>
        <div class="dova-ext-dos-col">
          <div><h3 class="dova-section-title">Por odontólogo</h3><table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Trabajos realizados</th><th>Atendidos</th><th>Faltaron</th></tr></thead><tbody>
            ${k.agenda.porOdontologo.map((o) => { const p = k.produccion.porOdontologo.find((x) => x.odontologo === o.nombre); return `<tr><td>${esc(o.nombre)}</td><td>${p ? fmtGs(p.produccion) : '-'}</td><td>${o.atendidos}</td><td>${pct(o.tasaInasistencia)}</td></tr>`; }).join('') || '<tr><td colspan="4">Sin datos.</td></tr>'}</tbody></table></div>
          <div><h3 class="dova-section-title">¿Cómo nos conocieron? (nuevos)</h3><table class="dova-tabla"><thead><tr><th>Fuente</th><th>Pacientes</th></tr></thead><tbody>
            ${k.pacientes.porFuente.map((x) => `<tr><td>${esc(etiqueta(x.fuente))}</td><td>${x.cantidad}</td></tr>`).join('') || '<tr><td colspan="2">Sin datos.</td></tr>'}</tbody></table>
            <h3 class="dova-section-title">Tratamientos más realizados</h3><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Sesiones</th></tr></thead><tbody>
            ${k.tratamientosMasRealizados.map((x) => `<tr><td>${esc(x.tratamiento)}</td><td>${x.sesiones}</td></tr>`).join('') || '<tr><td colspan="2">Sin datos.</td></tr>'}</tbody></table></div>
        </div>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
    const serie = await DOVA.get('/kpis/serie-mensual?meses=12');
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const et = serie.map((s) => `${MES[Number(s.periodo.slice(5)) - 1]} ${s.periodo.slice(2, 4)}`);
    const series = [
      { titulo: 'Cobranza', etiquetas: et, valores: serie.map((s) => s.cobranza), formato: 'gs' },
      { titulo: 'Trabajos realizados (Gs.)', etiquetas: et, valores: serie.map((s) => s.produccion), formato: 'gs' },
      { titulo: 'Turnos atendidos', etiquetas: et, valores: serie.map((s) => s.turnosAtendidos) },
      { titulo: 'Pacientes nuevos', etiquetas: et, valores: serie.map((s) => s.pacientesNuevos) },
      { titulo: 'Inasistencias', etiquetas: et, valores: serie.map((s) => s.inasistencias) },
    ];
    const g = root.querySelector('[data-g]');
    g.innerHTML = series.map((s) => X.grafico(s)).join('');
    X.activarGraficos(g, series);
  }

  return { indicadores };
})();
window.DovaEstadisticas = DovaEstadisticas;

DovaPantallas.registrar('indicadores', { dibujar: (contenedor, { navegar }) => DovaEstadisticas.indicadores(contenedor, navegar) });
