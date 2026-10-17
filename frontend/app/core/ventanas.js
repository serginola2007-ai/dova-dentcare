/* DOVA — escritorio con ventanas.
   Inicio queda siempre de fondo. Cada función del menú se abre en una
   ventana propia (un <iframe> con la misma app en "modo ventana", así cada
   ventana tiene su pantalla aislada y se pueden tener muchas abiertas).
   - Las ventanas tienen tamaño fijo: no se agrandan ni se achican.
   - Se mueven arrastrando la barra de título.
   - Zoom con los botones de la barra, con Ctrl + rueda o Ctrl + / Ctrl - (Ctrl 0 vuelve a 100 %).
   - Minimizar (queda en la barra de tareas de abajo) y cerrar.
   - En el celular cada ventana ocupa la pantalla y se cambia con la barra de abajo.
   - Al recargar la página se vuelven a abrir las que estaban abiertas. */
const DovaVentanas = (() => {
  const MAX = 12;
  const CLAVE = 'dova-ventanas';
  const CLAVE_ZOOM = 'dova-ventana-zoom';
  const ZMIN = 0.5; const ZMAX = 2; const ZPASO = 0.1;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const movil = () => window.matchMedia('(max-width: 768px)').matches;

  let capa = null; let barra = null; let opciones = {};
  let zTop = 20; let secuencia = 0; let cascada = 0;
  const ventanas = [];

  // Una ventana por sección; la ficha y la consulta, una por paciente.
  function clave(ruta, params) {
    if ((ruta === 'paciente' || ruta === 'consulta') && params) return `${ruta}/${String(params).split('/')[0]}`;
    return ruta;
  }
  const leerZooms = () => { try { return JSON.parse(localStorage.getItem(CLAVE_ZOOM) || '{}') || {}; } catch (_e) { return {}; } };
  function guardarZoom(ruta, z) { const m = leerZooms(); m[ruta] = z; try { localStorage.setItem(CLAVE_ZOOM, JSON.stringify(m)); } catch (_e) { /* sin almacenamiento */ } }
  function guardar() {
    const estado = ventanas.map((v) => ({ ruta: v.ruta, params: v.params || null, x: v.x, y: v.y, min: v.min }));
    try { sessionStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_e) { /* sin almacenamiento */ }
  }

  function area() {
    const r = capa.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  // Tamaño fijo, elegido al abrir según la pantalla (solo se ajusta si la ventana del navegador queda más chica).
  function tamano() {
    // Se calcula con la pantalla, no con el espacio libre del momento: todas las ventanas miden lo mismo.
    const top = capa.getBoundingClientRect().top;
    const estado = document.getElementById('mec-estado');
    const a = { w: window.innerWidth, h: window.innerHeight - top - 44 - (estado && estado.offsetParent !== null ? estado.offsetHeight : 0) };
    // No ocupa toda la pantalla: alrededor de tres cuartos del ancho y del alto disponibles.
    return { w: Math.round(Math.max(320, Math.min(1040, a.w * 0.74, a.w - 40))), h: Math.round(Math.max(260, Math.min(700, a.h * 0.84, a.h - 24))) };
  }
  function ubicar(v) {
    const a = area();
    v.w = Math.min(v.w0, Math.max(280, a.w - 8)); v.h = Math.min(v.h0, Math.max(220, a.h - 8));
    v.x = Math.max(0, Math.min(v.x, a.w - v.w)); v.y = Math.max(0, Math.min(v.y, a.h - v.h));
    v.el.style.width = `${v.w}px`; v.el.style.height = `${v.h}px`;
    v.el.style.left = `${v.x}px`; v.el.style.top = `${v.y}px`;
  }

  function titulo(ruta, params, sub, extra) {
    const base = (opciones.titulo && opciones.titulo(ruta, params, sub)) || ruta;
    return extra && extra !== base ? `${base}: ${extra}` : base;
  }

  function pintarBarra() {
    if (!barra) return;
    barra.hidden = !ventanas.length;
    document.body.classList.toggle('dova-con-ventanas', ventanas.length > 0);
    const activa = ventanas.find((v) => v.el.classList.contains('activa') && !v.min);
    barra.innerHTML = `<button type="button" class="dova-tarea dova-tarea-inicio" data-escritorio title="Mostrar Inicio">Inicio</button>${ventanas.map((v) => `<span class="dova-tarea-item${v === activa ? ' activa' : ''}${v.min ? ' minimizada' : ''}">
        <button type="button" class="dova-tarea" data-tarea="${v.id}" aria-pressed="${v === activa}" title="${esc(v.titulo)}">${esc(v.titulo)}</button>
        <button type="button" class="dova-tarea-cerrar" data-tarea-cerrar="${v.id}" aria-label="Cerrar ${esc(v.titulo)}" title="Cerrar">×</button></span>`).join('')}`;
  }

  function enfocar(v) {
    if (!v) return;
    if (v.min) { v.min = false; v.el.hidden = false; }
    ventanas.forEach((o) => o.el.classList.toggle('activa', o === v));
    zTop += 1; v.el.style.zIndex = String(zTop);
    pintarBarra(); guardar();
    document.dispatchEvent(new CustomEvent('dova:ventana', { detail: { ruta: v.ruta, params: v.params } }));
  }
  function arriba() {
    const visibles = ventanas.filter((v) => !v.min).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
    return visibles[0] || null;
  }
  function minimizar(v) {
    v.min = true; v.el.hidden = true; v.el.classList.remove('activa');
    const otra = movil() ? null : arriba();
    if (otra) enfocar(otra); else { pintarBarra(); guardar(); avisarInicio(); }
  }
  function cerrar(v) {
    const i = ventanas.indexOf(v);
    if (i < 0) return;
    ventanas.splice(i, 1);
    v.el.remove();
    const otra = movil() ? null : arriba();
    if (otra) enfocar(otra); else { pintarBarra(); guardar(); avisarInicio(); }
  }
  const avisarInicio = () => document.dispatchEvent(new CustomEvent('dova:ventana', { detail: { ruta: 'dashboard' } }));
  function mostrarEscritorio() {
    ventanas.forEach((v) => { v.min = true; v.el.hidden = true; v.el.classList.remove('activa'); });
    pintarBarra(); guardar(); avisarInicio();
  }

  // ---- Zoom ----
  function aplicarZoom(v) {
    v.el.querySelector('[data-zoom-valor]').textContent = `${Math.round(v.zoom * 100)}%`;
    try { v.iframe.contentDocument.documentElement.style.zoom = String(v.zoom); } catch (_e) { /* todavía cargando */ }
  }
  function cambiarZoom(v, delta) {
    const z = delta === 0 ? 1 : Math.round(Math.min(ZMAX, Math.max(ZMIN, v.zoom + delta)) * 10) / 10;
    if (z === v.zoom) return;
    v.zoom = z; aplicarZoom(v); guardarZoom(v.ruta, z);
  }

  // ---- Arrastrar ----
  function hacerMovible(v) {
    const cab = v.el.querySelector('.dova-ventana-barra');
    cab.addEventListener('pointerdown', (e) => {
      if (movil() || e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      enfocar(v);
      const x0 = e.clientX; const y0 = e.clientY; const vx = v.x; const vy = v.y;
      capa.classList.add('arrastrando');
      cab.setPointerCapture(e.pointerId);
      const mover = (ev) => { v.x = vx + ev.clientX - x0; v.y = vy + ev.clientY - y0; ubicar(v); };
      const soltar = () => {
        capa.classList.remove('arrastrando');
        cab.removeEventListener('pointermove', mover); cab.removeEventListener('pointerup', soltar); cab.removeEventListener('pointercancel', soltar);
        guardar();
      };
      cab.addEventListener('pointermove', mover); cab.addEventListener('pointerup', soltar); cab.addEventListener('pointercancel', soltar);
    });
  }

  // Lo que pasa adentro de la ventana: foco, zoom con el teclado o la rueda.
  function conectarContenido(v) {
    let w;
    try { w = v.iframe.contentWindow; if (!w || !w.document) return; } catch (_e) { return; }
    aplicarZoom(v);
    w.addEventListener('pointerdown', () => {
      if (!v.el.classList.contains('activa')) enfocar(v);
      // Tocar adentro de una ventana cuenta como "tocar afuera" para los menús de la página principal (se cierran).
      try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (_e) { /* */ }
    }, true);
    w.addEventListener('focus', () => { if (!v.el.classList.contains('activa')) enfocar(v); });
    w.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); cambiarZoom(v, e.deltaY < 0 ? ZPASO : -ZPASO);
    }, { passive: false });
    w.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); cambiarZoom(v, ZPASO); }
      else if (e.key === '-') { e.preventDefault(); cambiarZoom(v, -ZPASO); }
      else if (e.key === '0') { e.preventDefault(); cambiarZoom(v, 0); }
    });
  }

  function src(ruta, params, sub) {
    const q = new URLSearchParams({ ventana: '1' });
    if (sub) q.set('sub', sub);
    return `${location.pathname}?${q.toString()}#${ruta}${params ? `/${params}` : ''}`;
  }

  function crear({ ruta, params, sub, x, y, min }) {
    secuencia += 1;
    const t = tamano();
    const v = { id: `v${secuencia}`, ruta, params: params || null, clave: clave(ruta, params), titulo: titulo(ruta, params, sub), zoom: leerZooms()[ruta] || 1, min: false, historial: [], w0: t.w, h0: t.h, w: t.w, h: t.h };
    if (typeof x === 'number' && typeof y === 'number') { v.x = x; v.y = y; } else {
      const paso = cascada % 8; cascada += 1;
      v.x = Math.round(Math.max(0, (area().w - t.w) / 2 - 140) + paso * 28); v.y = 10 + paso * 24;
    }
    v.el = document.createElement('section');
    v.el.className = 'dova-ventana';
    v.el.dataset.ventanaRuta = ruta;
    v.el.setAttribute('role', 'dialog');
    v.el.setAttribute('aria-label', v.titulo);
    v.el.innerHTML = `
      <header class="dova-ventana-barra">
        <button type="button" class="dova-ventana-btn" data-atras aria-label="Volver" title="Volver" hidden>‹</button>
        <span class="dova-ventana-titulo">${esc(v.titulo)}</span>
        <span class="dova-ventana-ctrl">
          <button type="button" class="dova-ventana-btn" data-zoom="-" aria-label="Alejar" title="Alejar (Ctrl -)">−</button>
          <button type="button" class="dova-ventana-zoom" data-zoom="0" data-zoom-valor title="Volver a 100 %">100%</button>
          <button type="button" class="dova-ventana-btn" data-zoom="+" aria-label="Acercar" title="Acercar (Ctrl +)">+</button>
          <button type="button" class="dova-ventana-btn" data-minimizar aria-label="Minimizar" title="Minimizar">–</button>
          <button type="button" class="dova-ventana-btn dova-ventana-cerrar" data-cerrar aria-label="Cerrar" title="Cerrar">×</button>
        </span>
      </header>
      <iframe class="dova-ventana-contenido" title="${esc(v.titulo)}"></iframe>`;
    v.iframe = v.el.querySelector('iframe');
    v.iframe.addEventListener('load', () => conectarContenido(v));
    v.iframe.src = src(ruta, params, sub);
    v.el.querySelector('[data-minimizar]').addEventListener('click', () => minimizar(v));
    v.el.querySelector('[data-cerrar]').addEventListener('click', () => cerrar(v));
    v.el.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.zoom; cambiarZoom(v, d === '+' ? ZPASO : d === '-' ? -ZPASO : 0);
    }));
    v.el.querySelector('[data-atras]').addEventListener('click', () => volver(v));
    v.el.addEventListener('pointerdown', () => { if (!v.el.classList.contains('activa')) enfocar(v); }, true);
    hacerMovible(v);
    capa.appendChild(v.el);
    ventanas.push(v);
    ubicar(v);
    v.el.querySelector('[data-zoom-valor]').textContent = `${Math.round(v.zoom * 100)}%`;
    if (min) { v.min = true; v.el.hidden = true; pintarBarra(); guardar(); } else enfocar(v);
    return v;
  }

  function navegarDentro(v, ruta, params, sub) {
    try {
      const w = v.iframe.contentWindow;
      if (!w || !w.DovaApp) { v.iframe.src = src(ruta, params, sub); return; }
      w.DovaSubPendiente = sub || null;
      Promise.resolve(w.DovaApp.navegar(ruta, params)).finally(() => { w.DovaSubPendiente = null; });
    } catch (_e) { v.iframe.src = src(ruta, params, sub); }
  }

  function abrir(ruta, params, sub) {
    if (!capa) return null;
    const k = clave(ruta, params);
    const existente = ventanas.find((v) => v.clave === k);
    if (existente) {
      if (sub || String(existente.params || '') !== String(params || '')) navegarDentro(existente, ruta, params, sub);
      enfocar(existente);
      return existente;
    }
    if (ventanas.length >= MAX) {
      if (opciones.aviso) opciones.aviso(`Ya hay ${MAX} ventanas abiertas. Cerrá alguna para abrir otra.`);
      return null;
    }
    return crear({ ruta, params, sub });
  }

  // La pantalla de adentro avisa a qué sección fue (para el título y el botón Volver).
  function alNavegar(win, ruta, params, extra, sinHistorial) {
    const v = ventanas.find((o) => { try { return o.iframe.contentWindow === win; } catch (_e) { return false; } });
    if (!v) return;
    const antes = v.ruta ? { ruta: v.ruta, params: v.params } : null;
    if (!sinHistorial && antes && (antes.ruta !== ruta || String(antes.params || '') !== String(params || ''))) v.historial.push(antes);
    v.ruta = ruta; v.params = params || null; v.clave = clave(ruta, params);
    v.titulo = titulo(ruta, params, null, extra);
    v.el.dataset.ventanaRuta = ruta;
    v.el.querySelector('.dova-ventana-titulo').textContent = v.titulo;
    v.el.setAttribute('aria-label', v.titulo); v.iframe.title = v.titulo;
    v.el.querySelector('[data-atras]').hidden = !v.historial.length;
    pintarBarra(); guardar();
  }
  function volver(v) {
    const prev = v.historial.pop();
    v.el.querySelector('[data-atras]').hidden = !v.historial.length;
    if (!prev) return;
    try { v.iframe.contentWindow.DovaApp.navegar(prev.ruta, prev.params || undefined, { sinHistorial: true }); } catch (_e) { /* */ }
  }
  // Desde adentro: "volver al inicio" cierra la ventana.
  function cerrarDesde(win) {
    const v = ventanas.find((o) => { try { return o.iframe.contentWindow === win; } catch (_e) { return false; } });
    if (v) cerrar(v);
  }
  // Un cambio de tema claro/oscuro llega también a las ventanas abiertas.
  function aplicarTema(tema) {
    ventanas.forEach((v) => { try { v.iframe.contentDocument.documentElement.setAttribute('data-theme', tema); } catch (_e) { /* */ } });
  }

  // Lleva a una parte de la pantalla de una ventana (espera a que cargue, hasta 8 s).
  function desplazarA(ruta, id) {
    const v = ventanas.find((o) => o.ruta === ruta);
    if (!v) return;
    let n = 0;
    const intentar = () => {
      n += 1;
      let el = null;
      try { el = v.iframe.contentDocument && v.iframe.contentDocument.getElementById(id); } catch (_e) { /* */ }
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (n < 40) setTimeout(intentar, 200);
    };
    intentar();
  }

  function iniciar(o) {
    opciones = o || {};
    if (capa) return;
    capa = document.createElement('div');
    capa.id = 'dova-ventanas';
    capa.className = 'dova-ventanas';
    barra = document.createElement('nav');
    barra.id = 'dova-tareas';
    barra.className = 'dova-tareas';
    barra.setAttribute('aria-label', 'Ventanas abiertas');
    barra.hidden = true;
    const ref = document.getElementById('mec-estado');
    document.body.appendChild(capa);
    if (ref) ref.parentNode.insertBefore(barra, ref); else document.body.appendChild(barra);
    barra.addEventListener('click', (e) => {
      const c = e.target.closest('[data-tarea-cerrar]');
      if (c) { const v = ventanas.find((x) => x.id === c.dataset.tareaCerrar); if (v) cerrar(v); return; }
      if (e.target.closest('[data-escritorio]')) { mostrarEscritorio(); return; }
      const b = e.target.closest('[data-tarea]');
      if (!b) return;
      const v = ventanas.find((x) => x.id === b.dataset.tarea);
      if (!v) return;
      if (v.el.classList.contains('activa') && !v.min && !movil()) minimizar(v); else enfocar(v);
    });
    const medir = () => {
      const top = document.querySelector('.dova-topbar');
      const alto = top ? Math.max(0, top.getBoundingClientRect().bottom) : 0;
      const estado = document.getElementById('mec-estado');
      const alEstado = estado && estado.offsetParent !== null ? estado.offsetHeight : 0;
      barra.style.bottom = `${alEstado}px`;
      const abajo = (barra.hidden ? 0 : barra.offsetHeight) + alEstado;
      capa.style.top = `${alto}px`; capa.style.bottom = `${abajo}px`;
      ventanas.forEach(ubicar);
    };
    window.addEventListener('resize', medir);
    // La barra de arriba cambia de alto (menú abierto en el celular, campanita, etc.): se vuelve a medir.
    const top = document.querySelector('.dova-topbar');
    if (top && window.ResizeObserver) new ResizeObserver(() => medir()).observe(top);
    new MutationObserver(medir).observe(barra, { attributes: true, attributeFilter: ['hidden'] });
    medir();
    // Las que estaban abiertas antes de recargar.
    let previas = [];
    try { previas = JSON.parse(sessionStorage.getItem(CLAVE) || '[]'); } catch (_e) { previas = []; }
    (Array.isArray(previas) ? previas : []).slice(0, MAX).forEach((p) => {
      if (p && typeof p.ruta === 'string' && (!opciones.permitida || opciones.permitida(p.ruta))) crear({ ruta: p.ruta, params: p.params || null, x: p.x, y: p.y, min: !!p.min });
    });
    medir();
  }

  return { iniciar, abrir, desplazarA, alNavegar, cerrarDesde, mostrarEscritorio, aplicarTema, abiertas: () => ventanas.map((v) => ({ id: v.id, ruta: v.ruta, params: v.params, titulo: v.titulo, min: v.min })) };
})();
window.DovaVentanas = DovaVentanas;
