/* DOVA — Facturación (comprobantes internos).
   Pantallas: tablero, listado (tabla en compu, tarjetas en celular), nueva
   factura (hereda paciente, cobro, presupuesto y tratamientos), detalle con
   historial, anulación, notas de crédito internas, reportes y configuración.
   El servidor calcula número, totales, IVA y estado; acá solo se muestra una
   vista previa. Cada botón aparece solo si el usuario tiene el permiso, y el
   servidor lo vuelve a validar. */
const DovaFacturacion = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy, sumarDias, badge, cargando } = X;
  const num = (v) => Number(v || 0);
  const ESTADO = { pagada: ['Pagada', 'ok'], pendiente: ['Pendiente', 'atencion'], anulada: ['Anulada', 'critica'], emitida: ['Emitida', 'info'] };
  const badgeEstado = (e) => badge((ESTADO[e] || [e])[0], (ESTADO[e] || [0, 'info'])[1]);
  const EVENTOS = {
    creada: 'Factura emitida', pago_asociado: 'Cobro asociado', pago_anulado: 'Se anuló un cobro asociado', estado: 'Cambio de estado',
    editada: 'Datos corregidos', anulada: 'Factura anulada', nota_credito: 'Nota de crédito interna', pdf_generado: 'PDF generado',
    pdf_descargado: 'PDF descargado', pdf_impreso: 'PDF impreso',
  };
  const AVISO_INTERNO = 'Comprobante interno de DOVA: no es una factura fiscal (timbrada o electrónica). DOVA todavía no está integrado con la SET.';
  let metodosCache = null;
  async function metodos() {
    if (!metodosCache) metodosCache = DOVA.get('/facturacion/metodos-pago').catch(() => [{ codigo: 'efectivo', nombre: 'Efectivo' }]);
    return metodosCache;
  }
  // Preferencias de "facturar al cobrar" (Configuración) + métodos de pago.
  let opcionesCache = null;
  async function opcionesCobro() {
    if (!opcionesCache) opcionesCache = DOVA.get('/facturacion/opciones-cobro').catch(() => ({ metodos: [{ codigo: 'efectivo', nombre: 'Efectivo' }], facturarAlCobrar: false, imprimirAlFacturar: false, formatoImpresion: 'a4' }));
    return opcionesCache;
  }
  /* Casillas "Generar factura" e "Imprimir" + datos opcionales del cliente,
     para agregar a cualquier formulario de ingreso (cobro o ingreso de caja). */
  function bloqueFacturaHtml(op, { sinPaciente } = {}) {
    if (!puede('facturacion.crear')) return '';
    return `<fieldset class="dova-fac-al-cobrar" data-fac-bloque>
      <label class="dova-ext-check"><input type="checkbox" name="facGenerar" ${op.facturarAlCobrar ? 'checked' : ''}/> Generar factura</label>
      <div data-fac-extra ${op.facturarAlCobrar ? '' : 'hidden'}>
        ${puede('facturacion.imprimir') ? `<label class="dova-ext-check"><input type="checkbox" name="facImprimir" ${op.imprimirAlFacturar ? 'checked' : ''}/> Imprimir al terminar (${op.formatoImpresion === 'ticket' ? 'ticket' : 'hoja A4'})</label>` : ''}
        <div class="dova-ext-form-grid">
          <div class="dova-ext-campo"><label for="fac-ruc">RUC (opcional)</label><input id="fac-ruc" name="facRuc" maxlength="40" placeholder="ej. 4567890-1"/></div>
          <div class="dova-ext-campo"><label for="fac-nom">Nombre o razón social</label><input id="fac-nom" name="facNombre" maxlength="200" placeholder="${sinPaciente ? 'Consumidor final' : 'El del paciente'}"/></div>
        </div>
        ${sinPaciente ? '' : '<p class="dova-ext-ayuda">Si cargás RUC o razón social, quedan guardados en la ficha del paciente.</p>'}
      </div></fieldset>`;
  }
  function activarBloqueFactura(form) {
    const g = form.querySelector('[name="facGenerar"]'); if (!g) return;
    g.addEventListener('change', () => { form.querySelector('[data-fac-extra]').hidden = !g.checked; });
  }
  function leerBloqueFactura(form) {
    const g = form.querySelector('[name="facGenerar"]');
    if (!g || !g.checked) return null;
    const imp = form.querySelector('[name="facImprimir"]');
    return { imprimir: !!(imp && imp.checked), clienteRuc: form.querySelector('[name="facRuc"]').value.trim() || undefined, clienteNombre: form.querySelector('[name="facNombre"]').value.trim() || undefined };
  }
  // Factura de un cobro o de un ingreso de caja ya registrado. Nunca hace fallar el cobro.
  async function facturarIngreso({ pagoId, movimientoId }, opc) {
    try {
      const url = pagoId ? `/facturacion/cobro/${pagoId}` : `/facturacion/movimiento/${movimientoId}`;
      const r = await DOVA.post(url, { clienteRuc: opc.clienteRuc, clienteNombre: opc.clienteNombre });
      const f = r.factura;
      toast(r.yaExistia ? `Ya tenía la factura ${f.numero_completo}` : `Factura ${f.numero_completo} generada`, 'ok');
      // Después de que se cierre el formulario del cobro (si no, el cartel de imprimir se cerraría con él).
      if (opc.imprimir) setTimeout(() => imprimirPdf(f.id, f.numero_completo), 350);
      return f;
    } catch (e) {
      toast(`El ingreso quedó registrado, pero no se pudo generar la factura: ${e.message}`, 'error');
      return null;
    }
  }
  const nombreMetodo = (lista, c) => (lista.find((m) => m.codigo === c) || {}).nombre || c || '-';
  const puedeVer = () => puede('facturacion.ver', 'facturacion.ver_propias');

  // ---------------- PDF: ver, descargar, imprimir (archivo real del servidor) ----------------
  async function blobPdf(id, modo) {
    const res = await DOVA.request(`/facturacion/${id}/pdf?modo=${modo}`, { raw: true });
    if (!res.ok) { let m = 'No se pudo generar el PDF'; try { m = (await res.json()).error.message; } catch (_e) { /* */ } throw new Error(m); }
    return res.blob();
  }
  async function verPdf(id) {
    const w = window.open('', '_blank'); // se abre ya (si no, el navegador lo bloquea)
    try {
      const url = URL.createObjectURL(await blobPdf(id, 'ver'));
      if (w) w.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (w) w.close(); toast(e.message, 'error'); }
  }
  async function descargarPdf(id, numero) {
    try {
      const url = URL.createObjectURL(await blobPdf(id, 'descargar'));
      const a = document.createElement('a'); a.href = url; a.download = `comprobante-${numero || id}.pdf`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
      toast('PDF descargado', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }
  const esCelular = () => window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  /* Imprimir directo: en la compu abre el cuadro de impresión sin salir de la
     pantalla. En el celular el navegador solo deja abrir el PDF tras un toque,
     así que se muestra un botón "Imprimir" (el visor del PDF tiene su propio
     botón de imprimir/compartir). */
  async function imprimirPdf(id, numero) {
    try {
      const url = URL.createObjectURL(await blobPdf(id, 'imprimir'));
      if (esCelular()) {
        X.modal(`Factura ${numero || ''} lista`, `<p>Tocá <strong>Imprimir</strong> para abrir el comprobante y mandarlo a la impresora.</p>
          <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button><button class="dova-btn-primary" data-imp-ya>Imprimir</button></div>`);
        document.querySelector('.dova-modal-box [data-imp-ya]').addEventListener('click', () => { window.open(url, '_blank'); X.cerrarModal(); });
        return;
      }
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      fr.src = url;
      fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_e) { window.open(url, '_blank'); } setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 60000); };
      document.body.appendChild(fr);
    } catch (e) { toast(e.message, 'error'); }
  }
  function botonesPdf(f, { compacto } = {}) {
    const b = [];
    if (puede('facturacion.descargar')) b.push(`<button type="button" class="${compacto ? 'dova-btn-link' : 'dova-btn-secundario'}" data-pdf-ver="${f.id}">Ver PDF</button>`);
    if (puede('facturacion.descargar')) b.push(`<button type="button" class="${compacto ? 'dova-btn-link' : 'dova-btn-secundario'}" data-pdf-bajar="${f.id}" data-num="${esc(f.numero_completo)}">Descargar PDF</button>`);
    if (puede('facturacion.imprimir')) b.push(`<button type="button" class="${compacto ? 'dova-btn-link' : 'dova-btn-secundario'}" data-pdf-imprimir="${f.id}" data-num="${esc(f.numero_completo)}">Imprimir</button>`);
    return b.join('');
  }
  function enlazarPdf(scope) {
    scope.querySelectorAll('[data-pdf-ver]').forEach((x) => x.addEventListener('click', () => verPdf(x.dataset.pdfVer)));
    scope.querySelectorAll('[data-pdf-bajar]').forEach((x) => x.addEventListener('click', () => descargarPdf(x.dataset.pdfBajar, x.dataset.num)));
    scope.querySelectorAll('[data-pdf-imprimir]').forEach((x) => x.addEventListener('click', () => imprimirPdf(x.dataset.pdfImprimir, x.dataset.num)));
  }

  function confirmar(titulo, html, textoOk, { peligro, campoMotivo } = {}) {
    return new Promise((resolve) => {
      X.modal(titulo, `<div>${html}</div>
        ${campoMotivo ? `<div class="dova-ext-campo dova-ext-campo-completo"><label for="f-motivo">${esc(campoMotivo)} *</label><textarea id="f-motivo" rows="3" maxlength="500"></textarea></div><p class="dova-error-text" data-error style="display:none"></p>` : ''}
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-no>Volver</button><button class="dova-btn-primary ${peligro ? 'dova-fac-peligro' : ''}" data-si>${esc(textoOk)}</button></div>`);
      const box = document.querySelector('.dova-modal-box');
      box.querySelector('[data-no]').addEventListener('click', () => { X.cerrarModal(); resolve(null); });
      box.querySelector('[data-si]').addEventListener('click', () => {
        if (campoMotivo) {
          const v = box.querySelector('#f-motivo').value.trim();
          if (v.length < 5) { const e = box.querySelector('[data-error]'); e.textContent = 'Escribí el motivo (al menos 5 letras).'; e.style.display = 'block'; return; }
          X.cerrarModal(); resolve(v); return;
        }
        X.cerrarModal(); resolve(true);
      });
    });
  }

  // =================================================================
  // SECCIÓN
  // =================================================================
  async function seccion(root, navegar, params) {
    const p = String(params || '');
    root.innerHTML = '<h2 class="dova-view-title">Facturación</h2><p class="dova-nota dova-fac-aviso">⚠️ ' + esc(AVISO_INTERNO) + '</p><div data-subs></div>';
    const cont = root.querySelector('[data-subs]');
    if (p.startsWith('factura/')) return detalle(cont, navegar, Number(p.split('/')[1]));
    if (p.startsWith('nueva')) {
      const [, tipo, id] = p.split('/');
      return formulario(cont, navegar, tipo && id ? { [`${tipo}Id`]: Number(id) } : {});
    }
    X.subPestanas(cont, [
      { id: 'tablero', texto: 'Resumen', visible: puedeVer(), render: (c) => tablero(c, navegar) },
      { id: 'facturas', texto: 'Facturas', visible: puedeVer(), render: (c) => listado(c, navegar, {}) },
      { id: 'nueva', texto: '+ Nueva factura', visible: puede('facturacion.crear'), render: (c) => formulario(c, navegar, {}) },
      { id: 'reportes', texto: 'Reportes', visible: puede('facturacion.ver_reportes'), render: (c) => reportes(c) },
      { id: 'config', texto: 'Configuración', visible: puede('facturacion.configurar'), render: (c) => configuracion(c) },
    ], { inicial: p === 'reportes' ? 'reportes' : p === 'config' ? 'config' : undefined });
  }

  // ---------------- Tablero ----------------
  async function tablero(c, navegar) {
    X.vivo(c, ['facturas', 'pagos'], () => tablero(c, navegar));
    const e = await DOVA.get('/facturacion/estadisticas');
    const kpi = (v, t, sub, alerta) => `<div class="dova-ext-kpi ${alerta ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${v}</div><div class="dova-ext-kpi-label">${esc(t)}</div>${sub ? `<div class="dova-ext-kpi-sub">${sub}</div>` : ''}</div>`;
    if (!e.emitidas && !e.anuladas) {
      c.innerHTML = `<div class="dova-fac-vacio"><div class="dova-fac-vacio-icono">🧾</div><h3>Todavía no hay facturas</h3>
        <p class="dova-nota">Cuando emitas la primera, acá vas a ver lo facturado del día y del mes, lo cobrado y lo pendiente.</p>
        ${puede('facturacion.crear') ? '<button class="dova-btn-primary" data-ir-nueva>+ Emitir la primera factura</button>' : ''}</div>`;
      const b = c.querySelector('[data-ir-nueva]'); if (b) b.addEventListener('click', () => navegar('facturacion', 'nueva'));
      return;
    }
    c.innerHTML = `
      <div class="dova-ext-kpis">
        ${kpi(fmtGs(e.facturadoHoy), 'Facturado hoy', `${e.cantidadHoy} factura(s)`)}
        ${kpi(fmtGs(e.facturadoMes), 'Facturado este mes', `${e.cantidadMes} factura(s)`)}
        ${kpi(fmtGs(e.totalFacturado), 'Total facturado', `${e.emitidas} emitida(s) vigentes`)}
        ${kpi(fmtGs(e.totalCobrado), 'Total cobrado', e.totalAcreditado ? `+ ${fmtGs(e.totalAcreditado)} en notas de crédito` : '')}
        ${kpi(fmtGs(e.totalPendiente), 'Total pendiente de cobro', '', e.totalPendiente > 0)}
      </div>
      <div class="dova-ext-kpis">
        ${kpi(e.emitidas, 'Facturas emitidas')}${kpi(e.pagadas, 'Pagadas')}${kpi(e.pendientes, 'Pendientes', '', e.pendientes > 0)}${kpi(e.anuladas, 'Anuladas')}
      </div>
      <div data-graf></div>`;
    const g = c.querySelector('[data-graf]');
    if (e.serieMes.length >= 2) {
      const s = { titulo: 'Facturado por día (este mes)', etiquetas: e.serieMes.map((x) => fmtFecha(x.fecha).slice(0, 5)), valores: e.serieMes.map((x) => x.total), formato: 'gs' };
      g.innerHTML = X.grafico(s); X.activarGraficos(g, [s]);
    } else g.innerHTML = '<p class="dova-nota">El gráfico del mes aparece cuando haya facturas en al menos dos días distintos.</p>';
  }

  // ---------------- Listado ----------------
  async function listado(c, navegar, filtros) {
    const fl = { page: 1, pageSize: 20, orden: 'fecha', dir: 'desc', ...filtros };
    const [mets, odos, emisores] = await Promise.all([metodos(), X.opcionesOdontologos(), DOVA.get('/facturacion/emisores').catch(() => [])]);
    const verTodas = puede('facturacion.ver');
    c.innerHTML = `
      <details class="dova-fac-filtros" ${window.innerWidth > 700 ? 'open' : ''}><summary>Buscar y filtrar</summary>
        <form data-filtros class="dova-fac-filtros-form">
          <div class="dova-fac-f-q"><label>Buscar</label><input type="search" name="q" placeholder="N.º, paciente, C.I., RUC o concepto" value="${esc(fl.q || '')}"/></div>
          <div><label>Desde</label><input type="date" name="desde" value="${esc(fl.desde || '')}"/></div>
          <div><label>Hasta</label><input type="date" name="hasta" value="${esc(fl.hasta || '')}"/></div>
          <div><label>Estado</label><select name="estado"><option value="">Todos</option>${['pagada', 'pendiente', 'anulada'].map((x) => `<option value="${x}" ${fl.estado === x ? 'selected' : ''}>${ESTADO[x][0]}</option>`).join('')}</select></div>
          <div><label>Método de pago</label><select name="metodo"><option value="">Todos</option>${mets.map((m) => `<option value="${esc(m.codigo)}" ${fl.metodo === m.codigo ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></div>
          ${verTodas ? `<div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${odos.map(([id, n]) => `<option value="${id}" ${String(fl.odontologoId) === String(id) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          <div><label>Emitida por</label><select name="usuarioId"><option value="">Cualquiera</option>${emisores.map((u) => `<option value="${u.id}" ${String(fl.usuarioId) === String(u.id) ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></div>` : ''}
          ${fl.pacienteId ? `<div><label>Paciente</label><button type="button" class="dova-btn-secundario" data-quitar-pac>✕ ${esc(fl.pacienteNombre || 'Paciente #' + fl.pacienteId)}</button></div>` : ''}
          <div class="dova-fac-f-botones"><button class="dova-btn-primary">Buscar</button><button type="button" class="dova-btn-link" data-limpiar>Limpiar</button></div>
        </form>
      </details>
      <div data-res>${cargando}</div>`;
    const res = c.querySelector('[data-res]');
    const form = c.querySelector('[data-filtros]');
    const recargar = (cambios) => listado(c, navegar, { ...fl, ...cambios });
    X.vivo(c, ['facturas'], () => recargar({}));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      recargar({ ...d, page: 1 });
    });
    c.querySelector('[data-limpiar]').addEventListener('click', () => listado(c, navegar, {}));
    const qp = c.querySelector('[data-quitar-pac]'); if (qp) qp.addEventListener('click', () => recargar({ pacienteId: '', pacienteNombre: '', page: 1 }));

    const params = new URLSearchParams(Object.entries(fl).filter(([k, v]) => v !== '' && v !== undefined && k !== 'pacienteNombre'));
    let data;
    try { data = await DOVA.get(`/facturacion?${params}`); } catch (e) { res.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return; }
    if (!data.items.length) {
      res.innerHTML = `<div class="dova-fac-vacio"><div class="dova-fac-vacio-icono">🔎</div><h3>No hay facturas con esos filtros</h3><p class="dova-nota">Probá con otras fechas o limpiá los filtros.</p></div>`;
      return;
    }
    const th = (k, t) => `<th><button type="button" class="dova-fac-orden ${fl.orden === k ? 'activo' : ''}" data-orden="${k}">${t}${fl.orden === k ? (fl.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
    res.innerHTML = `
      <p class="dova-nota">${data.total} factura(s)${data.paginas > 1 ? ` · página ${data.page} de ${data.paginas}` : ''}</p>
      <div class="dova-ext-tabla-wrap dova-fac-tabla"><table class="dova-tabla">
        <thead><tr>${th('numero', 'Número')}${th('fecha', 'Fecha')}${th('paciente', 'Paciente')}<th>Documento / RUC</th><th>Concepto</th>${th('total', 'Total')}<th>Forma de pago</th>${th('estado', 'Estado')}<th>Usuario</th><th></th></tr></thead>
        <tbody>${data.items.map((f) => `<tr class="${f.estado === 'anulada' ? 'dova-op-fila-apagada' : ''}">
          <td><button class="dova-btn-link" data-ver="${f.id}"><strong>${esc(f.numero_completo)}</strong></button></td><td>${fmtFecha(f.fecha)}</td>
          <td>${f.paciente_id ? `<button class="dova-btn-link" data-pac="${f.paciente_id}">${esc(f.cliente_nombre)}</button>` : esc(f.cliente_nombre)}</td>
          <td>${esc(f.cliente_ruc ? `RUC ${f.cliente_ruc}` : f.cliente_documento ? `C.I. ${f.cliente_documento}` : '-')}</td>
          <td class="dova-fac-concepto" title="${esc(f.concepto || '')}">${esc(f.concepto || '-')}</td>
          <td><strong>${fmtGs(f.total)}</strong>${f.estado === 'pendiente' ? `<br><span class="dova-nota">debe ${fmtGs(num(f.total) - num(f.cobrado))}</span>` : ''}</td>
          <td>${esc(f.condicion === 'credito' && !f.metodo_pago ? 'Crédito' : nombreMetodo(mets, f.metodo_pago))}</td>
          <td>${badgeEstado(f.estado)}</td><td>${esc(f.usuario_nombre || '-')}</td>
          <td class="dova-ext-acciones"><button class="dova-btn-link" data-ver="${f.id}">Ver</button>${botonesPdf(f, { compacto: true })}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="dova-fac-cards">${data.items.map((f) => `
        <article class="dova-fac-card ${f.estado === 'anulada' ? 'anulada' : ''}">
          <header><button class="dova-btn-link" data-ver="${f.id}"><strong>${esc(f.numero_completo)}</strong></button>${badgeEstado(f.estado)}</header>
          <div class="dova-fac-card-cliente">${esc(f.cliente_nombre)}</div>
          <div class="dova-nota">${fmtFecha(f.fecha)} · ${esc(f.cliente_ruc ? `RUC ${f.cliente_ruc}` : f.cliente_documento ? `C.I. ${f.cliente_documento}` : 'sin documento')}</div>
          <div class="dova-fac-card-concepto">${esc(f.concepto || '-')}</div>
          <div class="dova-fac-card-pie"><strong>${fmtGs(f.total)}</strong><span class="dova-nota">${esc(f.condicion === 'credito' && !f.metodo_pago ? 'Crédito' : nombreMetodo(mets, f.metodo_pago))} · ${esc(f.usuario_nombre || '-')}</span></div>
          <div class="dova-fac-card-acciones"><button class="dova-btn-secundario" data-ver="${f.id}">Ver detalle</button>${botonesPdf(f)}</div>
        </article>`).join('')}</div>
      ${data.paginas > 1 ? `<nav class="dova-fac-paginas" aria-label="Páginas">
        <button class="dova-btn-secundario" data-pag="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>◀ Anterior</button>
        <span>Página ${data.page} de ${data.paginas}</span>
        <button class="dova-btn-secundario" data-pag="${data.page + 1}" ${data.page >= data.paginas ? 'disabled' : ''}>Siguiente ▶</button></nav>` : ''}`;
    res.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => navegar('facturacion', `factura/${b.dataset.ver}`)));
    res.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
    res.querySelectorAll('[data-pag]').forEach((b) => b.addEventListener('click', () => recargar({ page: Number(b.dataset.pag) })));
    res.querySelectorAll('[data-orden]').forEach((b) => b.addEventListener('click', () => recargar({ orden: b.dataset.orden, dir: fl.orden === b.dataset.orden && fl.dir === 'desc' ? 'asc' : 'desc', page: 1 })));
    enlazarPdf(res);
  }

  // ---------------- Detalle ----------------
  async function detalle(c, navegar, id) {
    c.innerHTML = cargando;
    let f;
    try { f = await DOVA.get(`/facturacion/${id}`); } catch (e) { c.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p><button class="dova-btn-link" data-volver>← Volver a facturas</button>`; c.querySelector('[data-volver]').addEventListener('click', () => navegar('facturacion')); return; }
    const mets = await metodos();
    const vig = f.estado !== 'anulada';
    const acciones = [
      botonesPdf(f),
      vig && puede('facturacion.crear') && f.saldo > 0 && f.paciente_id ? '<button class="dova-btn-secundario" data-asociar>Asociar un cobro</button>' : '',
      vig && puede('facturacion.editar') ? '<button class="dova-btn-secundario" data-editar>Corregir datos del cliente</button>' : '',
      vig && puede('facturacion.anular') && f.saldo > 0 ? '<button class="dova-btn-secundario" data-nc>Nota de crédito</button>' : '',
      vig && puede('facturacion.anular') ? '<button class="dova-btn-secundario dova-ext-peligro" data-anular>Anular factura</button>' : '',
    ].join('');
    const filaDato = (t, v) => (v ? `<div><dt>${esc(t)}</dt><dd>${v}</dd></div>` : '');
    c.innerHTML = `
      <button class="dova-btn-link" data-volver>← Volver a facturas</button>
      <div class="dova-fac-det-cab">
        <div><h3 class="dova-fac-num">Factura ${esc(f.numero_completo)}</h3>
          <p class="dova-nota">${esc(f.tipo_nombre)} (no fiscal) · ${fmtFecha(f.fecha)} · ${f.condicion === 'credito' ? 'Crédito' : 'Contado'}</p></div>
        <div class="dova-fac-det-estado">${badgeEstado(f.estado)}<div class="dova-fac-total">${fmtGs(f.total)}</div></div>
      </div>
      <div class="dova-fac-acciones">${acciones}</div>
      ${f.estado === 'anulada' ? `<div class="dova-fac-anulada">Anulada el ${X.fmtFechaHora(f.anulada_en)} por ${esc(f.anulada_por_nombre || '-')}. <strong>Motivo:</strong> ${esc(f.motivo_anulacion || '-')}</div>` : ''}
      <div class="dova-fac-det-grid">
        <section class="dova-ext-caja"><h4>Cliente</h4><dl class="dova-fac-dl">
          ${filaDato('Nombre', f.paciente_id ? `<button class="dova-btn-link" data-pac="${f.paciente_id}">${esc(f.cliente_nombre)}</button>` : `${esc(f.cliente_nombre)} <span class="dova-nota">(ingreso de caja, sin paciente)</span>`)}${filaDato('C.I.', esc(f.cliente_documento || ''))}${filaDato('RUC', esc(f.cliente_ruc || ''))}
          ${filaDato('Dirección', esc(f.cliente_direccion || ''))}${filaDato('Teléfono', esc(f.cliente_telefono || ''))}${filaDato('Email', esc(f.cliente_email || ''))}</dl></section>
        <section class="dova-ext-caja"><h4>Resumen</h4><dl class="dova-fac-dl">
          ${filaDato('Forma de pago', esc(f.metodo_pago ? nombreMetodo(mets, f.metodo_pago) : f.condicion === 'credito' ? 'A crédito' : '-'))}
          ${filaDato('Cobrado', fmtGs(f.cobrado))}${f.acreditado ? filaDato('Notas de crédito', fmtGs(f.acreditado)) : ''}${filaDato('Saldo', `<strong>${fmtGs(f.saldo)}</strong>`)}
          ${filaDato('Odontólogo/a', esc(f.odontologo_nombre || ''))}${filaDato('Emitida por', `${esc(f.creado_por_nombre || '-')} · ${X.fmtFechaHora(f.creado_en)}`)}
          ${filaDato('Última modificación', X.fmtFechaHora(f.actualizado_en))}${f.observaciones ? filaDato('Observaciones', esc(f.observaciones)) : ''}</dl></section>
      </div>
      <section class="dova-ext-caja"><h4>Conceptos</h4>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-fac-items"><thead><tr><th>Descripción</th><th>Tratamiento</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th>IVA</th><th>Subtotal</th></tr></thead><tbody>
        ${f.items.map((it) => `<tr><td>${esc(it.descripcion)}${it.pieza ? ` <span class="dova-nota">(pieza ${esc(it.pieza)})</span>` : ''}</td><td>${esc(it.tratamiento_nombre || '-')}</td><td>${num(it.cantidad)}</td><td>${fmtGs(it.precio_unitario)}</td><td>${num(it.descuento) ? fmtGs(it.descuento) : '-'}</td><td>${it.tasa_iva ? `${it.tasa_iva}%` : 'Exenta'}</td><td><strong>${fmtGs(it.subtotal)}</strong></td></tr>`).join('')}
        </tbody></table></div>
        <div class="dova-fac-totales">
          <div><span>Subtotal</span><span>${fmtGs(f.subtotal)}</span></div>
          ${num(f.descuento_total) ? `<div><span>Descuentos</span><span>− ${fmtGs(f.descuento_total)}</span></div>` : ''}
          ${num(f.exento) ? `<div><span>Exentas</span><span>${fmtGs(f.exento)}</span></div>` : ''}
          ${num(f.iva_5) ? `<div><span>IVA 5% (incluido)</span><span>${fmtGs(f.iva_5)}</span></div>` : ''}
          ${num(f.iva_10) ? `<div><span>IVA 10% (incluido)</span><span>${fmtGs(f.iva_10)}</span></div>` : ''}
          <div class="dova-fac-total-final"><span>Total</span><span>${fmtGs(f.total)}</span></div>
        </div></section>
      <div class="dova-fac-det-grid">
        <section class="dova-ext-caja"><h4>Cobros asociados</h4>
          ${f.movimiento ? `<p><strong>${fmtGs(f.movimiento.monto)}</strong> · ${esc(nombreMetodo(mets, f.movimiento.metodo))} · ingreso de caja "${esc(f.movimiento.concepto)}" · ${esc(f.movimiento.usuario_nombre || '-')}<br><span class="dova-nota">Caja del ${fmtFecha(f.movimiento.caja_fecha)} (${esc(f.movimiento.caja_estado)}) · movimiento #${f.movimiento.id}</span></p>` : ''}
          ${f.pagos.length ? `<ul class="dova-lista-simple">${f.pagos.map((p) => `<li class="${p.activo && p.estado === 'pagado' ? '' : 'dova-op-fila-apagada'}"><strong>${fmtGs(p.monto)}</strong> · ${esc(nombreMetodo(mets, p.metodo))} · ${fmtFecha(p.fecha)} · cobró ${esc(p.usuario_nombre || '-')}
            ${p.estado !== 'pagado' ? badge('cobro anulado', 'critica') : !p.activo ? badge('liberado al anular', 'info') : ''}
            <br><span class="dova-nota">${p.caja_movimiento_id ? `Caja del ${fmtFecha(p.caja_fecha)} (${esc(p.caja_estado)}) · movimiento #${p.caja_movimiento_id}` : 'No entró a la caja (se cobró con la caja cerrada o por otro medio)'}</span></li>`).join('')}</ul>`
            : f.movimiento ? '' : '<p class="dova-nota">Sin cobros asociados.</p>'}</section>
        <section class="dova-ext-caja"><h4>Presupuesto asociado</h4>
          ${f.presupuesto ? `<dl class="dova-fac-dl">${filaDato('Presupuesto', `N.º ${f.presupuesto.id} (${esc(f.presupuesto.estado)})`)}${filaDato('Total', fmtGs(f.presupuesto.total))}${filaDato('Pagado', fmtGs(f.presupuesto.pagado))}${filaDato('Pendiente', fmtGs(f.presupuesto.pendiente))}${filaDato('Facturado', fmtGs(f.presupuesto.facturado))}</dl>
            <p class="dova-nota">Facturas de este presupuesto: ${f.presupuesto.facturas.map((x) => `<button class="dova-btn-link" data-ir-fac="${x.id}">${esc(x.numero_completo)}</button>${x.estado === 'anulada' ? ' (anulada)' : ''}`).join(', ')}</p>` : '<p class="dova-nota">No está asociada a un presupuesto.</p>'}</section>
      </div>
      ${f.notas_credito.length ? `<section class="dova-ext-caja"><h4>Notas de crédito internas</h4><ul class="dova-lista-simple">${f.notas_credito.map((n) => `<li><strong>${esc(n.numero_completo)}</strong> · ${fmtFecha(n.fecha)} · ${fmtGs(n.monto)} · ${esc(n.motivo)} · ${esc(n.usuario_nombre || '-')} ${n.estado === 'anulada' ? badge('anulada', 'critica') : ''}</li>`).join('')}</ul></section>` : ''}
      <section class="dova-ext-caja"><h4>Historial</h4><ol class="dova-fac-historial">
        ${f.eventos.map((e) => {
          const d = e.detalle || {};
          const extra = e.tipo === 'anulada' ? `Motivo: ${esc(d.motivo)}` : e.tipo === 'estado' ? `${esc((ESTADO[d.de] || [d.de])[0])} → ${esc((ESTADO[d.a] || [d.a])[0])}${d.motivo ? ` (${esc(d.motivo)})` : ''}` : e.tipo === 'pago_asociado' ? `${fmtGs(d.monto)} · ${esc(nombreMetodo(mets, d.metodo))}` : e.tipo === 'nota_credito' ? `${esc(d.numero)} · ${fmtGs(d.monto)} · ${esc(d.motivo)}` : e.tipo === 'editada' ? `Cambió: ${Object.keys(d.cambios || {}).map((k) => esc(k.replace('cliente_', '').replace('_', ' '))).join(', ')}` : e.tipo === 'creada' ? `${fmtGs(d.total)} · ${esc((ESTADO[d.estado] || [d.estado])[0])}` : '';
          return `<li><span class="dova-fac-h-punto ${e.tipo}"></span><div><strong>${esc(EVENTOS[e.tipo] || e.tipo)}</strong> <span class="dova-nota">por ${esc(e.usuario_nombre || 'sistema')} · ${X.fmtFechaHora(e.creado_en)}</span>${extra ? `<br><span class="dova-nota">${extra}</span>` : ''}</div></li>`;
        }).join('')}</ol></section>`;
    const recargar = () => detalle(c, navegar, id);
    c.querySelector('[data-volver]').addEventListener('click', () => navegar('facturacion'));
    c.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
    c.querySelectorAll('[data-ir-fac]').forEach((b) => b.addEventListener('click', () => navegar('facturacion', `factura/${b.dataset.irFac}`)));
    enlazarPdf(c);
    const on = (sel, fn) => { const b = c.querySelector(sel); if (b) b.addEventListener('click', fn); };
    on('[data-anular]', async () => {
      const motivo = await confirmar(`¿Anular la factura ${f.numero_completo}?`, `<p>La factura no se borra: queda registrada como <strong>anulada</strong>, con el motivo, tu usuario y la fecha.</p><p class="dova-nota">Los cobros asociados NO se anulan ni salen de la caja: quedan libres para facturarse de nuevo. Si hay que devolver dinero, anulá el cobro aparte.</p>`, 'Anular factura', { peligro: true, campoMotivo: 'Motivo de la anulación' });
      if (!motivo) return;
      try { await DOVA.post(`/facturacion/${id}/anular`, { motivo }); toast('Factura anulada', 'ok'); recargar(); } catch (e) { toast(e.status === 403 ? 'No tenés permisos para anular facturas.' : e.message, 'error'); }
    });
    on('[data-editar]', () => X.modalForm('Corregir datos del cliente', [
      { k: 'clienteNombre', label: 'Nombre o razón social', req: true, max: 200, ancho: 'completo' }, { k: 'clienteDocumento', label: 'C.I.', max: 40 }, { k: 'clienteRuc', label: 'RUC', max: 40 },
      { k: 'clienteDireccion', label: 'Dirección', max: 300, ancho: 'completo' }, { k: 'clienteTelefono', label: 'Teléfono', max: 60 }, { k: 'clienteEmail', label: 'Email', max: 150 }, { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
    ], { clienteNombre: f.cliente_nombre, clienteDocumento: f.cliente_documento, clienteRuc: f.cliente_ruc, clienteDireccion: f.cliente_direccion, clienteTelefono: f.cliente_telefono, clienteEmail: f.cliente_email, observaciones: f.observaciones }, async (d) => {
      await DOVA.put(`/facturacion/${id}`, d); toast('Datos corregidos', 'ok'); recargar();
    }, { editando: true, extraHtml: '<p class="dova-nota">Los conceptos e importes no se pueden cambiar: si están mal, anulá la factura y emití una nueva.</p>' }));
    on('[data-nc]', () => X.modalForm('Nota de crédito interna', [
      { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1, max: f.saldo },
      { k: 'motivo', label: 'Motivo', tipo: 'textarea', req: true },
    ], { monto: f.saldo }, async (d) => {
      await DOVA.post(`/facturacion/${id}/notas-credito`, d); toast('Nota de crédito registrada', 'ok'); recargar();
    }, { textoBoton: 'Emitir nota de crédito', extraHtml: `<p class="dova-nota">Reduce el saldo de la factura (máximo ${fmtGs(f.saldo)}). Es un documento interno de DOVA, no una nota de crédito fiscal.</p>` }));
    on('[data-asociar]', async () => {
      const b = await DOVA.get(`/facturacion/borrador?pacienteId=${f.paciente_id}`).catch(() => ({ pagosDisponibles: [] }));
      const libres = b.pagosDisponibles.filter((p) => num(p.monto) <= f.saldo);
      if (!libres.length) { toast(b.pagosDisponibles.length ? `Los cobros sin factura de este paciente superan el saldo (${fmtGs(f.saldo)}).` : 'Este paciente no tiene cobros sin factura. Registrá el cobro en su ficha y volvé.', 'info'); return; }
      X.modalForm('Asociar un cobro', [{ k: 'pagoId', label: 'Cobro sin factura', tipo: 'select', req: true, opciones: libres.map((p) => [p.id, `${fmtFecha(p.fecha)} · ${fmtGs(p.monto)} · ${nombreMetodo(mets, p.metodo)}${p.concepto ? ` · ${p.concepto}` : ''}`]) }], {}, async (d) => {
        await DOVA.post(`/facturacion/${id}/pagos`, { pagoId: Number(d.pagoId) }); toast('Cobro asociado', 'ok'); recargar();
      }, { textoBoton: 'Asociar', extraHtml: `<p class="dova-nota">Saldo de la factura: ${fmtGs(f.saldo)}. El cobro ya está en la caja: asociarlo no la modifica.</p>` });
    });
  }

  // ---------------- Nueva factura ----------------
  async function formulario(c, navegar, prefijo) {
    c.innerHTML = cargando;
    const [mets, trats, odos, opc] = await Promise.all([metodos(), X.catalogo('tratamientos', '/tratamientos').catch(() => []), X.opcionesOdontologos(), opcionesCobro()]);
    let b = { items: [], pagoIds: [], pagosDisponibles: [], presupuestos: [], advertencias: [], config: {} };
    try { b = await DOVA.get(`/facturacion/borrador?${new URLSearchParams(Object.entries(prefijo).filter(([, v]) => v))}`); } catch (e) { toast(e.message, 'error'); }
    if (b.facturaExistente) {
      c.innerHTML = `<div class="dova-fac-vacio"><div class="dova-fac-vacio-icono">🧾</div><h3>Factura generada</h3><p>Este cobro ya tiene la factura <strong>${esc(b.facturaExistente.numero)}</strong>.</p>
        <p class="dova-nota">Para volver a facturarlo, primero hay que anular esa factura.</p><button class="dova-btn-primary" data-ir>Ver la factura ${esc(b.facturaExistente.numero)}</button></div>`;
      c.querySelector('[data-ir]').addEventListener('click', () => navegar('facturacion', `factura/${b.facturaExistente.id}`));
      return;
    }
    const ivaDef = b.config.ivaPorDefecto ?? 10;
    const estado = { pacienteId: b.paciente ? b.paciente.id : null, presupuestoId: b.presupuestoId || null, pagos: new Set(b.pagoIds || []) };
    const puedeCobrar = puede('pagos.create');
    c.innerHTML = `
      <form class="dova-fac-form" data-form novalidate>
        <div class="dova-fac-form-cab"><h3>Nueva factura</h3><p class="dova-nota">Tipo: <strong>Comprobante interno (no fiscal)</strong> · Número: <strong>se asigna al emitir</strong> (próximo: ${esc(b.config.proximoNumero || '-')})</p></div>
        <div data-avisos></div>
        <fieldset><legend>Cliente</legend>
          <div class="dova-ext-form-grid">
            <div class="dova-ext-campo dova-ext-campo-completo"><label>Paciente *</label>
              <input type="search" data-buscar-pac placeholder="Escribí nombre, apellido o cédula…" autocomplete="off" value="${esc(b.paciente ? b.paciente.nombre : '')}" ${b.paciente ? 'readonly' : ''}/>
              <div class="dova-op-resultados" data-pac-res></div>${b.paciente ? '<button type="button" class="dova-btn-link" data-cambiar-pac>Cambiar paciente</button>' : ''}</div>
            <div class="dova-ext-campo dova-ext-campo-completo"><label for="fc-nombre">Nombre o razón social *</label><input id="fc-nombre" name="clienteNombre" maxlength="200" required value="${esc((b.cliente || {}).nombre || '')}"/></div>
            <div class="dova-ext-campo"><label for="fc-doc">C.I.</label><input id="fc-doc" name="clienteDocumento" maxlength="40" value="${esc((b.cliente || {}).documento || '')}"/></div>
            <div class="dova-ext-campo"><label for="fc-ruc">RUC</label><input id="fc-ruc" name="clienteRuc" maxlength="40" placeholder="ej. 4567890-1" value="${esc((b.cliente || {}).ruc || '')}"/></div>
            <div class="dova-ext-campo dova-ext-campo-completo"><label for="fc-dir">Dirección</label><input id="fc-dir" name="clienteDireccion" maxlength="300" value="${esc((b.cliente || {}).direccion || '')}"/></div>
            <div class="dova-ext-campo"><label for="fc-tel">Teléfono</label><input id="fc-tel" name="clienteTelefono" maxlength="60" value="${esc((b.cliente || {}).telefono || '')}"/></div>
            <div class="dova-ext-campo"><label for="fc-mail">Email</label><input id="fc-mail" type="email" name="clienteEmail" maxlength="150" value="${esc((b.cliente || {}).email || '')}"/></div>
            <div class="dova-ext-campo dova-ext-campo-completo"><label class="dova-ext-check"><input type="checkbox" name="guardarEnFicha"/> Guardar el RUC y la razón social en la ficha del paciente</label></div>
          </div></fieldset>
        <fieldset><legend>Factura</legend>
          <div class="dova-ext-form-grid">
            <div class="dova-ext-campo"><label for="fc-fecha">Fecha *</label><input id="fc-fecha" type="date" name="fecha" max="${hoy()}" value="${esc(b.fecha || hoy())}" required/></div>
            <div class="dova-ext-campo"><label for="fc-cond">Condición *</label><select id="fc-cond" name="condicion"><option value="contado" ${b.condicion !== 'credito' ? 'selected' : ''}>Contado</option><option value="credito" ${b.condicion === 'credito' ? 'selected' : ''}>Crédito</option></select></div>
            <div class="dova-ext-campo"><label for="fc-met">Método de pago</label><select id="fc-met" name="metodoPago"><option value="">—</option>${mets.map((m) => `<option value="${esc(m.codigo)}" ${b.metodoPago === m.codigo ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></div>
            <div class="dova-ext-campo"><label for="fc-pres">Presupuesto</label><select id="fc-pres" name="presupuestoId"><option value="">— ninguno —</option>${(b.presupuestos || []).map((p) => `<option value="${p.id}" ${String(b.presupuestoId) === String(p.id) ? 'selected' : ''}>N.º ${p.id} · ${fmtFecha(p.fecha)} · ${fmtGs(p.total)} (${esc(p.estado)})</option>`).join('')}</select></div>
            <div class="dova-ext-campo"><label for="fc-odo">Odontólogo/a</label><select id="fc-odo" name="odontologoId"><option value="">—</option>${odos.map(([oid, n]) => `<option value="${oid}" ${String(b.odontologoId) === String(oid) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          </div>
          <div data-pres-res></div></fieldset>
        <fieldset><legend>Conceptos</legend>
          <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-op-items dova-fac-items-form"><thead><tr><th>Tratamiento / descripción</th><th>Pieza</th><th>Cant.</th><th>Precio unit.</th><th>Descuento</th><th>IVA</th><th>Subtotal</th><th></th></tr></thead><tbody data-items></tbody></table></div>
          <button type="button" class="dova-btn-secundario" data-agregar>+ Agregar concepto</button>
          <div class="dova-fac-totales" data-totales></div>
          <p class="dova-nota">Precios con IVA incluido. El total definitivo lo calcula el servidor al emitir.</p></fieldset>
        <fieldset><legend>Cobro</legend><div data-cobros></div></fieldset>
        <div class="dova-ext-campo dova-ext-campo-completo"><label for="fc-obs">Observaciones</label><textarea id="fc-obs" name="observaciones" rows="2" maxlength="1000"></textarea></div>
        <p class="dova-error-text" data-error style="display:none" role="alert"></p>
        ${puede('facturacion.imprimir') ? `<label class="dova-ext-check"><input type="checkbox" name="imprimirAlEmitir" ${opc.imprimirAlFacturar ? 'checked' : ''}/> Imprimir al emitir (${opc.formatoImpresion === 'ticket' ? 'ticket' : 'hoja A4'})</label>` : ''}
        <div class="dova-fac-form-pie"><button type="button" class="dova-btn-secundario" data-cancelar>Cancelar</button><button class="dova-btn-primary" data-emitir>Emitir factura</button></div>
      </form>`;
    const form = c.querySelector('[data-form]');
    const tbody = form.querySelector('[data-items]');
    const avisos = (l) => { form.querySelector('[data-avisos]').innerHTML = (l || []).map((a) => `<p class="dova-nota dova-nota-alerta">⚠️ ${esc(a)}</p>`).join(''); };
    avisos(b.advertencias);

    // Conceptos
    const fila = (it = {}) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-t aria-label="Tratamiento"><option value="">— Otro (escribir) —</option>${trats.filter((t) => t.activo !== false).map((t) => `<option value="${t.id}" data-p="${num(t.precio)}" ${String(it.tratamientoId) === String(t.id) ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select><input data-desc maxlength="250" placeholder="Descripción" aria-label="Descripción" value="${esc(it.descripcion || '')}"/></td>
        <td data-l="Pieza"><input data-pieza maxlength="10" size="3" aria-label="Pieza" value="${esc(it.pieza || '')}"/></td>
        <td data-l="Cantidad"><input data-cant type="number" min="1" step="1" aria-label="Cantidad" value="${it.cantidad || 1}"/></td>
        <td data-l="Precio unit."><input data-precio type="number" min="0" step="1000" aria-label="Precio" value="${num(it.precioUnitario)}"/></td>
        <td data-l="Descuento"><input data-descuento type="number" min="0" step="1000" aria-label="Descuento" value="${num(it.descuento)}"/></td>
        <td data-l="IVA"><select data-iva aria-label="IVA">${[[10, '10%'], [5, '5%'], [0, 'Exenta']].map(([v, t]) => `<option value="${v}" ${Number(it.tasaIva ?? ivaDef) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td data-sub data-l="Subtotal">-</td><td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar aria-label="Quitar">✕</button></td>`;
      tr.dataset.presItem = it.presupuestoItemId || '';
      tbody.appendChild(tr);
      const sel = tr.querySelector('[data-t]');
      sel.addEventListener('change', () => { const o = sel.selectedOptions[0]; if (sel.value) { tr.querySelector('[data-desc]').value = o.textContent; tr.querySelector('[data-precio]').value = o.dataset.p; } tr.dataset.presItem = ''; calcular(); });
      tr.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', calcular));
      tr.querySelector('[data-quitar]').addEventListener('click', () => { tr.remove(); calcular(); });
    };
    const leerItems = () => [...tbody.querySelectorAll('tr')].map((tr) => ({
      tratamientoId: tr.querySelector('[data-t]').value ? Number(tr.querySelector('[data-t]').value) : undefined,
      presupuestoItemId: tr.dataset.presItem ? Number(tr.dataset.presItem) : undefined,
      descripcion: tr.querySelector('[data-desc]').value.trim(), pieza: tr.querySelector('[data-pieza]').value.trim() || undefined,
      cantidad: Number(tr.querySelector('[data-cant]').value || 0), precioUnitario: Number(tr.querySelector('[data-precio]').value || 0),
      descuento: Number(tr.querySelector('[data-descuento]').value || 0), tasaIva: Number(tr.querySelector('[data-iva]').value),
    })).filter((i) => i.descripcion || i.tratamientoId);
    let total = 0;
    function calcular() {
      let bruto = 0; let desc = 0; let i5 = 0; let i10 = 0; total = 0;
      tbody.querySelectorAll('tr').forEach((tr) => {
        const l = Math.round(Number(tr.querySelector('[data-cant]').value || 0) * Number(tr.querySelector('[data-precio]').value || 0));
        const d = Math.round(Number(tr.querySelector('[data-descuento]').value || 0)); const s = Math.max(l - d, 0); const iva = Number(tr.querySelector('[data-iva]').value);
        bruto += l; desc += d; total += s; if (iva === 10) i10 += Math.round(s / 11); else if (iva === 5) i5 += Math.round(s / 21);
        tr.querySelector('[data-sub]').textContent = fmtGs(s);
      });
      form.querySelector('[data-totales]').innerHTML = `<div><span>Subtotal</span><span>${fmtGs(bruto)}</span></div>${desc ? `<div><span>Descuentos</span><span>− ${fmtGs(desc)}</span></div>` : ''}${i5 ? `<div><span>IVA 5% (incluido)</span><span>${fmtGs(i5)}</span></div>` : ''}${i10 ? `<div><span>IVA 10% (incluido)</span><span>${fmtGs(i10)}</span></div>` : ''}<div class="dova-fac-total-final"><span>Total</span><span>${fmtGs(total)}</span></div>`;
      renderCobros();
    }
    // Cobros: vincular los ya registrados (no se duplica la caja) o cobrar ahora.
    function renderCobros() {
      const cont = form.querySelector('[data-cobros]');
      const lista = b.pagosDisponibles || [];
      const elegido = lista.filter((p) => estado.pagos.has(p.id)).reduce((s, p) => s + num(p.monto), 0);
      const contado = form.condicion.value === 'contado';
      const falta = Math.max(total - elegido, 0);
      const cobrarPrevio = cont.querySelector('[name="cobrarAhora"]');
      const cobrarMarcado = cobrarPrevio ? cobrarPrevio.checked : (contado && !elegido && puedeCobrar);
      cont.innerHTML = `${lista.length ? `<p class="dova-nota">Cobros de este paciente que todavía no tienen factura. Vincularlos <strong>no</strong> vuelve a sumar dinero a la caja.</p>
        <ul class="dova-fac-pagos">${lista.map((p) => `<li><label class="dova-ext-check"><input type="checkbox" data-pago="${p.id}" ${estado.pagos.has(p.id) ? 'checked' : ''}/> ${fmtFecha(p.fecha)} · <strong>${fmtGs(p.monto)}</strong> · ${esc(nombreMetodo(mets, p.metodo))}${p.concepto ? ` · ${esc(p.concepto)}` : ''}</label></li>`).join('')}</ul>`
        : '<p class="dova-nota">Este paciente no tiene cobros sin factura.</p>'}
        <p>Cobros vinculados: <strong>${fmtGs(elegido)}</strong> · Falta: <strong>${fmtGs(falta)}</strong>${elegido > total ? ' <span class="dova-error-text">(superan el total)</span>' : ''}</p>
        ${puedeCobrar && falta > 0 ? `<label class="dova-ext-check"><input type="checkbox" name="cobrarAhora" ${cobrarMarcado ? 'checked' : ''}/> Cobrar ahora ${fmtGs(falta)} (se registra el cobro y entra una sola vez a la caja)</label>` : ''}
        ${falta > 0 && !cobrarMarcado ? `<p class="dova-nota">La factura va a quedar <strong>pendiente</strong> por ${fmtGs(falta)} hasta que se asocie un cobro.</p>` : ''}`;
      cont.querySelectorAll('[data-pago]').forEach((x) => x.addEventListener('change', () => { if (x.checked) estado.pagos.add(Number(x.dataset.pago)); else estado.pagos.delete(Number(x.dataset.pago)); renderCobros(); }));
      const ca = cont.querySelector('[name="cobrarAhora"]'); if (ca) ca.addEventListener('change', renderCobros);
    }
    const resumenPres = async () => {
      const r = form.querySelector('[data-pres-res]');
      if (!estado.presupuestoId) { r.innerHTML = ''; return; }
      try { const p = await DOVA.get(`/facturacion/presupuesto/${estado.presupuestoId}/resumen`); r.innerHTML = `<p class="dova-nota">Presupuesto N.º ${p.id}: total ${fmtGs(p.total)} · pagado ${fmtGs(p.pagado)} · pendiente ${fmtGs(p.pendiente)} · ya facturado ${fmtGs(p.facturado)}</p>`; } catch (_e) { r.innerHTML = ''; }
    };
    (b.items.length ? b.items : [{}]).forEach(fila);
    calcular(); resumenPres();
    form.querySelector('[data-agregar]').addEventListener('click', () => { fila(); calcular(); });
    form.condicion.addEventListener('change', () => { const ca = form.querySelector('[name="cobrarAhora"]'); if (ca) ca.checked = form.condicion.value === 'contado'; renderCobros(); });
    // Cargar datos al elegir paciente o presupuesto (lo que DOVA ya sabe).
    const recargarBorrador = async (q) => {
      const nb = await DOVA.get(`/facturacion/borrador?${new URLSearchParams(q)}`);
      b = { ...nb, config: b.config };
      estado.pacienteId = nb.paciente.id; estado.pagos = new Set(nb.pagoIds || []);
      const cl = nb.cliente || {};
      form.clienteNombre.value = cl.nombre || ''; form.clienteDocumento.value = cl.documento || ''; form.clienteRuc.value = cl.ruc || '';
      form.clienteDireccion.value = cl.direccion || ''; form.clienteTelefono.value = cl.telefono || ''; form.clienteEmail.value = cl.email || '';
      form.presupuestoId.innerHTML = `<option value="">— ninguno —</option>${nb.presupuestos.map((p) => `<option value="${p.id}" ${String(nb.presupuestoId) === String(p.id) ? 'selected' : ''}>N.º ${p.id} · ${fmtFecha(p.fecha)} · ${fmtGs(p.total)} (${esc(p.estado)})</option>`).join('')}`;
      if (nb.odontologoId) form.odontologoId.value = nb.odontologoId;
      if (nb.metodoPago) form.metodoPago.value = nb.metodoPago;
      if (nb.condicion) form.condicion.value = nb.condicion;
      if (nb.items.length) { tbody.innerHTML = ''; nb.items.forEach(fila); }
      avisos(nb.advertencias); calcular(); resumenPres();
    };
    form.presupuestoId.addEventListener('change', async () => {
      estado.presupuestoId = form.presupuestoId.value ? Number(form.presupuestoId.value) : null;
      if (estado.pacienteId && estado.presupuestoId) { try { await recargarBorrador({ pacienteId: estado.pacienteId, presupuestoId: estado.presupuestoId }); } catch (e) { toast(e.message, 'error'); } } else resumenPres();
    });
    // Buscador de paciente
    const inp = form.querySelector('[data-buscar-pac]'); const resPac = form.querySelector('[data-pac-res]'); let tmr = null;
    const cp = form.querySelector('[data-cambiar-pac]'); if (cp) cp.addEventListener('click', () => { inp.readOnly = false; inp.value = ''; inp.focus(); cp.remove(); });
    inp.addEventListener('input', () => {
      clearTimeout(tmr); const q = inp.value.trim(); if (q.length < 2) { resPac.innerHTML = ''; return; }
      tmr = setTimeout(async () => {
        try {
          const r = await DOVA.get(`/pacientes?q=${encodeURIComponent(q)}&pageSize=8`);
          resPac.innerHTML = (r.data || r.items || r).map((p) => `<button type="button" class="dova-op-res-item" data-id="${p.id}">${esc(p.nombre)} ${esc(p.apellido)} <span class="dova-nota">${p.ci ? 'C.I. ' + esc(p.ci) : ''}</span></button>`).join('') || '<p class="dova-nota">Sin resultados.</p>';
          resPac.querySelectorAll('[data-id]').forEach((x) => x.addEventListener('click', async () => {
            resPac.innerHTML = ''; inp.value = x.textContent.replace(/\s+C\.I\..*$/, '').trim(); inp.readOnly = true;
            try { await recargarBorrador({ pacienteId: x.dataset.id }); } catch (e) { toast(e.message, 'error'); }
          }));
        } catch (e) { resPac.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      }, 250);
    });
    form.querySelector('[data-cancelar]').addEventListener('click', () => navegar('facturacion'));
    let enviando = false;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (enviando) return; // sin doble envío
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      const mostrar = (m) => { err.textContent = m; err.style.display = 'block'; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      const items = leerItems();
      if (!estado.pacienteId) return mostrar('Elegí el paciente.');
      if (!form.clienteNombre.value.trim()) return mostrar('Falta el nombre o razón social del cliente.');
      if (!items.length) return mostrar('Agregá al menos un concepto.');
      if (items.some((i) => !i.descripcion)) return mostrar('Cada concepto necesita una descripción.');
      if (items.some((i) => i.descuento > i.cantidad * i.precioUnitario)) return mostrar('Un descuento es mayor que el importe del concepto.');
      if (total <= 0) return mostrar('El total tiene que ser mayor a cero.');
      const cobrar = form.querySelector('[name="cobrarAhora"]');
      const elegidos = (b.pagosDisponibles || []).filter((p) => estado.pagos.has(p.id));
      const falta = Math.max(total - elegidos.reduce((s, p) => s + num(p.monto), 0), 0);
      if (form.condicion.value === 'contado' && !form.metodoPago.value) return mostrar('Elegí el método de pago.');
      const datos = {
        pacienteId: estado.pacienteId, presupuestoId: estado.presupuestoId || undefined, fecha: form.fecha.value, condicion: form.condicion.value,
        metodoPago: form.metodoPago.value || undefined, odontologoId: form.odontologoId.value ? Number(form.odontologoId.value) : undefined,
        clienteNombre: form.clienteNombre.value, clienteDocumento: form.clienteDocumento.value, clienteRuc: form.clienteRuc.value,
        clienteDireccion: form.clienteDireccion.value, clienteTelefono: form.clienteTelefono.value, clienteEmail: form.clienteEmail.value,
        guardarEnFicha: form.guardarEnFicha.checked, observaciones: form.observaciones.value, items, pagoIds: [...estado.pagos],
        registrarCobro: cobrar && cobrar.checked && falta > 0 ? { monto: falta, metodo: form.metodoPago.value || 'efectivo' } : undefined,
      };
      const btn = form.querySelector('[data-emitir]');
      enviando = true; btn.disabled = true; btn.textContent = 'Emitiendo…';
      try {
        const f = await DOVA.post('/facturacion', datos);
        toast(`Factura ${f.numero_completo} creada correctamente.`, 'ok');
        const imp = form.querySelector('[name="imprimirAlEmitir"]');
        navegar('facturacion', `factura/${f.id}`);
        if (imp && imp.checked) imprimirPdf(f.id, f.numero_completo);
      } catch (e) {
        mostrar(e.status === 403 ? 'No tenés permisos para emitir facturas.' : e.message);
        enviando = false; btn.disabled = false; btn.textContent = 'Emitir factura';
      }
    });
  }

  // ---------------- Reportes ----------------
  const PERIODOS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['mes', 'Este mes'], ['mes_ant', 'Mes anterior'], ['anio', 'Este año'], ['custom', 'Personalizado']];
  function rango(p) {
    const h = hoy();
    if (p === 'hoy') return [h, h];
    if (p === 'ayer') { const a = sumarDias(h, -1); return [a, a]; }
    if (p === '7d') return [sumarDias(h, -6), h];
    if (p === 'mes') return [`${h.slice(0, 8)}01`, h];
    if (p === 'mes_ant') { const ini = new Date(`${h.slice(0, 8)}01T12:00:00Z`); ini.setUTCMonth(ini.getUTCMonth() - 1); const d = ini.toISOString().slice(0, 10); return [d, sumarDias(`${h.slice(0, 8)}01`, -1)]; }
    if (p === 'anio') return [`${h.slice(0, 4)}-01-01`, h];
    return [null, null];
  }
  const AGRUPAR = [['dia', 'Por día'], ['mes', 'Por mes'], ['odontologo', 'Por odontólogo'], ['tratamiento', 'Por tratamiento'], ['paciente', 'Por paciente'], ['metodo', 'Por método de pago'], ['estado', 'Por estado (incluye anuladas)']];
  async function reportes(c, st = { periodo: 'mes', agrupar: 'dia' }) {
    let [desde, hasta] = st.periodo === 'custom' ? [st.desde, st.hasta] : rango(st.periodo);
    const q = new URLSearchParams({ agrupar: st.agrupar, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) });
    c.innerHTML = `
      <form class="dova-fac-filtros-form" data-rep>
        <div><label>Período</label><select name="periodo">${PERIODOS.map(([v, t]) => `<option value="${v}" ${st.periodo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div data-custom style="display:${st.periodo === 'custom' ? 'contents' : 'none'}"><div><label>Desde</label><input type="date" name="desde" value="${esc(st.desde || '')}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${esc(st.hasta || '')}"/></div></div>
        <div><label>Ver</label><select name="agrupar">${AGRUPAR.map(([v, t]) => `<option value="${v}" ${st.agrupar === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="dova-fac-f-botones"><button class="dova-btn-primary">Ver reporte</button></div>
      </form><div data-r>${cargando}</div>`;
    const form = c.querySelector('[data-rep]');
    form.periodo.addEventListener('change', () => { c.querySelector('[data-custom]').style.display = form.periodo.value === 'custom' ? 'contents' : 'none'; });
    form.addEventListener('submit', (ev) => { ev.preventDefault(); reportes(c, { periodo: form.periodo.value, agrupar: form.agrupar.value, desde: form.desde.value, hasta: form.hasta.value }); });
    const r = c.querySelector('[data-r]');
    let rep;
    try { rep = await DOVA.get(`/facturacion/reporte?${q}`); } catch (e) { r.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return; }
    const t = rep.totales;
    const kpi = (v, l, alerta) => `<div class="dova-ext-kpi ${alerta ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${v}</div><div class="dova-ext-kpi-label">${esc(l)}</div></div>`;
    r.innerHTML = `
      <p class="dova-nota">${desde ? `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}` : 'Desde el inicio'}</p>
      <div class="dova-ext-kpis">${kpi(fmtGs(t.facturado), 'Total facturado')}${kpi(fmtGs(t.cobrado), 'Total cobrado')}${kpi(fmtGs(t.pendiente), 'Total pendiente', t.pendiente > 0)}${kpi(t.emitidas, 'Facturas emitidas')}${kpi(t.pendientes, 'Facturas pendientes', t.pendientes > 0)}${kpi(`${t.anuladas}`, `Anuladas (${fmtGs(t.totalAnulado)})`)}</div>
      ${rep.filas.length ? `<div class="dova-toolbar"><span></span><div><button class="dova-btn-secundario" data-csv>Excel / CSV</button> <button class="dova-btn-secundario" data-pdf>PDF</button></div></div>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Detalle</th><th>Facturas</th><th>Facturado</th><th>Cobrado</th><th>Pendiente</th></tr></thead><tbody>
        ${rep.filas.map((f) => `<tr><td>${esc(f.etiqueta)}</td><td>${f.facturas}</td><td>${fmtGs(f.total)}</td><td>${fmtGs(f.cobrado)}</td><td>${f.pendiente ? `<strong>${fmtGs(f.pendiente)}</strong>` : fmtGs(0)}</td></tr>`).join('')}
        </tbody></table></div><div data-g></div>`
        : '<div class="dova-fac-vacio"><div class="dova-fac-vacio-icono">📊</div><h3>Sin facturas en este período</h3><p class="dova-nota">Elegí otro período.</p></div>'}`;
    if (!rep.filas.length) return;
    if (['dia', 'mes'].includes(st.agrupar) && rep.filas.length >= 2) {
      const s = { titulo: 'Facturado', etiquetas: rep.filas.map((f) => f.etiqueta.slice(0, 5)), valores: rep.filas.map((f) => f.total), formato: 'gs' };
      const g = r.querySelector('[data-g]'); g.innerHTML = X.grafico(s); X.activarGraficos(g, [s]);
    }
    r.querySelector('[data-csv]').addEventListener('click', () => X.descargarCsv(`facturacion-${st.agrupar}-${desde || 'inicio'}-${hasta || hoy()}.csv`, rep.filas, [
      { t: 'Detalle', csv: (f) => f.etiqueta }, { t: 'Facturas', csv: (f) => f.facturas }, { t: 'Facturado', csv: (f) => f.total }, { t: 'Cobrado', csv: (f) => f.cobrado }, { t: 'Pendiente', csv: (f) => f.pendiente }]));
    r.querySelector('[data-pdf]').addEventListener('click', () => DOVA.descargarPdf(`/facturacion/reporte/pdf?${q}`, `reporte-facturacion-${st.agrupar}.pdf`).catch((e) => toast(e.message, 'error')));
  }

  // ---------------- Configuración ----------------
  async function configuracion(c) {
    const cfg = await DOVA.get('/facturacion/config');
    let mets = (cfg.metodos_pago || []).map((m) => ({ ...m }));
    c.innerHTML = `
      <div class="dova-fac-aviso-box"><strong>Comprobante interno vs. factura fiscal.</strong> Lo que emite DOVA es un comprobante interno para el paciente y el control de la clínica. La factura fiscal válida ante la SET (timbrada o electrónica) requiere una integración que DOVA todavía no tiene; el timbrado se guarda solo para cuando se haga esa integración y <strong>no</strong> se imprime.</div>
      <form data-datos class="dova-ext-caja"><h4>Datos del consultorio</h4>
        ${X.formHtml([
          { k: 'nombreComercial', label: 'Nombre comercial', max: 150 }, { k: 'razonSocial', label: 'Razón social', max: 200 }, { k: 'ruc', label: 'RUC', max: 40 },
          { k: 'telefono', label: 'Teléfono', max: 60 }, { k: 'email', label: 'Email', max: 150 }, { k: 'direccion', label: 'Dirección', ancho: 'completo', max: 300 },
          { k: 'ivaPorDefecto', label: 'IVA por defecto', tipo: 'select', req: true, opciones: [[10, '10%'], [5, '5%'], [0, 'Exenta']] },
          { k: 'pieTexto', label: 'Texto del pie del comprobante', tipo: 'textarea' },
          { k: 'timbrado', label: 'Timbrado (para futura integración fiscal)', max: 20 }, { k: 'timbradoVence', label: 'Vencimiento del timbrado', tipo: 'fecha' },
        ], { nombreComercial: cfg.nombre_comercial, razonSocial: cfg.razon_social, ruc: cfg.ruc, telefono: cfg.telefono, email: cfg.email, direccion: cfg.direccion, ivaPorDefecto: cfg.iva_por_defecto, pieTexto: cfg.pie_texto, timbrado: cfg.timbrado, timbradoVence: cfg.timbrado_vence })}
        <button class="dova-btn-primary">Guardar datos</button> ${cfg.actualizado_por_nombre ? `<span class="dova-nota">Último cambio: ${esc(cfg.actualizado_por_nombre)} · ${X.fmtFechaHora(cfg.actualizado_en)}</span>` : ''}</form>
      <div class="dova-ext-caja"><h4>Logo</h4><div class="dova-fac-logo">${cfg.tiene_logo ? '<img data-logo alt="Logo actual" />' : '<span class="dova-nota">Sin logo: el comprobante muestra solo el nombre.</span>'}</div>
        <form data-logo-form><input type="file" name="logo" accept="image/png,image/jpeg" required aria-label="Logo"/> <button class="dova-btn-secundario">Subir logo</button> ${cfg.tiene_logo ? '<button type="button" class="dova-btn-link dova-ext-peligro" data-quitar-logo>Quitar logo</button>' : ''}</form>
        <p class="dova-nota">PNG o JPG de hasta 500 KB.</p></div>
      <form data-num class="dova-ext-caja"><h4>Numeración</h4>
        <p class="dova-nota">Formato <strong>establecimiento-punto-número</strong>, ej. 001-001-0000123. La asigna el servidor al emitir: no se repite aunque varias personas emitan a la vez. Último número usado: <strong>${cfg.serie.ultimo_usado || 'ninguno'}</strong>.</p>
        <div class="dova-fac-filtros-form"><div><label>Establecimiento</label><input name="establecimiento" maxlength="3" inputmode="numeric" value="${esc(cfg.establecimiento)}" required/></div>
        <div><label>Punto de expedición</label><input name="puntoExpedicion" maxlength="3" inputmode="numeric" value="${esc(cfg.punto_expedicion)}" required/></div>
        <div><label>Próximo número</label><input name="siguienteNumero" type="number" min="${(cfg.serie.ultimo_usado || 0) + 1}" value="${cfg.serie.siguiente_numero}"/></div>
        <div class="dova-fac-f-botones"><button class="dova-btn-secundario">Guardar numeración</button></div></div>
        <p class="dova-nota">Próxima factura: <strong data-prox>${esc(cfg.proximo_numero)}</strong></p></form>
      <form data-cobrar class="dova-ext-caja"><h4>Al registrar un cobro o ingreso</h4>
        <label class="dova-ext-check"><input type="checkbox" name="facturarAlCobrar" ${cfg.facturar_al_cobrar ? 'checked' : ''}/> Marcar "Generar factura" por defecto</label>
        <label class="dova-ext-check"><input type="checkbox" name="imprimirAlFacturar" ${cfg.imprimir_al_facturar ? 'checked' : ''}/> Imprimir automáticamente al generar la factura</label>
        <div class="dova-fac-filtros-form"><div><label for="fac-formato">Formato de impresión</label><select id="fac-formato" name="formatoImpresion">
          <option value="a4" ${cfg.formato_impresion === 'a4' ? 'selected' : ''}>Hoja A4</option><option value="ticket" ${cfg.formato_impresion === 'ticket' ? 'selected' : ''}>Ticket 80 mm (impresora térmica)</option></select></div>
          <div class="dova-fac-f-botones"><button class="dova-btn-secundario">Guardar</button></div></div>
        <p class="dova-nota">Para que imprima sin mostrar el cuadro de impresión en la compu de recepción, abrí Chrome con la opción <code>--kiosk-printing</code> (usa la impresora predeterminada).</p></form>
      <div class="dova-ext-caja"><h4>Métodos de pago</h4><p class="dova-nota">Los que se ofrecen al cobrar y al facturar. "Efectivo" no se puede quitar porque la caja lo usa (sí desactivar).</p>
        <div data-mets></div><button type="button" class="dova-btn-link" data-agregar-met>+ Agregar método</button><br><button type="button" class="dova-btn-secundario" data-guardar-mets>Guardar métodos de pago</button></div>`;
    if (cfg.tiene_logo) {
      try { const r = await DOVA.request('/facturacion/config/logo', { raw: true }); if (r.ok) c.querySelector('[data-logo]').src = URL.createObjectURL(await r.blob()); } catch (_e) { /* */ }
    }
    const fd = c.querySelector('[data-datos]');
    fd.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = X.leerForm(fd, [{ k: 'nombreComercial' }, { k: 'razonSocial' }, { k: 'ruc' }, { k: 'telefono' }, { k: 'email' }, { k: 'direccion' }, { k: 'ivaPorDefecto', tipo: 'numero' }, { k: 'pieTexto' }, { k: 'timbrado' }, { k: 'timbradoVence' }], true);
      const btn = fd.querySelector('button'); btn.disabled = true;
      try { await DOVA.put('/facturacion/config', d); toast('Datos de facturación guardados', 'ok'); } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
    });
    const fcob = c.querySelector('[data-cobrar]');
    fcob.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await DOVA.put('/facturacion/config', { facturarAlCobrar: fcob.facturarAlCobrar.checked, imprimirAlFacturar: fcob.imprimirAlFacturar.checked, formatoImpresion: fcob.formatoImpresion.value });
        opcionesCache = null; toast('Preferencias de cobro guardadas', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
    const fl = c.querySelector('[data-logo-form]');
    fl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = fl.logo.files[0]; if (!f) return;
      if (f.size > 500 * 1024) { toast('El logo no puede pesar más de 500 KB', 'error'); return; }
      const datos = new FormData(); datos.append('logo', f);
      try { await DOVA.postForm('/facturacion/config/logo', datos); toast('Logo guardado', 'ok'); configuracion(c); } catch (e) { toast(e.message, 'error'); }
    });
    const ql = c.querySelector('[data-quitar-logo]');
    if (ql) ql.addEventListener('click', async () => { if (!(await confirmar('¿Quitar el logo?', '<p>Los comprobantes van a mostrar solo el nombre.</p>', 'Quitar'))) return; try { await DOVA.del('/facturacion/config/logo'); toast('Logo quitado', 'ok'); configuracion(c); } catch (e) { toast(e.message, 'error'); } });
    const fn = c.querySelector('[data-num]');
    fn.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!(await confirmar('¿Cambiar la numeración?', '<p>Las facturas ya emitidas no cambian. El cambio queda registrado en el historial de cambios.</p>', 'Cambiar numeración'))) return;
      try { const r = await DOVA.put('/facturacion/config/numeracion', { establecimiento: fn.establecimiento.value, puntoExpedicion: fn.puntoExpedicion.value, siguienteNumero: fn.siguienteNumero.value }); fn.querySelector('[data-prox]').textContent = r.proximo_numero; toast('Numeración actualizada', 'ok'); } catch (e) { toast(e.message, 'error'); }
    });
    const lm = c.querySelector('[data-mets]');
    const pintarMets = () => {
      lm.innerHTML = `<ul class="dova-fac-mets">${mets.map((m, i) => `<li><input data-nom="${i}" value="${esc(m.nombre)}" maxlength="40" aria-label="Nombre del método"/><code>${esc(m.codigo)}</code><label class="dova-ext-check"><input type="checkbox" data-act="${i}" ${m.activo !== false ? 'checked' : ''}/> Activo</label>${m.codigo !== 'efectivo' && m.nuevo ? `<button type="button" class="dova-btn-link dova-ext-peligro" data-del="${i}">Quitar</button>` : ''}</li>`).join('')}</ul>`;
      lm.querySelectorAll('[data-nom]').forEach((x) => x.addEventListener('input', () => { mets[x.dataset.nom].nombre = x.value; }));
      lm.querySelectorAll('[data-act]').forEach((x) => x.addEventListener('change', () => { mets[x.dataset.act].activo = x.checked; }));
      lm.querySelectorAll('[data-del]').forEach((x) => x.addEventListener('click', () => { mets.splice(Number(x.dataset.del), 1); pintarMets(); }));
    };
    pintarMets();
    c.querySelector('[data-agregar-met]').addEventListener('click', () => X.modalForm('Nuevo método de pago', [{ k: 'nombre', label: 'Nombre (ej. Giro Tigo)', req: true, max: 40 }], {}, async (d) => {
      const codigo = d.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      if (codigo.length < 2 || mets.some((m) => m.codigo === codigo)) throw new Error('Ese método ya existe o el nombre es muy corto');
      mets.push({ codigo, nombre: d.nombre, activo: true, nuevo: true }); pintarMets();
    }));
    c.querySelector('[data-guardar-mets]').addEventListener('click', async () => {
      try { const r = await DOVA.put('/facturacion/config', { metodosPago: mets.map(({ codigo, nombre, activo }) => ({ codigo, nombre, activo })) }); mets = r.metodos_pago.map((m) => ({ ...m })); metodosCache = null; opcionesCache = null; pintarMets(); toast('Métodos de pago guardados', 'ok'); } catch (e) { toast(e.message, 'error'); }
    });
  }

  // =================================================================
  // INTEGRACIÓN CON LA FICHA DEL PACIENTE
  // =================================================================
  async function panelPaciente(c, pid, navegar) {
    const r = await DOVA.get(`/facturacion/paciente/${pid}/resumen`);
    const kpi = (v, l, alerta) => `<div class="dova-ext-kpi ${alerta ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${v}</div><div class="dova-ext-kpi-label">${esc(l)}</div></div>`;
    c.innerHTML = `
      <div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Facturación</h3>${puede('facturacion.crear') ? '<button class="dova-btn-primary" data-nueva>+ Nueva factura</button>' : ''}</div>
      <div class="dova-ext-kpis">${kpi(fmtGs(r.totalFacturado), 'Total facturado')}${kpi(fmtGs(r.totalPagado), 'Total pagado')}${kpi(fmtGs(r.totalPendiente), 'Total pendiente', r.totalPendiente > 0)}${kpi(r.anuladas, 'Facturas anuladas')}</div>
      ${r.facturas.length ? `<div class="dova-fac-cards dova-fac-cards-siempre">${r.facturas.map((f) => `
        <article class="dova-fac-card ${f.estado === 'anulada' ? 'anulada' : ''}"><header><button class="dova-btn-link" data-ver="${f.id}"><strong>${esc(f.numero_completo)}</strong></button>${badgeEstado(f.estado)}</header>
          <div class="dova-nota">${fmtFecha(f.fecha)} · ${esc(f.concepto || '-')}</div>
          <div class="dova-fac-card-pie"><strong>${fmtGs(f.total)}</strong>${f.estado === 'pendiente' ? `<span class="dova-nota">debe ${fmtGs(num(f.total) - num(f.cobrado))}</span>` : ''}</div>
          <div class="dova-fac-card-acciones"><button class="dova-btn-secundario" data-ver="${f.id}">Ver</button>${botonesPdf(f)}</div></article>`).join('')}</div>`
        : '<p class="dova-nota">Este paciente todavía no tiene facturas.</p>'}`;
    c.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => navegar('facturacion', `factura/${b.dataset.ver}`)));
    const n = c.querySelector('[data-nueva]'); if (n) n.addEventListener('click', () => navegar('facturacion', `nueva/paciente/${pid}`));
    enlazarPdf(c);
  }

  return {
    seccion, panelPaciente, metodos, verPdf, descargarPdf, imprimirPdf, AVISO_INTERNO, olvidarMetodos: () => { metodosCache = null; opcionesCache = null; },
    opcionesCobro, bloqueFacturaHtml, activarBloqueFactura, leerBloqueFactura, facturarIngreso,
  };
})();
window.DovaFacturacion = DovaFacturacion;
