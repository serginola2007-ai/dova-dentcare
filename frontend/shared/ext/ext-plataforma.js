/* Plataforma (solo para el proveedor de DOVA) y "Mi plan" (para cada clínica).
   - seccion(): las clínicas que alquilan DOVA: plan, módulos, si están al día,
     suspender / reactivar y registrar el pago de cada mes. No muestra datos de pacientes.
   - tarjetaMiPlan(): en Configuración, qué incluye el plan de la clínica. */
const DovaPlataforma = (() => {
  const X = DovaExt;
  const { esc, toast } = X;
  const gs = (n) => Vistas.fmtGs(n);
  const mesActual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date()).slice(0, 7);

  function estadoDe(c) {
    if (!c.activa) return `${X.badge('Suspendida', 'critica')}${c.motivoSuspension ? `<div class="dova-nota">${esc(c.motivoSuspension)}</div>` : ''}`;
    if (c.mesesAtraso > 0) return X.badge(`Debe ${c.mesesAtraso} ${c.mesesAtraso === 1 ? 'mes' : 'meses'}`, 'atencion');
    return X.badge('Al día', 'ok');
  }

  async function seccion(root) {
    root.innerHTML = X.cargando || '<div class="dova-cargando">Cargando…</div>';
    const [clinicas, cat] = await Promise.all([DOVA.get('/plataforma/clinicas'), DOVA.get('/plataforma/catalogo')]);
    const activas = clinicas.filter((c) => c.activa);
    const mensual = activas.reduce((a, c) => a + c.mensualidad, 0);
    root.innerHTML = `<div class="dova-plat">
      <div class="dova-view-header"><h2 class="dova-view-title">Plataforma</h2><button type="button" class="dova-btn-primary" data-plat-nueva>+ Nueva clínica</button></div>
      <p class="dova-nota">Las clínicas que usan DOVA. Acá cambiás su plan, las suspendés o anotás sus pagos. Nunca ves datos de sus pacientes.</p>
      <div class="dova-plat-resumen"><div><strong>${clinicas.length}</strong><span>clínicas</span></div><div><strong>${activas.length}</strong><span>activas</span></div><div><strong>${gs(mensual)}</strong><span>por mes (activas)</span></div></div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Clínica</th><th>Código</th><th>Plan</th><th>Mensualidad</th><th>Último mes pagado</th><th>Estado</th><th></th></tr></thead><tbody>
      ${clinicas.map((c) => `<tr>
        <td><strong>${esc(c.nombre)}</strong><div class="dova-nota">${c.usuarios} usuarios</div></td>
        <td><code>${esc(c.slug)}</code></td>
        <td>${esc(c.nombrePlan)}${c.modulosExtra.length || c.modulosQuitar.length ? ' <span class="dova-nota">(ajustado)</span>' : ''}</td>
        <td>${c.mensualidad ? gs(c.mensualidad) : '-'}</td>
        <td>${esc(c.ultimoPeriodoPagado || '-')}</td>
        <td>${estadoDe(c)}</td>
        <td class="dova-plat-acc">
          <button type="button" class="dova-btn-link" data-plat-plan="${c.id}">Plan</button>
          <button type="button" class="dova-btn-link" data-plat-pagos="${c.id}">Pagos</button>
          ${c.activa ? `<button type="button" class="dova-btn-link" data-plat-susp="${c.id}">Suspender</button>` : `<button type="button" class="dova-btn-link" data-plat-react="${c.id}">Reactivar</button>`}
        </td></tr>`).join('')}
      </tbody></table></div></div>`;
    const por = (id) => clinicas.find((c) => c.id === Number(id));
    const recargar = () => seccion(root);
    root.querySelector('[data-plat-nueva]').addEventListener('click', () => nueva(cat, recargar));
    root.querySelectorAll('[data-plat-plan]').forEach((b) => b.addEventListener('click', () => editarPlan(por(b.dataset.platPlan), cat, recargar)));
    root.querySelectorAll('[data-plat-pagos]').forEach((b) => b.addEventListener('click', () => pagos(por(b.dataset.platPagos), recargar)));
    root.querySelectorAll('[data-plat-susp]').forEach((b) => b.addEventListener('click', () => suspender(por(b.dataset.platSusp), recargar)));
    root.querySelectorAll('[data-plat-react]').forEach((b) => b.addEventListener('click', async () => {
      try { await DOVA.post(`/plataforma/clinicas/${b.dataset.platReact}/reactivar`, {}); toast('Clínica reactivada', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  const opcionesPlan = (cat, actual) => cat.planes.map((p) => `<option value="${p.clave}" ${p.clave === actual ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');

  function nueva(cat, recargar) {
    const box = X.modal('Nueva clínica', `<form class="dova-ext-modal-form">
      <div class="dova-ext-campo"><label for="pl-nombre">Nombre de la clínica *</label><input id="pl-nombre" required maxlength="150" /></div>
      <div class="dova-ext-campo"><label for="pl-slug">Código para ingresar *</label><input id="pl-slug" required maxlength="60" pattern="[a-z0-9][a-z0-9\\-]{1,59}" placeholder="ej. sonrisa-luque" autocapitalize="none" /><span class="dova-nota">Minúsculas, números y guiones. Es lo que escribe la clínica en "Entro a otra clínica".</span></div>
      <div class="dova-ext-campo"><label for="pl-plan">Plan</label><select id="pl-plan">${opcionesPlan(cat, 'esencial')}</select></div>
      <div class="dova-ext-campo"><label for="pl-mens">Mensualidad (Gs.)</label><input id="pl-mens" type="number" min="0" step="1" value="0" /></div>
      <div class="dova-ext-campo"><label for="pl-adm">Nombre de quien administra</label><input id="pl-adm" maxlength="120" placeholder="Administrador" /></div>
      <p class="dova-error-text" data-error hidden></p>
      <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">Crear clínica</button></div>
    </form>`);
    const form = box.querySelector('form'); const err = form.querySelector('[data-error]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.hidden = true;
      try {
        const r = await DOVA.post('/plataforma/clinicas', { nombre: form.querySelector('#pl-nombre').value.trim(), slug: form.querySelector('#pl-slug').value.trim().toLowerCase(), plan: form.querySelector('#pl-plan').value, mensualidad: Number(form.querySelector('#pl-mens').value || 0), adminNombre: form.querySelector('#pl-adm').value.trim() });
        form.outerHTML = `<div class="dova-plat-clave"><p><strong>Clínica creada.</strong> Pasale estos datos a quien la administra:</p>
          <p>Código de la clínica: <code>${esc(r.slug)}</code><br>Usuario: <code>${esc(r.usuario)}</code><br>Contraseña temporal: <code>${esc(r.claveTemporal)}</code></p>
          <p class="dova-nota">${esc(r.aviso)}</p><div class="dova-modal-actions"><button type="button" class="dova-btn-primary" data-listo>Listo</button></div></div>`;
        box.querySelector('[data-listo]').addEventListener('click', () => { X.cerrarModal(); recargar(); });
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  function editarPlan(c, cat, recargar) {
    const filas = cat.modulos.map((m) => {
      const base = cat.planes.findIndex((p) => p.clave === m.desde);
      return `<tr data-mod="${m.clave}" data-desde="${base}"><td>${esc(m.nombre)}</td><td>${esc((cat.planes[base] || {}).nombre)}</td>
        <td><select data-mod-sel><option value="plan">Según el plan</option><option value="extra">Darle igual</option><option value="quitar">Quitarle</option></select></td></tr>`;
    }).join('');
    const box = X.modal(`Plan de ${c.nombre}`, `<form class="dova-ext-modal-form">
      <div class="dova-ext-form-grid">
        <div class="dova-ext-campo"><label for="pe-plan">Plan</label><select id="pe-plan">${opcionesPlan(cat, c.plan)}</select></div>
        <div class="dova-ext-campo"><label for="pe-mens">Mensualidad (Gs.)</label><input id="pe-mens" type="number" min="0" step="1" value="${c.mensualidad}" /></div>
      </div>
      <p class="dova-nota">Podés darle a una clínica un módulo de un plan superior, o quitarle uno de su plan, sin cambiarle el plan.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Módulo</th><th>Desde</th><th>Para esta clínica</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="dova-error-text" data-error hidden></p>
      <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">Guardar</button></div>
    </form>`, { ancho: 'ancho' });
    const form = box.querySelector('form'); const err = form.querySelector('[data-error]');
    form.querySelectorAll('tr[data-mod]').forEach((tr) => { tr.querySelector('select').value = c.modulosExtra.includes(tr.dataset.mod) ? 'extra' : (c.modulosQuitar.includes(tr.dataset.mod) ? 'quitar' : 'plan'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.hidden = true;
      const sel = (v) => [...form.querySelectorAll('tr[data-mod]')].filter((tr) => tr.querySelector('select').value === v).map((tr) => tr.dataset.mod);
      try {
        await DOVA.put(`/plataforma/clinicas/${c.id}`, { plan: form.querySelector('#pe-plan').value, mensualidad: Number(form.querySelector('#pe-mens').value || 0), modulosExtra: sel('extra'), modulosQuitar: sel('quitar') });
        toast('Plan guardado', 'ok'); X.cerrarModal(); recargar();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  function suspender(c, recargar) {
    const box = X.modal(`Suspender ${c.nombre}`, `<form class="dova-ext-modal-form">
      <p>Nadie de esta clínica va a poder usar DOVA hasta que la reactives. Sus datos no se tocan.</p>
      <div class="dova-ext-campo"><label for="ps-mot">Motivo (lo ven al intentar entrar)</label><input id="ps-mot" maxlength="200" value="Falta de pago" /></div>
      <p class="dova-error-text" data-error hidden></p>
      <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">Suspender</button></div>
    </form>`);
    const form = box.querySelector('form'); const err = form.querySelector('[data-error]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.hidden = true;
      try { await DOVA.post(`/plataforma/clinicas/${c.id}/suspender`, { motivo: form.querySelector('#ps-mot').value.trim() }); toast('Clínica suspendida', 'ok'); X.cerrarModal(); recargar(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  async function pagos(c, recargar) {
    const box = X.modal(`Pagos de ${c.nombre}`, '<div data-pg>Cargando…</div>', { ancho: 'ancho' });
    const pintar = async () => {
      const lista = await DOVA.get(`/plataforma/clinicas/${c.id}/pagos`);
      box.querySelector('[data-pg]').innerHTML = `
        <form class="dova-ext-modal-form dova-plat-pago">
          <div class="dova-ext-form-grid">
            <div class="dova-ext-campo"><label for="pg-mes">Mes que paga</label><input id="pg-mes" type="month" required value="${mesActual()}" /></div>
            <div class="dova-ext-campo"><label for="pg-monto">Monto (Gs.)</label><input id="pg-monto" type="number" min="0" step="1" required value="${c.mensualidad || ''}" /></div>
            <div class="dova-ext-campo"><label for="pg-nota">Nota</label><input id="pg-nota" maxlength="200" placeholder="Transferencia, efectivo…" /></div>
          </div>
          <p class="dova-error-text" data-error hidden></p>
          <div class="dova-modal-actions"><button type="submit" class="dova-btn-primary">Anotar pago</button></div>
        </form>
        ${lista.length ? `<table class="dova-tabla"><thead><tr><th>Mes</th><th>Monto</th><th>Pagó el</th><th>Nota</th><th></th></tr></thead><tbody>${lista.map((p) => `<tr><td>${esc(p.periodo)}</td><td>${gs(p.monto)}</td><td>${esc(Vistas.fmtFecha(p.fecha_pago))}</td><td>${esc(p.nota || '')}</td><td><button type="button" class="dova-btn-link" data-pg-del="${p.id}">Borrar</button></td></tr>`).join('')}</tbody></table>` : '<p class="dova-vacio">Todavía no hay pagos anotados.</p>'}
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`;
      const form = box.querySelector('form'); const err = form.querySelector('[data-error]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); err.hidden = true;
        try { await DOVA.post(`/plataforma/clinicas/${c.id}/pagos`, { periodo: form.querySelector('#pg-mes').value, monto: Number(form.querySelector('#pg-monto').value), nota: form.querySelector('#pg-nota').value.trim() }); toast('Pago anotado', 'ok'); await pintar(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      box.querySelectorAll('[data-pg-del]').forEach((b) => b.addEventListener('click', async () => {
        try { await DOVA.del(`/plataforma/clinicas/${c.id}/pagos/${b.dataset.pgDel}`); await pintar(); } catch (ex) { toast(ex.message, 'error'); }
      }));
      box.querySelectorAll('[data-cerrar-modal]').forEach((b) => b.addEventListener('click', () => { X.cerrarModal(); recargar(); }));
    };
    try { await pintar(); } catch (ex) { box.querySelector('[data-pg]').innerHTML = `<p class="dova-error-text">${esc(ex.message)}</p>`; }
  }

  // Configuración → "Mi plan": qué incluye y qué no.
  async function tarjetaMiPlan(elMain) {
    let p;
    try { p = await DOVA.get('/clinica/plan'); } catch (_e) { return; }
    const cont = document.createElement('div');
    const faltan = p.modulos.filter((m) => !m.incluido);
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Mi plan</h2>
      <p>Plan <strong>${esc(p.nombrePlan)}</strong>.${faltan.length ? ' Hay funciones que se suman con un plan mayor; consultale al proveedor de DOVA.' : ' Tenés todas las funciones.'}</p>
      <ul class="dova-plan-lista">${p.modulos.map((m) => `<li class="${m.incluido ? 'incluido' : 'no-incluido'}">${esc(m.nombre)} ${m.incluido ? X.badge('Incluido', 'ok') : `<span class="dova-nota">No incluido (desde el plan ${esc(m.nombreDesde)})</span>`}</li>`).join('')}</ul>`;
    elMain.appendChild(cont);
  }

  // Finanzas → Cobro online: estado de la pasarela y los cobros (para volver a consultar los que no avisaron).
  const EST_COBRO = { creado: ['Esperando el pago', 'info'], pagado: ['Pagado', 'ok'], cancelado: ['Cancelado', 'info'], vencido: ['Venció', 'info'], revisar: ['Para revisar', 'critica'] };
  async function cobroOnline(c) {
    const [est, lista] = await Promise.all([DOVA.get('/cobro-online/estado'), DOVA.get('/cobro-online')]);
    const aviso = `${location.origin}/api/cobro-online/aviso/pagopar`;
    c.innerHTML = `<div class="dova-cobro-online">
      <p>El paciente toca <strong>Pagar ahora</strong> en su enlace de pago y paga con tarjeta o QR por la pasarela (${esc(est.proveedor === 'pagopar' ? 'Pagopar' : est.proveedor)}). Cuando la pasarela confirma, DOVA registra el pago en su cuenta y en la caja, solo.</p>
      <p>${est.configurado ? X.badge('Pasarela conectada', 'ok') : X.badge('Pasarela sin conectar', 'atencion')}
        ${est.activo ? X.badge('Activado', 'ok') : X.badge('Apagado', 'info')}
        <button type="button" class="dova-btn-secundario" data-co-toggle ${!est.configurado && !est.activo ? 'disabled' : ''}>${est.activo ? 'Apagar' : 'Activar'}</button></p>
      ${est.configurado ? `<p class="dova-nota">En el panel de Pagopar, la URL de respuesta tiene que ser: <code>${esc(aviso)}</code></p>`
    : '<p class="dova-nota">Para conectarla hace falta una cuenta de comercio en la pasarela y cargar sus claves en el servidor (las claves no se guardan en la base). Pedile ayuda al proveedor de DOVA.</p>'}
      <h3 class="dova-section-title">Cobros</h3>
      ${lista.length ? `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Paciente</th><th>Cuota</th><th>Monto</th><th>Estado</th><th>Cuándo</th><th></th></tr></thead><tbody>
        ${lista.map((o) => `<tr><td>${esc(o.paciente)}</td><td>${esc(o.cuota)}</td><td>${gs(o.monto)}</td>
          <td>${X.badge(...EST_COBRO[o.estado] || [o.estado, 'info'])}${o.error ? `<div class="dova-nota">${esc(o.error)}</div>` : ''}</td>
          <td>${esc(X.fmtFechaHora(o.pagado || o.creado))}</td>
          <td>${['creado', 'revisar'].includes(o.estado) && est.configurado ? `<button type="button" class="dova-btn-link" data-co-reconsultar="${o.id}">Volver a consultar</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="dova-vacio">Todavía no hay cobros online.</p>'}
      <p class="dova-nota">"Para revisar" = la pasarela cobró pero DOVA no pudo registrar el pago solo (por ejemplo, la cuota ya figuraba pagada). Hay que aplicarlo o devolverlo a mano.</p>
    </div>`;
    const recargar = () => cobroOnline(c);
    c.querySelector('[data-co-toggle]').addEventListener('click', async () => {
      try { await DOVA.put('/cobro-online/estado', { activo: !est.activo }); toast(est.activo ? 'Cobro online apagado' : 'Cobro online activado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    });
    c.querySelectorAll('[data-co-reconsultar]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await DOVA.post(`/cobro-online/${b.dataset.coReconsultar}/reconsultar`, {}); toast(r.estado === 'pagado' ? 'Pago registrado' : 'Consultado: todavía no hay pago', r.estado === 'pagado' ? 'ok' : undefined); recargar(); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    }));
  }

  return { seccion, tarjetaMiPlan, cobroOnline };
})();
window.DovaPlataforma = DovaPlataforma;
