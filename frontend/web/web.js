/* Página web de DentCareRC: reserva turnos, registra pacientes y recibe
   consultas directamente en DOVA (API /api/web/publico). */
(() => {
  const API = '/api/web/publico';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gs = (n) => `Gs. ${Math.round(n).toLocaleString('es-PY')}`;
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_C = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const fechaLarga = (iso) => new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

  async function api(ruta, { method = 'GET', body } = {}) {
    let r;
    try { r = await fetch(API + ruta, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch (_e) { throw new Error('No hay conexión. Revisá tu internet y probá de nuevo.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'No se pudo completar. Probá de nuevo en unos minutos.');
    return j;
  }
  let avisoTmr;
  function aviso(msg) { const a = $('[data-aviso]'); a.textContent = msg; a.hidden = false; clearTimeout(avisoTmr); avisoTmr = setTimeout(() => { a.hidden = true; }, 4500); }

  // Turnos reservados en este dispositivo (para volver a verlos).
  const MIS = 'dentcare-mis-turnos';
  const misTurnos = () => { try { return JSON.parse(localStorage.getItem(MIS) || '[]'); } catch (_e) { return []; } };
  const guardarTurno = (t) => { try { const l = misTurnos().filter((x) => x.token !== t.token); l.unshift(t); localStorage.setItem(MIS, JSON.stringify(l.slice(0, 10))); } catch (_e) { /* modo privado */ } };

  let info = null;
  const st = { tratamientoId: null, odontologoId: null, fecha: null, hora: null, paso: 1, mes: null, dias: {} };

  // =================================================================== inicio
  // Cada página trae solo sus bloques; acá se activa lo que haya en la página actual.
  const hay = (sel) => !!$(sel);
  const params = new URLSearchParams(location.search);
  async function iniciar() {
    menuCelular();
    // Enlaces viejos (todo en una página): #turno=… ahora vive en mi-turno.html
    const viejo = location.hash.match(/^#turno=([\w-]{20,})/);
    if (viejo) { location.replace(`mi-turno.html#t=${viejo[1]}`); return; }
    try { info = await api('/info'); } catch (e) {
      const d = $('[data-libres]') || $('[data-reserva]') || $('main');
      if (d) d.insertAdjacentHTML('afterbegin', `<p class="error">${esc(e.message)}</p>`);
      return;
    }
    pintarDatos();
    const pausadas = !info.reservasActivas;
    if (hay('[data-libres]')) {
      if (pausadas) $('[data-libres]').innerHTML = '<p class="libres-vacio">Las reservas online están pausadas por ahora. Escribinos por WhatsApp o llamanos.</p>';
      else cargarLibres();
    }
    if (hay('[data-reserva]')) {
      if (pausadas) { $('[data-reserva]').innerHTML = '<p>Las reservas online están pausadas por ahora. Comunicate con la clínica para coordinar tu turno.</p>'; $('[data-pasos]').hidden = true; }
      else {
        // Llega con algo ya elegido desde otra página: tratamiento (t), profesional (o), día y hora (f, h).
        const num = (k) => (/^\d+$/.test(params.get(k) || '') ? Number(params.get(k)) : null);
        st.tratamientoId = info.tratamientos.some((t) => t.id === num('t')) ? num('t') : null;
        st.odontologoId = info.odontologos.some((o) => o.id === num('o')) ? num('o') : null;
        const f = params.get('f'); const h = params.get('h');
        if (/^\d{4}-\d{2}-\d{2}$/.test(f || '') && /^\d{2}:\d{2}$/.test(h || '')) { st.fecha = f; st.hora = h; st.paso = 4; }
        else st.paso = st.odontologoId ? 3 : st.tratamientoId ? 2 : 1;
        pintarPaso();
      }
    }
    if (hay('[data-vista-turno]')) { window.addEventListener('hashchange', ruteoTurno); ruteoTurno(); }
    if (hay('[data-form-ficha]')) formFicha();
    if (hay('[data-form-consulta]')) formConsulta();
  }

  function ruteoTurno() {
    const m = location.hash.match(/^#t=([\w-]{20,})/);
    if (m) verTurno(m[1]); else verMisTurnos();
    window.scrollTo(0, 0);
  }

  // Menú en el celular (botón ☰)
  function menuCelular() {
    const b = $('[data-menu]'); const nav = $('.cabecera-nav'); if (!b || !nav) return;
    b.addEventListener('click', () => { const abierto = nav.classList.toggle('abierto'); b.setAttribute('aria-expanded', String(abierto)); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('abierto')) { nav.classList.remove('abierto'); b.setAttribute('aria-expanded', 'false'); b.focus(); } });
  }

  function linkWa(texto) {
    const n = String(info.whatsapp || '').replace(/\D/g, '');
    if (!n) return null;
    const num = n.startsWith('0') ? `595${n.slice(1)}` : n;
    return `https://wa.me/${num}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
  }

  function pintarDatos() {
    document.title = `${info.nombre} — Odontología humanizada`;
    $$('[data-nombre]').forEach((e) => { e.textContent = info.nombre; });
    // Nombre como en la marca: "Dent" + "Care" en terracota (+ lo que siga, ej. "RC").
    const m = info.nombre.match(/^(dent)(care)(.*)$/i);
    $('[data-marca]').innerHTML = m ? `${esc(m[1])}<span class="care">${esc(m[2])}</span>${m[3] ? `<span class="rc">${esc(m[3].trim())}</span>` : ''}` : esc(info.nombre);
    if (info.eslogan && hay('[data-eslogan]')) $('[data-eslogan]').textContent = info.eslogan;
    if (info.presentacion && hay('[data-presentacion]')) $('[data-presentacion]').textContent = info.presentacion;
    // Logo cargado en DOVA (Facturación → Configuración); si no hay, el diente de la marca.
    if (info.tieneLogo) { const l = $('[data-logo]'); l.src = `${API}/logo`; l.hidden = false; l.alt = ''; $('[data-diente]').hidden = true; }
    const wa = linkWa('Hola, quería hacer una consulta.');
    $$('[data-wa]').forEach((b) => { if (wa) { b.href = wa; b.hidden = false; } });

    // Tratamientos agrupados por categoría
    const grupos = {};
    for (const t of info.tratamientos) (grupos[t.categoria || 'General'] ||= []).push(t);
    if (hay('[data-tratamientos]')) $('[data-tratamientos]').innerHTML = Object.entries(grupos).map(([cat, ts]) => `
      <div class="trat-grupo"><h3>${esc(cat)}</h3>
        ${ts.map((t) => `<div class="trat"><div><strong>${esc(t.nombre)}</strong>${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}</div>
          <div class="trat-dato">${t.precio ? `<b>Desde ${gs(t.precio)}</b>` : ''}${t.duracion} min${info.reservasActivas ? `<a class="trat-reservar" href="reservar.html?t=${t.id}">Reservar</a>` : ''}</div></div>`).join('')}</div>`).join('')
      || '<p class="cargando">Pronto vas a ver acá los tratamientos.</p>';

    // Equipo (el color es el mismo que usa la agenda de DOVA)
    if (hay('[data-equipo]')) $('[data-equipo]').innerHTML = info.odontologos.map((o) => `<li><span class="inicial" style="background:${/^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#B96A47'}">${esc((o.nombre.replace(/^(Dra?\.|Lic\.)\s*/i, '')[0] || '?').toUpperCase())}</span>
      <div><strong>${esc(o.nombre)}</strong><small>${esc(o.especialidad || 'Odontología general')}</small>${info.reservasActivas ? `<a class="trat-reservar" href="reservar.html?o=${o.id}">Reservar con ${esc(o.nombre.split(' ').slice(0, 2).join(' '))}</a>` : ''}</div></li>`).join('')
      || '<li>Pronto vas a conocer acá al equipo.</li>';

    // Horarios de atención
    const hoy = new Date(`${hoyIso()}T12:00:00Z`).getUTCDay();
    // Horario de hoy (portada)
    if (hay('[data-hoy]')) { const r = info.horarios[hoy] || []; $('[data-hoy]').textContent = r.length ? `Hoy atendemos de ${r.map(([a, b]) => `${a} a ${b}`).join(' y ')}.` : 'Hoy la clínica está cerrada.'; }
    if (hay('[data-horarios]')) $('[data-horarios]').innerHTML = `<caption class="ayuda" style="text-align:left;padding-bottom:6px">Horario de atención</caption>${[1, 2, 3, 4, 5, 6, 0].map((d) => {
      const r = info.horarios[d] || [];
      return `<tr class="${d === hoy ? 'hoy' : ''}"><td>${mayus(DIAS[d])}</td><td>${r.length ? r.map(([a, b]) => `${a} a ${b}`).join(' y ') : 'Cerrado'}</td></tr>`;
    }).join('')}`;
    const c = [];
    if (info.direccion) c.push(`<li>${esc(info.direccion)}</li>`);
    if (info.telefono) c.push(`<li>Teléfono: <a href="tel:${esc(info.telefono.replace(/[^\d+]/g, ''))}">${esc(info.telefono)}</a></li>`);
    if (wa) c.push(`<li>WhatsApp: <a href="${esc(wa)}" target="_blank" rel="noopener">${esc(info.whatsapp)}</a></li>`);
    if (info.email) c.push(`<li>Email: <a href="mailto:${esc(info.email)}">${esc(info.email)}</a></li>`);
    if (info.instagram) c.push(`<li>Instagram: <a href="https://instagram.com/${esc(info.instagram.replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, ''))}" target="_blank" rel="noopener">${esc(info.instagram)}</a></li>`);
    if (hay('[data-contacto]')) $('[data-contacto]').innerHTML = c.join('');
    if (info.mapaUrl && hay('[data-mapa]')) { const m = $('[data-mapa]'); m.innerHTML = `<iframe src="${esc(info.mapaUrl)}" title="Cómo llegar" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`; m.hidden = false; }
  }

  // =================================================================== horarios libres (portada)
  async function cargarLibres() {
    const cont = $('[data-libres]');
    try {
      const d = await api('/disponibilidad');
      const fechas = Object.keys(d.dias).sort().slice(0, 3);
      if (!fechas.length) { cont.innerHTML = '<p class="libres-vacio">No quedan horarios libres en los próximos días. Escribinos y te buscamos un lugar.</p>'; return; }
      const dias = await Promise.all(fechas.map((f) => api(`/disponibilidad?fecha=${f}`)));
      const hoy = hoyIso();
      cont.innerHTML = dias.map((x) => `<div class="libres-dia"><h3>${x.fecha === hoy ? 'Hoy' : mayus(fechaLarga(x.fecha))}</h3>
        <div class="libres-horas">${x.horarios.slice(0, 6).map((h) => `<button type="button" class="hora-chip" data-f="${x.fecha}" data-h="${h}" aria-label="Reservar ${esc(fechaLarga(x.fecha))} a las ${h}">${h}</button>`).join('')}</div></div>`).join('');
      $$('.hora-chip', cont).forEach((b) => b.addEventListener('click', () => { location.href = `reservar.html?f=${b.dataset.f}&h=${b.dataset.h}`; }));
    } catch (e) { cont.innerHTML = `<p class="libres-vacio">${esc(e.message)}</p>`; }
  }

  // =================================================================== reserva en 4 pasos
  const tratElegido = () => info.tratamientos.find((t) => t.id === st.tratamientoId);
  const odoElegido = () => info.odontologos.find((o) => o.id === st.odontologoId);
  function marcarPasos() {
    $$('[data-paso-ind]').forEach((li) => {
      const n = Number(li.dataset.pasoInd);
      li.classList.toggle('activo', n === st.paso); li.classList.toggle('hecho', n < st.paso);
      if (n === st.paso) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  function irPaso(n) { st.paso = n; pintarPaso(); const r = $('#reservar'); if (r.getBoundingClientRect().top < 0) r.scrollIntoView(); }
  function resumenHtml() {
    const t = tratElegido(); const o = odoElegido();
    return `<div class="resumen"><span><b>${esc(t ? t.nombre : 'Consulta general')}</b></span><span>${esc(o ? o.nombre : 'Cualquier profesional')}</span>
      ${st.fecha ? `<span>${esc(mayus(fechaLarga(st.fecha)))}${st.hora ? ` a las ${st.hora}` : ''}</span>` : ''}</div>`;
  }

  function pintarPaso() {
    marcarPasos();
    const c = $('[data-reserva]');
    if (st.paso === 1) {
      c.innerHTML = `<h3>¿Qué necesitás?</h3><p class="reserva-ayuda">Si no sabés, elegí “Consulta general” y lo vemos en la clínica.</p>
        <div class="opciones" role="group" aria-label="Tratamiento">
          <button type="button" class="opcion" data-t="" aria-pressed="${st.tratamientoId === null}"><div><strong>Consulta general</strong><small>Revisión y diagnóstico</small></div></button>
          ${info.tratamientos.map((t) => `<button type="button" class="opcion" data-t="${t.id}" aria-pressed="${st.tratamientoId === t.id}"><div><strong>${esc(t.nombre)}</strong><small>${t.duracion} min${t.precio ? ` · desde ${gs(t.precio)}` : ''}</small></div></button>`).join('')}
        </div>`;
      $$('[data-t]', c).forEach((b) => b.addEventListener('click', () => { st.tratamientoId = b.dataset.t ? Number(b.dataset.t) : null; st.fecha = null; st.hora = null; irPaso(2); }));
    } else if (st.paso === 2) {
      c.innerHTML = `${resumenHtml()}<h3>¿Con quién te querés atender?</h3><p class="reserva-ayuda">“Cualquier profesional” te muestra más horarios.</p>
        <div class="opciones" role="group" aria-label="Profesional">
          <button type="button" class="opcion" data-o="" aria-pressed="${st.odontologoId === null}"><span class="punto" style="background:var(--encia)"></span><div><strong>Cualquier profesional</strong><small>El primer horario libre</small></div></button>
          ${info.odontologos.map((o) => `<button type="button" class="opcion" data-o="${o.id}" aria-pressed="${st.odontologoId === o.id}"><span class="punto" style="background:${/^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : 'var(--cobalto)'}"></span><div><strong>${esc(o.nombre)}</strong><small>${esc(o.especialidad || 'Odontología general')}</small></div></button>`).join('')}
        </div><div class="reserva-pie"><button type="button" class="boton-texto" data-atras>Volver</button></div>`;
      $$('[data-o]', c).forEach((b) => b.addEventListener('click', () => { st.odontologoId = b.dataset.o ? Number(b.dataset.o) : null; st.fecha = null; st.hora = null; irPaso(3); }));
      $('[data-atras]', c).addEventListener('click', () => irPaso(1));
    } else if (st.paso === 3) {
      pasoCalendario(c);
    } else {
      pasoDatos(c);
    }
  }

  const filtros = () => new URLSearchParams(Object.entries({ tratamientoId: st.tratamientoId || '', odontologoId: st.odontologoId || '' }).filter(([, v]) => v)).toString();

  async function pasoCalendario(c) {
    c.innerHTML = `${resumenHtml()}<h3>Elegí el día y la hora</h3><p class="reserva-ayuda">Los días marcados tienen horarios libres.</p>
      <div class="calendario"><div data-cal><p class="cargando">Buscando días libres…</p></div><div class="horas" data-horas><p class="cargando">Elegí un día del calendario.</p></div></div>
      <div class="reserva-pie"><button type="button" class="boton-texto" data-atras>Volver</button></div>`;
    $('[data-atras]', c).addEventListener('click', () => irPaso(2));
    try {
      const d = await api(`/disponibilidad?${filtros()}`);
      st.dias = d.dias; st.desde = d.desde; st.hasta = d.hasta;
      const primero = Object.keys(d.dias).sort()[0];
      if (!primero) { $('[data-cal]', c).innerHTML = '<p>No hay horarios libres para esta elección en los próximos días. Probá con “Cualquier profesional” o escribinos.</p>'; $('[data-horas]', c).innerHTML = ''; return; }
      st.mes = (st.fecha || primero).slice(0, 7);
      pintarMes(c);
      elegirDia(c, st.fecha && d.dias[st.fecha] ? st.fecha : primero);
    } catch (e) { $('[data-cal]', c).innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  function pintarMes(c) {
    const [y, m] = st.mes.split('-').map(Number);
    const primerDia = new Date(Date.UTC(y, m - 1, 1)); const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = (primerDia.getUTCDay() + 6) % 7;
    const nombreMes = mayus(new Intl.DateTimeFormat('es-PY', { month: 'long', timeZone: 'UTC' }).format(primerDia)) + ` ${y}`;
    const celdas = [];
    for (let i = 0; i < offset; i++) celdas.push('<span></span>');
    for (let d = 1; d <= diasMes; d++) {
      const f = `${st.mes}-${String(d).padStart(2, '0')}`;
      const libre = !!st.dias[f];
      celdas.push(`<button type="button" class="dia ${libre ? 'libre' : ''} ${st.fecha === f ? 'elegido' : ''}" data-dia="${f}" ${libre ? '' : 'disabled'} aria-label="${esc(fechaLarga(f))}${libre ? '' : ', sin horarios'}">${d}</button>`);
    }
    const prev = `${st.mes}-01` > st.desde; const next = `${st.mes}-31` < st.hasta;
    $('[data-cal]', c).innerHTML = `<div class="mes-cab"><button type="button" data-mes="-1" ${prev ? '' : 'disabled'} aria-label="Mes anterior">‹</button><strong>${esc(nombreMes)}</strong><button type="button" data-mes="1" ${next ? '' : 'disabled'} aria-label="Mes siguiente">›</button></div>
      <div class="mes">${DIAS_C.map((x) => `<span class="dsem">${x}</span>`).join('')}${celdas.join('')}</div>`;
    $$('[data-dia]', c).forEach((b) => b.addEventListener('click', () => elegirDia(c, b.dataset.dia)));
    $$('[data-mes]', c).forEach((b) => b.addEventListener('click', () => { const dt = new Date(Date.UTC(y, m - 1 + Number(b.dataset.mes), 1)); st.mes = dt.toISOString().slice(0, 7); pintarMes(c); }));
  }
  async function elegirDia(c, f) {
    st.fecha = f; st.hora = null;
    $$('[data-dia]', c).forEach((b) => b.classList.toggle('elegido', b.dataset.dia === f));
    const h = $('[data-horas]', c); h.innerHTML = '<p class="cargando">Cargando horarios…</p>';
    try {
      const d = await api(`/disponibilidad?${filtros()}&fecha=${f}`);
      if (!d.horarios.length) { h.innerHTML = `<h4>${esc(mayus(fechaLarga(f)))}</h4><p>Ese día se completó. Elegí otro.</p>`; return; }
      const man = d.horarios.filter((x) => x < '13:00'); const tar = d.horarios.filter((x) => x >= '13:00');
      const grupo = (t, l) => (l.length ? `<p class="franja">${t}</p><div class="horas-grilla">${l.map((x) => `<button type="button" class="hora" data-hora="${x}" aria-pressed="false">${x}</button>`).join('')}</div>` : '');
      h.innerHTML = `<h4>${esc(mayus(fechaLarga(f)))}</h4>${grupo('Mañana', man)}${grupo('Tarde', tar)}`;
      $$('[data-hora]', h).forEach((b) => b.addEventListener('click', () => { st.hora = b.dataset.hora; irPaso(4); }));
    } catch (e) { h.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }

  function camposPersona(pref) {
    return `<div class="campo-fila">
        <div class="campo"><label for="${pref}-nom">Nombre</label><input id="${pref}-nom" name="nombre" autocomplete="given-name" maxlength="120" required /></div>
        <div class="campo"><label for="${pref}-ape">Apellido</label><input id="${pref}-ape" name="apellido" autocomplete="family-name" maxlength="120" required /></div>
      </div>
      <div class="campo-fila">
        <div class="campo"><label for="${pref}-ci">Cédula</label><input id="${pref}-ci" name="ci" inputmode="numeric" maxlength="20" required /></div>
        <div class="campo"><label for="${pref}-tel">Celular o WhatsApp</label><input id="${pref}-tel" name="telefono" type="tel" autocomplete="tel" maxlength="60" placeholder="0981 123 456" required /></div>
      </div>
      <div class="campo-fila">
        <div class="campo"><label for="${pref}-mail">Email <span class="opcional">(opcional)</span></label><input id="${pref}-mail" name="email" type="email" autocomplete="email" maxlength="150" /></div>
        <div class="campo"><label for="${pref}-nac">Fecha de nacimiento <span class="opcional">(opcional)</span></label><input id="${pref}-nac" name="fechaNacimiento" type="date" max="${hoyIso()}" /></div>
      </div>`;
  }
  const leer = (form) => Object.fromEntries(new FormData(form).entries());

  function pasoDatos(c) {
    c.innerHTML = `${resumenHtml()}<h3>Tus datos</h3><p class="reserva-ayuda">Los usamos solo para tu turno. Si ya sos paciente, con tu cédula te encontramos.</p>
      <form class="formulario" data-form-reserva novalidate>
        ${camposPersona('r')}
        <div class="campo"><label for="r-com">¿Algo que debamos saber? <span class="opcional">(opcional)</span></label><textarea id="r-com" name="comentario" rows="2" maxlength="500" placeholder="Por ejemplo: me duele una muela de abajo"></textarea></div>
        <label class="check"><input type="checkbox" name="acepta" required /> Acepto que ${esc(info.nombre)} use estos datos para darme el turno y contactarme.</label>
        <div class="trampa" aria-hidden="true"><label>Sitio <input name="sitio" tabindex="-1" autocomplete="off" /></label></div>
        <p class="error" data-error role="alert" hidden></p>
        <div class="reserva-pie"><button type="button" class="boton-texto" data-atras>Cambiar día u hora</button><button class="boton" type="submit">Confirmar turno</button></div>
      </form>`;
    $('[data-atras]', c).addEventListener('click', () => irPaso(st.fecha ? 3 : 1));
    const form = $('[data-form-reserva]', c);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', form); err.hidden = true;
      const btn = $('button[type=submit]', form);
      const d = leer(form);
      const falta = !d.nombre.trim() ? 'Escribí tu nombre' : !d.apellido.trim() ? 'Escribí tu apellido' : !d.ci.trim() ? 'Escribí tu cédula' : d.telefono.replace(/\D/g, '').length < 6 ? 'Escribí tu celular o WhatsApp' : !form.acepta.checked ? 'Marcá la casilla para aceptar el uso de tus datos' : null;
      if (falta) { err.textContent = falta; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Reservando…';
      try {
        const r = await api('/reservar', { method: 'POST', body: { ...d, acepta: true, tratamientoId: st.tratamientoId, odontologoId: st.odontologoId, fecha: st.fecha, hora: st.hora } });
        guardarTurno({ token: r.token, fecha: r.turno.fecha, hora: r.turno.hora, motivo: r.turno.motivo });
        try { sessionStorage.setItem('dentcare-recien', '1'); } catch (_e) { /* */ }
        location.href = `mi-turno.html#t=${r.token}`;
      } catch (e) {
        err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Confirmar turno';
        if (/ocup/.test(e.message)) { st.hora = null; }
      }
    });
  }

  // =================================================================== mi turno
  async function verTurno(token, mensajeNuevo) {
    const v = $('[data-vista-turno]');
    v.innerHTML = '<p class="cargando">Cargando tu turno…</p>';
    let t;
    try { t = await api(`/turno/${encodeURIComponent(token)}`); } catch (e) {
      v.innerHTML = `<div class="tarjeta-turno"><h2>No encontramos ese turno</h2><p style="margin-top:8px">${esc(e.message)}. Revisá el enlace o comunicate con la clínica.</p><p style="margin-top:20px"><a class="boton" href="index.html">Ir a la página</a></p></div>`;
      return;
    }
    const enlace = `${location.origin}${location.pathname}#t=${token}`;
    try { if (sessionStorage.getItem('dentcare-recien')) { sessionStorage.removeItem('dentcare-recien'); aviso('¡Listo! Tu turno quedó reservado.'); } } catch (_e) { /* */ }
    const estado = t.estado === 'cancelado' ? ['Cancelado', 'no'] : t.estado === 'atendido' ? ['Atendido', 'ok'] : t.estado === 'no_asistio' ? ['No asistió', 'no'] : !t.vigente ? ['Pasado', ''] : t.confirmado ? ['Confirmado', 'ok'] : ['Reservado', ''];
    const wa = linkWa(`Hola, soy ${t.nombre}. Tengo turno el ${fechaLarga(t.fecha)} a las ${t.hora}.`);
    v.innerHTML = `<div class="tarjeta-turno">
      <span class="estado ${estado[1]}">${estado[0]}</span>
      <p class="cuando">${esc(mayus(t.fechaTexto))}<br>a las ${esc(t.hora)}</p>
      <dl><dt>Paciente</dt><dd>${esc(t.nombre)}</dd><dt>Motivo</dt><dd>${esc(t.motivo || 'Consulta')}</dd><dt>Profesional</dt><dd>${esc(t.odontologo)}</dd><dt>Duración</dt><dd>${t.duracion} minutos</dd>
        ${info && info.direccion ? `<dt>Dónde</dt><dd>${esc(info.direccion)}</dd>` : ''}</dl>
      <div class="acciones-turno">
        ${t.vigente && !t.confirmado ? '<button type="button" class="boton" data-confirmar>Confirmar que voy</button>' : ''}
        ${t.puedeCancelar ? '<button type="button" class="boton boton-peligro" data-cancelar>Cancelar turno</button>' : ''}
        ${wa ? `<a class="boton boton-claro" href="${esc(wa)}" target="_blank" rel="noopener">Escribir a la clínica</a>` : ''}
      </div>
      ${t.vigente && !t.puedeCancelar ? `<p class="ayuda" style="margin-top:12px">Para cancelar con menos de ${t.cancelacionHoras} h de anticipación, comunicate con la clínica.</p>` : ''}
      ${t.vigente ? `<div class="enlace-guardar"><strong>Guardá este enlace</strong><p class="ayuda">Con él podés ver, confirmar o cancelar tu turno.</p>
        <input readonly value="${esc(enlace)}" aria-label="Enlace de tu turno" data-enlace />
        <div class="acciones-turno"><button type="button" class="boton boton-chico" data-copiar>Copiar enlace</button>
          <a class="boton boton-chico boton-claro" href="https://wa.me/?text=${encodeURIComponent(`Mi turno en ${info ? info.nombre : 'la clínica'}: ${fechaLarga(t.fecha)} a las ${t.hora}. ${enlace}`)}" target="_blank" rel="noopener">Mandármelo por WhatsApp</a></div></div>` : ''}
      <p style="margin-top:24px"><a href="index.html" class="boton-texto">Volver a la página</a></p>
    </div>`;
    const conf = $('[data-confirmar]', v); const canc = $('[data-cancelar]', v); const cop = $('[data-copiar]', v);
    if (conf) conf.addEventListener('click', async () => { conf.disabled = true; try { await api(`/turno/${encodeURIComponent(token)}/confirmar`, { method: 'POST' }); aviso('¡Gracias! Confirmaste tu asistencia.'); verTurno(token); } catch (e) { aviso(e.message); conf.disabled = false; } });
    if (canc) canc.addEventListener('click', async () => {
      if (canc.dataset.seguro !== '1') { canc.dataset.seguro = '1'; canc.textContent = 'Tocá de nuevo para cancelar'; return; }
      canc.disabled = true;
      try { await api(`/turno/${encodeURIComponent(token)}/cancelar`, { method: 'POST' }); aviso('Cancelaste el turno. El horario quedó libre para otra persona.'); verTurno(token); } catch (e) { aviso(e.message); canc.disabled = false; }
    });
    if (cop) cop.addEventListener('click', async () => { const i = $('[data-enlace]', v); try { await navigator.clipboard.writeText(i.value); aviso('Enlace copiado'); } catch (_e) { i.select(); aviso('Seleccioná el enlace y copialo'); } });
  }

  function verMisTurnos() {
    const l = misTurnos();
    const v = $('[data-vista-turno]');
    v.innerHTML = `<div class="tarjeta-turno"><h2>Mis turnos</h2>
      ${l.length ? `<p class="ayuda" style="margin-top:6px">Los que reservaste desde este celular o computadora.</p><div class="lista-turnos">${l.map((t) => `<a href="#t=${esc(t.token)}"><strong>${esc(mayus(fechaLarga(t.fecha)))} a las ${esc(t.hora)}</strong><br><span class="ayuda">${esc(t.motivo || 'Consulta')}</span></a>`).join('')}</div>`
        : '<p style="margin-top:8px">No hay turnos reservados desde este dispositivo. Si reservaste desde otro, usá el enlace que te quedó guardado.</p>'}
      <p style="margin-top:24px"><a class="boton" href="reservar.html">Reservar un turno</a></p></div>`;
  }

  // =================================================================== ficha (primera visita)
  const SALUD = [['alergias', '¿Tenés alguna alergia? (medicamentos, anestesia, látex…)'], ['medicacion', '¿Tomás algún medicamento?'], ['anticoagulantes', '¿Tomás anticoagulantes o aspirina?'],
    ['corazon', '¿Tenés problemas del corazón o presión alta?'], ['diabetes', '¿Tenés diabetes?'], ['enfermedades', '¿Tenés alguna otra enfermedad o tratamiento médico?'], ['embarazo', '¿Estás embarazada o puede que lo estés?']];
  function formFicha() {
    const f = $('[data-form-ficha]');
    f.innerHTML = `<fieldset class="formulario"><legend>Tus datos</legend>${camposPersona('f')}
        <div class="campo-fila"><div class="campo"><label for="f-dir">Dirección <span class="opcional">(opcional)</span></label><input id="f-dir" name="direccion" autocomplete="street-address" maxlength="300" /></div>
        <div class="campo"><label for="f-ciu">Ciudad <span class="opcional">(opcional)</span></label><input id="f-ciu" name="ciudad" autocomplete="address-level2" maxlength="100" /></div></div>
        <div class="campo-fila"><div class="campo"><label for="f-emer">Contacto de emergencia <span class="opcional">(opcional)</span></label><input id="f-emer" name="contactoEmergencia" maxlength="200" placeholder="Nombre y teléfono" /></div>
        <div class="campo"><label for="f-como">¿Cómo nos conociste? <span class="opcional">(opcional)</span></label><select id="f-como" name="comoNosConocio"><option value="">Elegí una opción</option>
          ${['Me recomendó un conocido', 'Instagram', 'Facebook', 'Google', 'Pasé por la clínica', 'Otro'].map((x) => `<option>${x}</option>`).join('')}</select></div></div></fieldset>
      <fieldset class="salud"><legend>Tu salud</legend><p class="ayuda">Nos ayuda a atenderte de forma segura. Si no sabés, dejalo en blanco y lo vemos en la consulta.</p>
        ${SALUD.map(([k, t]) => `<div class="pregunta"><span id="q-${k}">${t}</span><div class="sino" role="radiogroup" aria-labelledby="q-${k}">
          <label><input type="radio" name="s_${k}" value="si" /><span>Sí</span></label><label><input type="radio" name="s_${k}" value="no" /><span>No</span></label></div>
          <input class="detalle" name="d_${k}" maxlength="300" placeholder="¿Cuál? (opcional)" aria-label="Detalle" hidden /></div>`).join('')}</fieldset>
      <div class="campo"><label for="f-com">¿Algo más? <span class="opcional">(opcional)</span></label><textarea id="f-com" name="comentario" rows="2" maxlength="1000"></textarea></div>
      <label class="check"><input type="checkbox" name="acepta" /> Acepto que ${esc(info.nombre)} guarde estos datos en mi ficha de paciente.</label>
      <div class="trampa" aria-hidden="true"><label>Sitio <input name="sitio" tabindex="-1" autocomplete="off" /></label></div>
      <p class="error" data-error role="alert" hidden></p>
      <div><button class="boton" type="submit">Enviar mi ficha</button></div>`;
    $$('.pregunta', f).forEach((p) => $$('input[type=radio]', p).forEach((r) => r.addEventListener('change', () => { $('.detalle', p).hidden = r.value !== 'si'; })));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', f); err.hidden = true;
      const d = leer(f); const salud = {};
      for (const [k] of SALUD) { const r = d[`s_${k}`]; if (r) salud[k] = { r, d: d[`d_${k}`] || null }; delete d[`s_${k}`]; delete d[`d_${k}`]; }
      if (!f.acepta.checked) { err.textContent = 'Marcá la casilla para aceptar que guardemos tus datos'; err.hidden = false; return; }
      const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await api('/registro', { method: 'POST', body: { ...d, acepta: true, salud } });
        f.innerHTML = `<div><h3 style="font-size:26px">¡Gracias, ${esc(d.nombre)}!</h3><p style="margin-top:8px">Recibimos tu ficha. ${info.reservasActivas ? 'Si todavía no tenés turno, podés reservarlo ahora.' : ''}</p>
          ${info.reservasActivas ? '<p style="margin-top:20px"><a class="boton" href="reservar.html">Reservar turno</a></p>' : ''}</div>`;
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Enviar mi ficha'; }
    });
  }

  // =================================================================== consultas
  function formConsulta() {
    const f = $('[data-form-consulta]');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', f); err.hidden = true;
      const d = leer(f);
      const falta = !d.nombre.trim() ? 'Escribí tu nombre' : (!d.telefono.trim() && !d.email.trim()) ? 'Dejanos un teléfono o un email para responderte' : d.mensaje.trim().length < 5 ? 'Escribí tu consulta' : null;
      if (falta) { err.textContent = falta; err.hidden = false; return; }
      const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await api('/consulta', { method: 'POST', body: d });
        f.innerHTML = `<p><strong>Recibimos tu consulta.</strong> Te vamos a responder lo antes posible.</p>`;
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Enviar consulta'; }
    });
  }

  iniciar();
})();
