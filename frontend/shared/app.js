/* DOVA — motor de la SPA, compartido por los 3 diseños.
   Cada skin (original/minimalista/tecnico) trae su propio index.html con
   la estructura del layout (sidebar, topbar, etc.) y llama a DovaApp.iniciar()
   pasándole los IDs de sus contenedores. El contenido de cada vista es
   idéntico entre skins; solo cambia el CSS alrededor. */

const DovaApp = (() => {
  let elMain, elMenu, elMarca;

  /* Menú agrupado: arriba solo se ven Movimientos, Reportes y Administración;
     cada uno despliega sus opciones (solo las que el usuario tiene permitidas).
     "permiso" puede ser una lista: alcanza con tener cualquiera. */
  const GRUPOS = [['movimientos', 'Movimientos'], ['reportes', 'Reportes'], ['administracion', 'Administración']];
  const MENU = [
    // Movimientos: el trabajo del día
    { grupo: 'movimientos', ruta: 'dashboard', label: 'Inicio', permiso: null },
    { grupo: 'movimientos', ruta: 'agenda', label: 'Agenda', permiso: 'agenda.view' },
    { grupo: 'movimientos', ruta: 'caja', label: 'Caja', permiso: ['caja.view', 'caja.manage'] },
    { grupo: 'movimientos', ruta: 'facturacion', label: 'Facturación', permiso: ['facturacion.ver', 'facturacion.ver_propias', 'facturacion.crear', 'facturacion.configurar', 'facturacion.ver_reportes'] },
    { grupo: 'movimientos', ruta: 'seguimiento', label: 'Seguimiento', permiso: ['seguimiento.view', 'recalls.view', 'seguimiento.manage'] },
    { grupo: 'movimientos', ruta: 'web', label: 'Página web', permiso: ['web.ver', 'web.configurar'] },
    { grupo: 'movimientos', ruta: 'operaciones', label: 'Clínica', permiso: ['agenda.config', 'equipos.manage', 'esterilizacion.manage', 'laboratorio.manage', 'fichaje.use', 'fichaje.view_all'] },
    // Reportes: consultar y analizar
    { grupo: 'reportes', ruta: 'pacientes', label: 'Pacientes', permiso: 'pacientes.view' },
    { grupo: 'reportes', ruta: 'inventario', label: 'Inventario', permiso: 'inventario.view' },
    { grupo: 'reportes', ruta: 'catalogo', label: 'Tratamientos', permiso: ['tratamientos.manage', 'usuarios.manage'] },
    { grupo: 'reportes', ruta: 'indicadores', label: 'Estadísticas', permiso: ['kpis.view'] },
    { grupo: 'reportes', ruta: 'finanzas', label: 'Finanzas', permiso: ['cuenta_corriente.view', 'comisiones.view', 'comisiones.manage', 'aseguradoras.manage', 'listas_precios.manage', 'metas.manage'] },
    { grupo: 'reportes', ruta: 'reportes', label: 'Reportes generales', permiso: 'reportes.view' },
    // Administración. "Configuración" no pide permiso: cada uno cambia su propio diseño.
    { grupo: 'administracion', ruta: 'configuracion', label: 'Configuración', permiso: null },
    { grupo: 'administracion', ruta: 'usuarios', label: 'Usuarios', permiso: 'usuarios.manage' },
    { grupo: 'administracion', ruta: 'auditoria', label: 'Historial de cambios', permiso: 'auditoria.view' },
    { grupo: 'administracion', ruta: 'helpdesk', label: 'Ayuda técnica', permiso: 'helpdesk.view' },
  ];

  // ---- Selector de diseño (moderno/minimalista/tecnico) ----
  // DOVA es UNA sola aplicación: cada estilo visual vive en su propia
  // carpeta estática hermana (frontend/moderno, frontend/minimalista,
  // frontend/tecnico) que comparte TODO este código (shared/). Cambiar de
  // diseño significa navegar a la carpeta hermana correspondiente — la
  // sesión (localStorage) es la misma para las 3, así que no se pierde.
  const TEMAS_VALIDOS = ['moderno', 'minimalista', 'tecnico'];

  function normalizarTema(t) {
    return TEMAS_VALIDOS.includes(t) ? t : null;
  }

  // Detecta en qué carpeta de tema estamos parados a partir de la URL.
  // Admite tanto "/moderno/index.html" como "/moderno" (algunos servidores
  // estáticos, como el usado en desarrollo, sirven "clean URLs" sin barra
  // final ni nombre de archivo).
  function temaActual() {
    const m = location.pathname.match(/\/(moderno|minimalista|tecnico)(?:\/|$)/);
    return m ? m[1] : null;
  }

  // Navega a la carpeta del tema pedido, conservando la ruta (#hash) actual
  // para que el cambio de diseño no te devuelva siempre al dashboard.
  function irATema(tema) {
    const destino = normalizarTema(tema);
    if (!destino) return;
    const actual = temaActual();
    if (actual === destino) { location.reload(); return; }
    if (!actual) { return; } // no estamos en una carpeta de tema reconocible (raro): no hacer nada
    const nuevaRuta = location.pathname.replace(new RegExp(`/${actual}(/|$)`), `/${destino}$1`);
    location.href = nuevaRuta + location.search + location.hash;
  }

  function cerrarGrupos(excepto) {
    if (!elMenu) return;
    elMenu.querySelectorAll('.dova-menu-grupo.abierto').forEach((g) => {
      if (g === excepto) return;
      g.classList.remove('abierto');
      g.querySelector('.dova-menu-grupo-btn').setAttribute('aria-expanded', 'false');
    });
  }
  let cierreGlobalListo = false;
  function renderMenu() {
    if (!elMenu) return;
    elMenu.innerHTML = GRUPOS.map(([id, nombre]) => {
      const items = MENU.filter((m) => m.grupo === id && tieneAcceso(m.permiso));
      if (!items.length) return '';
      return `<div class="dova-menu-grupo" data-grupo="${id}">
        <button type="button" class="dova-menu-item dova-menu-grupo-btn" aria-expanded="false" aria-haspopup="true">${nombre}<span class="dova-menu-flecha" aria-hidden="true">▾</span></button>
        <div class="dova-submenu" role="menu" aria-label="${nombre}">${items.map((m) => `<button type="button" class="dova-menu-item dova-submenu-item" role="menuitem" data-ruta="${m.ruta}">${m.label}</button>`).join('')}</div>
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
    elMenu.querySelectorAll('[data-ruta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cerrarGrupos();
        navegar(btn.dataset.ruta);
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
    elMenu.querySelectorAll('[data-ruta]').forEach((btn) => {
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
    const alInicio = () => { navegar('dashboard'); document.body.classList.remove('dova-menu-abierto'); };
    logo.addEventListener('click', alInicio);
    logo.addEventListener('keydown', (e) => { if (e.key === 'Enter') alInicio(); });
  }

  // Permiso mínimo para entrar a una ruta que no es un ítem de MENU (se
  // llega por botón, no por click de menú, pero igual hay que evitar que
  // alguien la teclee directo en el hash sin tener el permiso).
  const PERMISO_RUTA_EXTRA = {
    consulta: 'historia_clinica.edit',
  };

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
    } else if (!DOVA.tienePermiso('reportes.view')) {
      Vistas.initDashboardSinReportes((rutaDestino) => navegar(rutaDestino));
    }
    conExtension(() => DovaSecciones.extenderDashboard(elMain, navegar));
    aplicarDataThATablas();
  }

  async function navegar(ruta, params) {
    if (window.DovaVivo) DovaVivo.olvidar(elMain);
    const permiso = permisoRequerido(ruta);
    if (permiso && !tieneAcceso(permiso)) {
      Vistas.toast('No tenés permiso para acceder a esa sección', 'error');
      ruta = 'dashboard';
      params = undefined;
    }
    marcarMenuActivo(ruta);
    // Un modal abierto no debe quedar flotando sobre la sección nueva.
    document.querySelectorAll('.dova-modal-overlay').forEach((o) => o.remove());
    window.location.hash = params ? `${ruta}/${params}` : ruta;
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
        case 'helpdesk':
          elMain.innerHTML = await Vistas.vistaHelpdesk();
          Vistas.initHelpdesk();
          break;
        case 'usuarios':
          elMain.innerHTML = await Vistas.vistaUsuariosAdmin();
          Vistas.initUsuariosAdmin(() => navegar('usuarios'));
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
    renderMenu();
    renderMarca();
    // Tiempo real: campanita de avisos y pantallas que se actualizan solas.
    if (window.DovaVivo) {
      DovaVivo.iniciar();
      const ref = document.getElementById('theme-toggle-btn') || document.getElementById('logout-btn');
      if (ref) DovaVivo.montarCampana(ref, navegar);
    }
    {
      const hashActual = location.hash.replace('#', '');
      const [rutaInicial, ...restoInicial] = hashActual.split('/');
      navegar(rutaInicial || 'dashboard', restoInicial.length ? restoInicial.join('/') : undefined);
    }
    // Si venimos de cambiar de diseño (irATema hizo una navegación completa
    // de página, sea desde el login o desde Configuración), mostrar acá la
    // confirmación.
    const flash = DOVA.consumeFlash();
    if (flash) Vistas.toast(flash, 'ok');
  }

  // Después de un login recién hecho: el diseño elegido en el propio
  // formulario de login (elegidoEnLogin) manda. Si coincide con lo que el
  // backend ya tenía guardado no hay nada que actualizar; si es distinto,
  // se guarda como nueva preferencia. Con eso decidido, si la carpeta
  // elegida es otra a la actual se redirige ahí (la sesión ya quedó guardada
  // en localStorage, así que la carpeta destino la recupera sin volver a
  // loguearse); si es la misma carpeta, se entra directo.
  async function decidirDestinoTrasLogin(elLogin, elShell, elegidoEnLogin) {
    const usuario = DOVA.usuarioActual();
    const prefGuardada = normalizarTema(usuario && usuario.disenoPreferido);
    // Sin elección explícita ("Mi diseño habitual"): el guardado del usuario;
    // si nunca eligió uno, el de la carpeta actual.
    const destino = normalizarTema(elegidoEnLogin) || prefGuardada || temaActual() || 'moderno';
    if (destino !== prefGuardada) {
      try { await DOVA.actualizarDisenoPreferido(destino); } catch (_e) { /* no bloquea el ingreso si falla */ }
    }
    const actual = temaActual();
    if (actual && destino !== actual) {
      irATema(destino); // recarga en la carpeta correcta con la sesión ya guardada
      return;
    }
    entrarADova(elLogin, elShell);
  }

  // Al recargar la página con una sesión ya activa (no pasó por el form de
  // login esta vez): se respeta el diseño ya guardado tal cual, sin volver
  // a preguntar. Si nunca eligió uno (cuenta muy vieja, dato corrupto),
  // "moderno" queda como default silencioso — el selector para cambiarlo
  // sigue disponible en Configuración > Apariencia.
  function decidirDestinoTrasSesionExistente(elLogin, elShell) {
    const usuario = DOVA.usuarioActual();
    // Quedó pendiente el cambio obligatorio de contraseña: vuelve al login.
    if (usuario && usuario.debeCambiarClave) {
      DOVA.logout().catch(() => {}).finally(() => location.reload());
      return;
    }
    const pref = normalizarTema(usuario && usuario.disenoPreferido) || 'moderno';
    const actual = temaActual();
    if (actual && pref !== actual) {
      irATema(pref);
      return;
    }
    entrarADova(elLogin, elShell);
  }

  function iniciarSesionUI(elLogin, elShell) {
    elLogin.innerHTML = Vistas.vistaLogin(temaActual());
    Vistas.initLogin((disenoElegido) => decidirDestinoTrasLogin(elLogin, elShell, disenoElegido));
  }

  function iniciar({ mainId, menuId, marcaId, loginId, shellId, logoutId }) {
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

    if (DOVA.estaAutenticado()) {
      decidirDestinoTrasSesionExistente(elLogin, elShell);
    } else {
      elShell.style.display = 'none';
      elLogin.style.display = '';
      iniciarSesionUI(elLogin, elShell);
    }
  }

  return { iniciar, navegar, irATema };
})();
