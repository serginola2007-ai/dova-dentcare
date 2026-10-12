/* Diseño MECÁNICO (solo administradores): estilo de sistema de escritorio
   clásico. Este archivo arma lo que es propio de este diseño:
   - la tira de íconos de la izquierda (accesos rápidos a las secciones que el usuario puede ver);
   - el recuadro "Parámetros activos" (usuario, clínica, caja, fecha y reloj);
   - la lista "Ventanas abiertas recientemente";
   - la barra de estado de abajo.
   El contenido de cada pantalla es el mismo de siempre (shared/). */
(function () {
  'use strict';
  const ACCESOS = [
    ['dashboard', 'Inicio', 'grafico'], ['agenda', 'Agenda', 'calendario'], ['pacientes', 'Pacientes', 'pacientes'],
    ['caja', 'Caja', 'efectivo'], ['facturacion', 'Facturación', 'comprobante'], ['seguimiento', 'Seguimiento', 'telefono'],
    ['inventario', 'Inventario', 'caja'], ['finanzas', 'Finanzas', 'tarjeta'], ['reportes', 'Reportes generales', 'documento'],
    ['usuarios', 'Usuarios', 'persona'], ['auditoria', 'Historial de cambios', 'historial'], ['configuracion', 'Configuración', 'herramienta'],
  ];
  const NOMBRES = { paciente: 'Ficha del paciente', consulta: 'Consulta' };
  const CLAVE = 'dova-mec-recientes';
  const MAX = 8;
  let navegar = null;
  let reloj = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leer = () => { try { const v = JSON.parse(sessionStorage.getItem(CLAVE) || '[]'); return Array.isArray(v) ? v : []; } catch (_e) { return []; } };
  const guardar = (l) => { try { sessionStorage.setItem(CLAVE, JSON.stringify(l)); } catch (_e) { /* sin almacenamiento */ } };
  const ahoraPy = () => new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
  const etiquetaMenu = (ruta) => {
    const b = document.querySelector(`#menu-root [data-ruta="${ruta}"]:not([data-sub])`);
    return b ? b.textContent.replace(/[^\p{L}\p{N} .,()/-]+/gu, '').trim() : (NOMBRES[ruta] || null);
  };

  function dibujarIconos() {
    const cont = document.getElementById('mec-iconos');
    if (!cont) return;
    const visibles = ACCESOS.filter(([r]) => r === 'dashboard' || r === 'configuracion' || document.querySelector(`#menu-root [data-ruta="${r}"]`));
    cont.innerHTML = visibles.map(([r, t, i]) => `<button type="button" class="mec-icono" data-mec-ir="${r}" title="${esc(t)}" aria-label="${esc(t)}">${window.DovaIcono ? DovaIcono(i, 20) : ''}</button>`).join('');
    cont.querySelectorAll('[data-mec-ir]').forEach((b) => b.addEventListener('click', () => navegar && navegar(b.dataset.mecIr)));
  }

  function marcarIcono(ruta) {
    document.querySelectorAll('#mec-iconos [data-mec-ir]').forEach((b) => b.classList.toggle('activo', b.dataset.mecIr === ruta));
  }

  async function dibujarParametros() {
    const dl = document.querySelector('#mec-parametros .mec-param');
    if (!dl) return;
    const u = DOVA.usuarioActual() || {}; const c = DOVA.clinicaActual() || {};
    let caja = '—';
    if (DOVA.tienePermiso && DOVA.tienePermiso('caja.view')) {
      try {
        const e = await DOVA.get('/caja/estado');
        caja = e.abierta ? `Abierta (N.º ${esc(e.caja && e.caja.id)}) · efectivo ${fmtGs(e.efectivoEsperado)}` : 'Cerrada';
      } catch (_e) { caja = 'Sin datos'; }
    }
    dl.innerHTML = `<dt>Usuario</dt><dd>${esc(u.nombre || u.username || '')}</dd>
      <dt>Perfil</dt><dd>${esc(u.rolNombre || u.rol || '')}</dd>
      <dt>Clínica</dt><dd>${esc(c.nombre || '')}</dd>
      <dt>Caja</dt><dd data-mec-caja>${caja}</dd>
      <dt>Fecha y hora</dt><dd data-mec-reloj>${esc(ahoraPy())}</dd>`;
  }

  function dibujarEstado() {
    const f = document.getElementById('mec-estado');
    if (!f) return;
    const u = DOVA.usuarioActual() || {}; const c = DOVA.clinicaActual() || {};
    f.innerHTML = `<span>DOVA</span><span>${esc(c.nombre || '')}</span><span>${esc((u.username || '').toUpperCase())}</span><span data-mec-reloj>${esc(ahoraPy())}</span>`;
  }

  function dibujarRecientes() {
    const ol = document.querySelector('#mec-recientes .mec-recientes-lista');
    if (!ol) return;
    const l = leer();
    ol.innerHTML = l.length ? l.map((v, i) => `<li><button type="button" class="mec-reciente" data-mec-rec="${i}">${esc(v.titulo)}</button><span class="mec-hora">${esc(v.hora)}</span></li>`).join('')
      : '<li class="mec-vacio">Todavía no abriste ninguna ventana.</li>';
    ol.querySelectorAll('[data-mec-rec]').forEach((b) => b.addEventListener('click', () => {
      const v = leer()[Number(b.dataset.mecRec)];
      if (v && navegar) navegar(v.ruta, v.params || undefined);
    }));
  }

  function anotar(ruta, params) {
    const base = etiquetaMenu(ruta);
    if (!base) return;
    const hora = new Date().toLocaleTimeString('es-PY', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit' });
    const clave = `${ruta}/${params || ''}`;
    const poner = (titulo) => {
      const l = leer().filter((v) => `${v.ruta}/${v.params || ''}` !== clave);
      l.unshift({ ruta, params: params || null, titulo: String(titulo).slice(0, 80), hora });
      guardar(l.slice(0, MAX));
      dibujarRecientes();
    };
    poner(base);
    // La ficha de un paciente: cuando carga, se usa su nombre como título.
    if (params) {
      setTimeout(() => {
        if (location.hash.replace('#', '') !== `${ruta}/${params}`) return;
        const h = document.querySelector('#main-root h2, #main-root h1');
        if (h && h.textContent.trim()) poner(`${base}: ${h.textContent.trim()}`);
      }, 1500);
    }
  }

  document.addEventListener('dova:entrar', (e) => {
    navegar = e.detail && e.detail.navegar;
    dibujarIconos();
    dibujarParametros();
    dibujarEstado();
    dibujarRecientes();
    const actual = (location.hash.replace('#', '').split('/')[0]) || 'dashboard';
    marcarIcono(actual);
    clearInterval(reloj);
    reloj = setInterval(() => {
      const t = ahoraPy();
      document.querySelectorAll('[data-mec-reloj]').forEach((x) => { x.textContent = t; });
    }, 1000);
  });
  document.addEventListener('dova:navegar', (e) => {
    const { ruta, params } = e.detail || {};
    marcarIcono(ruta);
    anotar(ruta, params);
    // Título de la "ventana" para las pantallas que no traen uno propio (ej. la ficha).
    const m = document.getElementById('main-root');
    if (m) m.dataset.ventana = etiquetaMenu(ruta) || '';
    // La caja puede haber cambiado (apertura, cobro, cierre).
    if (ruta === 'caja' || ruta === 'dashboard') dibujarParametros();
  });
}());
