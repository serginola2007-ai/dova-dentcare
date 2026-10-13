/* Mi día del odontólogo: la agenda de hoy (o de mañana, para prepararla la
   tarde anterior) con lo que conviene saber de cada paciente antes de que
   entre: alertas médicas, primera vez, cumpleaños, pagos atrasados,
   laboratorio, presupuestos y consentimientos pendientes, última visita y el
   próximo paso indicado. Los datos salen de GET /api/pendientes/mi-dia.
   Uso: DovaMiDia.montar(contenedor, { navegarAConsulta, navegarAFicha }) */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gs = (n) => 'Gs. ' + Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  const fechaLocal = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '');
  const DIAS = [{ id: 0, label: 'Hoy' }, { id: 1, label: 'Mañana' }];
  let diaElegido = 0;

  const chip = (tono, txt, titulo) => `<span class="dova-badge dova-midia-chip ${tono ? 'dova-ext-badge-' + tono : ''}"${titulo ? ` title="${esc(titulo)}"` : ''}>${esc(txt)}</span>`;

  function chips(p) {
    if (!p) return '';
    const out = [];
    for (const a of p.alertas || []) if (a.nivel === 'critica') out.push(chip('critica', a.titulo, a.detalle));
    const otras = (p.alertas || []).filter((a) => a.nivel !== 'critica').length;
    if (otras) out.push(chip('atencion', otras === 1 ? (p.alertas.find((a) => a.nivel !== 'critica').titulo) : `${otras} avisos de salud`));
    if (p.primeraVez) out.push(chip('info', 'Primera vez'));
    if (p.cumple) out.push(chip('info', `Cumple ${p.edad != null ? p.edad + ' años' : 'años'}`));
    for (const l of p.laboratorio || []) {
      const que = [l.trabajo, l.pieza ? `pieza ${l.pieza}` : ''].filter(Boolean).join(' ');
      out.push(l.llego ? chip('info', `Llegó del laboratorio: ${que}`) : chip('critica', `Laboratorio sin llegar: ${que}`, l.fechaEstimada ? `Fecha estimada: ${fmtFecha(l.fechaEstimada)}` : ''));
    }
    if (p.pagos && p.pagos.atrasado) out.push(chip('atencion', p.pagos.montoVencido !== undefined ? `Pagos atrasados: ${gs(p.pagos.montoVencido)}` : 'Pagos atrasados', 'Coordinar con recepción'));
    else if (p.pagos && p.pagos.saldo > 0) out.push(chip('', `Saldo ${gs(p.pagos.saldo)}`));
    if (p.presupuestosSinAceptar) out.push(chip('', p.presupuestosSinAceptar === 1 ? 'Presupuesto sin aceptar' : `${p.presupuestosSinAceptar} presupuestos sin aceptar`));
    for (const c of p.consentimientos || []) out.push(chip('atencion', `Falta firmar: ${c}`));
    return out.join(' ');
  }

  function detalle(p) {
    if (!p) return '';
    const partes = [];
    if (p.ultimaVisita) {
      partes.push(`<div><strong>Última visita (${esc(fmtFecha(p.ultimaVisita.fecha))}):</strong> ${esc(p.ultimaVisita.procedimiento || 'sin detalle')}</div>`);
      if (p.ultimaVisita.proximaAccion) partes.push(`<div><strong>Próximo paso indicado:</strong> ${esc(p.ultimaVisita.proximaAccion)}</div>`);
    } else partes.push('<div>Sin consultas anteriores registradas.</div>');
    if ((p.planes || []).length) partes.push(`<div><strong>En curso:</strong> ${p.planes.map((pl) => esc(pl.nombre) + (pl.sesiones ? ` (sesión ${esc(pl.sesiones)})` : '')).join(' · ')}</div>`);
    if ((p.alertas || []).length) partes.push(`<div><strong>Salud:</strong><ul class="dova-midia-alertas">${p.alertas.map((a) => `<li class="${a.nivel === 'critica' ? 'critica' : ''}">${esc(a.titulo)}${a.detalle ? ` — ${esc(a.detalle)}` : ''}</li>`).join('')}</ul></div>`);
    if (p.pagos && p.pagos.saldo !== undefined && p.pagos.saldo > 0) partes.push(`<div><strong>Saldo de cuenta:</strong> ${gs(p.pagos.saldo)}${p.pagos.cuotasVencidas ? ` · ${p.pagos.cuotasVencidas} cuota(s) vencida(s)` : ''}</div>`);
    return partes.join('');
  }

  function estadoFlujo(t, esHoy) {
    if (t.estado === 'no_asistio') return '<span class="dova-badge dova-ext-badge-critica">No asistió</span>';
    if (t.finalizado_en || t.estado === 'atendido') return '<span class="dova-badge dova-badge-ok">Finalizado</span>';
    if (esHoy && t.en_sillon_en) return `<span class="dova-badge dova-ext-badge-atencion">En consulta · ${hora(t.en_sillon_en)}</span>`;
    if (esHoy && t.llegada_en) return `<span class="dova-badge dova-ext-badge-info">En espera · ${hora(t.llegada_en)}</span>`;
    return `<span class="dova-badge">${t.estado === 'confirmado' ? 'Confirmado' : 'Reservado'}</span>`;
  }

  async function pintar(cont, nav) {
    const yo = DOVA.usuarioActual() || {};
    const fecha = fechaLocal(diaElegido);
    const esHoy = diaElegido === 0;
    cont.setAttribute('aria-busy', 'true');
    let turnos = []; let dia = null;
    try {
      [turnos, dia] = await Promise.all([
        DOVA.get(`/agenda?desde=${fecha}&hasta=${fecha}${yo.odontologoId ? `&odontologoId=${yo.odontologoId}` : ''}`).catch(() => []),
        DOVA.get(`/pendientes/mi-dia?fecha=${fecha}`).catch(() => null),
      ]);
    } finally { cont.removeAttribute('aria-busy'); }
    turnos = (turnos || []).filter((t) => !['cancelado', 'reprogramado'].includes(t.estado))
      .sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
    const pac = (dia && dia.pacientes) || {};
    const r = (dia && dia.resumen) || {};
    const puedeConsulta = DOVA.tienePermiso('historia_clinica.edit');
    const kpi = (v, label, alerta) => `<div class="dova-ext-kpi ${alerta ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${v}</div><div class="dova-ext-kpi-label">${esc(label)}</div></div>`;
    const accion = (t) => {
      if (!esHoy || t.estado === 'no_asistio' || !puedeConsulta) return '';
      const txt = t.finalizado_en || t.estado === 'atendido' ? 'Ver consulta' : t.en_sillon_en ? 'Continuar consulta' : 'Iniciar consulta';
      return `<button type="button" class="dova-btn-link" data-ir-consulta="${t.paciente_id}/t${t.id}">${txt}</button>`;
    };
    const labs = (dia && dia.laboratoriosPorLlegar) || [];

    cont.innerHTML = `
      <div class="dova-midia-cab">
        <h3 class="dova-section-title">Agenda de ${esHoy ? 'hoy' : 'mañana'} <span class="dova-midia-fecha">${esc(fmtFecha(fecha))}</span></h3>
        <div class="dova-tabs dova-midia-dias" role="tablist" aria-label="Día">
          ${DIAS.map((d) => `<button type="button" role="tab" class="dova-tab ${d.id === diaElegido ? 'activo' : ''}" aria-selected="${d.id === diaElegido}" data-midia-dia="${d.id}">${d.label}</button>`).join('')}
        </div>
      </div>
      ${dia ? `<div class="dova-ext-kpis dova-midia-kpis">
        ${kpi(turnos.length, 'Turnos')}
        ${kpi(r.conAlertaCritica || 0, 'Con alerta médica importante', r.conAlertaCritica > 0)}
        ${kpi(r.primeraVez || 0, 'Primera vez')}
        ${kpi(r.laboratorioSinLlegar || 0, 'Esperan un trabajo que no llegó', r.laboratorioSinLlegar > 0)}
        ${kpi(r.conPagosAtrasados || 0, 'Con pagos atrasados', r.conPagosAtrasados > 0)}
        ${r.cumpleanos ? kpi(r.cumpleanos, 'Cumplen años') : ''}
      </div>` : '<p class="dova-nota">No se pudo preparar el resumen de los pacientes. La agenda se muestra igual.</p>'}
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-midia-tabla">
        <thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Sillón</th><th>Estado</th><th>Tener en cuenta</th><th></th></tr></thead>
        <tbody>
          ${turnos.map((t) => {
            const p = pac[t.paciente_id];
            const ch = chips(p);
            return `
            <tr>
              <td data-th="Hora">${esc(String(t.hora_inicio).slice(0, 5))}</td>
              <td data-th="Paciente"><button type="button" class="dova-btn-link" data-ir-paciente="${t.paciente_id}">${esc(t.paciente_nombre || '')} ${esc(t.paciente_apellido || '')}</button></td>
              <td data-th="Motivo">${esc(t.tratamiento_nombre || t.motivo || '-')}${t.duracion_minutos ? ` <span class="dova-midia-dur">${t.duracion_minutos} min</span>` : ''}</td>
              <td data-th="Sillón">${esc(t.sillon_nombre || '-')}</td>
              <td data-th="Estado">${estadoFlujo(t, esHoy)}</td>
              <td data-th="Tener en cuenta"><div class="dova-midia-chips">${ch || '<span class="dova-midia-nada">Nada especial</span>'}${p ? ` <button type="button" class="dova-btn-link" data-midia-ver="${t.id}" aria-expanded="false" aria-controls="midia-det-${t.id}">Ver más</button>` : ''}</div></td>
              <td>${accion(t)}</td>
            </tr>
            ${p ? `<tr class="dova-midia-det" id="midia-det-${t.id}" hidden><td colspan="7"><div class="dova-midia-det-cuerpo">${detalle(p)}</div></td></tr>` : ''}`;
          }).join('') || `<tr><td colspan="7">No tenés turnos para ${esHoy ? 'hoy' : 'mañana'}.</td></tr>`}
        </tbody>
      </table></div>
      ${labs.length ? `
        <h3 class="dova-section-title">Trabajos de laboratorio por llegar</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla">
          <thead><tr><th>Paciente</th><th>Trabajo</th><th>Laboratorio</th><th>Fecha estimada</th></tr></thead>
          <tbody>${labs.map((l) => `<tr>
            <td data-th="Paciente"><button type="button" class="dova-btn-link" data-ir-paciente="${l.paciente_id}">${esc(l.paciente_nombre)} ${esc(l.paciente_apellido)}</button></td>
            <td data-th="Trabajo">${esc(l.trabajo || '-')}${l.pieza ? ` · pieza ${esc(l.pieza)}` : ''}</td>
            <td data-th="Laboratorio">${esc(l.laboratorio_nombre || '-')}</td>
            <td data-th="Fecha estimada">${esc(fmtFecha(l.fecha_estimada))} ${l.atrasado ? '<span class="dova-badge dova-ext-badge-critica">Atrasado</span>' : ''}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}`;

    cont.querySelectorAll('[data-midia-dia]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.midiaDia);
      if (n === diaElegido) return;
      diaElegido = n; pintar(cont, nav);
    }));
    cont.querySelectorAll('[data-midia-ver]').forEach((b) => b.addEventListener('click', () => {
      const fila = cont.querySelector(`#midia-det-${b.dataset.midiaVer}`);
      if (!fila) return;
      fila.hidden = !fila.hidden;
      b.setAttribute('aria-expanded', String(!fila.hidden));
      b.textContent = fila.hidden ? 'Ver más' : 'Ver menos';
    }));
    cont.querySelectorAll('[data-ir-consulta]').forEach((b) => b.addEventListener('click', () => nav.navegarAConsulta(b.dataset.irConsulta)));
    cont.querySelectorAll('[data-ir-paciente]').forEach((b) => b.addEventListener('click', () => nav.navegarAFicha(Number(b.dataset.irPaciente))));
  }

  function montar(cont, nav) {
    if (!cont) return Promise.resolve();
    return pintar(cont, nav);
  }

  window.DovaMiDia = { montar };
})();
