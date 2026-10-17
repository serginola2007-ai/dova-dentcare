/* DOVA — Finanzas (Reportes → Finanzas).
   Quién debe, avisos de cobro, cobro online, comisiones, rentabilidad, metas, seguros y convenios,
   listas de precios y cierre de meses. Uso: DovaFinanzas.finanzas(contenedor, navegar). */
const DovaFinanzas = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, etiqueta, badge } = X;
  const { linkPac, kpi, montar } = DovaSeccionBase;
  const OPC = (lista) => lista.map((valor) => [valor, etiqueta(valor)]);

  // ================================ FINANZAS ================================
  async function finanzas(root, nav) {
    montar(root, nav);
    root.innerHTML = `<h2 class="dova-view-title">Finanzas</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'deuda', texto: 'Quién debe y desde cuándo', visible: puede('cuenta_corriente.view', 'reportes.view'), render: subDeuda },
      { id: 'cobro', texto: 'Avisos de cobro', visible: puede('cobranza.manage'), render: subCobro },
      { id: 'online', texto: 'Cobro online', visible: puede('cobro_online.manage'), render: (c) => DovaPlataforma.cobroOnline(c) },
      { id: 'comisiones', texto: 'Comisiones', visible: puede('comisiones.view', 'comisiones.manage'), render: subComisiones },
      { id: 'rentabilidad', texto: 'Rentabilidad', visible: puede('rentabilidad.view'), render: subRentabilidad },
      { id: 'metas', texto: 'Metas', visible: puede('metas.manage', 'kpis.view', 'comisiones.view'), render: subMetas },
      { id: 'seguros', texto: 'Seguros y convenios', visible: puede('aseguradoras.manage'), render: subSeguros },
      { id: 'listas', texto: 'Listas de precios', visible: puede('listas_precios.manage'), render: subListas },
      { id: 'cierre', texto: 'Cerrar meses', visible: puede('clinica.config.manage'), render: subCierre },
    ]);
  }

  // Avisos de cobro por WhatsApp: cuotas por vencer o vencidas y presupuestos sin respuesta.
  async function subCobro(c) {
    const puedeCfg = puede('clinica.config.manage');
    const [cfg, l] = await Promise.all([DOVA.get('/cobranza/config'), DOVA.get('/cobranza/pendientes')]);
    const ultimo = (x) => (x.avisos || []).filter((a) => a.estado !== 'fallo').slice(-1)[0];
    const ESTADO = { enviando: 'Enviando', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', respondido: 'Respondió', fallo: 'No se pudo enviar' };
    const avisos = (x) => {
      const ok = (x.avisos || []).filter((a) => a.estado !== 'fallo');
      const fallo = (x.avisos || []).find((a) => a.estado === 'fallo');
      const u = ultimo(x);
      return `${ok.length ? `${ok.length} · <span class="dova-nota">${esc(ESTADO[u.estado] || u.estado)} ${fmtFecha(u.en)}${u.canal === 'whatsapp_manual' ? ' (a mano)' : ''}</span>` : '<span class="dova-nota">Ninguno</span>'}${fallo ? ` <span title="${esc(fallo.error || '')}">${badge('Falló', 'critica')}</span>` : ''}`;
    };
    const acciones = (x) => {
      if (x.noEnviable) return `<span class="dova-nota">${esc(x.noEnviable)}</span>`;
      if (x.etapa === null || x.etapa === undefined) return `<span class="dova-nota">${esc(x.motivo || '')}</span>`;
      return `${x.toca ? `${badge('Toca hoy', 'atencion')} ` : `<span class="dova-nota">${esc(x.motivo || '')}</span> `}
        ${l.whatsappConectado ? `<button type="button" class="dova-btn-link" data-cob-enviar="${x.tipo}:${x.id}">Enviar</button>` : ''}
        <button type="button" class="dova-btn-link dova-link-wa" data-cob-manual="${x.tipo}:${x.id}">Mandar por mi WhatsApp</button>`;
    };
    const dibujarCfg = () => `<details class="dova-rec-config" data-cob-cfg><summary>Configurar los avisos</summary>
      <form class="dova-ext-filtros dova-cob-form">
        <label class="dova-check"><input type="checkbox" name="automatico" ${cfg.automatico ? 'checked' : ''} ${cfg.whatsappConectado ? '' : 'disabled'}/> Mandar los avisos solos${cfg.whatsappConectado ? '' : ' (necesita WhatsApp Business)'}</label>
        <div><label>Hora de envío</label><select name="hora">${Array.from({ length: 13 }, (_, i) => i + 8).map((h) => `<option value="${h}" ${cfg.hora === h ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
        <div><label>Avisar antes de que venza</label><select name="diasAntes">${[0, 1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${cfg.diasAntes === d ? 'selected' : ''}>${d ? `${d} día${d === 1 ? '' : 's'} antes` : 'No avisar'}</option>`).join('')}</select></div>
        <div><label>Si vence sin pagar, repetir cada</label><select name="repetirDias">${[3, 5, 7, 10, 15, 30].map((d) => `<option value="${d}" ${cfg.repetirDias === d ? 'selected' : ''}>${d} días</option>`).join('')}</select></div>
        <div><label>Hasta cuántos avisos</label><select name="maxAvisos">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${cfg.maxAvisos === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <label class="dova-check"><input type="checkbox" name="presupuestos" ${cfg.presupuestos ? 'checked' : ''}/> Seguir los presupuestos sin respuesta</label>
        <div><label>Primer aviso del presupuesto</label><select name="presupuestoDias">${[2, 3, 5, 7, 10, 15].map((d) => `<option value="${d}" ${cfg.presupuestoDias === d ? 'selected' : ''}>${d} días después de enviado</option>`).join('')}</select></div>
        <button class="dova-btn-primary">Guardar</button>
      </form>
      <p class="dova-nota"><strong>Así le llega una cuota vencida:</strong></p><p class="dova-rec-ejemplo">${esc(cfg.ejemplos.cuota)}</p>
      <p class="dova-nota"><strong>Así le llega un presupuesto:</strong></p><p class="dova-rec-ejemplo">${esc(cfg.ejemplos.presupuesto)}</p>
      <p class="dova-nota">El enlace abre una página con lo que tiene pendiente, los datos para pagar y, si los pagos online están activos, para mandar el comprobante (llega a Página web → Pagos para revisar). En un presupuesto puede avisar que quiere empezar o que tiene una consulta: te llega a la campanita.</p>
    </details>`;
    c.innerHTML = `<div class="dova-rec-estado">
        <div><span class="dova-vivo-punto ${l.whatsappConectado ? 'ok' : ''}"></span> <strong>WhatsApp Business:</strong> ${l.whatsappConectado ? 'conectado' : 'sin conectar'} <span class="dova-nota">${l.whatsappConectado ? '' : '— los mandás desde tu WhatsApp con el botón verde (el mensaje ya va armado).'}</span></div>
        <div><strong>Envío automático:</strong> ${l.automatico ? `todos los días a las ${cfg.hora} h` : 'apagado'}</div>
        <div><strong>Para avisar hoy:</strong> ${l.tocanHoy}</div>
      </div>
      ${puedeCfg ? dibujarCfg() : ''}
      <label class="dova-check"><input type="checkbox" data-solo-hoy/> Ver solo los que toca avisar hoy</label>
      <h3 class="dova-section-title">Cuotas por vencer y vencidas</h3><div data-cuotas></div>
      <h3 class="dova-section-title">Presupuestos sin respuesta</h3><div data-press></div>`;
    const pintar = (lista) => {
      c.querySelector('[data-cuotas]').innerHTML = lista.cuotas.length ? `<table class="dova-tabla"><thead><tr><th>Paciente</th><th>Cuota</th><th>Monto</th><th>Vence</th><th>Avisos</th><th></th></tr></thead><tbody>
        ${lista.cuotas.map((x) => `<tr><td>${linkPac(x.pacienteId, x.paciente, '')}</td><td>${x.numero} de ${x.de}</td><td>${fmtGs(x.monto)}</td>
          <td>${fmtFecha(x.vencimiento)}${x.diasAtraso ? ` ${badge(`${x.diasAtraso} día${x.diasAtraso === 1 ? '' : 's'} de atraso`, 'critica')}` : ''}${x.enRevision ? ` ${badge('Comprobante en revisión', 'info')}` : ''}</td>
          <td>${avisos(x)}</td><td>${acciones(x)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">No hay cuotas por vencer ni vencidas.</p>';
      c.querySelector('[data-press]').innerHTML = lista.presupuestos.length ? `<table class="dova-tabla"><thead><tr><th>Paciente</th><th>Presupuesto</th><th>Total</th><th>Enviado hace</th><th>Avisos</th><th></th></tr></thead><tbody>
        ${lista.presupuestos.map((x) => `<tr><td>${linkPac(x.pacienteId, x.paciente, '')}</td><td>${fmtFecha(x.fecha)}${x.odontologo ? ` <span class="dova-nota">${esc(x.odontologo)}</span>` : ''}</td><td>${fmtGs(x.total)}</td>
          <td>${x.dias} día${x.dias === 1 ? '' : 's'}</td><td>${avisos(x)}</td><td>${acciones(x)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">No hay presupuestos esperando respuesta.</p>';
    };
    pintar(l);
    const recargar = () => subCobro(c);
    c.querySelector('[data-solo-hoy]').addEventListener('change', async (e) => { try { pintar(await DOVA.get(`/cobranza/pendientes${e.target.checked ? '?soloHoy=1' : ''}`)); } catch (ex) { X.toast(ex.message, 'error'); } });
    // onclick (no addEventListener): al recargar la pestaña no se suma un segundo manejador.
    c.onclick = async (e) => {
      const env = e.target.closest('[data-cob-enviar]'); const man = e.target.closest('[data-cob-manual]');
      if (env) {
        const [tipo, id] = env.dataset.cobEnviar.split(':'); env.disabled = true;
        try { await DOVA.post(`/cobranza/${tipo}/${id}/enviar`); X.toast('Aviso enviado', 'ok'); recargar(); } catch (ex) { X.toast(ex.message, 'error'); env.disabled = false; }
      } else if (man) {
        const [tipo, id] = man.dataset.cobManual.split(':');
        // La ventana se abre antes del pedido (si no, el navegador la bloquea).
        const w = window.open('', '_blank');
        try { const r = await DOVA.post(`/cobranza/${tipo}/${id}/enlace`); if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url; recargar(); } catch (ex) { if (w) w.close(); X.toast(ex.message, 'error'); }
      }
    };
    const f = c.querySelector('.dova-cob-form');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await DOVA.put('/cobranza/config', { automatico: f.automatico.checked, hora: Number(f.hora.value), diasAntes: Number(f.diasAntes.value), repetirDias: Number(f.repetirDias.value), maxAvisos: Number(f.maxAvisos.value), presupuestos: f.presupuestos.checked, presupuestoDias: Number(f.presupuestoDias.value) });
        X.toast('Configuración guardada', 'ok'); recargar();
      } catch (ex) { X.toast(ex.message, 'error'); }
    });
  }

  async function subDeuda(c) {
    const r = await DOVA.get('/finanzas/antiguedad-deuda');
    const t = r.totales;
    const cols = [
      { t: 'Paciente', v: (f) => linkPac(f.paciente.id, f.paciente.nombre, f.paciente.apellido), csv: (f) => `${f.paciente.nombre} ${f.paciente.apellido}` },
      { t: 'Saldo', v: (f) => `<strong>${fmtGs(f.saldo)}</strong>`, csv: (f) => f.saldo },
      { t: '0–30', v: (f) => (f.tramos['0_30'] ? fmtGs(f.tramos['0_30']) : '-'), csv: (f) => f.tramos['0_30'] },
      { t: '31–60', v: (f) => (f.tramos['31_60'] ? fmtGs(f.tramos['31_60']) : '-'), csv: (f) => f.tramos['31_60'] },
      { t: '61–90', v: (f) => (f.tramos['61_90'] ? fmtGs(f.tramos['61_90']) : '-'), csv: (f) => f.tramos['61_90'] },
      { t: '+90', v: (f) => (f.tramos['90_mas'] ? `<strong style="color:var(--rust)">${fmtGs(f.tramos['90_mas'])}</strong>` : '-'), csv: (f) => f.tramos['90_mas'] },
      { t: 'Último pago', v: (f) => fmtFecha(f.ultimoPago), csv: (f) => f.ultimoPago || '' },
      { t: 'Teléfono', v: (f) => esc(f.paciente.whatsapp || f.paciente.telefono || '-'), csv: (f) => f.paciente.whatsapp || f.paciente.telefono || '' },
    ];
    c.innerHTML = `<div class="dova-ext-kpis">${kpi(fmtGs(t.saldo), 'Total a cobrar')}${kpi(fmtGs(t['0_30']), '0–30 días')}${kpi(fmtGs(t['31_60']), '31–60 días')}${kpi(fmtGs(t['61_90']), '61–90 días', { alerta: t['61_90'] > 0 })}${kpi(fmtGs(t['90_mas']), 'Más de 90 días', { alerta: t['90_mas'] > 0 })}</div>
      <div class="dova-ext-toolbar"><span class="dova-nota">${r.filas.length} paciente(s) con saldo. Pagos imputados primero a las deudas más antiguas.</span><button class="dova-btn-link" data-csv>Descargar lista (Excel)</button></div>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr>${cols.map((x) => `<th>${x.t}</th>`).join('')}<th></th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr>${cols.map((x) => `<td>${x.v(f)}</td>`).join('')}<td>${puede('seguimiento.manage', 'whatsapp.send') ? `<button class="dova-btn-link" data-cobrar="${f.paciente.id}" data-monto="${f.saldo}">WhatsApp</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">No hay saldos pendientes.</td></tr>'}</tbody></table></div>`;
    c.querySelector('[data-csv]').addEventListener('click', () => X.descargarCsv(`deudas-${X.hoy()}.csv`, r.filas, cols));
    c.querySelectorAll('[data-cobrar]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const m = await DOVA.post('/seguimiento/mensaje', { pacienteId: Number(b.dataset.cobrar), plantilla: 'cobranza', datos: { monto: Number(b.dataset.monto) } });
        if (!m.whatsapp_link) throw new Error('El paciente no tiene teléfono válido');
        window.open(m.whatsapp_link, '_blank', 'noopener');
        await DOVA.post('/seguimiento/comunicaciones', { pacienteId: Number(b.dataset.cobrar), canal: 'whatsapp', motivo: 'cobranza', resultado: 'enviado', contenido: m.texto });
      } catch (e) { X.toast(e.message, 'error'); }
    }));
  }

  async function subComisiones(c) {
    const gestiona = puede('comisiones.manage');
    const [ods, trats] = await Promise.all([X.opcionesOdontologos(), X.catalogo('tratamientos', '/tratamientos').catch(() => [])]);
    const inicio = `${X.hoy().slice(0, 7)}-01`;
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${inicio}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      ${gestiona ? `<div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${ods.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>` : ''}<button class="dova-btn-secundario">Calcular</button></form>
      <p class="dova-nota">Producción = sesiones realizadas × (precio neto del plan ÷ sesiones). Comisión = producción × % de la regla (específica del tratamiento o general), menos el costo de laboratorio × % general si la regla lo indica.</p>
      <div data-res></div>${gestiona ? '<div data-reglas></div><div data-liq></div>' : ''}`;
    const f = c.querySelector('[data-f]');
    const calcular = async () => {
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
      const r = await DOVA.get(`/finanzas/comisiones?${q}`);
      const res = c.querySelector('[data-res]');
      res.innerHTML = `<table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Sesiones</th><th>Trabajos realizados (Gs.)</th><th>Comisión antes de descontar</th><th>Costo de laboratorio</th><th>Comisión a pagar</th><th></th></tr></thead><tbody>
        ${r.odontologos.map((o, i) => `<tr><td><strong>${esc(o.odontologo)}</strong>${o.sinRegla ? ` ${badge(`${o.sinRegla} sin regla`, 'atencion')}` : ''}</td><td>${o.sesiones}</td><td>${fmtGs(o.produccion)}</td><td>${fmtGs(o.comisionBruta)}</td><td>${o.descuentoLaboratorio ? `− ${fmtGs(o.descuentoLaboratorio)}` : '-'}</td><td><strong>${fmtGs(o.comision)}</strong></td>
          <td class="dova-ext-acciones"><button class="dova-btn-link" data-det="${i}">Detalle</button>${gestiona ? `<button class="dova-btn-link" data-liquidar="${o.odontologoId}">Registrar pago de comisión</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Sin producción en el período.</td></tr>'}</tbody></table>`;
      res.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => {
        const o = r.odontologos[Number(b.dataset.det)];
        X.modal(`Detalle — ${o.odontologo}`, `<div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Paciente</th><th>Plan</th><th>Valor</th><th>%</th><th>Comisión</th></tr></thead><tbody>${o.detalle.map((d) => `<tr><td>${fmtFecha(d.fecha)}</td><td>${esc(d.paciente)}</td><td>${esc(d.plan)}</td><td>${fmtGs(d.valor)}</td><td>${d.porcentaje}%</td><td>${fmtGs(d.comision)}</td></tr>`).join('')}</tbody></table></div><div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
      }));
      res.querySelectorAll('[data-liquidar]').forEach((b) => b.addEventListener('click', async () => {
        try { await DOVA.post('/finanzas/comisiones/liquidar', { odontologoId: Number(b.dataset.liquidar), desde: f.desde.value, hasta: f.hasta.value }); X.toast('Liquidación generada', 'ok'); cargarLiq(); } catch (e) { X.toast(e.message, 'error'); }
      }));
    };
    const cargarLiq = () => gestiona && X.tablaCrud({
      root: c.querySelector('[data-liq]'), titulo: 'Liquidaciones', endpoint: '/finanzas/comision-liquidaciones', puedeEditar: true,
      columnas: [{ t: 'Odontólogo', v: (r) => esc(r.odontologo_nombre) }, { t: 'Período', v: (r) => `${fmtFecha(r.desde)} → ${fmtFecha(r.hasta)}` }, { t: 'Trabajos realizados', v: (r) => fmtGs(r.produccion) }, { t: 'Comisión', v: (r) => `<strong>${fmtGs(r.comision)}</strong>` }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'pagada' ? 'ok' : r.estado === 'anulada' ? 'critica' : 'atencion') }],
      campos: [{ k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['borrador', 'aprobada', 'pagada', 'anulada']) }],
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
    await calcular();
    if (gestiona) {
      X.tablaCrud({
        root: c.querySelector('[data-reglas]'), titulo: 'Reglas de comisión', endpoint: '/finanzas/comision-reglas', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
        descripcion: 'Una regla general por odontólogo (sin tratamiento) y, si hace falta, reglas específicas por tratamiento que tienen prioridad.',
        columnas: [{ t: 'Odontólogo', v: (r) => esc(r.odontologo_nombre) }, { t: 'Tratamiento', v: (r) => esc(r.tratamiento_nombre || 'General (todos)') }, { t: '%', v: (r) => `${Number(r.porcentaje)}%` }, { t: 'Descuenta laboratorio', v: (r) => (r.descontar_laboratorio ? 'Sí' : 'No') }, { t: 'Activa', v: (r) => (r.activa ? 'Sí' : 'No') }],
        campos: [{ k: 'odontologoId', label: 'Odontólogo', tipo: 'select', req: true, opciones: ods }, { k: 'tratamientoId', label: 'Tratamiento (vacío = general)', tipo: 'select', opciones: trats.map((t) => [t.id, t.nombre]) }, { k: 'porcentaje', label: 'Porcentaje', tipo: 'numero', req: true, min: 0, max: 100 }, { k: 'descontarLaboratorio', label: 'Descontar costo de laboratorio', tipo: 'bool' }, { k: 'activa', label: 'Activa', tipo: 'bool' }],
        valoresNuevo: () => ({ descontarLaboratorio: true, activa: true }),
      });
      cargarLiq();
    }
  }

  async function subRentabilidad(c) {
    const ods = await X.opcionesOdontologos();
    const inicio = `${X.hoy().slice(0, 7)}-01`;
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Desde</label><input type="date" name="desde" value="${inicio}"/></div><div><label>Hasta</label><input type="date" name="hasta" value="${X.hoy()}"/></div>
      <div><label>Odontólogo</label><select name="odontologoId"><option value="">Todos</option>${ods.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div><button class="dova-btn-secundario">Calcular</button></form>
      <p class="dova-nota">Lo ganado = sesiones realizadas × (precio neto del plan ÷ sesiones). Se descuentan los insumos usados en cada sesión (a su precio de compra), el laboratorio y la comisión de los odontólogos. El laboratorio no está atado a un tratamiento: por eso aparece por odontólogo y en el total, no en cada tratamiento.</p>
      <div data-res></div>`;
    const f = c.querySelector('[data-f]');
    const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
    const cls = (v) => (v < 0 ? 'dova-ext-neg' : '');
    const calcular = async () => {
      const q = new URLSearchParams(Object.fromEntries(Array.from(new FormData(f)).filter(([, v]) => v))).toString();
      const r = await DOVA.get(`/finanzas/rentabilidad?${q}`);
      const t = r.totales;
      c.querySelector('[data-res]').innerHTML = `<div class="dova-ext-kpis">
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.produccion)}</div><div class="dova-ext-kpi-label">Trabajos realizados</div></div>
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.costoInsumos + t.costoLaboratorio + t.comision)}</div><div class="dova-ext-kpi-label">Costos (insumos, laboratorio, comisión)</div></div>
          <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor ${cls(t.margen)}">${fmtGs(t.margen)}</div><div class="dova-ext-kpi-label">Margen (${pct(t.margenPct)})</div></div></div>
        ${r.avisos.insumosSinPrecio ? `<p class="dova-nota">${r.avisos.insumosSinPrecio} uso${r.avisos.insumosSinPrecio === 1 ? '' : 's'} de insumos sin precio de compra cargado: se contaron a cero. Cargá el precio en Inventario para que el margen sea real.</p>` : ''}
        <h3 class="dova-section-title">Por tratamiento</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Sesiones</th><th>Realizado</th><th>Insumos</th><th>Comisión</th><th>Margen</th><th>%</th></tr></thead><tbody>
          ${r.porTratamiento.map((x) => `<tr><td><strong>${esc(x.tratamiento)}</strong></td><td>${x.sesiones}</td><td>${fmtGs(x.produccion)}</td><td>${fmtGs(x.costoInsumos)}</td><td>${fmtGs(x.comision)}</td><td class="${cls(x.margen)}"><strong>${fmtGs(x.margen)}</strong></td><td>${pct(x.margenPct)}</td></tr>`).join('') || '<tr><td colspan="7" class="dova-vacio">No hay sesiones realizadas en ese período.</td></tr>'}
        </tbody></table></div>
        <h3 class="dova-section-title">Por odontólogo</h3>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Odontólogo</th><th>Sesiones</th><th>Realizado</th><th>Insumos</th><th>Laboratorio</th><th>Comisión</th><th>Margen</th><th>%</th></tr></thead><tbody>
          ${r.porOdontologo.map((x) => `<tr><td><strong>${esc(x.odontologo)}</strong></td><td>${x.sesiones}</td><td>${fmtGs(x.produccion)}</td><td>${fmtGs(x.costoInsumos)}</td><td>${fmtGs(x.costoLaboratorio)}</td><td>${fmtGs(x.comision)}</td><td class="${cls(x.margen)}"><strong>${fmtGs(x.margen)}</strong></td><td>${pct(x.margenPct)}</td></tr>`).join('') || '<tr><td colspan="8" class="dova-vacio">No hay sesiones realizadas en ese período.</td></tr>'}
        </tbody></table></div>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); calcular().catch((x) => X.toast(x.message, 'error')); });
    await calcular();
  }

  async function subMetas(c) {
    const ods = await X.opcionesOdontologos();
    c.innerHTML = `<form class="dova-ext-filtros" data-f><div><label>Mes</label><input type="month" name="periodo" value="${X.hoy().slice(0, 7)}"/></div><button class="dova-btn-secundario">Ver</button></form><div data-prog></div><div data-crud></div>`;
    const f = c.querySelector('[data-f]');
    const cargar = async () => {
      const r = await DOVA.get(`/finanzas/metas-progreso?periodo=${f.periodo.value}`);
      const val = (m, v) => (['produccion', 'cobranza'].includes(m.tipo) ? fmtGs(v) : m.tipo === 'tasa_aceptacion' ? `${v}%` : v);
      c.querySelector('[data-prog]').innerHTML = `<div class="dova-ext-kpis">${r.metas.map((m) => `<div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${m.avancePct ?? 0}%</div><div class="dova-ext-kpi-label">${esc(etiqueta(m.tipo))}${m.odontologo_nombre ? ` — ${esc(m.odontologo_nombre)}` : ''}</div><div class="dova-ext-progreso" role="progressbar" aria-valuenow="${m.avancePct || 0}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(m.avancePct || 0, 100)}%"></span></div><div class="dova-ext-kpi-sub">${val(m, m.actual)} de ${val(m, Number(m.objetivo))}</div></div>`).join('') || '<p class="dova-vacio">No hay metas cargadas para este mes.</p>'}</div>`;
      if (puede('metas.manage')) X.tablaCrud({
        root: c.querySelector('[data-crud]'), titulo: 'Metas del mes', endpoint: '/finanzas/metas', query: `periodo=${f.periodo.value}`, fijos: { periodo: f.periodo.value }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
        columnas: [{ t: 'Tipo', v: (m) => esc(etiqueta(m.tipo)) }, { t: 'Odontólogo', v: (m) => esc(m.odontologo_nombre || 'Toda la clínica') }, { t: 'Objetivo', v: (m) => esc(Number(m.objetivo).toLocaleString('es-PY')) }],
        campos: [{ k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: OPC(['produccion', 'cobranza', 'pacientes_nuevos', 'turnos_atendidos', 'tasa_aceptacion']) }, { k: 'odontologoId', label: 'Odontólogo (vacío = clínica)', tipo: 'select', opciones: ods }, { k: 'objetivo', label: 'Objetivo', tipo: 'numero', req: true }],
        alGuardar: cargar,
      });
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
    await cargar();
  }

  function subSeguros(c) {
    c.innerHTML = '<div data-a></div><div data-p></div>';
    const verPlanes = (a) => X.tablaCrud({
      root: c.querySelector('[data-p]'), titulo: `Planes — ${a.nombre}`, endpoint: '/finanzas/planes-cobertura', query: `aseguradoraId=${a.id}`, fijos: { aseguradoraId: a.id }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Plan', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Cobertura general', v: (r) => `${Number(r.cobertura_general)}%` }, { t: 'Por categoría', v: (r) => esc(Object.entries(r.cobertura || {}).map(([k, v]) => `${k}: ${v}%`).join(' · ') || '-') }, { t: 'Tope anual', v: (r) => (r.tope_anual ? fmtGs(r.tope_anual) : '-') }, { t: 'Autorización', v: (r) => (r.requiere_autorizacion ? 'Requiere' : 'No') }],
      campos: [{ k: 'nombre', label: 'Nombre del plan', req: true }, { k: 'coberturaGeneral', label: 'Cobertura general (%)', tipo: 'numero', min: 0, max: 100 }, { k: 'coberturaTexto', label: 'Cobertura por categoría', ancho: 'completo', ayuda: 'Formato: Categoría=porcentaje, separadas por coma. Ej.: Prevención=100, Endodoncia=60, Ortodoncia=0' }, { k: 'topeAnual', label: 'Tope anual (Gs.)', tipo: 'numero' }, { k: 'copagoFijo', label: 'Copago fijo (Gs.)', tipo: 'numero' }, { k: 'requiereAutorizacion', label: 'Requiere autorización previa', tipo: 'bool' }],
      valoresEditar: (r) => ({ ...r, coberturaTexto: Object.entries(r.cobertura || {}).map(([k, v]) => `${k}=${v}`).join(', ') }),
      preparar: (d) => {
        if ('coberturaTexto' in d) {
          d.cobertura = Object.fromEntries((d.coberturaTexto || '').split(',').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v !== undefined && v !== '').map(([k, v]) => [k, Number(v)]));
          delete d.coberturaTexto;
        }
      },
    });
    return X.tablaCrud({
      root: c.querySelector('[data-a]'), titulo: 'Seguros, prepagas y convenios', endpoint: '/finanzas/aseguradoras', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'RUC', v: (r) => esc(r.ruc || '-') }, { t: 'Contacto', v: (r) => esc([r.contacto, r.telefono].filter(Boolean).join(' · ') || '-') }, { t: 'Planes', v: (r) => esc(r.planes) }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['seguro', 'prepaga', 'convenio', 'mutual', 'empresa', 'ips']) }, { k: 'ruc', label: 'RUC' }, { k: 'contacto', label: 'Contacto' }, { k: 'telefono', label: 'Teléfono' }, { k: 'email', label: 'Email' }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      acciones: [{ texto: 'Planes', fn: (r) => verPlanes(r) }],
    });
  }

  async function subListas(c) {
    const [asegs, trats] = await Promise.all([DOVA.get('/finanzas/aseguradoras').catch(() => []), X.catalogo('tratamientos', '/tratamientos').catch(() => [])]);
    c.innerHTML = '<div data-l></div><div data-i></div>';
    const verItems = (l) => X.tablaCrud({
      root: c.querySelector('[data-i]'), titulo: `Precios — ${l.nombre}`, endpoint: '/finanzas/lista-precio-items', query: `listaId=${l.id}`, fijos: { listaId: l.id }, puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Tratamiento', v: (r) => esc(r.tratamiento_nombre) }, { t: 'Precio base', v: (r) => fmtGs(r.precio_base) }, { t: 'Precio en lista', v: (r) => `<strong>${fmtGs(r.precio)}</strong>` }, { t: 'Diferencia', v: (r) => { const d = Math.round(((r.precio - r.precio_base) / (r.precio_base || 1)) * 100); return `${d > 0 ? '+' : ''}${d}%`; } }],
      campos: [{ k: 'tratamientoId', label: 'Tratamiento', tipo: 'select', req: true, soloCrear: true, opciones: trats.map((t) => [t.id, `${t.nombre} (${fmtGs(t.precio)})`]) }, { k: 'precio', label: 'Precio', tipo: 'numero', req: true }],
    });
    return X.tablaCrud({
      root: c.querySelector('[data-l]'), titulo: 'Listas de precios', endpoint: '/finanzas/listas-precios', puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      descripcion: 'Precios diferenciados por convenio o grupo. Se aplican a los pacientes con esa lista asignada, o a los que tienen cobertura de la aseguradora vinculada.',
      columnas: [{ t: 'Lista', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Aseguradora', v: (r) => esc(r.aseguradora_nombre || '-') }, { t: 'Tratamientos', v: (r) => esc(r.items) }],
      campos: [{ k: 'nombre', label: 'Nombre', req: true }, { k: 'aseguradoraId', label: 'Aseguradora vinculada', tipo: 'select', opciones: asegs.map((a) => [a.id, a.nombre]) }],
      acciones: [{ texto: 'Precios', fn: (r) => verItems(r) }],
    });
  }

  async function subCierre(c) {
    const r = await DOVA.get('/finanzas/bloqueo-contable');
    c.innerHTML = `<div class="dova-ext-caja"><h4>Cerrar meses ya revisados por el contador</h4><p>Hasta la fecha de cierre (inclusive) nadie puede registrar ajustes ni anular pagos. Usalo cuando el contador cierra un mes.</p>
      <p>Cierre actual: <strong>${r.fechaBloqueo ? fmtFecha(r.fechaBloqueo) : 'sin cierre'}</strong></p>
      <form class="dova-ext-filtros" data-f><div><label>Cerrar hasta</label><input type="date" name="f" max="${X.hoy()}" value="${r.fechaBloqueo || ''}"/></div><button class="dova-btn-primary">Guardar</button><button type="button" class="dova-btn-secundario" data-quitar>Quitar cierre</button></form></div>`;
    const guardar = async (v) => { try { await DOVA.put('/finanzas/bloqueo-contable', { fechaBloqueo: v }); X.toast('Cierre actualizado', 'ok'); subCierre(c); } catch (e) { X.toast(e.message, 'error'); } };
    c.querySelector('[data-f]').addEventListener('submit', (e) => { e.preventDefault(); guardar(e.target.f.value || null); });
    c.querySelector('[data-quitar]').addEventListener('click', () => guardar(null));
  }

  return { finanzas };
})();
window.DovaFinanzas = DovaFinanzas;

DovaPantallas.registrar('finanzas', { dibujar: (contenedor, { navegar }) => DovaFinanzas.finanzas(contenedor, navegar) });
