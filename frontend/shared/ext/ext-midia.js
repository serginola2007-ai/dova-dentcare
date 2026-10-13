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
  const fechaTexto = (iso) => { const t = new Date(`${iso}T12:00:00`).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '');
  const DIAS = [{ id: 0, label: 'Hoy' }, { id: 1, label: 'Mañana' }];
  let diaElegido = 0;
  const MAX_CHIPS = 2;

  const chip = (tono, txt, titulo) => `<span class="dova-badge dova-midia-chip ${tono ? 'dova-ext-badge-' + tono : ''}"${titulo ? ` title="${esc(titulo)}"` : ''}>${esc(txt)}</span>`;

  // Ordenados por importancia: solo los primeros se ven en la fila.
  function chips(p) {
    if (!p) return [];
    const out = [];
    const alertas = p.alertas || [];
    for (const a of alertas) if (a.nivel === 'critica') out.push(chip('critica', a.titulo, a.detalle));
    const que = (l) => [l.trabajo, l.pieza ? `pieza ${l.pieza}` : ''].filter(Boolean).join(' ');
    for (const l of p.laboratorio || []) if (!l.llego) out.push(chip('critica', `Laboratorio sin llegar: ${que(l)}`, l.fechaEstimada ? `Fecha estimada: ${fmtFecha(l.fechaEstimada)}` : ''));
    if (p.pagos && p.pagos.atrasado) out.push(chip('atencion', p.pagos.montoVencido !== undefined ? `Pagos atrasados: ${gs(p.pagos.montoVencido)}` : 'Pagos atrasados', 'Coordinar con recepción'));
    for (const c of p.consentimientos || []) out.push(chip('atencion', `Falta firmar: ${c}`));
    for (const a of alertas) if (a.nivel !== 'critica') out.push(chip('atencion', a.titulo, a.detalle));
    if (p.primeraVez) out.push(chip('info', 'Primera vez'));
    if (p.cumple) out.push(chip('info', `Cumple ${p.edad != null ? p.edad + ' años' : 'años'}`));
    for (const l of p.laboratorio || []) if (l.llego) out.push(chip('info', `Llegó del laboratorio: ${que(l)}`));
    if (p.presupuestosSinAceptar) out.push(chip('', p.presupuestosSinAceptar === 1 ? 'Presupuesto sin aceptar' : `${p.presupuestosSinAceptar} presupuestos sin aceptar`));
    return out;
  }

  function detalle(p, t, todos) {
    const partes = [];
    if (todos.length > MAX_CHIPS) partes.push(`<div class="dova-midia-chips">${todos.join(' ')}</div>`);
    const extra = [t.sillon_nombre ? `Sillón: ${esc(t.sillon_nombre)}` : '', t.duracion_minutos ? `Duración: ${t.duracion_minutos} min` : ''].filter(Boolean).join(' · ');
    if (extra) partes.push(`<div>${extra}</div>`);
    if (!p) return partes.join('');
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
    if (t.estado === 'no_asistio') return '<span class="dova-midia-est critica">No asistió</span>';
    if (t.finalizado_en || t.estado === 'atendido') return '<span class="dova-midia-est ok">Finalizado</span>';
    if (esHoy && t.en_sillon_en) return `<span class="dova-midia-est atencion">En consulta · ${hora(t.en_sillon_en)}</span>`;
    if (esHoy && t.llegada_en) return `<span class="dova-midia-est info">Llegó · ${hora(t.llegada_en)}</span>`;
    return t.estado === 'confirmado' ? '' : '<span class="dova-midia-sinconf">Sin confirmar</span>';
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
    const accion = (t) => {
      if (!esHoy || t.estado === 'no_asistio' || !puedeConsulta) return '';
      const txt = t.finalizado_en || t.estado === 'atendido' ? 'Ver consulta' : t.en_sillon_en ? 'Continuar consulta' : 'Iniciar consulta';
      return `<button type="button" class="dova-btn-link" data-ir-consulta="${t.paciente_id}/t${t.id}">${txt}</button>`;
    };
    const labs = (dia && dia.laboratoriosPorLlegar) || [];

    const resumen = [`${turnos.length} turno${turnos.length === 1 ? '' : 's'}`];
    if (r.conAlertaCritica) resumen.push(`<span class="dova-inicio-alerta">${r.conAlertaCritica} con alerta médica</span>`);
    if (r.laboratorioSinLlegar) resumen.push(`<span class="dova-inicio-alerta">${r.laboratorioSinLlegar} sin el trabajo de laboratorio</span>`);
    if (r.primeraVez) resumen.push(`${r.primeraVez} primera vez`);
    if (r.conPagosAtrasados) resumen.push(`${r.conPagosAtrasados} con pagos atrasados`);
    if (r.cumpleanos) resumen.push(`${r.cumpleanos} cumple años`);
    const labsVer = labs.slice(0, 3);

    cont.innerHTML = `
      <div class="dova-midia-cab">
        <p class="dova-inicio-sub">${esc(fechaTexto(fecha))}${turnos.length ? ' · ' + resumen.join(' · ') : ''}</p>
        <div class="dova-tabs dova-midia-dias" role="tablist" aria-label="Día">
          ${DIAS.map((d) => `<button type="button" role="tab" class="dova-tab ${d.id === diaElegido ? 'activo' : ''}" aria-selected="${d.id === diaElegido}" data-midia-dia="${d.id}">${d.label}</button>`).join('')}
        </div>
      </div>
      ${dia ? '' : '<p class="dova-nota">No se pudo preparar el resumen de los pacientes. La agenda se muestra igual.</p>'}
      ${turnos.length ? `<table class="dova-tabla dova-midia-tabla">
        <thead><tr><th>Hora</th><th>Paciente</th><th>Tener en cuenta</th><th></th></tr></thead>
        <tbody>
          ${turnos.map((t) => {
            const p = pac[t.paciente_id];
            const todos = chips(p);
            const visibles = todos.slice(0, MAX_CHIPS).join(' ');
            const resto = todos.length - MAX_CHIPS;
            const est = estadoFlujo(t, esHoy);
            return `
            <tr>
              <td data-th="Hora" class="dova-midia-hora"><div>${esc(String(t.hora_inicio).slice(0, 5))}${est ? `<div>${est}</div>` : ''}</div></td>
              <td data-th="Paciente"><div><button type="button" class="dova-btn-link dova-midia-nombre" data-ir-paciente="${t.paciente_id}">${esc(t.paciente_nombre || '')} ${esc(t.paciente_apellido || '')}</button>
                <div class="dova-midia-motivo">${esc(t.tratamiento_nombre || t.motivo || '')}</div></div></td>
              <td data-th="Tener en cuenta"><div class="dova-midia-chips">${visibles}
                <button type="button" class="dova-btn-link dova-midia-mas" data-midia-ver="${t.id}" aria-expanded="false" aria-controls="midia-det-${t.id}">${resto > 0 ? `+${resto} más` : 'Ver más'}</button></div></td>
              <td class="dova-midia-accion">${accion(t)}</td>
            </tr>
            <tr class="dova-midia-det" id="midia-det-${t.id}" hidden><td colspan="4"><div class="dova-midia-det-cuerpo">${detalle(p, t, todos)}</div></td></tr>`;
          }).join('')}
        </tbody>
      </table>` : `<p class="dova-atender-vacio">No tenés turnos para ${esHoy ? 'hoy' : 'mañana'}.</p>`}
      ${labsVer.length ? `
        <div class="dova-midia-labs">
          <h3 class="dova-section-title">Laboratorio por llegar</h3>
          <ul class="dova-atender-lista">${labsVer.map((l) => `<li><button type="button" class="dova-atender-fila" data-ir-paciente="${l.paciente_id}">
            <span class="dova-atender-txt">${esc(l.trabajo || 'Trabajo')}${l.pieza ? ` · pieza ${esc(l.pieza)}` : ''} — ${esc(l.paciente_nombre)} ${esc(l.paciente_apellido)}</span>
            <span class="dova-midia-labfecha ${l.atrasado ? 'atrasado' : ''}">${l.atrasado ? 'Atrasado · ' : ''}${esc(fmtFecha(l.fecha_estimada))}</span></button></li>`).join('')}</ul>
          ${labs.length > labsVer.length ? `<p class="dova-nota">Y ${labs.length - labsVer.length} más en Clínica → Laboratorio.</p>` : ''}
        </div>` : ''}`;

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
      if (!b.dataset.txt) b.dataset.txt = b.textContent.trim();
      b.textContent = fila.hidden ? b.dataset.txt : 'Ver menos';
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
