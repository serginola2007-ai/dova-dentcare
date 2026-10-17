/* Diseño MECÁNICO (para todos, con los colores de la clínica): estilo de sistema de escritorio
   clásico. Este archivo arma lo que es propio de este diseño:
   - la tira de íconos de la izquierda: Nuevo turno, Pacientes (ficha o alta), Nueva factura y
     Nuevo presupuesto directos, más Informes, Usuarios, Historial y Configuración (según permisos);
   - el recuadro "Parámetros activos" (usuario, clínica, caja, fecha y reloj);
   - la lista "Ventanas abiertas recientemente";
   - la barra de estado de abajo.
   El contenido de cada pantalla es el mismo de siempre (app/pages). */
(function () {
  'use strict';
  // Accesos directos: [id, título, ícono, permiso, acción]. Los de acción abren directo
  // el formulario (sin pasar por la sección); el resto abre la sección.
  const ACCESOS = [
    ['nuevo-turno', 'Nuevo turno', 'calendario', 'agenda.create', () => DovaRapido.turno()],
    ['pacientes', 'Pacientes: ver ficha o dar de alta', 'pacientes', 'pacientes.view', () => DovaRapido.paciente(navegar)],
    ['nueva-factura', 'Nueva factura', 'efectivo', 'facturacion.crear', () => navegar('facturacion', 'nueva')],
    ['nuevo-presupuesto', 'Nuevo presupuesto', 'tarjeta', 'presupuestos.manage', () => navegar('presupuestos', 'nuevo')],
    ['informes', 'Informes', 'documento'], ['usuarios', 'Usuarios', 'persona'],
    ['auditoria', 'Historial de cambios', 'historial'], ['configuracion', 'Configuración', 'herramienta'],
  ];
  // Ventana abierta → ícono que queda marcado.
  const ICONO_DE_RUTA = { facturacion: 'nueva-factura', presupuestos: 'nuevo-presupuesto', paciente: 'pacientes' };
  const NOMBRES = { paciente: 'Ficha del paciente', consulta: 'Consulta' };
  const CLAVE = 'dova-mec-recientes';
  const MAX = 8;
  let navegar = null;
  let reloj = null;
  // Adentro de una ventana no va nada de esto (la ventana ya tiene su barra de título).
  const enVentana = () => document.documentElement.classList.contains('dova-modo-ventana') || new URLSearchParams(location.search).get('ventana') === '1';
  const escritorio = () => !enVentana() && !!window.DovaVentanas;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leer = () => { try { const v = JSON.parse(sessionStorage.getItem(CLAVE) || '[]'); return Array.isArray(v) ? v : []; } catch (_e) { return []; } };
  const guardar = (l) => { try { sessionStorage.setItem(CLAVE, JSON.stringify(l)); } catch (_e) { /* sin almacenamiento */ } };
  const ahoraPy = () => new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtGs = (n) => `Gs.\u00a0${Math.round(Number(n) || 0).toLocaleString('es-PY')}`;
  const etiquetaMenu = (ruta) => {
    const b = document.querySelector(`#menu-root [data-ruta="${ruta}"]:not([data-sub])`);
    return b ? b.textContent.replace(/[^\p{L}\p{N} .,()/-]+/gu, '').trim() : (NOMBRES[ruta] || null);
  };

  function dibujarIconos() {
    const cont = document.getElementById('mec-iconos');
    if (!cont) return;
    const puede = (p) => DOVA.tienePermiso && DOVA.tienePermiso(p);
    const visibles = ACCESOS.filter(([r, , , permiso, accion]) => (accion ? puede(permiso) && (r !== 'pacientes' || document.querySelector('#menu-root [data-ruta="pacientes"]'))
      : (r === 'configuracion' || document.querySelector(`#menu-root [data-ruta="${r}"]`))));
    cont.innerHTML = visibles.map(([r, t, i]) => `<button type="button" class="mec-icono" data-mec-ir="${r}" title="${esc(t)}" aria-label="${esc(t)}">${window.DovaIcono ? DovaIcono(i, 20) : ''}</button>`).join('');
    cont.querySelectorAll('[data-mec-ir]').forEach((b) => b.addEventListener('click', () => {
      const a = ACCESOS.find(([r]) => r === b.dataset.mecIr);
      if (!a || !navegar) return;
      if (a[4]) { Promise.resolve(a[4]()).catch((e) => { if (window.DovaExt) DovaExt.toast(e.message || 'No se pudo abrir', 'error'); }); return; }
      navegar(a[0]);
    }));
  }

  function marcarIcono(ruta) {
    const id = ICONO_DE_RUTA[ruta] || ruta;
    document.querySelectorAll('#mec-iconos [data-mec-ir]').forEach((b) => b.classList.toggle('activo', b.dataset.mecIr === id));
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

  // Barra de estado: lo que sirve tener a la vista (caja y próximo turno) y el reloj.
  async function dibujarEstado() {
    const f = document.getElementById('mec-estado');
    if (!f) return;
    const puede = (p) => DOVA.tienePermiso && DOVA.tienePermiso(p);
    let caja = ''; let proximo = '';
    if (puede('caja.view')) {
      try { const e = await DOVA.get('/caja/estado'); caja = e.abierta ? `Caja abierta · efectivo ${fmtGs(e.efectivoEsperado)}` : 'Caja cerrada'; } catch (_e) { /* sin dato */ }
    }
    if (puede('agenda.view')) {
      try {
        const ahora = new Date();
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
        const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora);
        const l = await DOVA.get(`/agenda?desde=${hoy}&hasta=${hoy}`);
        const t = (Array.isArray(l) ? l : (l.items || [])).find((x) => String(x.hora_inicio).slice(0, 5) >= hhmm && !['cancelado', 'reprogramado', 'atendido', 'finalizado', 'no_asistio'].includes(x.estado));
        proximo = t ? `Próximo turno ${String(t.hora_inicio).slice(0, 5)} · ${t.paciente_nombre} ${t.paciente_apellido}` : 'Sin más turnos hoy';
      } catch (_e) { /* sin dato */ }
    }
    f.innerHTML = `${caja ? `<span data-mec-est-caja>${esc(caja)}</span>` : ''}${proximo ? `<span data-mec-est-turno>${esc(proximo)}</span>` : ''}<span data-mec-reloj>${esc(ahoraPy())}</span>`;
  }

  // Celular: barra fija abajo con los accesos de todos los días (según permisos) y el menú.
  function dibujarBarraMovil() {
    const shell = document.getElementById('shell-root');
    if (!shell || document.getElementById('mec-movil')) return;
    const enMenu = (r) => !!document.querySelector(`#menu-root [data-ruta="${r}"]`);
    const items = [['dashboard', 'Inicio', 'inicio'], ['agenda', 'Agenda', 'calendario'], ['pacientes', 'Pacientes', 'pacientes'], ['caja', 'Caja', 'efectivo']]
      .filter(([r]) => r === 'dashboard' || enMenu(r));
    const nav = document.createElement('nav');
    nav.id = 'mec-movil'; nav.className = 'mec-movil'; nav.setAttribute('aria-label', 'Accesos rápidos');
    nav.innerHTML = items.map(([r, t, i]) => `<button type="button" data-mov-ir="${r}">${window.DovaIcono ? DovaIcono(i, 20) : ''}<span>${esc(t)}</span></button>`).join('')
      + `<button type="button" data-mov-menu>${window.DovaIcono ? DovaIcono('menu', 20) : ''}<span>Menú</span></button>`;
    shell.appendChild(nav);
    nav.querySelectorAll('[data-mov-ir]').forEach((b) => b.addEventListener('click', () => {
      document.body.classList.remove('dova-menu-abierto');
      if (navegar) navegar(b.dataset.movIr);
    }));
    nav.querySelector('[data-mov-menu]').addEventListener('click', () => { const t = document.getElementById('dova-menu-toggle'); if (t) t.click(); });
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
    const hora = new Date().toLocaleTimeString('es-PY', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hour12: false });
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
    if (enVentana()) return;
    navegar = e.detail && e.detail.navegar;
    dibujarIconos();
    dibujarParametros();
    dibujarEstado();
    dibujarBarraMovil();
    dibujarRecientes();
    const actual = escritorio() ? 'dashboard' : ((location.hash.replace('#', '').split('/')[0]) || 'dashboard');
    marcarIcono(actual);
    if (escritorio()) { const m = document.getElementById('main-root'); if (m) m.dataset.ventana = 'Inicio'; }
    clearInterval(reloj);
    let vueltas = 0;
    reloj = setInterval(() => {
      vueltas += 1;
      if (vueltas % 120 === 0) dibujarEstado(); // caja y próximo turno al día (cada 2 minutos)
      const t = ahoraPy();
      document.querySelectorAll('[data-mec-reloj]').forEach((x) => { x.textContent = t; });
    }, 1000);
  });
  // Con ventanas: queda marcado el ícono de la ventana que está adelante.
  document.addEventListener('dova:ventana', (e) => { if (!enVentana()) marcarIcono((e.detail || {}).ruta); });
  document.addEventListener('dova:navegar', (e) => {
    if (enVentana()) return;
    const { ruta, params } = e.detail || {};
    if (escritorio()) {
      // Con ventanas: Inicio queda de fondo; solo se anota la ventana abierta.
      anotar(ruta, params);
      if (ruta === 'caja') dibujarParametros();
      return;
    }
    marcarIcono(ruta);
    anotar(ruta, params);
    // Título de la "ventana" para las pantallas que no traen uno propio (ej. la ficha).
    const m = document.getElementById('main-root');
    if (m) m.dataset.ventana = etiquetaMenu(ruta) || '';
    // La caja puede haber cambiado (apertura, cobro, cierre).
    if (ruta === 'caja' || ruta === 'dashboard') dibujarParametros();
  });
}());
