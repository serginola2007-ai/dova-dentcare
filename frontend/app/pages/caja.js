/* DOVA — Caja (Movimientos → Caja).
   Pestañas: Caja del día (abrir, ingresos, egresos, devoluciones, cerrar) y Cierres anteriores.
   Uso: DovaCaja.caja(contenedor, navegar). */
const DovaCaja = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, toast, puede, hoy, sumarDias, etiqueta, badge } = X;
  const { opcionesMetodos } = DovaTurnos;
  const num = (valor) => Number(valor || 0);

  // =================================================================
  // CAJA
  // =================================================================
  let navegarCaja = null;
  async function caja(root, navegar) {
    navegarCaja = navegar;
    root.innerHTML = `<h2 class="dova-view-title">Caja</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'hoy', texto: 'Caja del día', visible: true, render: cajaActual },
      { id: 'hist', texto: 'Cierres anteriores', visible: true, render: cajaHistorico },
    ]);
  }

  async function cajaActual(c) {
    X.vivo(c, ['caja_aperturas', 'caja_movimientos', 'pagos', 'facturas'], () => cajaActual(c));
    const e = await DOVA.get('/caja/estado');
    const maneja = puede('caja.manage');
    if (!e.abierta) {
      c.innerHTML = `
        <div class="dova-ext-caja">
          <h4>La caja está cerrada</h4>
          ${e.pagosSinCaja && e.pagosSinCaja.length ? `<p class="dova-nota dova-nota-alerta">Hoy se cobraron ${e.pagosSinCaja.length} pago(s) por ${fmtGs(e.totalSinCaja)} con la caja cerrada. Al abrirla se suman automáticamente.</p>
            <ul class="dova-lista-simple">${e.pagosSinCaja.map((p) => `<li>${esc(p.paciente)} — ${fmtGs(p.monto)} (${esc(etiqueta(p.metodo))})</li>`).join('')}</ul>` : '<p class="dova-nota">Abrí la caja al empezar el día, con el efectivo que hay en el cajón.</p>'}
          ${maneja ? `<form class="dova-ext-filtros" data-abrir><div><label>Efectivo inicial en el cajón (Gs.)</label><input type="number" name="montoInicial" min="0" step="1000" value="0" required/></div><button class="dova-btn-primary">Abrir caja</button></form>` : ''}
        </div>`;
      const fa = c.querySelector('[data-abrir]');
      if (fa) fa.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const r = await DOVA.post('/caja/abrir', { montoInicial: Number(fa.montoInicial.value || 0) });
          toast(r.pagosIncorporados ? `Caja abierta (se sumaron ${r.pagosIncorporados} cobro(s) previos)` : 'Caja abierta', 'ok');
          cajaActual(c);
        } catch (ex) { toast(ex.message, 'error'); }
      });
      return;
    }
    const t = e.totales;
    const nomMet = Object.fromEntries(await opcionesMetodos());
    const verFac = puede('facturacion.ver', 'facturacion.ver_propias'); const crearFac = puede('facturacion.crear'); const impFac = puede('facturacion.imprimir');
    const colFacturaMov = (m) => {
      if (m.tipo !== 'ingreso') return '';
      if (m.factura_id) return `${verFac ? `<button class="dova-btn-link" data-ir-factura="${m.factura_id}">${esc(m.factura_numero)}</button>` : esc(m.factura_numero)}${impFac ? ` <button class="dova-btn-link" data-imprimir-factura="${m.factura_id}" data-num="${esc(m.factura_numero)}">Imprimir</button>` : ''}`;
      return crearFac ? `<button class="dova-btn-link" data-facturar-mov="${m.id}">Generar factura</button>` : '<span class="dova-nota">—</span>';
    };
    c.innerHTML = `
      <p class="dova-nota">Abierta el ${fmtFecha(e.caja.fecha)}${e.caja.fecha && String(e.caja.fecha).slice(0, 10) < hoy() ? ` ${badge('de otro día: cerrala', 'critica')}` : ''}.</p>
      <div class="dova-ext-kpis">
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(e.efectivoEsperado)}</div><div class="dova-ext-kpi-label">Efectivo que debe haber en el cajón</div><div class="dova-ext-kpi-sub">Inicial ${fmtGs(e.caja.monto_inicial)} + cobros en efectivo ${fmtGs(t.efectivo)} − egresos ${fmtGs(t.egresos_efectivo)}</div></div>
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(e.otrosMedios)}</div><div class="dova-ext-kpi-label">Otros medios (no van al cajón)</div><div class="dova-ext-kpi-sub">Tarjeta ${fmtGs(t.tarjetas)} · Transferencia ${fmtGs(t.transferencias)} · QR ${fmtGs(t.qr)}</div></div>
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t.total_ingresos)}</div><div class="dova-ext-kpi-label">Total cobrado hoy</div></div>
      </div>
      ${maneja ? `<div class="dova-toolbar"><span></span><div>
        <button class="dova-btn-secundario" data-mov="ingreso">+ Ingreso</button>
        <button class="dova-btn-secundario" data-mov="egreso">− Egreso</button>
        <button class="dova-btn-secundario" data-mov="devolucion">↩ Devolución</button>
        <button class="dova-btn-primary" data-cerrar-caja>Cerrar caja</button></div></div>` : ''}
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Método</th><th>Monto</th><th>Usuario</th><th>Factura</th></tr></thead><tbody>
      ${e.movimientos.map((m) => `<tr><td>${new Date(m.creado_en).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })}</td><td>${m.tipo === 'egreso' ? (String(m.concepto || '').startsWith('Devolución') ? badge('Devolución', 'atencion') : badge('Egreso', 'critica')) : badge('Ingreso', 'ok')}</td><td>${esc(m.concepto || '-')}</td><td>${esc(nomMet[m.metodo] || etiqueta(m.metodo || 'efectivo'))}</td><td>${m.tipo === 'egreso' ? '−' : ''}${fmtGs(m.monto)}</td><td>${esc(m.usuario_nombre || '-')}</td>
        <td class="dova-ext-acciones">${colFacturaMov(m)}</td></tr>`).join('') || '<tr><td colspan="7">Sin movimientos todavía.</td></tr>'}
      </tbody></table></div>`;
    c.querySelectorAll('[data-ir-factura]').forEach((x) => x.addEventListener('click', () => navegarCaja && navegarCaja('facturacion', `factura/${x.dataset.irFactura}`)));
    c.querySelectorAll('[data-imprimir-factura]').forEach((x) => x.addEventListener('click', () => DovaFacturacion.imprimirPdf(x.dataset.imprimirFactura, x.dataset.num)));
    c.querySelectorAll('[data-facturar-mov]').forEach((x) => x.addEventListener('click', async () => {
      x.disabled = true;
      const op = await DovaFacturacion.opcionesCobro();
      const f = await DovaFacturacion.facturarIngreso({ movimientoId: x.dataset.facturarMov }, { imprimir: op.imprimirAlFacturar && puede('facturacion.imprimir') });
      if (f) cajaActual(c); else x.disabled = false;
    }));
    c.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', async () => {
      const tipo = b.dataset.mov;
      const mets = await opcionesMetodos();
      const op = tipo === 'ingreso' ? await DovaFacturacion.opcionesCobro() : null;
      X.modalForm(tipo === 'egreso' ? 'Egreso de caja' : tipo === 'devolucion' ? 'Devolución de dinero' : 'Ingreso de caja', [
        { k: 'concepto', label: 'Concepto', req: true, ancho: 'completo', max: 200 },
        { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1 },
        { k: 'metodo', label: 'Medio', tipo: 'select', req: true, opciones: mets },
      ], { metodo: 'efectivo' }, async (d, form) => {
        const fac = op ? DovaFacturacion.leerBloqueFactura(form) : null;
        const mov = await DOVA.post('/caja/movimiento', { ...d, tipo });
        toast('Movimiento registrado', 'ok');
        if (fac) await DovaFacturacion.facturarIngreso({ movimientoId: mov.id }, fac);
        cajaActual(c);
      }, { extraHtml: op ? DovaFacturacion.bloqueFacturaHtml(op, { sinPaciente: true }) : '' });
      DovaFacturacion.activarBloqueFactura(document.querySelector('.dova-ext-modal-form'));
    }));
    const bc = c.querySelector('[data-cerrar-caja]');
    if (bc) bc.addEventListener('click', () => {
      const form = X.modalForm('Cerrar caja', [
        { k: 'montoContado', label: 'Efectivo contado en el cajón (Gs.)', tipo: 'numero', req: true, min: 0 },
        { k: 'motivoDiferencia', label: 'Motivo de la diferencia (si la hay)', tipo: 'textarea' },
      ], {}, async (d) => {
        const r = await DOVA.post(`/caja/${e.caja.id}/cerrar`, d);
        toast(Number(r.diferencia) === 0 ? 'Caja cerrada sin diferencias' : `Caja cerrada con diferencia de ${fmtGs(r.diferencia)}`, Number(r.diferencia) === 0 ? 'ok' : 'info');
        cajaActual(c);
      }, { textoBoton: 'Cerrar caja', extraHtml: `<p class="dova-nota">Debería haber <strong>${fmtGs(e.efectivoEsperado)}</strong> en efectivo. Tarjeta, transferencia y QR (${fmtGs(e.otrosMedios)}) no se cuentan acá.</p><p data-dif class="dova-nota"></p>` });
      const inp = form.querySelector('[name="montoContado"]');
      inp.addEventListener('input', () => {
        const dif = Number(inp.value || 0) - e.efectivoEsperado;
        form.querySelector('[data-dif]').innerHTML = inp.value === '' ? '' : dif === 0 ? badge('Cuadra exacto', 'ok') : `${badge(dif > 0 ? 'Sobra' : 'Falta', 'critica')} ${fmtGs(Math.abs(dif))} — indicá el motivo`;
      });
    });
  }

  async function cajaHistorico(c) {
    const filas = await DOVA.get(`/caja/historico?desde=${sumarDias(hoy(), -90)}`);
    c.innerHTML = `<p class="dova-nota">Últimos 90 días. Una diferencia distinta de cero requiere motivo al cerrar.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Inicial</th><th>Efectivo esperado</th><th>Contado</th><th>Diferencia</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${fmtFecha(f.fecha)}</td><td>${fmtGs(f.monto_inicial)}</td><td>${f.monto_esperado !== null ? fmtGs(f.monto_esperado) : '-'}</td><td>${f.monto_contado !== null ? fmtGs(f.monto_contado) : '-'}</td>
        <td>${f.diferencia === null ? '-' : num(f.diferencia) === 0 ? badge('0', 'ok') : badge(fmtGs(f.diferencia), 'critica')}</td><td>${esc(f.motivo_diferencia || '')}</td><td>${esc(etiqueta(f.estado))}</td></tr>`).join('') || '<tr><td colspan="7">Sin cierres.</td></tr>'}
      </tbody></table></div>`;
  }

  return { caja };
})();
window.DovaCaja = DovaCaja;

DovaPantallas.registrar('caja', { dibujar: (contenedor, { navegar }) => DovaCaja.caja(contenedor, navegar) });
