/* DOVA — Centro de comandos (Ctrl+K / ⌘K, o el botón 🔍 del encabezado).
   Busca en un solo lugar: secciones del menú, acciones rápidas y datos
   (pacientes, turnos, presupuestos, cobros, facturas…). Todo se filtra por
   los permisos del usuario: lo que no puede usar no aparece, y el servidor
   vuelve a validar cada acción. Sin IA: búsqueda directa en la base. */
const DovaComandos = (() => {
  let cfg = null; // { menu, navegar }
  let abierto = false;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const puede = (...ps) => ps.some((p) => DOVA.tienePermiso(p));
  const fmtF = (f) => { const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const gs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
  const toast = (m, t) => { if (typeof Vistas !== 'undefined' && Vistas.toast) Vistas.toast(m, t); };

  // Espera a que aparezca un elemento (para acciones que abren una pantalla y luego un botón).
  const cuando = (sel, fn, ms = 6000) => { const t0 = Date.now(); const it = setInterval(() => { const el = document.querySelector(sel); if (el) { clearInterval(it); fn(el); } else if (Date.now() - t0 > ms) clearInterval(it); }, 120); };

  function acciones() {
    const nav = cfg.navegar;
    const op = typeof DovaOperativo !== 'undefined' ? DovaOperativo : null;
    return [
      { t: 'Nuevo turno', d: 'Reservar un turno en la agenda', ic: '📅', ok: puede('agenda.create') && op, fn: () => op.modalTurno({ alGuardar: () => toast('Turno reservado', 'ok') }), claves: 'agendar reservar cita' },
      { t: 'Buscar un tratamiento', d: 'Escribí el nombre (ej.: endodoncia) para ver precio y duración', ic: '🔎', ok: puede('tratamientos.view'), fn: () => {}, buscar: true, claves: 'precio catalogo' },
      { t: 'Nuevo paciente', d: 'Dar de alta un paciente', ic: '👤', ok: puede('pacientes.create'), fn: () => { nav('pacientes'); cuando('#btn-nuevo-paciente', (b) => b.click()); }, claves: 'alta ficha crear' },
      { t: 'Mi día', d: 'Agenda de hoy', ic: '🗓', ok: puede('agenda.view'), fn: () => nav('agenda'), claves: 'hoy agenda turnos' },
      { t: 'Abrir / ver caja', d: 'Estado de la caja del día', ic: '💵', ok: puede('caja.view', 'caja.manage'), fn: () => nav('caja'), claves: 'arqueo efectivo cierre' },
      { t: 'Pacientes para contactar', d: 'Bandeja de seguimiento', ic: '📞', ok: puede('seguimiento.view', 'seguimiento.manage', 'recalls.view'), fn: () => nav('seguimiento', 'bandeja'), claves: 'llamar recall cobranza seguimiento' },
      { t: 'Insumos por vencer', d: 'Inventario por lote', ic: '📦', ok: puede('inventario.view'), fn: () => { nav('inventario'); cuando('[data-subtab="vencen"]', (b) => b.click()); }, claves: 'stock lotes vencimiento' },
      { t: 'Reporte de cobros', d: 'Reportes → Cobros', ic: '📊', ok: puede('reportes.view'), fn: () => nav('reportes', 'cobros'), claves: 'ingresos pagos reporte' },
      { t: 'Historial de cambios', d: 'Auditoría', ic: '🛡', ok: puede('auditoria.view'), fn: () => nav('auditoria'), claves: 'auditoria log quien' },
    ].filter((a) => a.ok);
  }
  function accionesPaciente(p) {
    const nav = cfg.navegar; const op = typeof DovaOperativo !== 'undefined' ? DovaOperativo : null;
    const nombre = `${p.nombre} ${p.apellido}`;
    return [
      { t: `Abrir ficha de ${nombre}`, ic: '📁', ok: puede('pacientes.view'), fn: () => nav('paciente', p.id) },
      { t: 'Iniciar consulta', ic: '🦷', ok: puede('historia_clinica.edit'), fn: () => nav('consulta', String(p.id)) },
      { t: 'Darle un turno', ic: '📅', ok: puede('agenda.create') && op, fn: () => op.modalTurno({ fijo: { pacienteId: p.id, pacienteNombre: nombre }, alGuardar: () => toast('Turno reservado', 'ok') }) },
      { t: 'Nueva receta', ic: '💊', ok: puede('recetas.manage'), fn: () => { nav('paciente', p.id); cuando('#ficha-tabs [data-tab="recetas"]', (b) => { b.click(); cuando('[data-panel="recetas"] [data-nueva]', (n) => n.click()); }); } },
      { t: 'Nuevo presupuesto', ic: '🧾', ok: puede('presupuestos.manage') && op && op.modalPresupuesto, fn: () => op.modalPresupuesto(p.id, () => toast('Presupuesto creado', 'ok')) },
      { t: 'Abrir odontograma', ic: '🦷', ok: puede('odontograma.view'), fn: () => { nav('paciente', p.id); cuando('#ficha-tabs [data-tab="odontograma"]', (b) => b.click()); } },
      { t: 'Registrar un cobro', ic: '💵', ok: puede('pagos.create') && op, fn: () => op.modalCobro(p.id, { alGuardar: () => toast('Cobro registrado', 'ok') }) },
      { t: 'Ver documentos', ic: '📄', ok: puede('pacientes.view'), fn: () => { nav('paciente', p.id); cuando('#ficha-tabs [data-tab="documentos"]', (b) => b.click()); } },
    ].filter((a) => a.ok);
  }

  function abrir() {
    if (abierto || !cfg || !DOVA.estaAutenticado()) return;
    abierto = true;
    const prev = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'dova-cmd-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Buscar y ejecutar');
    ov.innerHTML = `<div class="dova-cmd">
        <div class="dova-cmd-barra"><span aria-hidden="true">🔍</span><input type="search" data-q placeholder="Buscá un paciente, una sección o una acción…" autocomplete="off" aria-controls="dova-cmd-lista" /><kbd>Esc</kbd></div>
        <ul class="dova-cmd-lista" id="dova-cmd-lista" role="listbox" data-lista></ul>
        <div class="dova-cmd-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> en cualquier pantalla</span></div>
      </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('[data-q]'); const lista = ov.querySelector('[data-lista]');
    let items = []; let sel = 0; let timer = null; let pedido = 0; let paciente = null;
    const cerrar = () => { if (!abierto) return; abierto = false; ov.remove(); document.removeEventListener('keydown', teclas, true); if (prev && prev.focus) try { prev.focus(); } catch (_e) { /* */ } };
    const ejecutar = (it) => { if (!it) return; if (it.buscar) { inp.value = ''; inp.placeholder = 'Nombre del tratamiento…'; inp.focus(); return; } if (it.volver) { paciente = null; inp.value = ''; pintar(); inp.focus(); return; } if (it.sub) { paciente = it.sub; inp.value = ''; pintar(); inp.focus(); return; } cerrar(); try { it.fn(); } catch (e) { toast(e.message, 'error'); } };
    const render = (grupos, cargando) => {
      items = []; let html = '';
      for (const [titulo, arr] of grupos) {
        if (!arr.length) continue;
        html += `<li class="dova-cmd-grupo" role="presentation">${esc(titulo)}</li>`;
        for (const it of arr) { html += `<li class="dova-cmd-item" role="option" data-i="${items.length}" id="dova-cmd-${items.length}"><span class="dova-cmd-ic" aria-hidden="true">${it.ic || '›'}</span><span><strong>${esc(it.t)}</strong>${it.d ? `<small>${esc(it.d)}</small>` : ''}</span></li>`; items.push(it); }
      }
      if (cargando) html += '<li class="dova-cmd-vacio">Buscando…</li>';
      else if (!items.length) html += '<li class="dova-cmd-vacio">Sin resultados.</li>';
      lista.innerHTML = html; sel = Math.min(sel, Math.max(0, items.length - 1)); marcar();
      lista.querySelectorAll('[data-i]').forEach((li) => {
        li.addEventListener('mousemove', () => { sel = Number(li.dataset.i); marcar(); });
        li.addEventListener('click', () => ejecutar(items[Number(li.dataset.i)]));
      });
    };
    const marcar = () => {
      lista.querySelectorAll('[data-i]').forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.i) === sel)));
      const a = lista.querySelector(`[data-i="${sel}"]`); if (a) { a.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', a.id); }
    };
    const pintar = async () => {
      const q = norm(inp.value.trim());
      if (paciente) {
        render([[`${paciente.nombre} ${paciente.apellido}`, accionesPaciente(paciente).filter((a) => !q || norm(a.t).includes(q))], ['Otras opciones', [{ t: 'Volver a buscar', ic: '↩', volver: true }]]]);
        return;
      }
      const secciones = cfg.menu().filter((m) => !q || norm(m.label).includes(q) || norm(m.ruta).includes(q)).map((m) => ({ t: m.label, d: 'Ir a la sección', ic: '↗', fn: () => cfg.navegar(m.ruta) }));
      const acc = acciones().filter((a) => !q || norm(`${a.t} ${a.d} ${a.claves}`).includes(q));
      if (q.length < 2) { render([['Acciones rápidas', acc], ['Secciones', secciones]]); return; }
      render([['Acciones', acc], ['Secciones', secciones]], true);
      clearTimeout(timer);
      const yo = ++pedido;
      timer = setTimeout(async () => {
        let d = null;
        try { d = await DOVA.get(`/busqueda?q=${encodeURIComponent(inp.value.trim())}`); } catch (_e) { d = null; }
        if (yo !== pedido || !abierto) return;
        const nav = cfg.navegar;
        const pac = (d && d.pacientes) || [];
        const grupos = [
          ['Pacientes', pac.map((p) => ({ t: `${p.nombre} ${p.apellido}`, d: [p.ci ? `C.I. ${p.ci}` : '', p.telefono || ''].filter(Boolean).join(' · ') + ' — Enter para ver acciones', ic: '👤', sub: p }))],
          ['Acciones', acc], ['Secciones', secciones],
          ['Turnos', ((d && d.citas) || []).map((c) => ({ t: `${fmtF(c.fecha)} ${String(c.hora_inicio || '').slice(0, 5)} · ${c.paciente_nombre} ${c.paciente_apellido}`, d: c.motivo || '', ic: '📅', fn: () => nav('paciente', c.paciente_id) }))],
          ['Presupuestos', ((d && d.presupuestos) || []).map((x) => ({ t: `Presupuesto N.º ${x.id} · ${x.paciente_nombre} ${x.paciente_apellido}`, d: `${fmtF(x.fecha)} · ${x.estado} · ${gs(x.total)}`, ic: '🧾', fn: () => nav('paciente', x.paciente_id) }))],
          ['Cobros', ((d && d.pagos) || []).map((x) => ({ t: `Recibo N.º ${x.id} · ${x.paciente_nombre} ${x.paciente_apellido}`, d: `${fmtF(x.fecha)} · ${x.concepto || ''} · ${gs(x.monto)}`, ic: '💵', fn: () => nav('paciente', x.paciente_id) }))],
          ['Facturas', ((d && d.facturas) || []).map((x) => ({ t: `Factura ${x.numero_completo}`, d: `${x.cliente_nombre || ''} · ${gs(x.total)}`, ic: '🧾', fn: () => nav('facturacion', `factura/${x.id}`) }))],
          ['Tratamientos', ((d && d.tratamientos) || []).map((x) => ({ t: x.nombre, d: `${gs(x.precio)}${x.duracion_minutos ? ` · ${x.duracion_minutos} min` : ''} — catálogo`, ic: '🦷', fn: () => nav('catalogo') }))],
          ['Tickets', ((d && d.tickets) || []).map((x) => ({ t: x.titulo || `Ticket ${x.id}`, ic: '🛠', fn: () => nav('helpdesk') }))],
          ['Usuarios', ((d && d.usuarios) || []).map((x) => ({ t: x.nombre, d: `@${x.username}`, ic: '🔑', fn: () => nav('usuarios') }))],
        ];
        render(grupos);
      }, 220);
    };
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (paciente) { paciente = null; inp.value = ''; pintar(); } else cerrar(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { sel = (sel + 1) % items.length; marcar(); } return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel - 1 + items.length) % items.length; marcar(); } return; }
      if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); ejecutar(items[sel]); }
      if (e.key === 'Tab') { e.preventDefault(); inp.focus(); }
    }
    document.addEventListener('keydown', teclas, true);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrar(); });
    inp.addEventListener('input', () => { sel = 0; pintar(); });
    pintar();
    setTimeout(() => inp.focus(), 0);
  }

  function iniciar(opciones) {
    if (cfg) { cfg = opciones; return; }
    cfg = opciones;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (abierto) return; abrir(); }
    });
    // Botón en el encabezado (útil en celular, donde no hay teclado físico).
    const ref = document.getElementById('theme-toggle-btn') || document.getElementById('logout-btn');
    if (ref && !document.getElementById('dova-cmd-btn')) {
      const b = document.createElement('button');
      b.id = 'dova-cmd-btn'; b.type = 'button'; b.className = 'dova-cmd-btn'; b.title = 'Buscar y ejecutar (Ctrl+K)'; b.setAttribute('aria-label', 'Buscar y ejecutar (Ctrl+K)');
      b.innerHTML = '<span aria-hidden="true">🔍</span><span class="dova-cmd-btn-txt">Buscar</span><kbd class="dova-cmd-btn-kbd">Ctrl K</kbd>';
      b.addEventListener('click', abrir);
      ref.parentNode.insertBefore(b, ref);
    }
  }
  return { iniciar, abrir };
})();
window.DovaComandos = DovaComandos;
