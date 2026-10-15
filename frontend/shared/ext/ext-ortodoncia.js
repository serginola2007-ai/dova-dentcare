/* Ortodoncia: tablero de la clínica y cuotas mensuales del tratamiento.
   - seccion(): quién está en tratamiento, a quién le toca control (o lo tiene atrasado) y quién debe cuotas.
   - cuotas(casoId): ver el plan de cuotas del caso o generarlo desde el honorario. Las cuotas generadas son
     las de siempre: aparecen en Mi pago, en el cobro online, en los avisos de cobro y en "quién debe". */
const DovaOrtodoncia = (() => {
  const X = DovaExt;
  const { esc, toast, puede } = X;
  const gs = (n) => Vistas.fmtGs(n);
  const FASE = { diagnostico: ['Diagnóstico', 'info'], activa: ['En tratamiento', 'ok'], contencion: ['Contención', 'info'] };

  async function seccion(root, navegar) {
    root.innerHTML = X.cargando;
    const d = await DOVA.get('/ortodoncia/panel');
    const r = d.resumen;
    const manage = puede('ortodoncia.manage');
    root.innerHTML = `<div class="dova-orto">
      <h2 class="dova-view-title">Ortodoncia</h2>
      <div class="dova-plat-resumen">
        <div><strong>${r.activos}</strong><span>en tratamiento</span></div>
        <div><strong>${r.controlesAtrasados}</strong><span>con el control atrasado</span></div>
        <div><strong>${r.conCuotasVencidas}</strong><span>con cuotas vencidas (${gs(r.montoVencido)})</span></div>
        <div><strong>${r.enContencion}</strong><span>en contención</span></div>
      </div>
      ${r.sinPlanDeCuotas ? `<p class="dova-nota">${r.sinPlanDeCuotas} ${r.sinPlanDeCuotas === 1 ? 'caso tiene' : 'casos tienen'} honorario pero todavía no tiene las cuotas generadas.</p>` : ''}
      ${d.casos.length ? `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Paciente</th><th>Aparato</th><th>Fase</th><th>Último control</th><th>Próximo control</th><th>Cuotas</th><th></th></tr></thead><tbody>
      ${d.casos.map((c) => `<tr>
        <td><strong>${esc(c.paciente)}</strong>${c.odontologo ? `<div class="dova-nota">${esc(c.odontologo)}</div>` : ''}</td>
        <td>${esc(X.etiqueta(c.aparato))}${c.alineador ? `<div class="dova-nota">Alineador ${c.alineador.actual}/${c.alineador.total}</div>` : ''}</td>
        <td>${X.badge(...(FASE[c.fase] || [c.fase, 'info']))}</td>
        <td>${c.ultimaVisita ? esc(X.fmtFecha(c.ultimaVisita)) : '<span class="dova-nota">Sin visitas</span>'}</td>
        <td>${c.proximoControl ? `${esc(X.fmtFecha(c.proximoControl))}${c.controlAtrasado ? ` ${X.badge(`atrasado ${c.controlAtrasado} d`, 'critica')}` : ''}` : '-'}</td>
        <td>${c.tienePlan ? `${c.cuotasPagadas}/${c.cuotasTotal}${c.cuotasVencidas ? ` ${X.badge(`${c.cuotasVencidas} vencida${c.cuotasVencidas === 1 ? '' : 's'}`, 'critica')}` : ''}` : (c.sinPlanDeCuotas ? '<span class="dova-nota">Sin generar</span>' : '-')}</td>
        <td class="dova-plat-acc"><button type="button" class="dova-btn-link" data-or-ficha="${c.pacienteId}">Ver ficha</button>
          ${puede('fotos_clinicas.manage', 'pacientes.clinical.view', 'historia_clinica.view') ? `<button type="button" class="dova-btn-link" data-or-fotos="${c.pacienteId}">Comparar fotos</button>` : ''}
          ${puede('ortodoncia.view', 'ortodoncia.manage') && (c.tienePlan || manage) ? `<button type="button" class="dova-btn-link" data-or-cuotas="${c.id}" data-or-pac="${esc(c.paciente)}">Cuotas</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="dova-vacio">No hay casos de ortodoncia en curso. Se cargan desde la ficha del paciente → Especialidades → Ortodoncia.</p>'}
    </div>`;
    root.querySelectorAll('[data-or-ficha]').forEach((b) => b.addEventListener('click', () => navegar('paciente', String(b.dataset.orFicha))));
    root.querySelectorAll('[data-or-fotos]').forEach((b) => b.addEventListener('click', () => DovaClinica.compararPaciente(b.dataset.orFotos)));
    root.querySelectorAll('[data-or-cuotas]').forEach((b) => b.addEventListener('click', () => cuotas(Number(b.dataset.orCuotas), { paciente: b.dataset.orPac, alCambiar: () => seccion(root, navegar) })));
  }

  async function cuotas(casoId, { paciente, alCambiar } = {}) {
    const box = X.modal(`Cuotas de ortodoncia${paciente ? ` — ${paciente}` : ''}`, '<div data-oc>Cargando…</div>', { ancho: 'ancho' });
    if (!box) return;
    const pintar = async () => {
      const cont = box.querySelector('[data-oc]');
      let d;
      try { d = await DOVA.get(`/ortodoncia/casos/${casoId}/cuotas`); } catch (e) { cont.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return; }
      const resumen = `<p>Honorario: <strong>${gs(d.honorario)}</strong> · Entrega inicial: <strong>${gs(d.entrega)}</strong>${d.cuotaMensual ? ` · Cuota mensual: <strong>${gs(d.cuotaMensual)}</strong>` : ''}</p>`;
      if (d.tienePlan) {
        cont.innerHTML = `${resumen}<table class="dova-tabla"><thead><tr><th>N°</th><th>Vence</th><th>Monto</th><th>Estado</th></tr></thead><tbody>
          ${d.cuotas.map((q) => `<tr><td>${q.numero}</td><td>${esc(X.fmtFecha(q.vencimiento))}</td><td>${gs(q.monto)}</td><td>${q.estado === 'pagada' ? X.badge('Pagada', 'ok') : (q.vencida ? X.badge('Vencida', 'critica') : X.badge('Pendiente', 'info'))}</td></tr>`).join('')}</tbody></table>
          <p class="dova-nota">La entrega inicial se registra como un cobro normal en la ficha del paciente. Las cuotas se cobran como siempre (caja, Mi pago, cobro online).</p>
          <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`;
      } else if (puede('ortodoncia.manage')) {
        cont.innerHTML = `${resumen}
          ${d.honorario > d.entrega ? `<form class="dova-ext-modal-form"><div class="dova-ext-form-grid">
            <div class="dova-ext-campo"><label for="oc-cant">Cantidad de cuotas mensuales</label><input id="oc-cant" type="number" min="1" max="60" step="1" value="${d.cuotaMensual ? Math.ceil((d.honorario - d.entrega) / d.cuotaMensual) : ''}" required /></div>
            <div class="dova-ext-campo"><label for="oc-ini">Fecha de inicio (la primera vence un mes después)</label><input id="oc-ini" type="date" value="${X.hoy()}" /></div></div>
            <p class="dova-nota">Saldo a financiar: <strong>${gs(d.honorario - d.entrega)}</strong>. La última cuota absorbe el redondeo.</p>
            <p class="dova-error-text" data-error hidden></p>
            <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">Generar cuotas</button></div></form>`
    : '<p class="dova-vacio">Cargá el honorario total del caso (ficha → Ortodoncia → Editar) para poder generar las cuotas.</p><div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>'}`;
        const form = cont.querySelector('form');
        if (form) form.addEventListener('submit', async (e) => {
          e.preventDefault(); const err = form.querySelector('[data-error]'); err.hidden = true;
          try {
            await DOVA.post(`/ortodoncia/casos/${casoId}/cuotas`, { cantidad: Number(form.querySelector('#oc-cant').value), primerVencimiento: form.querySelector('#oc-ini').value });
            toast('Cuotas generadas', 'ok'); if (alCambiar) alCambiar(); await pintar();
          } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        });
      } else {
        cont.innerHTML = `${resumen}<p class="dova-vacio">Todavía no se generaron las cuotas.</p><div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`;
      }
    };
    await pintar();
  }

  return { seccion, cuotas };
})();
window.DovaOrtodoncia = DovaOrtodoncia;
