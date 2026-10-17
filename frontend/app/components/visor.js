/* Visor de radiografías y estudios en imagen (pantalla completa).
   - Zoom con la rueda, con dos dedos o con los botones; arrastrar para mover.
   - Brillo, contraste, negativo y rotación (solo en pantalla: el archivo no cambia).
   - Medir: dos toques marcan una línea. Con "Calibrar" (una medida conocida,
     por ejemplo la regla de la placa) las medidas salen en milímetros.
   - Comparar: dos estudios lado a lado, con el zoom y los ajustes sincronizados.
   Uso: DovaVisor.abrir({ items: [{ id, titulo, fecha, ruta }], inicial: id, urlArchivo }) */
(function () {
  'use strict';
  const { esc } = DovaAyudantes;
  const NS = 'http://www.w3.org/2000/svg';

  function abrir({ items, inicial, urlArchivo }) {
    if (!items || !items.length) return;
    const previo = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'dova-visor'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Visor de radiografías');
    const opciones = (sel) => items.map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(sel) ? 'selected' : ''}>${esc(x.titulo)}${x.fecha ? ` · ${esc(x.fecha)}` : ''}</option>`).join('');
    ov.innerHTML = `
      <div class="dova-visor-barra" role="toolbar" aria-label="Herramientas del visor">
        <select data-sel-a aria-label="Estudio">${opciones(inicial)}</select>
        <span class="dova-visor-grupo">
          <button type="button" data-z="-" title="Alejar" aria-label="Alejar">−</button><span data-zoom class="dova-visor-zoom">100%</span><button type="button" data-z="+" title="Acercar" aria-label="Acercar">+</button>
          <button type="button" data-ajustar title="Ajustar a la pantalla">Ajustar</button>
        </span>
        <label class="dova-visor-ctl">Brillo <input type="range" min="40" max="220" value="100" data-brillo aria-label="Brillo"/></label>
        <label class="dova-visor-ctl">Contraste <input type="range" min="40" max="300" value="100" data-contraste aria-label="Contraste"/></label>
        <span class="dova-visor-grupo">
          <button type="button" data-negativo aria-pressed="false" title="Negativo">Negativo</button>
          <button type="button" data-rotar title="Rotar 90°">Rotar</button>
          <button type="button" data-medir aria-pressed="false" title="Medir: tocá dos puntos">Medir</button>
          <button type="button" data-calibrar title="Convertir las medidas a milímetros">Calibrar</button>
          <button type="button" data-borrar-medidas title="Borrar medidas">Borrar medidas</button>
          <button type="button" data-restablecer title="Volver a como estaba">Restablecer</button>
        </span>
        <span class="dova-visor-grupo">
          ${items.length > 1 ? '<button type="button" data-comparar aria-pressed="false">Comparar</button>' : ''}
          <select data-sel-b aria-label="Estudio para comparar" hidden>${opciones((items.find((x) => String(x.id) !== String(inicial)) || items[0]).id)}</select>
        </span>
        <button type="button" class="dova-visor-cerrar" data-cerrar aria-label="Cerrar el visor">Cerrar</button>
      </div>
      <div class="dova-visor-areas" data-areas>
        <div class="dova-visor-area" data-area="a"><div class="dova-visor-lienzo" data-lienzo><img alt="" draggable="false" data-img/><svg data-svg></svg></div><span class="dova-visor-titulo" data-titulo></span></div>
        <div class="dova-visor-area" data-area="b" hidden><div class="dova-visor-lienzo" data-lienzo><img alt="" draggable="false" data-img/><svg data-svg></svg></div><span class="dova-visor-titulo" data-titulo></span></div>
      </div>
      <p class="dova-visor-ayuda" data-ayuda aria-live="polite">Rueda o dos dedos: zoom · Arrastrar: mover · Esc: cerrar</p>`;
    document.body.appendChild(ov);
    document.body.classList.add('dova-visor-abierto');

    const st = { zoom: 1, x: 0, y: 0, rot: 0, brillo: 100, contraste: 100, negativo: false, medir: false, mmPorPx: {} };
    const areas = ['a', 'b'].map((k) => ({ k, el: ov.querySelector(`[data-area="${k}"]`) }));
    areas.forEach((a) => { a.lienzo = a.el.querySelector('[data-lienzo]'); a.img = a.el.querySelector('[data-img]'); a.svg = a.el.querySelector('[data-svg]'); a.tit = a.el.querySelector('[data-titulo]'); a.puntos = []; });
    const ayuda = ov.querySelector('[data-ayuda]');
    const decir = (t) => { ayuda.textContent = t; };

    const aplicar = () => {
      for (const a of areas) {
        a.lienzo.style.transform = `translate(-50%, -50%) translate(${st.x}px, ${st.y}px) scale(${st.zoom}) rotate(${st.rot}deg)`;
        a.img.style.filter = `brightness(${st.brillo}%) contrast(${st.contraste}%)${st.negativo ? ' invert(1)' : ''}`;
        a.svg.querySelectorAll('line, circle').forEach((n) => n.setAttribute('stroke-width', String(2 / st.zoom)));
        a.svg.querySelectorAll('text').forEach((n) => n.setAttribute('font-size', String(14 / st.zoom)));
      }
      ov.querySelector('[data-zoom]').textContent = `${Math.round(st.zoom * 100)}%`;
    };
    const ajustar = () => {
      const a = areas[0]; const r = a.el.getBoundingClientRect();
      const w = a.img.naturalWidth || 1; const h = a.img.naturalHeight || 1;
      const giro = st.rot % 180 !== 0;
      st.zoom = Math.min(r.width / (giro ? h : w), r.height / (giro ? w : h)) * 0.95 || 1;
      st.x = 0; st.y = 0; aplicar();
    };
    async function cargar(a, id) {
      const it = items.find((x) => String(x.id) === String(id)); if (!it) return;
      a.tit.textContent = `${it.titulo}${it.fecha ? ` · ${it.fecha}` : ''}`;
      a.img.alt = it.titulo; a.puntos = []; a.svg.innerHTML = ''; a.id = it.id;
      try {
        const u = await urlArchivo(it.ruta);
        await new Promise((ok, mal) => { a.img.onload = ok; a.img.onerror = () => mal(new Error('No se pudo abrir la imagen')); a.img.src = u; });
        a.svg.setAttribute('viewBox', `0 0 ${a.img.naturalWidth} ${a.img.naturalHeight}`);
        a.svg.setAttribute('width', a.img.naturalWidth); a.svg.setAttribute('height', a.img.naturalHeight);
        a.lienzo.style.width = `${a.img.naturalWidth}px`; a.lienzo.style.height = `${a.img.naturalHeight}px`;
        if (a.k === 'a') ajustar(); else aplicar();
      } catch (e) { decir(e.message); }
    }

    // ---- mover y zoom (mouse, rueda, táctil) ----
    const zoomEn = (f, cx, cy) => {
      const nz = Math.min(20, Math.max(0.05, st.zoom * f));
      const r = areas[0].el.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2) - st.x; const dy = cy - (r.top + r.height / 2) - st.y;
      st.x -= dx * (nz / st.zoom - 1); st.y -= dy * (nz / st.zoom - 1); st.zoom = nz; aplicar();
    };
    const toques = new Map(); let arrastre = null; let pinza = null;
    ov.querySelector('[data-areas]').addEventListener('wheel', (e) => { e.preventDefault(); zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    ov.querySelector('[data-areas]').addEventListener('pointerdown', (e) => {
      if (st.medir) return;
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (toques.size === 1) arrastre = { x: e.clientX - st.x, y: e.clientY - st.y };
      if (toques.size === 2) { const [p, q] = [...toques.values()]; pinza = { d: Math.hypot(p.x - q.x, p.y - q.y), z: st.zoom }; arrastre = null; }
    });
    ov.querySelector('[data-areas]').addEventListener('pointermove', (e) => {
      if (!toques.has(e.pointerId)) return;
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinza && toques.size === 2) { const [p, q] = [...toques.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y); st.zoom = Math.min(20, Math.max(0.05, pinza.z * (d / pinza.d))); aplicar(); }
      else if (arrastre) { st.x = e.clientX - arrastre.x; st.y = e.clientY - arrastre.y; aplicar(); }
    });
    const soltar = (e) => { toques.delete(e.pointerId); if (toques.size < 2) pinza = null; if (!toques.size) arrastre = null; };
    ov.querySelector('[data-areas]').addEventListener('pointerup', soltar);
    ov.querySelector('[data-areas]').addEventListener('pointercancel', soltar);

    // ---- medir ----
    const aImagen = (a, e) => { const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(a.svg.getScreenCTM().inverse()); return { x: pt.x, y: pt.y }; };
    const largo = (a, p, q) => { const px = Math.hypot(q.x - p.x, q.y - p.y); const k = st.mmPorPx[a.id]; return { px, texto: k ? `${(px * k).toFixed(1)} mm` : `${Math.round(px)} px` }; };
    const dibujarMedida = (a, p, q) => {
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'dova-visor-medida');
      const l = document.createElementNS(NS, 'line'); Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y }).forEach(([k, v]) => l.setAttribute(k, v));
      const t = document.createElementNS(NS, 'text'); t.setAttribute('x', (p.x + q.x) / 2 + 6); t.setAttribute('y', (p.y + q.y) / 2 - 6);
      const m = largo(a, p, q); t.textContent = m.texto; g.dataset.px = String(m.px);
      g.append(l, t); a.svg.appendChild(g); aplicar();
      return m;
    };
    areas.forEach((a) => a.svg.addEventListener('pointerdown', (e) => {
      if (!st.medir) return;
      e.stopPropagation();
      const p = aImagen(a, e);
      const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', String(4 / st.zoom)); c.setAttribute('class', 'dova-visor-punto'); a.svg.appendChild(c);
      a.puntos.push(p);
      if (a.puntos.length === 2) {
        const [p1, p2] = a.puntos; a.puntos = [];
        a.svg.querySelectorAll('.dova-visor-punto').forEach((x) => x.remove());
        const m = dibujarMedida(a, p1, p2);
        if (st.calibrando) {
          st.calibrando = false;
          // Se pide la medida real en la misma barra (sin ventanas del navegador).
          ayuda.innerHTML = '<form class="dova-visor-calib" data-calib><label>¿Cuántos milímetros mide esa línea? <input type="text" inputmode="decimal" value="10" size="5" data-mm aria-label="Milímetros"/></label> <button>Aplicar</button> <button type="button" data-cancelar-calib>Cancelar</button></form>';
          const f = ayuda.querySelector('[data-calib]'); const inp = f.querySelector('[data-mm]'); inp.focus(); inp.select();
          f.querySelector('[data-cancelar-calib]').addEventListener('click', () => decir('Calibración cancelada.'));
          f.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const mm = Number(String(inp.value).replace(',', '.'));
            if (!(mm > 0)) { inp.focus(); return; }
            st.mmPorPx[a.id] = mm / m.px;
            a.svg.querySelectorAll('.dova-visor-medida').forEach((g) => { g.querySelector('text').textContent = `${(Number(g.dataset.px) * st.mmPorPx[a.id]).toFixed(1)} mm`; });
            decir('Calibrado: las medidas de este estudio salen en milímetros.');
          });
        } else decir(`Medida: ${m.texto}`);
      } else decir('Tocá el segundo punto.');
    }));

    // ---- botones ----
    const btn = (sel) => ov.querySelector(sel);
    btn('[data-z="+"]').addEventListener('click', () => { const r = areas[0].el.getBoundingClientRect(); zoomEn(1.25, r.left + r.width / 2, r.top + r.height / 2); });
    btn('[data-z="-"]').addEventListener('click', () => { const r = areas[0].el.getBoundingClientRect(); zoomEn(0.8, r.left + r.width / 2, r.top + r.height / 2); });
    btn('[data-ajustar]').addEventListener('click', ajustar);
    btn('[data-brillo]').addEventListener('input', (e) => { st.brillo = Number(e.target.value); aplicar(); });
    btn('[data-contraste]').addEventListener('input', (e) => { st.contraste = Number(e.target.value); aplicar(); });
    btn('[data-negativo]').addEventListener('click', (e) => { st.negativo = !st.negativo; e.target.setAttribute('aria-pressed', String(st.negativo)); aplicar(); });
    btn('[data-rotar]').addEventListener('click', () => { st.rot = (st.rot + 90) % 360; ajustar(); });
    btn('[data-medir]').addEventListener('click', (e) => { st.medir = !st.medir; st.calibrando = false; e.target.setAttribute('aria-pressed', String(st.medir)); ov.classList.toggle('midiendo', st.medir); decir(st.medir ? 'Medir: tocá dos puntos de la imagen.' : 'Rueda o dos dedos: zoom · Arrastrar: mover · Esc: cerrar'); });
    btn('[data-calibrar]').addEventListener('click', () => { st.medir = true; st.calibrando = true; btn('[data-medir]').setAttribute('aria-pressed', 'true'); ov.classList.add('midiendo'); decir('Calibrar: marcá los dos extremos de algo cuya medida conocés (por ejemplo, la regla de la placa).'); });
    btn('[data-borrar-medidas]').addEventListener('click', () => { areas.forEach((a) => { a.svg.innerHTML = ''; a.puntos = []; }); decir('Medidas borradas.'); });
    btn('[data-restablecer]').addEventListener('click', () => { Object.assign(st, { rot: 0, brillo: 100, contraste: 100, negativo: false }); btn('[data-brillo]').value = 100; btn('[data-contraste]').value = 100; btn('[data-negativo]').setAttribute('aria-pressed', 'false'); ajustar(); });
    btn('[data-sel-a]').addEventListener('change', (e) => cargar(areas[0], e.target.value));
    const cmp = btn('[data-comparar]');
    if (cmp) cmp.addEventListener('click', () => {
      const on = cmp.getAttribute('aria-pressed') !== 'true';
      cmp.setAttribute('aria-pressed', String(on)); areas[1].el.hidden = !on; btn('[data-sel-b]').hidden = !on;
      ov.classList.toggle('comparando', on);
      if (on) cargar(areas[1], btn('[data-sel-b]').value).then(ajustar); else ajustar();
    });
    btn('[data-sel-b]').addEventListener('change', (e) => cargar(areas[1], e.target.value));
    const cerrar = () => { document.removeEventListener('keydown', tecla); ov.remove(); document.body.classList.remove('dova-visor-abierto'); if (previo && previo.focus) previo.focus(); };
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar();
      else if (e.key === '+' || e.key === '=') btn('[data-z="+"]').click();
      else if (e.key === '-') btn('[data-z="-"]').click();
    };
    document.addEventListener('keydown', tecla);
    btn('[data-cerrar]').addEventListener('click', cerrar);
    window.addEventListener('resize', () => { if (document.body.contains(ov)) ajustar(); });
    btn('[data-cerrar]').focus();
    cargar(areas[0], inicial);
    return { cerrar };
  }

  window.DovaVisor = { abrir };
}());
