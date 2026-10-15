/* DOVA — motor de la SPA, compartido por los 3 diseños.
   El único diseño (mecánico) trae su index.html en frontend/mecanico y comparte todo este código (shared/).
   la estructura del layout (sidebar, topbar, etc.) y llama a DovaApp.iniciar()
   pasándole los IDs de sus contenedores. El contenido de cada vista es
   idéntico entre skins; solo cambia el CSS alrededor. */

const DovaApp = (() => {
  let elMain, elMenu, elMarca;
  /* Escritorio con ventanas (ver ventanas.js):
     - ESCRITORIO: la página principal. Inicio queda siempre de fondo y cada
       función del menú se abre en una ventana.
     - MODO_VENTANA: lo que corre ADENTRO de una ventana (?ventana=1): solo la
       pantalla de la sección, sin barra de menú. */
  const MODO_VENTANA = new URLSearchParams(location.search).get('ventana') === '1';
  const EN_IFRAME = (() => { try { return window.parent !== window; } catch (_e) { return true; } })();
  const ESCRITORIO = !MODO_VENTANA && !!window.DovaVentanas;
  const padreVentanas = () => { try { return EN_IFRAME ? window.parent.DovaVentanas : null; } catch (_e) { return null; } };

  /* Menú agrupado: arriba solo se ven Movimientos, Reportes y Administración;
     cada uno despliega sus opciones (solo las que el usuario tiene permitidas).
     "permiso" puede ser una lista: alcanza con tener cualquiera.
     "subs": las pestañas de esa herramienta [id, texto, permiso]. Al pasar el
     cursor por la herramienta se abre un segundo panel con ellas y se entra
     directo a la elegida. Los id y permisos son los mismos que usa cada
     sección en X.subPestanas (lo verifica la prueba ui-submenu). */
  const GRUPOS = [['movimientos', 'Movimientos'], ['reportes', 'Reportes'], ['administracion', 'Administración']];
  const MENU = [
    // Movimientos: el trabajo del día. (Inicio no va en el menú: queda siempre de fondo.)
    { grupo: 'movimientos', ruta: 'agenda', label: 'Agenda', permiso: 'agenda.view', subs: [['dia', 'Turnos'], ['espera', 'Lista de espera', 'lista_espera.manage']] },
    { grupo: 'movimientos', ruta: 'presupuestos', label: 'Presupuestos', permiso: 'presupuestos.view' },
    { grupo: 'movimientos', ruta: 'caja', label: 'Caja', permiso: ['caja.view', 'caja.manage'], subs: [['hoy', 'Caja del día'], ['hist', 'Cierres anteriores']] },
    { grupo: 'movimientos', ruta: 'facturacion', label: 'Facturación', permiso: ['facturacion.ver', 'facturacion.ver_propias', 'facturacion.crear', 'facturacion.configurar', 'facturacion.ver_reportes'],
      subs: [['tablero', 'Resumen', ['facturacion.ver', 'facturacion.ver_propias']], ['facturas', 'Facturas', ['facturacion.ver', 'facturacion.ver_propias']], ['nueva', 'Nueva factura', 'facturacion.crear'], ['reportes', 'Reportes', 'facturacion.ver_reportes'], ['config', 'Configuración', 'facturacion.configurar']] },
    { grupo: 'movimientos', ruta: 'seguimiento', label: 'Seguimiento', permiso: ['seguimiento.view', 'recalls.view', 'seguimiento.manage'],
      subs: [['bandeja', 'Para contactar'], ['recalls', 'Controles periódicos', ['recalls.view', 'recalls.manage']], ['controles', 'Controles después de un tratamiento'], ['observacion', 'Piezas en observación'],
        ['sinturno', 'Tratamientos sin turno', ['planes_tratamiento.view', 'seguimiento.view']], ['presupuestos', 'Presupuestos sin respuesta', 'presupuestos.view'], ['recordatorios', 'Recordatorios de turnos', ['agenda.view', 'recordatorios.propios']],
        ['reactivacion', 'Pacientes que no volvieron'], ['cumpleanos', 'Cumpleaños'], ['tareas', 'Tareas', 'tareas.manage'], ['biopsias', 'Biopsias', ['especialidades.edit', 'pacientes.clinical.view']], ['comunicaciones', 'Llamadas y mensajes']] },
    { grupo: 'movimientos', ruta: 'ortodoncia', label: 'Ortodoncia', permiso: ['ortodoncia.view', 'ortodoncia.manage'] },
    { grupo: 'movimientos', ruta: 'web', label: 'Página web', permiso: ['web.ver', 'web.configurar'],
      subs: [['solicitudes', 'Lo que llegó', ['web.ver', 'web.configurar']], ['pagos', 'Pagos para revisar', 'web.ver'], ['accesos', 'Cuentas de pacientes', 'web.ver'], ['config', 'Configurar la página', 'web.configurar']] },
    { grupo: 'movimientos', ruta: 'operaciones', label: 'Clínica', permiso: ['agenda.config', 'equipos.manage', 'esterilizacion.manage', 'laboratorio.manage', 'fichaje.use', 'fichaje.view_all'],
      subs: [['sala', 'Sala de espera', 'agenda.view'], ['fichaje', 'Asistencia del personal', ['fichaje.use', 'fichaje.view_all']], ['lab', 'Laboratorio', 'laboratorio.manage'], ['ester', 'Esterilización', 'esterilizacion.manage'],
        ['equipos', 'Equipos', 'equipos.manage'], ['agendacfg', 'Sillones y días bloqueados', 'agenda.config'], ['alertas', 'Alertas', ['equipos.manage', 'esterilizacion.manage', 'inventario.view', 'laboratorio.manage']]] },
    // Reportes: consultar y analizar
    { grupo: 'reportes', ruta: 'pacientes', label: 'Pacientes', permiso: 'pacientes.view' },
    { grupo: 'reportes', ruta: 'inventario', label: 'Inventario', permiso: 'inventario.view', subs: [['insumos', 'Insumos'], ['vencen', 'Por vencer'], ['compras', 'Registrar compra', 'proveedores.manage'], ['prov', 'Proveedores'], ['kits', 'Kits por tratamiento']] },
    { grupo: 'reportes', ruta: 'catalogo', label: 'Tratamientos', permiso: ['tratamientos.manage', 'usuarios.manage'], subs: [['trat', 'Tratamientos y precios', 'tratamientos.manage'], ['odo', 'Odontólogos', 'usuarios.manage']] },
    { grupo: 'reportes', ruta: 'indicadores', label: 'Estadísticas', permiso: ['kpis.view'] },
    { grupo: 'reportes', ruta: 'finanzas', label: 'Finanzas', permiso: ['cuenta_corriente.view', 'comisiones.view', 'comisiones.manage', 'rentabilidad.view', 'aseguradoras.manage', 'listas_precios.manage', 'metas.manage', 'cobranza.manage', 'cobro_online.manage'],
      subs: [['deuda', 'Quién debe y desde cuándo', ['cuenta_corriente.view', 'reportes.view']], ['cobro', 'Avisos de cobro', 'cobranza.manage'], ['online', 'Cobro online', 'cobro_online.manage'], ['comisiones', 'Comisiones', ['comisiones.view', 'comisiones.manage']], ['rentabilidad', 'Rentabilidad', 'rentabilidad.view'], ['metas', 'Metas', ['metas.manage', 'kpis.view', 'comisiones.view']],
        ['seguros', 'Seguros y convenios', 'aseguradoras.manage'], ['listas', 'Listas de precios', 'listas_precios.manage'], ['cierre', 'Cerrar meses', 'clinica.config.manage']] },
    { grupo: 'reportes', ruta: 'informes', label: 'Informes', permiso: 'reportes.view',
      subs: [['dia', 'Del día'], ['semana', 'De la semana'], ['mes', 'Del mes'], ['anio', 'Del año'], ['detalle', 'Reportes detallados']] },
    // Administración. "Configuración" no pide permiso: cada uno cambia su propio diseño.
    { grupo: 'administracion', ruta: 'configuracion', label: 'Configuración', permiso: null },
    { grupo: 'administracion', ruta: 'usuarios', label: 'Usuarios', permiso: 'usuarios.manage' },
    { grupo: 'administracion', ruta: 'auditoria', label: 'Historial de cambios', permiso: 'auditoria.view' },
    { grupo: 'administracion', ruta: 'helpdesk', label: 'Ayuda técnica', permiso: 'helpdesk.view' },
    { grupo: 'administracion', ruta: 'plataforma', label: 'Plataforma', permiso: 'plataforma.manage' },
  ];

  // ---- Modo claro / oscuro ----
  // DOVA tiene un único diseño. El modo claro u oscuro es una preferencia de cada usuario que
  // solo se cambia en Configuración > Apariencia: se guarda en el servidor (lo sigue a donde entre)
  // y en este navegador (para pintar bien la pantalla de ingreso y evitar parpadeos).
  // Tamaño de letra (normal / grande): agranda el contenido de las pantallas, no las barras.
  function aplicarLetra(letra) {
    if (MODO_VENTANA && EN_IFRAME) { try { window.top.DovaApp.aplicarLetra(letra); return; } catch (_e) { /* sigue acá */ } }
    const v = letra === 'grande' ? 'grande' : 'normal';
    document.documentElement.setAttribute('data-letra', v);
    try { localStorage.setItem('dova-letra', v); } catch (_e) { /* sin almacenamiento */ }
    document.querySelectorAll('.dova-ventana iframe').forEach((f) => { try { f.contentDocument.documentElement.setAttribute('data-letra', v); } catch (_e) { /* */ } });
  }

  function aplicarModo(tema) {
    if (MODO_VENTANA && EN_IFRAME) { try { window.top.DovaApp.aplicarModo(tema); return; } catch (_e) { /* sigue acá */ } }
    const modo = tema === 'oscuro' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', modo);
    try { localStorage.setItem('dova-tema', modo); } catch (_e) { /* sin almacenamiento */ }
    if (window.DovaVentanas) { try { window.DovaVentanas.aplicarTema(modo); } catch (_e) { /* */ } }
  }

  function cerrarGrupos(excepto) {
    if (!elMenu) return;
    elMenu.querySelectorAll('.dova-submenu-fila.abierta').forEach((f) => { f.classList.remove('abierta'); f.querySelector('.dova-submenu-padre').setAttribute('aria-expanded', 'false'); });
    elMenu.querySelectorAll('.dova-menu-grupo.abierto').forEach((g) => {
      if (g === excepto) return;
      g.classList.remove('abierto');
      g.querySelector('.dova-menu-grupo-btn').setAttribute('aria-expanded', 'false');
    });
  }
  // Pestañas visibles de una herramienta para el usuario actual.
  const subsVisibles = (m) => (m.subs || []).filter(([, , permiso]) => tieneAcceso(permiso || null));
  function itemMenu(m) {
    const subs = subsVisibles(m);
    const boton = (extra = '') => `<button type="button" class="dova-menu-item dova-submenu-item${extra}" role="menuitem" data-ruta="${m.ruta}"`;
    if (subs.length < 2) return `${boton()}>${m.label}</button>`;
    return `<div class="dova-submenu-fila" data-fila="${m.ruta}">
      ${boton(' dova-submenu-padre')} aria-haspopup="true" aria-expanded="false">${m.label}<span class="dova-submenu-flecha" aria-hidden="true">›</span></button>
      <div class="dova-submenu2" role="menu" aria-label="${m.label}">${subs.map(([id, texto]) => `<button type="button" class="dova-menu-item dova-submenu-item" role="menuitem" data-ruta="${m.ruta}" data-sub="${id}">${texto}</button>`).join('')}</div>
    </div>`;
  }
  // Sin mouse (celular/tablet) o con el menú en acordeón, la herramienta se
  // toca para desplegar sus pestañas en lugar de entrar directo.
  const sinHover = () => window.matchMedia('(hover: none), (max-width: 768px)').matches;
  function cerrarFilas(excepto) {
    elMenu.querySelectorAll('.dova-submenu-fila.abierta').forEach((f) => {
      if (f === excepto) return;
      f.classList.remove('abierta'); f.querySelector('.dova-submenu-padre').setAttribute('aria-expanded', 'false');
    });
  }
  function abrirFila(f) {
    cerrarFilas(f);
    f.classList.add('abierta'); f.querySelector('.dova-submenu-padre').setAttribute('aria-expanded', 'true');
    // Si el panel no entra a la derecha, se abre hacia la izquierda.
    const panel = f.querySelector('.dova-submenu2');
    f.classList.remove('a-la-izquierda');
    if (!sinHover() && panel.getBoundingClientRect().right > window.innerWidth - 8) f.classList.add('a-la-izquierda');
  }
  let cierreGlobalListo = false;
  function renderMenu() {
    if (!elMenu) return;
    const sueltos = MENU.filter((m) => !m.grupo && tieneAcceso(m.permiso))
      .map((m) => `<button type="button" class="dova-menu-item dova-menu-suelto" data-ruta="${m.ruta}">${m.label}</button>`).join('');
    elMenu.innerHTML = sueltos + GRUPOS.map(([id, nombre]) => {
      const items = MENU.filter((m) => m.grupo === id && tieneAcceso(m.permiso));
      if (!items.length) return '';
      return `<div class="dova-menu-grupo" data-grupo="${id}">
        <button type="button" class="dova-menu-item dova-menu-grupo-btn" aria-expanded="false" aria-haspopup="true">${nombre}<span class="dova-menu-flecha" aria-hidden="true">▾</span></button>
        <div class="dova-submenu" role="menu" aria-label="${nombre}">${items.map(itemMenu).join('')}</div>
      </div>`;
    }).join('');
    elMenu.querySelectorAll('.dova-menu-grupo-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = btn.parentElement;
        cerrarGrupos(g);
        const abrir = !g.classList.contains('abierto');
        g.classList.toggle('abierto', abrir);
        btn.setAttribute('aria-expanded', String(abrir));
        if (abrir) { const primero = g.querySelector('.dova-submenu-item'); if (primero && e.detail === 0) primero.focus(); }
      });
    });
    // Un solo temporizador para todas las herramientas: pasar rápido de una a
    // otra no cierra la que se acaba de abrir.
    let timerFila = null;
    elMenu.querySelectorAll('.dova-submenu-fila').forEach((f) => {
      const padre = f.querySelector('.dova-submenu-padre');
      f.addEventListener('mouseenter', () => { if (sinHover()) return; clearTimeout(timerFila); abrirFila(f); });
      // Un margen corto al salir: se puede llegar al panel en diagonal sin que se cierre.
      f.addEventListener('mouseleave', () => { if (sinHover()) return; clearTimeout(timerFila); timerFila = setTimeout(() => cerrarFilas(), 220); });
      padre.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFila(f); f.querySelector('.dova-submenu2 .dova-submenu-item').focus(); }
      });
      f.querySelectorAll('.dova-submenu2 .dova-submenu-item').forEach((b) => b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); cerrarFilas(); padre.focus(); }
      }));
    });
    elMenu.querySelectorAll('[data-ruta]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const fila = btn.classList.contains('dova-submenu-padre') ? btn.parentElement : null;
        if (fila) {
          // La herramienta no navega: despliega sus pestañas para elegir.
          e.stopPropagation();
          if (fila.classList.contains('abierta') && sinHover()) cerrarFilas(); else abrirFila(fila);
          return;
        }
        cerrarGrupos();
        // Pestaña elegida en el segundo panel: la sección abre directo en ella.
        window.DovaSubPendiente = btn.dataset.sub || null;
        Promise.resolve(navegar(btn.dataset.ruta)).finally(() => { window.DovaSubPendiente = null; });
        document.body.classList.remove('dova-menu-abierto');
      });
    });
    // Tocar afuera o apretar Esc cierra el desplegable (se registra una sola vez).
    if (!cierreGlobalListo) {
      cierreGlobalListo = true;
      document.addEventListener('click', (e) => { if (elMenu && !elMenu.contains(e.target)) cerrarGrupos(); });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !elMenu) return;
        const abierto = elMenu.querySelector('.dova-menu-grupo.abierto .dova-menu-grupo-btn');
        cerrarGrupos(); if (abierto) abierto.focus();
      });
    }
  }

  // Fase 6 — Responsive: botón hamburguesa para mobile/tablet, oculto en
  // desktop por CSS. Alterna una clase en <body> que cada skin usa para
  // mostrar/ocultar su navegación (sidebar u topbar) en pantallas chicas.
  function initMenuMovil() {
    const btn = document.getElementById('dova-menu-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dova-menu-abierto');
    });
    // Overlay para cerrar tocando afuera del menú (se crea una sola vez).
    if (!document.getElementById('dova-menu-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'dova-menu-overlay';
      overlay.className = 'dova-menu-overlay';
      overlay.addEventListener('click', () => document.body.classList.remove('dova-menu-abierto'));
      document.body.appendChild(overlay);
    }
  }

  function marcarMenuActivo(ruta) {
    if (!elMenu) return;
    elMenu.querySelectorAll('[data-ruta]:not([data-sub])').forEach((btn) => {
      btn.classList.toggle('activo', btn.dataset.ruta === ruta);
    });
    // El grupo que contiene la sección actual también queda resaltado.
    elMenu.querySelectorAll('.dova-menu-grupo').forEach((g) => {
      g.querySelector('.dova-menu-grupo-btn').classList.toggle('activo', !!g.querySelector(`[data-ruta="${ruta}"]`));
    });
  }

  async function renderMarca() {
    if (!elMarca) return;
    const clinica = DOVA.clinicaActual();
    elMarca.innerHTML = `
      <button id="dova-menu-toggle" class="dova-menu-toggle" aria-label="Abrir menú" type="button">☰</button>
      <div class="dova-marca-producto">DOVA</div>
      <div class="dova-marca-clinica">${Vistas.esc(clinica ? clinica.nombre : '')}</div>
      ${Vistas.vistaBuscadorGlobal()}
    `;
    Vistas.initBuscadorGlobal(navegar);
    initMenuMovil();
    // Tocar "DOVA" lleva al inicio.
    const logo = elMarca.querySelector('.dova-marca-producto');
    logo.setAttribute('role', 'link'); logo.setAttribute('tabindex', '0'); logo.title = 'Ir al inicio';
    const alInicio = () => {
      document.body.classList.remove('dova-menu-abierto');
      if (ESCRITORIO) DovaVentanas.mostrarEscritorio(); else navegar('dashboard');
    };
    logo.addEventListener('click', alInicio);
    logo.addEventListener('keydown', (e) => { if (e.key === 'Enter') alInicio(); });
  }

  // Permiso mínimo para entrar a una ruta que no es un ítem de MENU (se
  // llega por botón, no por click de menú, pero igual hay que evitar que
  // alguien la teclee directo en el hash sin tener el permiso).
  const PERMISO_RUTA_EXTRA = {
    consulta: 'historia_clinica.edit',
    // Los reportes detallados ahora están dentro de Informes; la dirección vieja sigue andando.
    reportes: 'reportes.view',
  };

  // Título de una ventana: el nombre de la sección en el menú.
  const TITULOS_EXTRA = { paciente: 'Ficha del paciente', consulta: 'Consulta', dashboard: 'Inicio', reportes: 'Reportes detallados' };
  function etiquetaRuta(ruta) {
    const m = MENU.find((x) => x.ruta === ruta);
    return m ? m.label : (TITULOS_EXTRA[ruta] || ruta);
  }

  function tieneAcceso(permiso) {
    if (!permiso) return true;
    return Array.isArray(permiso) ? DOVA.tieneAlguno(...permiso) : DOVA.tienePermiso(permiso);
  }

  function permisoRequerido(ruta) {
    const enMenu = MENU.find((m) => m.ruta === ruta);
    if (enMenu) return enMenu.permiso;
    return PERMISO_RUTA_EXTRA[ruta] || null;
  }

  async function dibujarInicio() {
    const html = await Vistas.vistaDashboard();
    elMain.innerHTML = html;
    if (DOVA.usuarioActual() && DOVA.usuarioActual().odontologoId) {
      Vistas.initDashboardOdontologo((pacienteId) => navegar('consulta', pacienteId), (pacienteId) => navegar('paciente', pacienteId));
    } else {
      Vistas.initInicio((rutaDestino, params) => navegar(rutaDestino, params));
    }
    // Cuando la extensión terminó de sumar sus filas, se decide si Inicio está vacío (muestra la marca).
    const atender = elMain.querySelector('[data-para-atender]');
    Promise.resolve().then(() => DovaSecciones.extenderDashboard(elMain, navegar))
      .catch((e) => console.error('[DOVA ext]', e))
      .finally(() => { if (atender) atender.dataset.listo = '1'; Vistas.ordenarAtender(elMain); Vistas.revisarInicioVacio(elMain); });
    aplicarDataThATablas();
  }

  // Inicio de fondo (escritorio), en vivo: turnos del día, cobros y lo que llega de la web.
  async function mostrarInicio() {
    if (window.DovaVivo) DovaVivo.olvidar(elMain);
    try { await dibujarInicio(); } catch (e) { elMain.innerHTML = `<p class="dova-error-text">No se pudo cargar el inicio: ${Vistas.esc(e.message)}</p>`; }
    if (window.DovaVivo) DovaVivo.vivo(elMain, ['turnos', 'pagos', 'caja_movimientos', 'caja_aperturas', 'web_solicitudes', 'web_pagos', 'pacientes', 'cuotas'], () => dibujarInicio());
  }

  async function navegar(ruta, params, opciones = {}) {
    // Escritorio: cada función se abre en su ventana; Inicio queda de fondo.
    if (ESCRITORIO) {
      if (!ruta || ruta === 'dashboard') { await mostrarInicio(); return; }
      const permisoE = permisoRequerido(ruta);
      if (permisoE && !tieneAcceso(permisoE)) { Vistas.toast('No tenés permiso para acceder a esa sección', 'error'); return; }
      document.body.classList.remove('dova-menu-abierto');
      DovaVentanas.abrir(ruta, params, window.DovaSubPendiente || null);
      document.dispatchEvent(new CustomEvent('dova:navegar', { detail: { ruta, params } }));
      return;
    }
    // Dentro de una ventana, "volver al inicio" la cierra.
    if (MODO_VENTANA && (!ruta || ruta === 'dashboard') && padreVentanas()) { padreVentanas().cerrarDesde(window); return; }
    if (window.DovaVivo) DovaVivo.olvidar(elMain);
    const permiso = permisoRequerido(ruta);
    if (permiso && !tieneAcceso(permiso)) {
      if (MODO_VENTANA) { elMain.innerHTML = '<p class="dova-error-text">No tenés permiso para acceder a esta sección.</p>'; return; }
      Vistas.toast('No tenés permiso para acceder a esa sección', 'error');
      ruta = 'dashboard';
      params = undefined;
    }
    marcarMenuActivo(ruta);
    // Un modal abierto no debe quedar flotando sobre la sección nueva.
    document.querySelectorAll('.dova-modal-overlay').forEach((o) => o.remove());
    const hash = params ? `${ruta}/${params}` : ruta;
    // En una ventana la dirección se reemplaza (no se suma al "atrás" del navegador).
    if (MODO_VENTANA) { try { history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`); } catch (_e) { /* */ } } else window.location.hash = hash;
    document.dispatchEvent(new CustomEvent('dova:navegar', { detail: { ruta, params } }));
    elMain.innerHTML = '<div class="dova-cargando">Cargando…</div>';
    try {
      switch (ruta) {
        case 'dashboard':
          await dibujarInicio();
          // Inicio en vivo: turnos del día, cobros y lo que llega de la web.
          if (window.DovaVivo) DovaVivo.vivo(elMain, ['turnos', 'pagos', 'caja_movimientos', 'caja_aperturas', 'web_solicitudes', 'web_pagos', 'pacientes', 'cuotas'], () => (location.hash.replace('#', '').split('/')[0] || 'dashboard') === 'dashboard' && dibujarInicio());
          break;
        case 'pacientes':
          elMain.innerHTML = await Vistas.vistaPacientes();
          Vistas.initPacientes((id) => navegar('paciente', id));
          break;
        case 'paciente':
          elMain.innerHTML = await Vistas.vistaFichaPaciente(params);
          // Las pestañas nuevas se agregan ANTES de iniciar la ficha, así el
          // manejador de pestañas existente también las controla.
          conExtension(() => DovaFicha.extender(params));
          conExtension(() => DovaOperativo.extenderFicha(params, navegar));
          conExtension(() => DovaClinica.extenderFicha(params));
          Vistas.initFichaPaciente(params, () => navegar('pacientes'), (pacienteId) => navegar('consulta', pacienteId));
          break;
        case 'consulta':
          // Modo Consulta (ext-clinica.js): consulta guardada en la base, con
          // el turno (consulta/<paciente>/t<turno>) y accesos rápidos reales.
          elMain.innerHTML = '<div></div>';
          await DovaClinica.consulta(elMain.firstElementChild, params, navegar);
          break;
        // Agenda, caja, inventario y catálogo con todas las operaciones del
        // día (ver shared/ext/ext-operativo.js).
        case 'agenda':
          elMain.innerHTML = '<div></div>';
          await DovaOperativo.agenda(elMain.firstElementChild, navegar);
          break;
        case 'caja':
          elMain.innerHTML = '<div></div>';
          await DovaOperativo.caja(elMain.firstElementChild, navegar);
          break;
        case 'web':
          elMain.innerHTML = '<div></div>';
          await DovaWeb.seccion(elMain.firstElementChild, navegar, params);
          break;
        case 'facturacion':
          elMain.innerHTML = '<div></div>';
          await DovaFacturacion.seccion(elMain.firstElementChild, navegar, params);
          break;
        case 'inventario':
          elMain.innerHTML = '<div></div>';
          await DovaOperativo.inventario(elMain.firstElementChild);
          break;
        case 'catalogo':
          elMain.innerHTML = '<div></div>';
          await DovaOperativo.catalogo(elMain.firstElementChild);
          break;
        case 'ortodoncia':
          elMain.innerHTML = '<div></div>';
          await DovaOrtodoncia.seccion(elMain.firstElementChild, navegar);
          break;
        case 'plataforma':
          elMain.innerHTML = '<div></div>';
          await DovaPlataforma.seccion(elMain.firstElementChild);
          break;
        case 'helpdesk':
          elMain.innerHTML = await Vistas.vistaHelpdesk();
          Vistas.initHelpdesk();
          break;
        case 'usuarios':
          elMain.innerHTML = await Vistas.vistaUsuariosAdmin();
          Vistas.initUsuariosAdmin(() => navegar('usuarios'));
          break;
        case 'informes':
          elMain.innerHTML = '<div></div>';
          await DovaInformes.seccion(elMain.firstElementChild, navegar, params);
          break;
        case 'presupuestos':
          elMain.innerHTML = '<div></div>';
          await DovaPresupuestos.seccion(elMain.firstElementChild, navegar, params);
          break;
        case 'reportes':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.reportes(elMain.firstElementChild, navegar, params);
          break;
        case 'configuracion':
          elMain.innerHTML = await Vistas.vistaConfiguracion();
          Vistas.initConfiguracion();
          conExtension(() => DovaSecciones.extenderConfiguracion(elMain));
          break;
        case 'seguimiento':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.seguimiento(elMain.firstElementChild, navegar, params);
          break;
        case 'operaciones':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.operaciones(elMain.firstElementChild, navegar);
          break;
        case 'finanzas':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.finanzas(elMain.firstElementChild, navegar);
          break;
        case 'indicadores':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.indicadores(elMain.firstElementChild, navegar);
          break;
        case 'auditoria':
          elMain.innerHTML = '<div></div>';
          await DovaSecciones.auditoria(elMain.firstElementChild, navegar);
          break;
        default:
          elMain.innerHTML = await Vistas.vistaDashboard();
      }
      aplicarDataThATablas();
    } catch (e) {
      elMain.innerHTML = `<p class="dova-error-text">No se pudo cargar esta sección: ${Vistas.esc(e.message)}</p>`;
    }
    // Avisa a la ventana qué se abrió (título y botón Volver).
    if (MODO_VENTANA && padreVentanas()) {
      let extra = null;
      if (ruta === 'paciente' || ruta === 'consulta') { const h = elMain.querySelector('h2, h1'); extra = h ? h.textContent.trim().slice(0, 60) : null; }
      try { padreVentanas().alNavegar(window, ruta, params, extra, !!opciones.sinHistorial); } catch (_e) { /* */ }
    }
  }

  // Las extensiones del seguimiento integral nunca deben romper la vista
  // principal: si algo falla, se registra en consola y la vista sigue.
  function conExtension(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch((e) => console.error('[DOVA ext]', e));
    } catch (e) { console.error('[DOVA ext]', e); }
  }

  // Fase 6 — Responsive: en mobile las tablas se muestran como tarjetas
  // apiladas (ver base.css), y cada celda necesita saber a qué columna
  // pertenece para mostrar su etiqueta (content: attr(data-th)). En vez de
  // tocar cada vista para agregar data-th a mano, se completa automáticamente
  // acá a partir del <thead> de cada tabla, cada vez que se renderiza una vista.
  function aplicarDataThATablas() {
    elMain.querySelectorAll('.dova-tabla').forEach((tabla) => {
      // Toda tabla ancha se desplaza dentro de su caja en vez de empujar la
      // pantalla (antes había que acordarse de envolverla a mano en cada vista).
      if (!tabla.closest('.dova-ext-tabla-wrap, .dova-modal-box') && tabla.parentElement) {
        const caja = document.createElement('div');
        caja.className = 'dova-ext-tabla-wrap';
        tabla.parentElement.insertBefore(caja, tabla);
        caja.appendChild(tabla);
      }
      const encabezados = Array.from(tabla.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      if (!encabezados.length) return;
      tabla.querySelectorAll('tbody tr').forEach((fila) => {
        fila.querySelectorAll('td').forEach((celda, i) => {
          if (encabezados[i]) celda.setAttribute('data-th', encabezados[i]);
        });
      });
    });
  }

  async function entrarADova(elLogin, elShell) {
    // Permisos al día (p. ej. un módulo nuevo como Facturación) sin pedir que se vuelva a iniciar sesión.
    if (DOVA.actualizarSesion) await DOVA.actualizarSesion();
    if (!DOVA.estaAutenticado()) { location.reload(); return; }
    elLogin.style.display = 'none';
    elShell.style.display = '';
    if (ESCRITORIO) {
      document.body.classList.add('dova-escritorio');
      // El menú resalta la sección de la ventana que está adelante.
      document.addEventListener('dova:ventana', (e) => marcarMenuActivo((e.detail || {}).ruta || 'dashboard'));
    }
    renderMenu();
    renderMarca();
    // Tiempo real: campanita de avisos y pantallas que se actualizan solas.
    if (window.DovaVivo) {
      DovaVivo.iniciar();
      const ref = document.getElementById('theme-toggle-btn') || document.getElementById('logout-btn');
      if (ref) DovaVivo.montarCampana(ref, navegar);
    }
    // Bloqueo de pantalla por inactividad (minutos según la clínica).
    if (window.DovaBloqueo) DovaBloqueo.iniciar();
    if (window.DovaComandos) DovaComandos.iniciar({ navegar, menu: () => MENU.filter((m) => tieneAcceso(m.permiso)) });
    {
      const hashActual = location.hash.replace('#', '');
      const [rutaInicial, ...restoInicial] = hashActual.split('/');
      if (ESCRITORIO) {
        await mostrarInicio();
        DovaVentanas.iniciar({
          titulo: (r) => etiquetaRuta(r),
          aviso: (m) => Vistas.toast(m, 'error'),
          permitida: (r) => tieneAcceso(permisoRequerido(r)),
        });
        // Un enlace directo (#agenda, #paciente/12…) abre esa ventana.
        if (rutaInicial && rutaInicial !== 'dashboard') navegar(rutaInicial, restoInicial.length ? restoInicial.join('/') : undefined);
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_e) { /* */ }
      } else {
        navegar(rutaInicial || 'dashboard', restoInicial.length ? restoInicial.join('/') : undefined);
      }
    }
    // Mensaje pendiente de una navegación completa de página (si lo hubiera).
    const flash = DOVA.consumeFlash();
    if (flash) Vistas.toast(flash, 'ok');
    document.dispatchEvent(new CustomEvent('dova:entrar', { detail: { navegar } }));
  }

  // Adentro de una ventana: solo la pantalla de la sección (la sesión es la de la página principal).
  async function entrarVentana(elLogin, elShell) {
    document.documentElement.classList.add('dova-modo-ventana');
    elLogin.style.display = 'none';
    elShell.style.display = '';
    if (window.DovaVivo) DovaVivo.iniciar();
    if (window.DovaBloqueo && DovaBloqueo.soloActividad) DovaBloqueo.soloActividad();
    // Ctrl+K (buscar) abre el buscador de la página principal.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && EN_IFRAME) {
        try { const c = window.parent.DovaComandos; if (c) { e.preventDefault(); c.abrir(); } } catch (_e) { /* */ }
      }
    });
    const sub = new URLSearchParams(location.search).get('sub');
    const [r, ...resto] = location.hash.replace('#', '').split('/');
    window.DovaSubPendiente = sub || null;
    try { await navegar(r || 'dashboard', resto.length ? resto.join('/') : undefined); } finally { window.DovaSubPendiente = null; }
  }

  // Después de un login recién hecho: se aplica el modo claro/oscuro que el usuario eligió y se entra.
  function decidirDestinoTrasLogin(elLogin, elShell) {
    const usuario = DOVA.usuarioActual();
    aplicarModo(usuario && usuario.temaPreferido);
    aplicarLetra(usuario && usuario.letraPreferida);
    entrarADova(elLogin, elShell);
  }

  // Al recargar con una sesión ya activa: igual, con el modo guardado del usuario.
  function decidirDestinoTrasSesionExistente(elLogin, elShell) {
    const usuario = DOVA.usuarioActual();
    // Quedó pendiente el cambio obligatorio de contraseña: vuelve al login.
    if (usuario && usuario.debeCambiarClave) {
      DOVA.logout().catch(() => {}).finally(() => location.reload());
      return;
    }
    aplicarModo(usuario && usuario.temaPreferido);
    aplicarLetra(usuario && usuario.letraPreferida);
    entrarADova(elLogin, elShell);
  }

  function iniciarSesionUI(elLogin, elShell) {
    elLogin.innerHTML = Vistas.vistaLogin();
    Vistas.initLogin(() => decidirDestinoTrasLogin(elLogin, elShell));
  }

  /* Estado "cargando" de lo que pidió el usuario: barra fina arriba y el botón
     que lo disparó queda ocupado (con indicador y sin poder apretarse dos
     veces) hasta que el servidor responde. Los pedidos automáticos (avisos,
     tiempo real) no muestran nada. */
  function iniciarEstadosDeCarga() {
    let ultimo = { el: null, t: 0 };
    const anotar = (el) => { if (el) ultimo = { el, t: performance.now() }; };
    document.addEventListener('click', (e) => anotar(e.target.closest && e.target.closest('button, a, [role="button"]')), true);
    document.addEventListener('submit', (e) => anotar(e.submitter || (e.target && e.target.querySelector('[type=submit]'))), true);
    let activos = 0; const botones = new Set();
    window.addEventListener('dova:pedido', (e) => {
      if (e.detail > 0) {
        activos += 1;
        if (performance.now() - ultimo.t < 600 && ultimo.el && ultimo.el.isConnected) {
          document.body.classList.add('dova-ocupado');
          const b = ultimo.el;
          if (b.matches('.dova-btn-primary, .dova-btn-secundario')) { b.classList.add('dova-btn-ocupado'); b.setAttribute('aria-busy', 'true'); botones.add(b); }
        }
        return;
      }
      activos = Math.max(0, activos - 1);
      if (activos === 0) {
        document.body.classList.remove('dova-ocupado');
        botones.forEach((b) => { b.classList.remove('dova-btn-ocupado'); b.removeAttribute('aria-busy'); });
        botones.clear();
      }
    });
  }

  /* Campos numéricos enteros (importes en Gs., cantidades): en Paraguay se
     escribe "1.500.000". El navegador tomaba el punto como decimal (1,5) o
     invalidaba el campo. Acá el punto y la coma de miles simplemente se
     ignoran al tipear o pegar. Los campos con decimales (mm, kg, °C) no se tocan. */
  function iniciarCamposEnteros() {
    const entero = (el) => el && el.tagName === 'INPUT' && el.type === 'number' && !/[.]|any/.test(el.getAttribute('step') || '1');
    document.addEventListener('keydown', (e) => { if ((e.key === '.' || e.key === ',') && entero(e.target)) e.preventDefault(); }, true);
    document.addEventListener('paste', (e) => {
      if (!entero(e.target)) return;
      const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
      const limpio = t.replace(/[.,\s]/g, '').replace(/^Gs/i, '');
      if (limpio !== t) { e.preventDefault(); e.target.value = limpio; e.target.dispatchEvent(new Event('input', { bubbles: true })); }
    }, true);
  }

  function iniciar({ mainId, menuId, marcaId, loginId, shellId, logoutId }) {
    iniciarEstadosDeCarga();
    iniciarCamposEnteros();
    elMain = document.getElementById(mainId);
    elMenu = document.getElementById(menuId);
    elMarca = document.getElementById(marcaId);
    const elLogin = document.getElementById(loginId);
    const elShell = document.getElementById(shellId);
    const elLogout = logoutId ? document.getElementById(logoutId) : null;

    // Fase 6 — Responsive: además de al navegar, hay vistas que agregan
    // tablas dinámicamente dentro de un sub-contenedor (ver etapas de un
    // plan, admin de usuarios, contexto de agenda, etc.) sin pasar por
    // navegar(). Este observer detecta esas tablas nuevas también.
    if (elMain && window.MutationObserver) {
      const observer = new MutationObserver(() => aplicarDataThATablas());
      observer.observe(elMain, { childList: true, subtree: true });
    }

    if (elLogout) {
      elLogout.addEventListener('click', async () => {
        if (window.DovaVivo) DovaVivo.detener();
        await DOVA.logout();
        location.reload();
      });
    }

    if (MODO_VENTANA) {
      if (DOVA.estaAutenticado()) entrarVentana(elLogin, elShell);
      else if (EN_IFRAME) { try { window.top.location.reload(); } catch (_e) { /* */ } }
      else location.replace(location.pathname + location.hash);
      return;
    }
    if (DOVA.estaAutenticado()) {
      decidirDestinoTrasSesionExistente(elLogin, elShell);
    } else {
      elShell.style.display = 'none';
      elLogin.style.display = '';
      iniciarSesionUI(elLogin, elShell);
    }
  }

  return { iniciar, navegar, aplicarModo, aplicarLetra, enVentana: () => MODO_VENTANA, escritorio: () => ESCRITORIO };
})();
window.DovaApp = DovaApp;
