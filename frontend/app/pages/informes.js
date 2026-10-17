/* Sección Informes (Reportes → Informes): resumen del día, de la semana, del
   mes y del año, comparado con el período anterior, y los reportes detallados
   (filtros y exportación a PDF, Excel o CSV).
   Datos: GET /api/reportes/informes/periodo?tipo=…&fecha=…
   Uso: DovaInformes.seccion(root, navegar, subInicial) */
const DovaInformes = (() => {
  const X = DovaExt;
  const { esc, fmtGs } = X;
  const TIPOS = [
    { id: 'dia', texto: 'Del día', ant: 'el día anterior', hoy: 'Hoy' },
    { id: 'semana', texto: 'De la semana', ant: 'la semana anterior', hoy: 'Esta semana' },
    { id: 'mes', texto: 'Del mes', ant: 'el mes anterior', hoy: 'Este mes' },
    { id: 'anio', texto: 'Del año', ant: 'el año anterior', hoy: 'Este año' },
  ];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = (iso) => new Date(`${iso}T12:00:00Z`);
  const sumar = (iso, n) => { const x = d(iso); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fechaLarga = (iso) => cap(d(iso).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
  const diaMes = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  const fechas = {}; // fecha elegida en cada pestaña

  function titulo(r) {
    if (r.tipo === 'dia') return fechaLarga(r.desde);
    if (r.tipo === 'semana') return `Semana del ${diaMes(r.desde)} al ${diaMes(r.hasta)} de ${r.hasta.slice(0, 4)}`;
    if (r.tipo === 'mes') return `${cap(MESES[Number(r.desde.slice(5, 7)) - 1])} de ${r.desde.slice(0, 4)}`;
    return `Año ${r.desde.slice(0, 4)}`;
  }
  // Cambio contra el período anterior (no se muestra si antes era cero).
  function variacion(a, b, { menosEsMejor } = {}) {
    if (!b) return '';
    const p = Math.round(((a - b) / Math.abs(b)) * 100);
    if (!p) return '<span class="dova-inf-var">igual</span>';
    const bueno = menosEsMejor ? p < 0 : p > 0;
    return `<span class="dova-inf-var ${bueno ? 'sube' : 'baja'}">${p > 0 ? '+' : ''}${p}%</span>`;
  }
  const kpi = (valor, label, sub) => `<div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${valor}</div><div class="dova-ext-kpi-label">${esc(label)}</div>${sub ? `<div class="dova-ext-kpi-sub">${sub}</div>` : ''}</div>`;

  async function periodo(c, tipo) {
    const def = TIPOS.find((t) => t.id === tipo);
    let r;
    try { r = await DOVA.get(`/reportes/informes/periodo?tipo=${tipo}${fechas[tipo] ? `&fecha=${fechas[tipo]}` : ''}`); } catch (e) { c.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return; }
    if (!c.isConnected) return;
    fechas[tipo] = r.fecha;
    const a = r.actual; const p = r.previo;
    const etiquetaSerie = (k) => (tipo === 'anio' ? cap(MESES[Number(k.slice(5, 7)) - 1]).slice(0, 3) : String(Number(k.slice(8, 10))));
    const etiquetas = r.serie.map((s) => etiquetaSerie(s.k));
    const series = [
      { titulo: tipo === 'anio' ? 'Cobrado por mes' : 'Cobrado por día', etiquetas, valores: r.serie.map((s) => s.cobrado), formato: 'gs', ancho: 520 },
      { titulo: tipo === 'anio' ? 'Pacientes atendidos por mes' : 'Pacientes atendidos por día', etiquetas, valores: r.serie.map((s) => s.atendidos), ancho: 520 },
    ];
    c.innerHTML = `
      <div class="dova-inf-nav">
        <button type="button" class="dova-btn-secundario" data-mover="-1" aria-label="Período anterior">‹</button>
        <h3 class="dova-section-title">${esc(titulo(r))}${r.enCurso ? ' <span class="dova-nota">(en curso)</span>' : ''}</h3>
        <button type="button" class="dova-btn-secundario" data-mover="1" aria-label="Período siguiente">›</button>
        ${r.enCurso ? '' : `<button type="button" class="dova-btn-link" data-actual>${esc(def.hoy)}</button>`}
        <span class="dova-inf-acciones"><input type="date" data-ir-fecha value="${r.fecha}" aria-label="Ir a una fecha"/><button type="button" class="dova-btn-secundario" data-imprimir>Imprimir</button></span>
      </div>
      <div class="dova-ext-kpis dova-inf-kpis">
        ${kpi(fmtGs(a.cobrado), 'Cobrado', `${a.cobros} cobro(s) ${variacion(a.cobrado, p.cobrado)}`)}
        ${kpi(fmtGs(a.facturado), 'Facturado', `${a.facturas} comprobante(s) ${variacion(a.facturado, p.facturado)}`)}
        ${kpi(a.atendidos, 'Pacientes atendidos', `de ${a.turnos} turno(s) ${variacion(a.atendidos, p.atendidos)}`)}
        ${kpi(a.ausencias, 'Ausencias', `${a.asistencia === null ? 'sin datos de asistencia' : `${a.asistencia}% de asistencia`} ${variacion(a.ausencias, p.ausencias, { menosEsMejor: true })}`)}
        ${kpi(a.pacientesNuevos, 'Pacientes nuevos', variacion(a.pacientesNuevos, p.pacientesNuevos))}
        ${kpi(fmtGs(a.aceptado), 'Presupuestos aceptados', `${a.aceptados} de ${a.presupuestos} ${variacion(a.aceptado, p.aceptado)}`)}
        ${kpi(fmtGs(a.egresos), 'Egresos de caja', variacion(a.egresos, p.egresos, { menosEsMejor: true }))}
        ${kpi(a.cancelados, 'Turnos cancelados', variacion(a.cancelados, p.cancelados, { menosEsMejor: true }))}
      </div>
      <p class="dova-nota">Los porcentajes comparan con ${r.enCurso && tipo !== 'dia' ? `el mismo tramo de ${esc(def.ant)}` : esc(def.ant)} (${X.fmtFecha(r.anterior.desde)}${r.anterior.desde !== r.anterior.hasta ? ` al ${X.fmtFecha(r.anterior.hasta)}` : ''}).</p>
      ${r.serie.length ? `<div class="dova-inf-graficos">${series.map((g) => `<div>${X.grafico(g)}</div>`).join('')}</div>` : ''}
      <div class="dova-inf-tablas">
        <section><h4>Cobros por método</h4>${r.metodos.length ? `<table class="dova-tabla"><thead><tr><th>Método</th><th class="num">Cobros</th><th class="num">Total</th></tr></thead><tbody>${r.metodos.map((m) => `<tr><td>${esc(m.metodo)}</td><td class="num">${m.cantidad}</td><td class="num">${fmtGs(m.total)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">Sin cobros.</p>'}</section>
        <section><h4>Tratamientos más realizados</h4>${r.tratamientos.length ? `<table class="dova-tabla"><thead><tr><th>Tratamiento</th><th class="num">Veces</th></tr></thead><tbody>${r.tratamientos.map((t) => `<tr><td>${esc(t.nombre)}</td><td class="num">${t.cantidad}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">Sin turnos atendidos.</p>'}</section>
        <section><h4>Por odontólogo</h4>${r.odontologos.length ? `<table class="dova-tabla"><thead><tr><th>Odontólogo</th><th class="num">Atendidos</th><th class="num">Cobrado</th></tr></thead><tbody>${r.odontologos.map((o) => `<tr><td>${esc(o.nombre)}</td><td class="num">${o.atendidos}</td><td class="num">${fmtGs(o.cobrado)}</td></tr>`).join('')}</tbody></table>` : '<p class="dova-nota">Sin actividad.</p>'}</section>
      </div>`;
    if (r.serie.length) c.querySelectorAll('.dova-inf-graficos > div').forEach((g, i) => X.activarGraficos(g, [series[i]]));
    const ir = (fecha) => { fechas[tipo] = fecha; c.innerHTML = X.cargando; periodo(c, tipo); };
    c.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => ir(Number(b.dataset.mover) < 0 ? sumar(r.desde, -1) : sumar(r.hasta, 1))));
    const act = c.querySelector('[data-actual]');
    if (act) act.addEventListener('click', () => ir(''));
    c.querySelector('[data-ir-fecha]').addEventListener('change', (e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) ir(e.target.value); });
    c.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
  }

  async function seccion(root, navegar, subInicial) {
    root.innerHTML = '<h2 class="dova-view-title">Informes</h2><div data-subs></div>';
    X.subPestanas(root.querySelector('[data-subs]'), [
      ...TIPOS.map((t) => ({ id: t.id, texto: t.texto, render: (c) => periodo(c, t.id) })),
      { id: 'detalle', texto: 'Reportes detallados', render: (c) => DovaReportes.reportes(c, navegar, undefined, { sinTitulo: true }) },
    ], { inicial: subInicial || undefined });
  }

  return { seccion };
})();
window.DovaInformes = DovaInformes;

DovaPantallas.registrar('informes', { dibujar: (contenedor, { navegar, params }) => DovaInformes.seccion(contenedor, navegar, params) });
