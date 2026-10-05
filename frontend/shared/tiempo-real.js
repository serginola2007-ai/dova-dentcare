/* DOVA — tiempo real.
   Mantiene una conexión abierta con el servidor (/api/eventos). Cuando algo
   cambia (un turno nuevo desde la web, un pago para revisar, un paciente,
   la caja…) el servidor avisa al instante y:
   - la campanita suma el aviso y muestra un cartel;
   - la pantalla abierta que muestra esos datos se vuelve a dibujar sola
     (sin perder lo que el usuario está escribiendo: si hay un formulario o
     una ventana abierta, espera a que termine).
   Si se corta internet, se reconecta sola y se pone al día. */
const DovaVivo = (() => {
  let activo = false; let ctrl = null; let espera = 1000; let huboConexion = false; let conectado = false;
  let pendientes = new Set(); let timerAgrupar = null;
  const vivos = new Map(); // contenedor -> { tablas, fn, timer }
  const oyentes = new Set();
  let ultimaTecla = 0;
  document.addEventListener('keydown', () => { ultimaTecla = Date.now(); }, true);
  document.addEventListener('input', () => { ultimaTecla = Date.now(); }, true);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- conexión ----------
  function iniciar() {
    if (activo) return;
    activo = true; bucle();
  }
  function detener() { activo = false; if (ctrl) ctrl.abort(); marcar(false); }

  async function bucle() {
    while (activo) {
      try { await conectarUna(); } catch (_e) { /* se reintenta */ }
      if (!activo) break;
      marcar(false);
      await dormir(espera);
      espera = Math.min(espera * 2, 20000);
    }
  }

  async function conectarUna() {
    const token = DOVA.tokenActual();
    if (!token) throw new Error('sin sesión');
    ctrl = new AbortController();
    const r = await fetch(`${DOVA.apiBase()}/eventos`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: ctrl.signal, cache: 'no-store' });
    if (r.status === 401) { await DOVA.refrescar().catch(() => {}); espera = 500; return; }
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { procesar(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
  }

  async function procesar(bloque) {
    let ev = 'message'; let data = '';
    for (const l of bloque.split('\n')) {
      if (l.startsWith('event:')) ev = l.slice(6).trim();
      else if (l.startsWith('data:')) data += l.slice(5).trim();
    }
    let d = {}; try { d = data ? JSON.parse(data) : {}; } catch (_e) { /* */ }
    if (ev === 'listo') {
      espera = 1000; marcar(true);
      if (huboConexion) emitir('*'); // reconectó: ponerse al día con lo que se perdió
      huboConexion = true;
    } else if (ev === 'cambio' && d.t) emitir(d.t);
    else if (ev === 'renovar') { espera = 200; await DOVA.refrescar().catch(() => {}); }
  }

  function marcar(v) {
    conectado = v;
    document.querySelectorAll('[data-vivo-estado]').forEach((e) => {
      e.classList.toggle('desconectado', !v);
      e.title = v ? 'En vivo: los cambios aparecen al instante' : 'Reconectando…';
    });
  }

  // Agrupa avisos que llegan juntos (un cobro toca pagos, caja y facturas a la vez).
  function emitir(tabla) {
    pendientes.add(tabla);
    clearTimeout(timerAgrupar);
    timerAgrupar = setTimeout(() => {
      const tablas = pendientes; pendientes = new Set();
      repartir(tablas);
      oyentes.forEach((fn) => { try { fn(tablas); } catch (e) { console.error('[vivo]', e); } });
    }, 300);
  }
  const toca = (tablas, mias) => tablas.has('*') || [...mias].some((t) => tablas.has(t));

  // ---------- pantallas que se actualizan solas ----------
  // vivo(contenedor, ['turnos', ...], () => volverADibujar())
  function vivo(cont, tablas, fn) {
    if (!cont) return;
    const ant = vivos.get(cont); if (ant && ant.timer) clearTimeout(ant.timer);
    vivos.set(cont, { tablas: new Set(tablas), fn, timer: null });
  }
  function ocupado(cont) {
    if (document.querySelector('.dova-modal-overlay')) return true;
    const a = document.activeElement;
    if (a && cont.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && Date.now() - ultimaTecla < 5000) return true;
    return false;
  }
  function repartir(tablas) {
    for (const [cont, v] of vivos) {
      if (!cont.isConnected) { vivos.delete(cont); continue; }
      if (!toca(tablas, v.tablas) || v.timer) continue;
      const intentar = () => {
        v.timer = null;
        if (!cont.isConnected || vivos.get(cont) !== v) return;
        if (ocupado(cont)) { v.timer = setTimeout(intentar, 1500); return; }
        const y = window.scrollY;
        Promise.resolve(v.fn()).catch((e) => console.error('[vivo]', e)).finally(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); });
      };
      v.timer = setTimeout(intentar, 150);
    }
  }
  const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

  // ---------- campanita de avisos ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hace = (iso) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'recién'; if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
    return new Date(iso).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' });
  };
  let campana = null; let noLeidas = null; let tituloBase = document.title;

  function montarCampana(antesDe, navegar) {
    if (campana && campana.isConnected) return;
    tituloBase = document.title.replace(/^\(\d+\)\s*/, '');
    campana = document.createElement('div');
    campana.className = 'dova-campana';
    campana.innerHTML = `<button type="button" class="dova-campana-btn" aria-haspopup="true" aria-expanded="false" aria-label="Avisos">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"/></svg>
        <span class="dova-campana-num" hidden></span><span class="dova-vivo-punto" data-vivo-estado></span></button>
      <div class="dova-campana-panel" hidden role="dialog" aria-label="Avisos">
        <div class="dova-campana-cab"><strong>Avisos</strong><button type="button" class="dova-btn-link" data-leer-todo>Marcar todo como leído</button></div>
        <div class="dova-campana-lista" data-lista><p class="dova-nota">Cargando…</p></div>
        <p class="dova-campana-pie" data-vivo-estado><span></span> En vivo</p>
      </div>`;
    antesDe.parentNode.insertBefore(campana, antesDe);
    const btn = campana.querySelector('.dova-campana-btn'); const panel = campana.querySelector('.dova-campana-panel');
    const cerrar = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = panel.hidden; panel.hidden = !abrir; btn.setAttribute('aria-expanded', String(abrir));
      if (abrir) cargarLista(navegar, cerrar);
    });
    document.addEventListener('click', (e) => { if (!campana.contains(e.target)) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
    campana.querySelector('[data-leer-todo]').addEventListener('click', async () => {
      try { await DOVA.post('/notificaciones/leer-todas', {}); } catch (_e) { /* */ }
      await contar(false); cargarLista(navegar, cerrar);
    });
    marcar(conectado);
    contar(false);
    alCambiar((tablas) => {
      if (toca(tablas, new Set(['notificaciones']))) {
        contar(true);
        if (!panel.hidden) cargarLista(navegar, cerrar);
      }
    });
  }

  async function contar(avisarNuevas) {
    let n;
    try { n = (await DOVA.get('/notificaciones/contador')).noLeidas || 0; } catch (_e) { return; }
    const antes = noLeidas; noLeidas = n;
    const num = campana && campana.querySelector('.dova-campana-num');
    if (num) { num.hidden = !n; num.textContent = n > 99 ? '99+' : String(n); }
    document.title = n ? `(${n}) ${tituloBase}` : tituloBase;
    if (avisarNuevas && antes !== null && n > antes) {
      try {
        const [ult] = await DOVA.get('/notificaciones?soloNoLeidas=true');
        if (ult && typeof Vistas !== 'undefined') Vistas.toast(`🔔 ${ult.titulo}`, 'info');
        if (campana) { campana.classList.remove('sonando'); void campana.offsetWidth; campana.classList.add('sonando'); }
      } catch (_e) { /* */ }
    }
  }

  async function cargarLista(navegar, cerrar) {
    const lista = campana.querySelector('[data-lista]');
    let items = [];
    try { items = await DOVA.get('/notificaciones'); } catch (e) { lista.innerHTML = `<p class="dova-nota">${esc(e.message)}</p>`; return; }
    lista.innerHTML = items.length ? items.map((n) => `<button type="button" class="dova-campana-item ${n.leido ? '' : 'nueva'}" data-id="${n.id}" data-ruta="${esc(n.ruta || '')}">
        <span class="dova-campana-titulo">${esc(n.titulo)}</span>
        ${n.mensaje ? `<span class="dova-campana-msg">${esc(n.mensaje)}</span>` : ''}
        <span class="dova-campana-cuando">${esc(hace(n.creado_en))}</span></button>`).join('')
      : '<p class="dova-nota dova-campana-vacio">No hay avisos.</p>';
    lista.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', async () => {
      cerrar();
      DOVA.post(`/notificaciones/${b.dataset.id}/leer`, {}).then(() => contar(false)).catch(() => {});
      if (b.dataset.ruta) { const [r, ...resto] = b.dataset.ruta.split('/'); navegar(r, resto.length ? resto.join('/') : undefined); }
    }));
  }

  const olvidar = (cont) => { const v = vivos.get(cont); if (v && v.timer) clearTimeout(v.timer); vivos.delete(cont); };

  return { iniciar, detener, vivo, olvidar, alCambiar, montarCampana, estaConectado: () => conectado };
})();
window.DovaVivo = DovaVivo;
