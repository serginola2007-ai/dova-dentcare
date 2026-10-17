/* DOVA — Reportes detallados (pestaña de Informes) e Historial de cambios (auditoría).
   Uso: DovaReportes.reportes(contenedor, navegar, inicial), DovaReportes.auditoria(contenedor, navegar). */
const DovaReportes = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, etiqueta, badge } = X;
  const { montar } = DovaSeccionBase;
  const OPC = (lista) => lista.map((valor) => [valor, etiqueta(valor)]);

  // ================================ AUDITORÍA ================================
  // ================================ REPORTES ================================
  const FILTRO_UI = {
    odontologoId: (o) => ['Odontólogo', o.odontologos.map((x) => [x.id, `${x.nombre}${x.activo === false ? ' (inactivo)' : ''}`])],
    tratamientoId: (o) => ['Tratamiento', o.tratamientos.map((x) => [x.id, x.nombre])],
    usuarioId: (o) => ['Usuario', o.usuarios.map((x) => [x.id, x.nombre])],
    metodo: (o) => ['Método de pago', Object.entries(o.metodos)],
    estadoPlan: () => ['Estado', OPC(['pendiente', 'aprobado', 'en_proceso', 'finalizado', 'cancelado'])],
    estadoPago: () => ['Estado', [['pagado', 'Cobrado'], ['anulado', 'Anulado']]],
    estadoFactura: () => ['Estado', [['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']]],
  };
  const celda = (v, tipo) => {
    if (v === null || v === undefined || v === '') return '<span class="dova-nota">—</span>';
    if (tipo === 'gs') return fmtGs(v);
    if (tipo === 'pct') return `${String(v).replace('.', ',')} %`;
    if (tipo === 'num') return Number(v).toLocaleString('es-PY');
    if (tipo === 'fecha') return fmtFecha(v);
    return esc(v);
  };
  async function reportes(root, nav, inicial) {
    montar(root, nav);
    const [lista, op] = await Promise.all([DOVA.get('/reportes/centro'), DOVA.get('/reportes/centro-opciones')]);
    const grupos = [...new Set(lista.map((r) => r.grupo))];
    let actual = lista.find((r) => r.clave === inicial) || lista[0];
    const mes = `${X.hoy().slice(0, 8)}01`;
    const st = { desde: mes, hasta: X.hoy() };
    root.innerHTML = `<h2 class="dova-view-title">Reportes</h2>
      <p class="dova-subtitulo">Calculados en el momento con los datos guardados. Elegí un reporte, ajustá los filtros y exportalo si lo necesitás.</p>
      <div class="dova-rep">
        <nav class="dova-rep-menu" aria-label="Reportes">${grupos.map((g) => `<h4>${esc(g)}</h4>${lista.filter((r) => r.grupo === g).map((r) => `<button type="button" data-rep="${r.clave}">${esc(r.titulo)}</button>`).join('')}`).join('')}</nav>
        <label class="dova-rep-select"><span>Reporte</span><select data-rep-select>${grupos.map((g) => `<optgroup label="${esc(g)}">${lista.filter((r) => r.grupo === g).map((r) => `<option value="${r.clave}">${esc(r.titulo)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <section class="dova-rep-cuerpo" data-cuerpo></section>
      </div>`;
    const cuerpo = root.querySelector('[data-cuerpo]');
    const sel = root.querySelector('[data-rep-select]');
    const pintar = async () => {
      root.querySelectorAll('[data-rep]').forEach((b) => b.classList.toggle('activo', b.dataset.rep === actual.clave));
      sel.value = actual.clave;
      cuerpo.innerHTML = `<h3 class="dova-section-title">${esc(actual.titulo)}</h3><p class="dova-nota">${esc(actual.descripcion)}</p>
        <form class="dova-ext-filtros" data-f>
          ${actual.sinPeriodo ? '' : `<div><label>Desde</label><input type="date" name="desde" value="${st.desde}" required/></div><div><label>Hasta</label><input type="date" name="hasta" value="${st.hasta}" required/></div>`}
          ${actual.filtros.map((k) => { const [t, opc] = FILTRO_UI[k](op); return `<div><label>${t}</label><select name="${k}"><option value="">Todos</option>${opc.map(([v, n]) => `<option value="${esc(v)}" ${String(st[k] || '') === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`; }).join('')}
          <button class="dova-btn-primary">Ver</button>
          ${op.puedeExportar ? '<span class="dova-rep-export"><button type="button" class="dova-btn-secundario" data-exp="pdf">PDF</button><button type="button" class="dova-btn-secundario" data-exp="xlsx">Excel</button><button type="button" class="dova-btn-secundario" data-exp="csv">CSV</button></span>' : ''}
        </form><div data-res>${X.cargando}</div>`;
      const f = cuerpo.querySelector('[data-f]');
      const qs = (extra = {}) => { const o = Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v !== '')); Object.assign(st, o); return new URLSearchParams({ ...o, ...extra }).toString(); };
      const cargar = async () => {
        const res = cuerpo.querySelector('[data-res]'); res.innerHTML = X.cargando;
        try {
          const r = await DOVA.get(`/reportes/centro/${actual.clave}?${qs()}`);
          res.innerHTML = `<p class="dova-nota">${r.filas.length} fila(s)${r.sinPeriodo ? '' : ` · ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)}`}</p>
            <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-rep-tabla"><thead><tr>${r.columnas.map((c) => `<th class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
            ${r.filas.slice(0, 1000).map((fl) => `<tr>${r.columnas.map((c) => `<td class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${celda(fl[c.k], c.tipo)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${r.columnas.length}">No hay datos con estos filtros.</td></tr>`}
            </tbody>${r.totales && r.filas.length ? `<tfoot><tr>${r.columnas.map((c, i) => `<td class="${['gs', 'num', 'pct'].includes(c.tipo) ? 'num' : ''}">${i === 0 ? '<strong>Total</strong>' : r.totales[c.k] !== undefined ? `<strong>${celda(r.totales[c.k], c.tipo)}</strong>` : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>
            ${r.filas.length > 1000 ? '<p class="dova-nota">En pantalla se muestran las primeras 1000 filas; la exportación incluye todas.</p>' : ''}`;
        } catch (e) { res.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
      cuerpo.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', async () => {
        const fmt = b.dataset.exp; b.disabled = true;
        try {
          const r = await DOVA.request(`/reportes/centro/${actual.clave}?${qs({ formato: fmt })}`, { raw: true });
          if (!r.ok) { let m = 'No se pudo exportar'; try { m = (await r.json()).error.message; } catch (_e) { /* */ } throw new Error(m); }
          const u = URL.createObjectURL(await r.blob());
          const a = document.createElement('a'); a.href = u; a.download = `${actual.clave}-${st.desde || ''}-${st.hasta || ''}.${fmt}`; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(u), 2000);
          X.toast('Reporte exportado', 'ok');
        } catch (e) { X.toast(e.message, 'error'); }
        b.disabled = false;
      }));
      await cargar();
    };
    const elegir = (clave) => { actual = lista.find((r) => r.clave === clave) || actual; if (location.hash.startsWith('#reportes')) { try { history.replaceState(null, '', `${location.pathname}${location.search}#reportes/${actual.clave}`); } catch (_e) { /* */ } } pintar(); };
    root.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.rep)));
    sel.addEventListener('change', () => elegir(sel.value));
    await pintar();
  }

  async function auditoria(root, nav) {
    montar(root, nav);
    const usuarios = await X.catalogo('usuarios', '/seguimiento/equipo').catch(() => []);
    root.innerHTML = `<h2 class="dova-view-title">Historial de cambios</h2><p class="dova-subtitulo">Quién hizo qué, cuándo, desde qué IP y con qué resultado. Cada creación, edición, anulación, exportación, ingreso y acceso denegado queda registrado.</p>
      <form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${X.sumarDias(X.hoy(), -7)}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      <div><label>Usuario</label><select name="usuarioId"><option value="">Todos</option>${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></div>
      <div><label>Módulo</label><select name="modulo"><option value="">Todos</option></select></div>
      <div><label>Acción</label><select name="accion"><option value="">Todas</option></select></div>
      <div><label>Resultado</label><select name="resultado"><option value="">Todos</option><option value="ok">Correcto</option><option value="denegado">Denegado</option><option value="fallido">Fallido</option></select></div>
      <div><label>ID de paciente</label><input type="number" name="pacienteId"/></div><div><label>Buscar</label><input name="q"/></div>
      <button class="dova-btn-primary">Buscar</button><button type="button" class="dova-btn-secundario" data-csv>Descargar (CSV)</button></form><div data-l></div>`;
    const f = root.querySelector('[data-f]');
    let primera = true;
    const qs = () => new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
    const RES = { ok: ['Correcto', 'ok'], denegado: ['Denegado', 'critica'], fallido: ['Fallido', 'atencion'] };
    const detalleHtml = (d) => {
      if (d && d.antes && d.despues && typeof d.antes === 'object') {
        const claves = [...new Set([...Object.keys(d.antes), ...Object.keys(d.despues)])];
        const v = (x) => esc(x === null || x === undefined ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x));
        const otros = Object.fromEntries(Object.entries(d).filter(([k]) => !['antes', 'despues'].includes(k)));
        return `<table class="dova-tabla"><thead><tr><th>Dato</th><th>Antes</th><th>Después</th></tr></thead><tbody>${claves.map((k) => `<tr class="${JSON.stringify(d.antes[k]) !== JSON.stringify(d.despues[k]) ? 'dova-ext-fila-aviso' : ''}"><td>${esc(etiqueta(k))}</td><td>${v(d.antes[k])}</td><td>${v(d.despues[k])}</td></tr>`).join('')}</tbody></table>
          ${Object.keys(otros).length ? `<pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(otros, null, 2))}</pre>` : ''}`;
      }
      return `<pre style="white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto">${esc(JSON.stringify(d, null, 2))}</pre>`;
    };
    const cargar = async () => {
      const l = root.querySelector('[data-l]'); l.innerHTML = X.cargando;
      const r = await DOVA.get(`/kpis/auditoria?${qs()}`);
      if (primera) {
        f.modulo.innerHTML += r.modulos.map((m) => `<option value="${esc(m)}">${esc(etiqueta(m))}</option>`).join('');
        f.accion.innerHTML += (r.acciones || []).map((m) => `<option value="${esc(m)}">${esc(etiqueta(m))}</option>`).join('');
        primera = false;
      }
      l.innerHTML = `<p class="dova-nota">${r.registros.length} registro(s)${r.registros.length >= 200 ? ' (se muestran los 200 más recientes; la descarga incluye todos)' : ''}.</p>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>Resultado</th><th>IP</th><th>Detalle</th></tr></thead><tbody>
        ${r.registros.map((a, i) => { const rs = RES[a.resultado || 'ok'] || RES.ok; return `<tr class="${a.resultado && a.resultado !== 'ok' ? 'dova-ext-fila-alerta' : ''}"><td>${X.fmtFechaHora(a.creado_en)}</td><td>${esc(a.usuario_nombre || 'sistema')}</td><td>${esc(etiqueta(a.accion))}</td><td>${esc(etiqueta(a.modulo))}</td><td>${esc(a.entidad_id || '-')}</td><td>${badge(rs[0], rs[1])}</td><td><span class="dova-nota">${esc(a.ip || '-')}</span></td><td>${a.detalle ? `<button class="dova-btn-link" data-det="${i}">Ver</button>` : '-'}</td></tr>`; }).join('') || '<tr><td colspan="8">Sin registros.</td></tr>'}</tbody></table></div>`;
      l.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => X.modal('Detalle del registro', `${detalleHtml(r.registros[Number(b.dataset.det)].detalle)}<div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' })));
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    root.querySelector('[data-csv]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await DOVA.request(`/kpis/auditoria?${qs()}&formato=csv`, { raw: true });
        if (!r.ok) throw new Error('No se pudo descargar');
        const u = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = u; a.download = `auditoria-${X.hoy()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
      } catch (er) { X.toast(er.message, 'error'); }
      b.disabled = false;
    });
    await cargar();
  }

  return { reportes, auditoria };
})();
window.DovaReportes = DovaReportes;

DovaPantallas.registrar('auditoria', { dibujar: (contenedor, { navegar }) => DovaReportes.auditoria(contenedor, navegar) });
// Dirección vieja de los reportes detallados (hoy son una pestaña de Informes).
DovaPantallas.registrar('reportes', { permiso: 'reportes.view', dibujar: (contenedor, { navegar, params }) => DovaReportes.reportes(contenedor, navegar, params) });
