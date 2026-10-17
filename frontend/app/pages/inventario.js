/* DOVA — Inventario (Reportes → Inventario).
   Pestañas: Insumos, Por vencer, Registrar compra, Proveedores y Kits por tratamiento.
   Uso: DovaInventario.inventario(contenedor). */
const DovaInventario = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy, etiqueta, badge } = X;
  const num = (valor) => Number(valor || 0);

  // =================================================================
  // INVENTARIO
  // =================================================================
  async function inventario(root) {
    root.innerHTML = `<h2 class="dova-view-title">Inventario</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'insumos', texto: 'Insumos', visible: true, render: insumos },
      { id: 'vencen', texto: 'Por vencer', visible: true, render: porVencer },
      { id: 'compras', texto: 'Registrar compra', visible: puede('proveedores.manage'), render: compra },
      { id: 'prov', texto: 'Proveedores', visible: true, render: proveedores },
      { id: 'kits', texto: 'Kits por tratamiento', visible: true, render: kits },
    ]);
  }

  // Kit de insumos de cada tratamiento: se descuenta solo al registrar una sesión realizada.
  async function kits(c) {
    const maneja = puede('inventario.manage');
    const lista = await DOVA.get('/inventario/kits');
    c.innerHTML = `<p class="dova-nota">Cargá qué insumos se usan en cada sesión de un tratamiento. Al registrar una sesión realizada, DOVA los descuenta del stock solo y avisa si algo se está por acabar.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Insumos del kit</th><th></th></tr></thead><tbody>
      ${lista.map((t) => `<tr><td>${esc(t.nombre)}${t.activo ? '' : ` ${badge('inactivo', 'info')}`}</td><td>${t.insumos ? `${t.insumos}` : '<span class="dova-nota">Sin kit</span>'}</td>
        <td class="dova-ext-acciones"><button class="dova-btn-link" data-kit="${t.id}">${maneja ? (t.insumos ? 'Editar kit' : 'Armar kit') : 'Ver kit'}</button></td></tr>`).join('') || '<tr><td colspan="3" class="dova-vacio">No hay tratamientos en el catálogo.</td></tr>'}
      </tbody></table></div>`;
    c.querySelectorAll('[data-kit]').forEach((b) => b.addEventListener('click', () => editarKit(Number(b.dataset.kit), maneja, () => kits(c))));
  }

  async function editarKit(tratamientoId, maneja, alGuardar) {
    const [kit, insumosLista] = await Promise.all([DOVA.get(`/inventario/kits/${tratamientoId}`), DOVA.get('/inventario/insumos')]);
    const activos = insumosLista.filter((i) => i.activo !== false);
    const fila = (it = {}) => `<div class="dova-kit-fila" data-fila>
        <select data-insumo aria-label="Insumo" ${maneja ? '' : 'disabled'}><option value="">Elegí un insumo…</option>${activos.map((i) => `<option value="${i.id}" ${Number(it.insumoId) === i.id ? 'selected' : ''}>${esc(i.nombre)} (stock ${num(i.stock_actual)})</option>`).join('')}</select>
        <input type="number" data-cant min="0.01" step="0.01" value="${it.cantidad || 1}" aria-label="Cantidad por sesión" ${maneja ? '' : 'disabled'} />
        ${maneja ? '<button type="button" class="dova-btn-link dova-ext-peligro" data-quitar>Quitar</button>' : ''}</div>`;
    const box = X.modal(`Kit — ${kit.tratamiento}`, `<form data-kit-form>
        <p class="dova-nota">Cantidad que se usa en <strong>cada sesión</strong>.</p>
        <div data-filas>${kit.items.length ? kit.items.map(fila).join('') : (maneja ? fila() : '<p class="dova-nota">Este tratamiento no tiene kit.</p>')}</div>
        ${maneja ? '<button type="button" class="dova-btn-secundario" data-agregar>+ Agregar insumo</button>' : ''}
        <p class="dova-error-text" data-err hidden></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>${maneja ? 'Cancelar' : 'Cerrar'}</button>${maneja ? '<button class="dova-btn-primary">Guardar kit</button>' : ''}</div>
      </form>`, { ancho: 'ancho' });
    if (!box || !maneja) return;
    const filas = box.querySelector('[data-filas]');
    const enganchar = () => filas.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => b.closest('[data-fila]').remove(); });
    enganchar();
    box.querySelector('[data-agregar]').addEventListener('click', () => { filas.insertAdjacentHTML('beforeend', fila()); enganchar(); });
    box.querySelector('[data-kit-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = box.querySelector('[data-err]'); err.hidden = true;
      const items = Array.from(filas.querySelectorAll('[data-fila]')).map((f) => ({ insumoId: Number(f.querySelector('[data-insumo]').value), cantidad: Number(f.querySelector('[data-cant]').value) })).filter((x) => x.insumoId);
      try { await DOVA.put(`/inventario/kits/${tratamientoId}`, { items }); toast(items.length ? 'Kit guardado' : 'Se quitó el kit', 'ok'); X.cerrarModal(); alGuardar(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  async function insumos(c, filtro = '') {
    const [lista, provs] = await Promise.all([DOVA.get('/inventario/insumos'), DOVA.get('/inventario/proveedores').catch(() => [])]);
    const maneja = puede('inventario.manage');
    const h = hoy();
    const f = filtro.toLowerCase();
    const vis = lista.filter((i) => !f || `${i.nombre} ${i.categoria || ''}`.toLowerCase().includes(f));
    c.innerHTML = `
      <div class="dova-toolbar"><input type="search" data-filtro placeholder="Buscar insumo…" value="${esc(filtro)}" style="max-width:280px"/>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo insumo</button>' : ''}</div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Vence</th><th>Proveedor</th><th></th></tr></thead><tbody>
      ${vis.map((i) => {
        const bajo = num(i.stock_actual) <= num(i.stock_minimo);
        const vencido = i.fecha_vencimiento && String(i.fecha_vencimiento).slice(0, 10) < h;
        return `<tr class="${bajo ? 'dova-fila-alerta' : ''}"><td>${esc(i.nombre)}${i.lote ? ` <span class="dova-nota">lote ${esc(i.lote)}</span>` : ''}</td><td>${esc(i.categoria || '-')}</td>
          <td><strong>${num(i.stock_actual)}</strong> ${bajo ? badge('bajo', 'critica') : ''}</td><td>${num(i.stock_minimo)}</td>
          <td>${i.fecha_vencimiento ? `${fmtFecha(i.fecha_vencimiento)} ${vencido ? badge('vencido', 'critica') : ''}` : '-'}</td><td>${esc(i.proveedor_nombre || '-')}</td>
          <td class="dova-ext-acciones">${maneja ? `<button class="dova-btn-link" data-mov="${i.id}">Entrada / salida</button><button class="dova-btn-link" data-editar="${i.id}">Editar</button>` : ''}<button class="dova-btn-link" data-lotes="${i.id}">Lotes</button><button class="dova-btn-link" data-hist="${i.id}">Historial</button></td></tr>`;
      }).join('') || '<tr><td colspan="7">Sin insumos.</td></tr>'}
      </tbody></table></div>`;
    const fi = c.querySelector('[data-filtro]');
    let t = null;
    fi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => insumos(c, fi.value).then(() => { const n = c.querySelector('[data-filtro]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 300); });
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => X.modalForm('Nuevo insumo', [
      { k: 'nombre', label: 'Nombre', req: true, max: 150 },
      { k: 'categoria', label: 'Categoría', max: 80 },
      { k: 'stockActual', label: 'Stock inicial', tipo: 'numero', min: 0 },
      { k: 'stockMinimo', label: 'Avisar cuando queden menos de', tipo: 'numero', min: 0 },
      { k: 'proveedorId', label: 'Proveedor', tipo: 'select', opciones: provs.map((p) => [p.id, p.nombre]) },
      { k: 'precioCompra', label: 'Precio de compra (Gs.)', tipo: 'numero', min: 0 },
      { k: 'lote', label: 'Lote', max: 60 },
      { k: 'fechaVencimiento', label: 'Vencimiento', tipo: 'fecha' },
    ], { stockActual: 0, stockMinimo: 0 }, async (d) => {
      if (d.proveedorId) d.proveedorId = Number(d.proveedorId);
      await DOVA.post('/inventario/insumos', d); toast('Insumo creado', 'ok'); insumos(c, filtro);
    }));
    c.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', async () => {
      const i = lista.find((x) => String(x.id) === b.dataset.mov);
      const lotes = (await DOVA.get(`/inventario/insumos/${i.id}/lotes`).catch(() => [])).filter((l) => num(l.cantidad_actual) > 0);
      X.modalForm(`Movimiento — ${i.nombre}`, [
        { k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: [['entrada', 'Entrada (llegó mercadería)'], ['salida', 'Salida (uso)'], ['perdida', 'Pérdida / rotura'], ['vencimiento', 'Baja por vencimiento'], ['ajuste', 'Ajuste (fijar el stock contado)']] },
        { k: 'cantidad', label: 'Cantidad', tipo: 'numero', req: true, min: 0 },
        { k: 'lote', label: 'Lote (solo entradas)', max: 60 },
        { k: 'vencimiento', label: 'Vencimiento (solo entradas)', tipo: 'fecha' },
        ...(lotes.length ? [{ k: 'loteId', label: 'Sacar del lote (salidas)', tipo: 'select', opciones: lotes.map((l) => [l.id, `${l.lote || 'sin lote'}${l.vencimiento ? ` · vence ${fmtFecha(l.vencimiento)}` : ''} · quedan ${num(l.cantidad_actual)}`]) }] : []),
        { k: 'motivo', label: 'Motivo (obligatorio en pérdida, vencimiento y ajuste)', ancho: 'completo', max: 200 },
      ], { tipo: 'salida' }, async (d) => {
        if (d.tipo !== 'entrada') { delete d.lote; delete d.vencimiento; } else delete d.loteId;
        if (d.loteId) d.loteId = Number(d.loteId); else delete d.loteId;
        if (!d.vencimiento) delete d.vencimiento;
        const r = await DOVA.post(`/inventario/insumos/${i.id}/movimiento`, d);
        toast(`Stock actualizado: ${num(r.stock_actual)}`, 'ok'); insumos(c, filtro);
      }, { extraHtml: `<p class="dova-nota">Stock actual: <strong>${num(i.stock_actual)}</strong>. En "Ajuste" la cantidad es el stock que contaste. Si no elegís lote en una salida, se usa primero el que vence antes.</p>` });
    }));
    c.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      const i = lista.find((x) => String(x.id) === b.dataset.editar);
      X.modalForm(`Editar — ${i.nombre}`, [
        { k: 'nombre', label: 'Nombre', req: true, max: 150 },
        { k: 'categoria', label: 'Categoría', max: 80 },
        { k: 'stockMinimo', label: 'Avisar cuando queden menos de', tipo: 'numero', min: 0 },
        { k: 'proveedorId', label: 'Proveedor', tipo: 'select', opciones: provs.map((p) => [p.id, p.nombre]) },
        { k: 'precioCompra', label: 'Precio de compra (Gs.)', tipo: 'numero', min: 0 },
        { k: 'activo', label: 'Estado', tipo: 'select', req: true, opciones: [['si', 'Activo'], ['no', 'Inactivo (no se ofrece en consultas)']] },
      ], { nombre: i.nombre, categoria: i.categoria || '', stockMinimo: num(i.stock_minimo), proveedorId: i.proveedor_id || '', precioCompra: i.precio_compra !== null && i.precio_compra !== undefined ? num(i.precio_compra) : '', activo: i.activo === false ? 'no' : 'si' }, async (d) => {
        d.activo = d.activo !== 'no'; d.proveedorId = d.proveedorId ? Number(d.proveedorId) : null;
        await DOVA.put(`/inventario/insumos/${i.id}`, d); toast('Insumo actualizado', 'ok'); insumos(c, filtro);
      }, { extraHtml: '<p class="dova-nota">El stock no se edita acá: usá "Entrada / salida" para que quede registrado.</p>' });
    }));
    c.querySelectorAll('[data-lotes]').forEach((b) => b.addEventListener('click', async () => {
      const i = lista.find((x) => String(x.id) === b.dataset.lotes);
      const lotes = await DOVA.get(`/inventario/insumos/${i.id}/lotes`).catch(() => []);
      const h2 = hoy();
      X.modal(`Lotes — ${i.nombre}`, `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Lote</th><th>Vence</th><th>Ingresó</th><th>Quedan</th></tr></thead><tbody>
        ${lotes.map((l) => { const v = l.vencimiento && String(l.vencimiento).slice(0, 10) < h2; return `<tr class="${num(l.cantidad_actual) <= 0 ? 'dova-nota' : ''}"><td>${esc(l.lote || 'sin lote')}</td><td>${l.vencimiento ? `${fmtFecha(l.vencimiento)} ${v && num(l.cantidad_actual) > 0 ? badge('vencido', 'critica') : ''}` : '-'}</td><td>${num(l.cantidad_inicial)}</td><td><strong>${num(l.cantidad_actual)}</strong></td></tr>`; }).join('') || '<tr><td colspan="4">Sin lotes registrados.</td></tr>'}
        </tbody></table></div><p class="dova-nota">Las salidas descuentan primero del lote que vence antes.</p><div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    }));
    c.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', async () => {
      const i = lista.find((x) => String(x.id) === b.dataset.hist);
      const movs = await DOVA.get(`/inventario/insumos/${i.id}/movimientos`).catch(() => []);
      X.modal(`Historial — ${i.nombre}`, `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Lote</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>
        ${movs.map((m) => `<tr><td>${X.fmtFechaHora(m.fecha || m.creado_en)}</td><td>${esc(etiqueta(m.tipo))}</td><td>${num(m.cantidad)}</td><td>${esc(m.lote_nombre || '-')}</td><td>${esc(m.motivo || '')}</td><td>${esc(m.usuario_nombre || '-')}</td></tr>`).join('') || '<tr><td colspan="6">Sin movimientos.</td></tr>'}
        </tbody></table></div><div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    }));
  }

  async function porVencer(c, dias = 60) {
    const lista = await DOVA.get(`/inventario/vencimientos?dias=${dias}`);
    c.innerHTML = `<div class="dova-toolbar"><label>Mostrar lotes que vencen en los próximos <select data-dias>${[30, 60, 90, 180].map((d) => `<option value="${d}" ${d === dias ? 'selected' : ''}>${d} días</option>`).join('')}</select></label></div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Insumo</th><th>Lote</th><th>Vence</th><th>Quedan</th><th></th></tr></thead><tbody>
      ${lista.map((l) => `<tr class="${l.vencido ? 'dova-fila-alerta' : ''}"><td>${esc(l.nombre)}${l.categoria ? ` <span class="dova-nota">${esc(l.categoria)}</span>` : ''}</td><td>${esc(l.lote || 'sin lote')}</td>
        <td>${fmtFecha(l.vencimiento)} ${l.vencido ? badge('vencido', 'critica') : badge('por vencer', 'atencion')}</td><td>${num(l.cantidad_actual)}</td>
        <td>${puede('inventario.manage') ? `<button class="dova-btn-link" data-baja="${l.lote_id}" data-ins="${l.insumo_id}" data-cant="${num(l.cantidad_actual)}">Dar de baja</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No hay lotes con stock que venzan en ese período.</td></tr>'}
      </tbody></table></div>`;
    c.querySelector('[data-dias]').addEventListener('change', (e) => porVencer(c, Number(e.target.value)));
    c.querySelectorAll('[data-baja]').forEach((b) => b.addEventListener('click', () => X.modalForm('Baja por vencimiento', [
      { k: 'cantidad', label: 'Cantidad a dar de baja', tipo: 'numero', req: true, min: 0 },
      { k: 'motivo', label: 'Motivo', req: true, ancho: 'completo', max: 200 },
    ], { cantidad: Number(b.dataset.cant), motivo: 'Producto vencido' }, async (d) => {
      await DOVA.post(`/inventario/insumos/${b.dataset.ins}/movimiento`, { ...d, tipo: 'vencimiento', loteId: Number(b.dataset.baja) });
      toast('Baja registrada', 'ok'); porVencer(c, dias);
    })));
  }

  async function compra(c) {
    const [lista, provs] = await Promise.all([DOVA.get('/inventario/insumos'), DOVA.get('/inventario/proveedores').catch(() => [])]);
    c.innerHTML = `
      <form data-compra class="dova-ext-caja">
        <h4>Nueva compra</h4>
        <p class="dova-nota">Al guardar, el stock de cada insumo se suma automáticamente.</p>
        <div class="dova-ext-form-grid">
          <div class="dova-ext-campo"><label>Proveedor *</label><select name="proveedorId" required><option value="">—</option>${provs.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>
          <div class="dova-ext-campo"><label>Fecha</label><input type="date" name="fecha" value="${hoy()}"/></div>
        </div>
        <table class="dova-tabla dova-op-items"><thead><tr><th>Insumo</th><th>Cantidad</th><th>Precio unit.</th><th>Lote</th><th>Vence</th><th></th></tr></thead><tbody data-items></tbody></table>
        <button type="button" class="dova-btn-secundario" data-agregar>+ Agregar insumo</button>
        <p class="dova-op-total">Total: <strong data-total>Gs. 0</strong></p>
        <p class="dova-error-text" data-error style="display:none"></p>
        <button class="dova-btn-primary">Guardar compra</button>
      </form>`;
    const form = c.querySelector('[data-compra]');
    const tbody = form.querySelector('[data-items]');
    const total = () => { let s = 0; tbody.querySelectorAll('tr').forEach((tr) => { s += Number(tr.querySelector('[data-cant]').value || 0) * Number(tr.querySelector('input[data-precio]').value || 0); }); form.querySelector('[data-total]').textContent = fmtGs(s); };
    const fila = (ini) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select data-ins required><option value="">—</option>${lista.map((i) => `<option value="${i.id}" data-p="${num(i.precio_compra)}">${esc(i.nombre)}</option>`).join('')}</select></td>
        <td><input data-cant type="number" min="1" value="1" style="width:80px" required/></td><td><input data-precio type="number" min="0" step="100" value="0" style="width:120px"/></td>
        <td><input data-lote maxlength="60" style="width:100px" placeholder="opcional"/></td><td><input data-vence type="date"/></td>
        <td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar>✕</button></td>`;
      tbody.appendChild(tr);
      const sel = tr.querySelector('[data-ins]');
      sel.addEventListener('change', () => { tr.querySelector('input[data-precio]').value = sel.selectedOptions[0].dataset.p || 0; total(); });
      tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', total));
      tr.querySelector('[data-quitar]').addEventListener('click', () => { tr.remove(); total(); });
      if (ini && typeof ini === 'object' && !(ini instanceof Event)) {
        if (ini.tratamientoId) sel.value = String(ini.tratamientoId);
        tr.querySelector('[data-desc]').value = ini.descripcion || (sel.value ? sel.selectedOptions[0].textContent : '');
        tr.querySelector('[data-pieza]').value = ini.pieza || '';
        tr.querySelector('input[data-precio]').value = ini.precioUnitario !== undefined ? ini.precioUnitario : (sel.value ? sel.selectedOptions[0].dataset.p : 0);
      }
    };
    form.querySelector('[data-agregar]').addEventListener('click', () => fila());
    fila(); // una fila vacía para empezar
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('[data-error]'); err.style.display = 'none';
      const items = [...tbody.querySelectorAll('tr')].map((tr) => ({ insumoId: Number(tr.querySelector('[data-ins]').value), cantidad: Number(tr.querySelector('[data-cant]').value), precioUnitario: Number(tr.querySelector('input[data-precio]').value || 0), lote: tr.querySelector('[data-lote]').value.trim() || undefined, vencimiento: tr.querySelector('[data-vence]').value || undefined })).filter((i) => i.insumoId);
      try {
        if (!items.length) throw new Error('Agregá al menos un insumo');
        await DOVA.post('/inventario/compras', { proveedorId: Number(form.proveedorId.value), fecha: form.fecha.value || undefined, items, total: items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0) });
        toast('Compra registrada y stock actualizado', 'ok'); compra(c);
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }

  async function proveedores(c) {
    const lista = await DOVA.get('/inventario/proveedores');
    const maneja = puede('proveedores.manage');
    c.innerHTML = `
      <div class="dova-toolbar"><span></span>${maneja ? '<button class="dova-btn-primary" data-nuevo>+ Nuevo proveedor</button>' : ''}</div>
      <table class="dova-tabla"><thead><tr><th>Proveedor</th><th>Teléfono</th><th>Email</th><th>Productos</th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td>${esc(p.nombre)}${p.empresa ? ` <span class="dova-nota">${esc(p.empresa)}</span>` : ''}</td><td>${esc(p.telefono || p.whatsapp || '-')}</td><td>${esc(p.email || '-')}</td><td>${esc(p.productos || '-')}</td></tr>`).join('') || '<tr><td colspan="4">Sin proveedores.</td></tr>'}
      </tbody></table>`;
    const bn = c.querySelector('[data-nuevo]');
    if (bn) bn.addEventListener('click', () => X.modalForm('Nuevo proveedor', [
      { k: 'nombre', label: 'Nombre', req: true, max: 150 }, { k: 'empresa', label: 'Empresa', max: 150 },
      { k: 'telefono', label: 'Teléfono', max: 40 }, { k: 'whatsapp', label: 'WhatsApp', max: 40 }, { k: 'email', label: 'Email', max: 150 },
      { k: 'productos', label: 'Qué provee', ancho: 'completo' }, { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
    ], {}, async (d) => { await DOVA.post('/inventario/proveedores', d); toast('Proveedor creado', 'ok'); proveedores(c); }));
  }

  return { inventario };
})();
window.DovaInventario = DovaInventario;

DovaPantallas.registrar('inventario', { dibujar: (contenedor) => DovaInventario.inventario(contenedor) });
