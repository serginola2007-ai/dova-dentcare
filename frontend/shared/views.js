/* Vistas compartidas por los 3 diseños de DOVA. Cada vista devuelve HTML
   (string) y registra sus propios listeners tras insertarse en el DOM.
   El layout (sidebar vs topbar, bordes vs whitespace, etc.) lo define cada
   skin en su propio index.html / css; esto solo genera el contenido. */

const Vistas = (() => {
  function fmtGs(n) { return 'Gs. ' + Math.round(Number(n || 0)).toLocaleString('es-PY'); } // el guaraní no usa decimales
  // Un día calendario ('AAAA-MM-DD') se arma en hora LOCAL: new Date('2026-01-05')
  // lo toma como medianoche UTC y en Paraguay (UTC-3) mostraba el 4/1.
  function fmtFecha(f) {
    if (!f) return '-';
    const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es-PY');
    return new Date(f).toLocaleDateString('es-PY');
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function toast(msg, tipo = 'info') {
    let cont = document.getElementById('dova-toasts');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'dova-toasts';
      cont.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(cont);
    }
    const el = document.createElement('div');
    const colores = { info: '#2B2420', error: '#B8443A', ok: '#7A8B76' };
    el.style.cssText = `background:${colores[tipo] || colores.info};color:#F7F3EC;padding:11px 16px;border-radius:2px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,0.18);max-width:320px;`;
    el.textContent = msg;
    cont.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function manejarError(fn) {
    try { return await fn(); } catch (e) { toast(e.message || 'Ocurrió un error', 'error'); throw e; }
  }

  // ---------------- SELECTOR DE DISEÑO / APARIENCIA ----------------
  // Catálogo de los 3 estilos visuales de DOVA. Los textos son los mismos
  // en el login, en Configuración > Apariencia y en cualquier otro lugar
  // donde se elija diseño.
  const DISENOS = [
    { id: 'moderno', nombre: 'Moderno', desc: 'Una interfaz actual, visual y dinámica, pensada para una experiencia moderna.' },
    { id: 'minimalista', nombre: 'Minimalista', desc: 'Una interfaz limpia, simple y ordenada, enfocada en facilitar el trabajo diario.' },
    { id: 'tecnico', nombre: 'Técnico', desc: 'Una interfaz orientada a información, control y gestión detallada.' },
  ];

  // ---------------- LOGIN ----------------
  // El selector de diseño vive acá mismo, junto a usuario/contraseña (en
  // vez de una pantalla aparte que aparecía después de loguearse): se
  // preselecciona el diseño de la carpeta actual (o "moderno" si no se
  // puede determinar) y el usuario puede cambiarlo antes de entrar.
  // Por defecto queda marcada "Mi diseño habitual": cada operador entra con
  // el diseño que tiene guardado en su usuario (en una computadora
  // compartida, el que entra sin tocar nada no pisa su preferencia). Si
  // elige uno de los 3, ese pasa a ser su nuevo diseño guardado.
  function vistaLogin(disenoActual) {
    void disenoActual;
    const preseleccion = '';
    return `
      <div class="dova-login-wrap">
        <div class="dova-login-card dova-login-card-ancha">
          <h1 class="dova-login-title">Iniciar sesión</h1>
          <form id="form-login">
            <label>Usuario</label>
            <input type="text" id="login-username" required autocomplete="username" />
            <label>Contraseña</label>
            <input type="password" id="login-password" required autocomplete="current-password" />

            <fieldset class="dova-login-disenos">
              <legend>Diseño</legend>
              <label class="dova-diseno-habitual${preseleccion === '' ? ' seleccionado' : ''}" data-diseno-radio-card="">
                <input type="radio" name="login-diseno" value="" ${preseleccion === '' ? 'checked' : ''} />
                <span><strong>Mi diseño habitual</strong><br><span class="dova-nota">Entrás con el diseño que elegiste la última vez. Elegí otro abajo solo si querés cambiarlo.</span></span>
              </label>
              <div class="dova-disenos-grid dova-disenos-grid-login">
                ${DISENOS.map((d) => `
                  <label class="dova-diseno-card dova-diseno-card-radio${d.id === preseleccion ? ' seleccionado' : ''}" data-diseno-radio-card="${d.id}">
                    <input type="radio" name="login-diseno" value="${d.id}" ${d.id === preseleccion ? 'checked' : ''} />
                    ${previewDiseno(d.id)}
                    <h3>${esc(d.nombre)}</h3>
                    <p>${esc(d.desc)}</p>
                  </label>`).join('')}
              </div>
            </fieldset>

            <button type="submit" class="dova-btn-primary">Ingresar</button>
            <p id="login-error" class="dova-error-text" style="display:none;"></p>
          </form>
        </div>
      </div>`;
  }
  function initLogin(onSuccess) {
    const form = document.getElementById('form-login');

    // Resaltar visualmente la tarjeta del diseño elegido (el radio real
    // queda oculto; la tarjeta entera funciona como botón).
    document.querySelectorAll('[data-diseno-radio-card]').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-diseno-radio-card]').forEach((c) => c.classList.remove('seleccionado'));
        card.classList.add('seleccionado');
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const disenoElegido = (form.querySelector('input[name="login-diseno"]:checked') || {}).value || '';
      const errorEl = document.getElementById('login-error');
      errorEl.style.display = 'none';
      try {
        await DOVA.login(username, password);
        const u = DOVA.usuarioActual();
        if (u && u.debeCambiarClave) {
          pedirCambioDeClave(password, () => onSuccess(disenoElegido));
          return;
        }
        onSuccess(disenoElegido);
      } catch (err) {
        errorEl.textContent = err.message || 'No se pudo iniciar sesión. Revisá tu conexión a internet.';
        errorEl.style.display = 'block';
      }
    });
  }

  // Formulario de cambio de contraseña (se reutiliza en el primer ingreso y
  // en Configuración > Seguridad).
  function formCambioClaveHtml({ pedirActual = true } = {}) {
    return `
      <form id="form-cambio-clave" class="dova-form-clave">
        ${pedirActual ? '<label>Contraseña actual</label><input type="password" name="actual" required autocomplete="current-password" />' : ''}
        <label>Nueva contraseña</label>
        <input type="password" name="nueva" required minlength="8" autocomplete="new-password" />
        <label>Repetí la nueva contraseña</label>
        <input type="password" name="repetir" required minlength="8" autocomplete="new-password" />
        <p class="dova-nota">Mínimo 8 caracteres. Evitá tu nombre de usuario o claves obvias.</p>
        <button type="submit" class="dova-btn-primary">Guardar contraseña</button>
        <p class="dova-error-text" data-error-clave style="display:none;"></p>
      </form>`;
  }
  function initCambioClave(form, obtenerActual, alTerminar) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('[data-error-clave]');
      err.style.display = 'none';
      const nueva = form.nueva.value;
      if (nueva !== form.repetir.value) { err.textContent = 'Las dos contraseñas nuevas no coinciden.'; err.style.display = 'block'; return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await DOVA.cambiarClave(obtenerActual(), nueva);
        alTerminar();
      } catch (ex) {
        err.textContent = ex.message || 'No se pudo cambiar la contraseña';
        err.style.display = 'block';
        btn.disabled = false;
      }
    });
  }
  // Primer ingreso con la contraseña inicial (admin/admin): hay que cambiarla
  // antes de entrar. No se puede saltear.
  function pedirCambioDeClave(claveActual, alTerminar) {
    const card = document.querySelector('.dova-login-card');
    card.innerHTML = `
      <h1 class="dova-login-title">Elegí una contraseña nueva</h1>
      <p class="dova-nota">Estás usando la contraseña inicial del sistema. Por seguridad, cambiala antes de continuar.</p>
      ${formCambioClaveHtml({ pedirActual: false })}`;
    initCambioClave(document.getElementById('form-cambio-clave'), () => claveActual, () => { toast('Contraseña actualizada', 'ok'); alTerminar(); });
  }

  function previewDiseno(id) {
    return `
      <div class="dova-preview dova-preview-${id}">
        <div class="dova-preview-barra"><span class="dova-preview-dot"></span></div>
        <div class="dova-preview-cuerpo">
          <div class="dova-preview-bloque"></div><div class="dova-preview-bloque"></div><div class="dova-preview-bloque"></div>
        </div>
      </div>`;
  }

  function vistaSelectorDiseno() {
    return `
      <div class="dova-selector-diseno">
        <h1 class="dova-selector-diseno-titulo">Elegí cómo querés ver DOVA</h1>
        <p class="dova-selector-diseno-subtitulo">Seleccioná el estilo de interfaz que mejor se adapte a tu clínica. Podés cambiarlo cuando quieras desde Configuración.</p>
        <div class="dova-disenos-grid">
          ${DISENOS.map((d) => `
            <div class="dova-diseno-card">
              ${previewDiseno(d.id)}
              <h3>${esc(d.nombre)}</h3>
              <p>${esc(d.desc)}</p>
              <button class="dova-btn-primary" data-elegir-diseno="${d.id}" type="button">Elegir ${esc(d.nombre.toLowerCase())}</button>
            </div>`).join('')}
        </div>
        <p id="selector-diseno-error" class="dova-error-text" style="display:none;"></p>
      </div>`;
  }

  function initSelectorDiseno(onElegido) {
    document.querySelectorAll('[data-elegir-diseno]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tema = btn.dataset.elegirDiseno;
        const errorEl = document.getElementById('selector-diseno-error');
        errorEl.style.display = 'none';
        document.querySelectorAll('[data-elegir-diseno]').forEach((b) => { b.disabled = true; });
        try {
          await DOVA.actualizarDisenoPreferido(tema);
          onElegido(tema);
        } catch (e) {
          document.querySelectorAll('[data-elegir-diseno]').forEach((b) => { b.disabled = false; });
          errorEl.textContent = e.message || 'No se pudo guardar tu preferencia. Intentá de nuevo.';
          errorEl.style.display = 'block';
        }
      });
    });
  }

  // ---------------- CONFIGURACIÓN ----------------
  function vistaConfiguracion() {
    const actual = (DOVA.usuarioActual() || {}).disenoPreferido || null;
    return `
      <h2 class="dova-view-title">Configuración</h2>
      <p class="dova-subtitulo">Preferencias de tu cuenta en DOVA.</p>

      <h3 class="dova-section-title">Apariencia</h3>
      <p class="dova-nota">Estilo de DOVA — el cambio se guarda en tu cuenta y te va a acompañar en cualquier dispositivo donde inicies sesión.</p>
      <div class="dova-apariencia-grid">
        ${DISENOS.map((d) => {
          const esActual = d.id === actual;
          return `
            <div class="dova-diseno-card ${esActual ? 'seleccionado' : ''}">
              ${previewDiseno(d.id)}
              <h3>${esc(d.nombre)} ${esActual ? '<span class="dova-badge dova-badge-ok">Actual</span>' : ''}</h3>
              <p>${esc(d.desc)}</p>
              <button class="${esActual ? 'dova-btn-secundario' : 'dova-btn-primary'}" data-elegir-diseno-config="${d.id}" type="button" ${esActual ? 'disabled' : ''}>
                ${esActual ? 'Seleccionado' : 'Elegir ' + esc(d.nombre.toLowerCase())}
              </button>
            </div>`;
        }).join('')}
      </div>

      <h3 class="dova-section-title">Seguridad</h3>
      <div class="dova-card dova-card-clave">
        <p class="dova-nota">Cambiá tu contraseña de ingreso a DOVA.</p>
        ${formCambioClaveHtml()}
        <hr class="dova-separador" />
        <p class="dova-nota">¿Dejaste DOVA abierto en otra compu o perdiste el celular? Cerrá tu sesión en todos los dispositivos (también en este).</p>
        <button type="button" class="dova-btn-secundario" id="btn-logout-todas">Cerrar sesión en todos los dispositivos</button>
      </div>
      ${window.DovaPWA ? DovaPWA.tarjetaHtml() : ''}
    `;
  }

  function initConfiguracion() {
    const fc = document.getElementById('form-cambio-clave');
    if (fc) initCambioClave(fc, () => fc.actual.value, () => { fc.reset(); toast('Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.', 'ok'); });
    const bt = document.getElementById('btn-logout-todas');
    if (bt) bt.addEventListener('click', async () => {
      if (bt.dataset.seguro !== '1') { bt.dataset.seguro = '1'; bt.textContent = '¿Seguro? Tocá de nuevo para cerrar todas'; return; }
      bt.disabled = true;
      try { await DOVA.logoutTodas(); } catch (_e) { /* igual se cierra acá */ }
      location.reload();
    });
    if (window.DovaPWA) DovaPWA.activarTarjeta();
    document.querySelectorAll('[data-elegir-diseno-config]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tema = btn.dataset.elegirDisenoConfig;
        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        try {
          await DOVA.actualizarDisenoPreferido(tema);
          // El toast se muestra recién después de aterrizar en la carpeta
          // nueva (ver DOVA.consumeFlash() en app.js), porque acá la página
          // se descarga enseguida y un toast inmediato no llegaría a verse.
          DOVA.setFlash('El diseño se actualizó correctamente.');
          DovaApp.irATema(tema);
        } catch (e) {
          toast(e.message || 'No se pudo cambiar el diseño', 'error');
          btn.disabled = false;
          btn.textContent = textoOriginal;
        }
      });
    });
  }

  // ---------------- DASHBOARD ----------------
  async function vistaDashboard() {
    const usuario = DOVA.usuarioActual();
    if (usuario && usuario.odontologoId) {
      return vistaDashboardOdontologo();
    }
    if (!DOVA.tienePermiso('reportes.view')) {
      return vistaDashboardSinReportes(usuario);
    }
    const alertas = await manejarError(() => DOVA.get('/reportes/dashboard/alertas'));
    const items = [
      { label: 'Turnos hoy', valor: alertas.turnosHoy, tono: 'info' },
      { label: 'Insumos por acabarse', valor: alertas.stockBajo, tono: alertas.stockBajo > 0 ? 'alerta' : 'ok' },
      { label: 'Cuotas vencidas', valor: alertas.cuotasVencidas, tono: alertas.cuotasVencidas > 0 ? 'alerta' : 'ok' },
      { label: 'Lista de espera', valor: alertas.listaEsperaPendiente, tono: 'info' },
      { label: 'Insumos por vencer (30d)', valor: alertas.insumosPorVencer, tono: alertas.insumosPorVencer > 0 ? 'alerta' : 'ok' },
      { label: 'Pedidos de ayuda técnica sin resolver', valor: alertas.ticketsHelpdeskAbiertos, tono: alertas.ticketsHelpdeskAbiertos > 0 ? 'alerta' : 'ok' },
    ];
    return `
      <h2 class="dova-view-title">Inicio</h2>
      <div class="dova-cards-grid">
        ${items.map((it) => `
          <div class="dova-card dova-card-${it.tono}">
            <div class="dova-card-valor">${it.valor}</div>
            <div class="dova-card-label">${esc(it.label)}</div>
          </div>`).join('')}
      </div>
      ${alertas.cajaAbierta
        ? `<p class="dova-nota">Caja abierta desde ${fmtFecha(alertas.cajaAbierta.fecha)}.</p>`
        : `<p class="dova-nota dova-nota-alerta">No hay una caja abierta hoy.</p>`}
    `;
  }

  // Panel para roles sin el permiso 'reportes.view' (recepción, asistente,
  // helpdesk): no pide datos agregados de reportes, así que no puede fallar
  // por permisos. Muestra un saludo y accesos directos a lo que ese rol sí
  // puede usar, en vez de una pantalla en blanco.
  function vistaDashboardSinReportes(usuario) {
    const nombre = usuario && (usuario.nombre || usuario.username) ? esc(usuario.nombre || usuario.username) : '';
    const accesos = [
      { ruta: 'pacientes', label: 'Pacientes', icono: 'pacientes' },
      { ruta: 'agenda', label: 'Agenda', icono: 'calendario' },
      { ruta: 'inventario', label: 'Inventario', icono: 'caja' },
      { ruta: 'helpdesk', label: 'Helpdesk', icono: 'ticket' },
    ].filter((a) => DOVA.tienePermiso(`${a.ruta}.view`));
    return `
      <h2 class="dova-view-title">Inicio</h2>
      <p class="dova-nota">${nombre ? `Hola, ${nombre}. ` : ''}Estos son tus accesos rápidos:</p>
      <div class="dova-cards-grid">
        ${accesos.map((a) => `
          <button type="button" class="dova-card dova-card-info dova-card-clicable" data-ir-a="${esc(a.ruta)}">
            <div class="dova-card-valor dova-card-icono">${DovaIcono(a.icono, 22)}</div>
            <div class="dova-card-label">${esc(a.label)}</div>
          </button>`).join('')}
      </div>
    `;
  }

  function initDashboardSinReportes(irA) {
    document.querySelectorAll('[data-ir-a]').forEach((btn) => {
      btn.addEventListener('click', () => irA(btn.dataset.irA));
    });
  }

  // Dashboard específico del odontólogo (sección 23 del prompt): Mi día,
  // Mis tratamientos, Mis pendientes, Resumen — sin datos administrativos
  // ni financieros salvo que tenga permiso explícito para verlos.
  const CATEGORIAS_PENDIENTES = [
    { key: 'tratamientosAbiertos', label: 'Tratamientos abiertos', icono: 'lista' },
    { key: 'pacientesSinProximaCita', label: 'Sin próxima cita', icono: 'calendario' },
    { key: 'evolucionesSinFirmar', label: 'Evoluciones sin firmar', icono: 'firma' },
    { key: 'estudiosPendientes', label: 'Estudios sin resultado', icono: 'estudio' },
    { key: 'consentimientosPendientes', label: 'Consentimientos pendientes', icono: 'firma' },
    { key: 'controlesVencidos', label: 'Controles postop. vencidos', icono: 'curacion' },
    { key: 'pacientesParaRevisar', label: 'Pacientes para revisar', icono: 'alerta' },
    { key: 'derivacionesRecibidas', label: 'Derivaciones recibidas', icono: 'flecha' },
    { key: 'recetasPendientes', label: 'Recetas pendientes', icono: 'medicamento' },
    { key: 'presupuestosPendientes', label: 'Presupuestos sin aceptar', icono: 'comprobante' },
  ];

  function nombrePaciente(item) {
    return esc((item.paciente_nombre || '') + ' ' + (item.paciente_apellido || ''));
  }

  async function vistaDashboardOdontologo() {
    // "Hoy" en la hora de la clínica (no en UTC: después de las 21 h ya sería mañana).
    const ahora = new Date(); const hoy = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const yo = DOVA.usuarioActual() || {};
    const [pendientes, todos] = await Promise.all([
      manejarError(() => DOVA.get('/pendientes')),
      manejarError(() => DOVA.get(`/agenda?desde=${hoy}&hasta=${hoy}${yo.odontologoId ? `&odontologoId=${yo.odontologoId}` : ''}`)).catch(() => []),
    ]);
    const turnosHoy = (todos || []).filter((t) => !['cancelado', 'reprogramado'].includes(t.estado))
      .sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
    const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '');
    const estadoFlujo = (t) => {
      if (t.estado === 'no_asistio') return '<span class="dova-badge dova-ext-badge-critica">No asistió</span>';
      if (t.finalizado_en || t.estado === 'atendido') return '<span class="dova-badge dova-badge-ok">Finalizado</span>';
      if (t.en_sillon_en) return `<span class="dova-badge dova-ext-badge-atencion">En consulta · ${hora(t.en_sillon_en)}</span>`;
      if (t.llegada_en) return `<span class="dova-badge dova-ext-badge-info">En espera · ${hora(t.llegada_en)}</span>`;
      return `<span class="dova-badge">${t.estado === 'confirmado' ? 'Confirmado' : 'Reservado'}</span>`;
    };
    const accion = (t) => {
      if (t.estado === 'no_asistio' || !DOVA.tienePermiso('historia_clinica.edit')) return '';
      const txt = t.finalizado_en || t.estado === 'atendido' ? 'Ver consulta' : t.en_sillon_en ? 'Continuar consulta' : 'Iniciar consulta';
      return `<button class="dova-btn-link" data-ir-consulta="${t.paciente_id}/t${t.id}">${txt}</button>`;
    };
    const puedeFinanzas = DOVA.tienePermiso('presupuestos.view') || DOVA.tienePermiso('pagos.view');

    return `
      <h2 class="dova-view-title">Mi día</h2>
      <p class="dova-subtitulo">${esc(DOVA.usuarioActual().nombre)} — ${turnosHoy.length} turno(s) hoy</p>

      <div class="dova-cards-grid">
        <div class="dova-card ${pendientes.total > 0 ? 'dova-card-alerta' : 'dova-card-ok'}">
          <div class="dova-card-valor">${pendientes.total}</div>
          <div class="dova-card-label">Pendientes totales</div>
        </div>
        <div class="dova-card">
          <div class="dova-card-valor">${turnosHoy.length}</div>
          <div class="dova-card-label">Turnos de hoy</div>
        </div>
      </div>

      <h3 class="dova-section-title">Agenda de hoy</h3>
      <table class="dova-tabla">
        <thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Duración</th><th>Sillón</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${turnosHoy.map((t) => `
            <tr>
              <td>${esc(String(t.hora_inicio).slice(0, 5))}</td>
              <td><button class="dova-btn-link" data-ir-paciente="${t.paciente_id}">${esc(t.paciente_nombre || '')} ${esc(t.paciente_apellido || '')}</button></td>
              <td>${esc(t.tratamiento_nombre || t.motivo || '-')}</td>
              <td>${t.duracion_minutos ? `${t.duracion_minutos} min` : '-'}</td>
              <td>${esc(t.sillon_nombre || '-')}</td>
              <td>${estadoFlujo(t)}</td>
              <td>${accion(t)}</td>
            </tr>
          `).join('') || '<tr><td colspan="7">No tenés turnos programados para hoy.</td></tr>'}
        </tbody>
      </table>

      <h3 class="dova-section-title">Mis pendientes</h3>
      <div class="dova-tabs" id="pendientes-tabs">
        ${CATEGORIAS_PENDIENTES.map((c, i) => `
          <button class="dova-tab ${i === 0 ? 'activo' : ''}" data-tab-pend="${c.key}">${esc(c.label)} (${(pendientes[c.key] || []).length})</button>
        `).join('')}
      </div>
      ${CATEGORIAS_PENDIENTES.map((c, i) => `
        <div class="dova-tab-panel" data-panel-pend="${c.key}" style="${i === 0 ? '' : 'display:none;'}">
          ${(pendientes[c.key] || []).length ? `
            <ul class="dova-lista-simple">
              ${(pendientes[c.key] || []).map((item) => `
                <li>
                  <button class="dova-btn-link" data-ir-paciente="${item.paciente_id}">${nombrePaciente(item)}</button>
                  — ${esc(item.nombre || item.tratamiento_nombre || item.procedimiento || (item.medicacion ? `Indicó: ${item.medicacion}` : '') || (item.total !== undefined && item.estado ? `Presupuesto ${item.estado} · Gs. ${Number(item.total).toLocaleString('es-PY')}` : '') || item.motivo || item.detalle || '')}
                </li>
              `).join('')}
            </ul>
          ` : '<p class="dova-nota">Sin pendientes en esta categoría.</p>'}
        </div>
      `).join('')}

      ${puedeFinanzas ? '<p class="dova-nota">Para ver presupuestos y pagos de tus pacientes, abrí su ficha clínica → pestaña Administrativo.</p>' : ''}
    `;
  }

  function initDashboardOdontologo(navegarAConsulta, navegarAFicha) {
    document.querySelectorAll('[data-tab-pend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tab-pend]').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        const key = btn.dataset.tabPend;
        document.querySelectorAll('[data-panel-pend]').forEach((p) => {
          p.style.display = p.dataset.panelPend === key ? '' : 'none';
        });
      });
    });
    document.querySelectorAll('[data-ir-consulta]').forEach((btn) => {
      btn.addEventListener('click', () => navegarAConsulta(btn.dataset.irConsulta));
    });
    document.querySelectorAll('[data-ir-paciente]').forEach((btn) => {
      btn.addEventListener('click', () => navegarAFicha(Number(btn.dataset.irPaciente)));
    });
  }

  // ---------------- PACIENTES ----------------
  async function vistaPacientes() {
    const data = await manejarError(() => DOVA.get('/pacientes?pageSize=50'));
    const items = data.data || data.items || data; // tolera las distintas formas de paginación del backend
    const puedeBorrar = DOVA.tienePermiso('pacientes.delete');
    return `
      <h2 class="dova-view-title">Pacientes</h2>
      <div class="dova-toolbar">
        <input id="pacientes-buscar" type="search" placeholder="Buscar por nombre o C.I..." class="dova-input-buscar" autocomplete="off" />
        ${puedeBorrar ? '<button id="btn-ver-eliminados" class="dova-btn-secundario" aria-pressed="false">Ver eliminados</button>' : ''}
        ${DOVA.tienePermiso('pacientes.create') ? '<button id="btn-nuevo-paciente" class="dova-btn-primary">+ Nuevo paciente</button>' : ''}
      </div>
      <p class="dova-nota" id="pacientes-aviso" hidden></p>
      <table class="dova-tabla">
        <thead><tr><th>Nombre</th><th>C.I.</th><th>Teléfono</th><th>Acciones</th></tr></thead>
        <tbody id="pacientes-tbody">${filasPacientes(items, false)}</tbody>
      </table>
      <div id="modal-root"></div>
    `;
  }

  function filasPacientes(items, eliminados) {
    const puedeBorrar = DOVA.tienePermiso('pacientes.delete');
    return (items || []).map((p) => `
            <tr>
              <td>${esc(p.nombre)} ${esc(p.apellido)}</td>
              <td>${esc(p.ci || '-')}</td>
              <td>${esc(p.telefono || '-')}</td>
              <td class="dova-acciones-fila">${eliminados
                ? `<button class="dova-btn-link" data-restaurar-paciente="${p.id}">Restaurar</button>`
                : `<button class="dova-btn-link" data-ver-paciente="${p.id}">Ver ficha</button>${puedeBorrar ? ` <button class="dova-btn-link dova-btn-peligro" data-eliminar-paciente="${p.id}" data-nombre="${esc(p.nombre)} ${esc(p.apellido)}">Eliminar</button>` : ''}`}</td>
            </tr>`).join('') || `<tr><td colspan="4">${eliminados ? 'No hay pacientes eliminados.' : 'No se encontraron pacientes.'}</td></tr>`;
  }

  // Eliminar paciente (solo con permiso pacientes.delete, el admin lo tiene).
  // Es una baja: no se borra su historia clínica ni sus pagos/facturas, y se
  // puede restaurar desde "Ver eliminados".
  async function confirmarEliminarPaciente(id, nombre, alTerminar) {
    let r;
    try { r = await DOVA.get(`/pacientes/${id}/baja-resumen`); } catch (e) { toast(e.message, 'error'); return; }
    const avisos = [
      r.turnosFuturos ? `<li>Se van a <strong>cancelar ${r.turnosFuturos} turno${r.turnosFuturos > 1 ? 's' : ''}</strong> próximo${r.turnosFuturos > 1 ? 's' : ''}.</li>` : '',
      r.cuotasPendientes ? `<li>Tiene <strong>${r.cuotasPendientes} cuota${r.cuotasPendientes > 1 ? 's' : ''} sin pagar</strong>.</li>` : '',
      r.cuentaWeb ? '<li>Se cierra su cuenta en la página web.</li>' : '',
      (r.pagos || r.facturas) ? `<li>Sus ${r.pagos ? `${r.pagos} pago${r.pagos > 1 ? 's' : ''}` : ''}${r.pagos && r.facturas ? ' y ' : ''}${r.facturas ? `${r.facturas} factura${r.facturas > 1 ? 's' : ''}` : ''} se conservan en caja y reportes.</li>` : '',
    ].join('');
    abrirModal(`
      <h3>¿Eliminar a ${esc(nombre)}?</h3>
      <p>Deja de aparecer en Pacientes, en los buscadores y en la agenda.</p>
      ${avisos ? `<ul class="dova-lista-avisos">${avisos}</ul>` : ''}
      <p class="dova-nota">La historia clínica, los pagos y las facturas no se borran (la ley obliga a guardarlos). Si te equivocaste, lo recuperás en Pacientes → "Ver eliminados" → Restaurar.</p>
      <label for="conf-eliminar">Para confirmar, escribí <strong>ELIMINAR</strong></label>
      <input id="conf-eliminar" autocomplete="off" />
      <div class="dova-modal-actions">
        <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
        <button type="button" class="dova-btn-primary dova-btn-peligro-fondo" id="btn-conf-eliminar" disabled>Eliminar paciente</button>
      </div>`);
    const inp = document.getElementById('conf-eliminar'); const btn = document.getElementById('btn-conf-eliminar');
    inp.addEventListener('input', () => { btn.disabled = inp.value.trim().toUpperCase() !== 'ELIMINAR'; });
    inp.focus();
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await DOVA.del(`/pacientes/${id}`);
        document.getElementById('modal-root').innerHTML = '';
        toast(`${nombre} eliminado${res && res.turnosCancelados ? ` · ${res.turnosCancelados} turno(s) cancelado(s)` : ''}`, 'ok');
        alTerminar();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    });
  }

  function initPacientes(navegarAFicha) {
    const tbody = document.getElementById('pacientes-tbody');
    const buscar = document.getElementById('pacientes-buscar');
    const btnElim = document.getElementById('btn-ver-eliminados');
    const aviso = document.getElementById('pacientes-aviso');
    let eliminados = false; let ultimo = 0; let espera;
    const cargar = async () => {
      const n = ++ultimo;
      const q = buscar.value.trim();
      const url = `/pacientes?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}${eliminados ? '&eliminados=true' : ''}`;
      try {
        const data = await DOVA.get(url);
        if (n !== ultimo) return; // llegó una búsqueda más nueva
        tbody.innerHTML = filasPacientes(data.data || data.items || data, eliminados);
      } catch (e) { toast(e.message, 'error'); }
    };
    buscar.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 250); });
    if (window.DovaVivo) DovaVivo.vivo(tbody, ['pacientes'], cargar);
    if (btnElim) btnElim.addEventListener('click', () => {
      eliminados = !eliminados;
      btnElim.textContent = eliminados ? 'Ver activos' : 'Ver eliminados';
      btnElim.setAttribute('aria-pressed', String(eliminados));
      aviso.hidden = !eliminados;
      aviso.textContent = 'Pacientes eliminados: no aparecen en la agenda ni en los buscadores. "Restaurar" los vuelve a activar con toda su historia.';
      const nuevoBtn = document.getElementById('btn-nuevo-paciente'); if (nuevoBtn) nuevoBtn.hidden = eliminados;
      cargar();
    });
    tbody.addEventListener('click', async (ev) => {
      const ver = ev.target.closest('[data-ver-paciente]');
      if (ver) { navegarAFicha(ver.dataset.verPaciente); return; }
      const del = ev.target.closest('[data-eliminar-paciente]');
      if (del) { confirmarEliminarPaciente(del.dataset.eliminarPaciente, del.dataset.nombre, cargar); return; }
      const res = ev.target.closest('[data-restaurar-paciente]');
      if (res) {
        res.disabled = true;
        try { await DOVA.post(`/pacientes/${res.dataset.restaurarPaciente}/restaurar`, {}); toast('Paciente restaurado', 'ok'); cargar(); } catch (e) { toast(e.message, 'error'); res.disabled = false; }
      }
    });
    const btnNuevo = document.getElementById('btn-nuevo-paciente');
    if (btnNuevo) {
      btnNuevo.addEventListener('click', () => {
        abrirModal(`
          <h3>Nuevo paciente</h3>
          <form id="form-nuevo-paciente">
            <label>Nombre</label><input required id="np-nombre" />
            <label>Apellido</label><input required id="np-apellido" />
            <label>C.I.</label><input id="np-ci" />
            <label>Teléfono</label><input id="np-telefono" />
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Guardar</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-paciente').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/pacientes', {
            nombre: document.getElementById('np-nombre').value,
            apellido: document.getElementById('np-apellido').value,
            ci: document.getElementById('np-ci').value || undefined,
            telefono: document.getElementById('np-telefono').value || undefined,
          }));
          toast('Paciente creado', 'ok');
          location.reload();
        });
      });
    }
  }

  // ---------------- FICHA CLÍNICA 360° ----------------
  // Paciente = centro de la experiencia (sección 37 del prompt maestro).
  // Todo lo relacionado a un paciente vive en esta única pantalla.

  const ICONOS_TIMELINE = {
    evolucion: 'evolucion', sesion: 'diente', foto: 'camara', estudio: 'estudio', consentimiento: 'firma', receta: 'medicamento',
    control_postop: 'curacion', derivacion: 'flecha',
  };
  const LABELS_TIMELINE = {
    evolucion: 'Evolución', sesion: 'Sesión de tratamiento', foto: 'Fotografía',
    estudio: 'Estudio', consentimiento: 'Consentimiento', receta: 'Receta',
    control_postop: 'Control postoperatorio', derivacion: 'Derivación',
  };

  function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nac = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }

  function alertasClinicasHtml(paciente) {
    const alertas = [];
    if (paciente.alergias) alertas.push({ tipo: 'Alergias', texto: paciente.alergias });
    if (paciente.medicamentos) alertas.push({ tipo: 'Medicación', texto: paciente.medicamentos });
    if (paciente.antecedentes_medicos) alertas.push({ tipo: 'Antecedentes', texto: paciente.antecedentes_medicos });
    if (!alertas.length) return '';
    return `
      <div class="dova-alertas-clinicas">
        ${alertas.map((a) => `<div class="dova-alerta-clinica"><strong>${esc(a.tipo)}:</strong> ${esc(a.texto)}</div>`).join('')}
      </div>`;
  }

  // Fase 5 — Integración: detalle de un plan de tratamiento con etapas,
  // sesiones, materiales consumidos (vínculo real a inventario) y acceso a
  // generar el presupuesto asociado si todavía no existe uno.
  async function renderPlanDetalle(root, planId) {
    // Fase 2: etapas con estados, profesional, piezas, fotos y materiales.
    if (window.DovaClinica && DovaClinica.planDetalle) return DovaClinica.planDetalle(root, planId);
    root.innerHTML = '<div class="dova-cargando">Cargando plan…</div>';
    const plan = await DOVA.get(`/planes-tratamiento/${planId}`);
    const completadas = (plan.etapas || []).filter((e) => e.completada).length;
    const puedeManage = DOVA.tienePermiso('planes_tratamiento.manage');
    const puedePresupuestos = DOVA.tienePermiso('presupuestos.manage');

    function bloqueMateriales(origen, item) {
      const mats = item.materiales || [];
      return `
        <div class="dova-materiales-box">
          ${mats.length ? `
            <ul class="dova-lista-simple">
              ${mats.map((m) => `<li>${Number(m.cantidad)} × ${esc(m.insumo_nombre)}${m.usuario_nombre ? ' — ' + esc(m.usuario_nombre) : ''}</li>`).join('')}
            </ul>` : '<p class="dova-nota" style="margin:4px 0;">Sin materiales registrados.</p>'}
          ${puedeManage ? `<button class="dova-btn-link" data-reg-material="${origen}:${item.id}">+ Registrar material usado</button>` : ''}
        </div>`;
    }

    root.innerHTML = `
      <div class="dova-etapas-box">
        <div class="dova-toolbar">
          <h4 style="margin:0;">${esc(plan.nombre)} — ${completadas}/${(plan.etapas || []).length} etapas completadas</h4>
          ${puedePresupuestos ? (
            plan.presupuesto_id
              ? `<span class="dova-badge dova-badge-ok">Presupuesto #${plan.presupuesto_id} generado</span>`
              : `<button class="dova-btn-primary" data-generar-presupuesto="${plan.id}">Generar presupuesto</button>`
          ) : ''}
        </div>

        ${(plan.etapas || []).length ? `
        <h5>Etapas</h5>
        <ul class="dova-checklist">
          ${plan.etapas.map((e) => `
            <li class="${e.completada ? 'completada' : ''}">
              <span>${e.completada ? '✓' : '☐'} ${esc(e.nombre)}</span>
              ${!e.completada && puedeManage ? `<button class="dova-btn-link" data-completar-etapa="${plan.id}:${e.id}">Completar</button>` : ''}
              ${bloqueMateriales('etapa', e)}
            </li>
          `).join('')}
        </ul>` : ''}

        ${(plan.sesiones || []).length ? `
        <h5>Sesiones</h5>
        <ul class="dova-checklist">
          ${plan.sesiones.map((s) => `
            <li>
              <span>Sesión ${s.numero} — ${fmtFecha(s.fecha)}${s.procedimiento ? ' — ' + esc(s.procedimiento) : ''}</span>
              ${bloqueMateriales('sesion', s)}
            </li>
          `).join('')}
        </ul>` : ''}

        ${!(plan.etapas || []).length && !(plan.sesiones || []).length ? '<p class="dova-nota">Este plan todavía no tiene etapas ni sesiones registradas.</p>' : ''}
      </div>`;

    root.querySelectorAll('[data-completar-etapa]').forEach((b) => {
      b.addEventListener('click', async () => {
        const [pId, etapaId] = b.dataset.completarEtapa.split(':');
        await manejarError(() => DOVA.post(`/planes-tratamiento/${pId}/etapas/${etapaId}/completar`, {}));
        toast('Etapa completada', 'ok');
        renderPlanDetalle(root, planId);
      });
    });

    const btnGenerar = root.querySelector('[data-generar-presupuesto]');
    if (btnGenerar) {
      btnGenerar.addEventListener('click', async () => {
        try {
          await DOVA.post(`/planes-tratamiento/${btnGenerar.dataset.generarPresupuesto}/generar-presupuesto`, {});
          toast('Presupuesto generado a partir del plan', 'ok');
          renderPlanDetalle(root, planId);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    }

    root.querySelectorAll('[data-reg-material]').forEach((b) => {
      b.addEventListener('click', async () => {
        const [origen, itemId] = b.dataset.regMaterial.split(':');
        let insumos = [];
        try {
          insumos = await DOVA.get('/planes-tratamiento/insumos-disponibles');
        } catch (e) {
          toast('No se pudo cargar el inventario: ' + e.message, 'error');
          return;
        }
        if (!insumos.length) { toast('No hay insumos activos cargados en inventario', 'error'); return; }
        abrirModal(`
          <h3>Registrar material usado</h3>
          <form id="form-reg-material">
            <label>Insumo</label>
            <select id="rm-insumo">
              ${insumos.map((i) => `<option value="${i.id}">${esc(i.nombre)} (stock: ${Number(i.stock_actual)})</option>`).join('')}
            </select>
            <label>Cantidad</label>
            <input id="rm-cantidad" type="number" min="0.01" step="0.01" value="1" />
            <div class="dova-modal-acciones">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Registrar y descontar stock</button>
            </div>
          </form>
        `);
        document.getElementById('form-reg-material').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const insumoId = Number(document.getElementById('rm-insumo').value);
          const cantidad = Number(document.getElementById('rm-cantidad').value);
          try {
            const ruta = origen === 'etapa'
              ? `/planes-tratamiento/${planId}/etapas/${itemId}/materiales`
              : `/planes-tratamiento/${planId}/sesiones/${itemId}/materiales`;
            await DOVA.post(ruta, { insumoId, cantidad });
            toast('Material registrado, stock actualizado', 'ok');
            const modalRoot = document.getElementById('modal-root');
            if (modalRoot) modalRoot.innerHTML = '';
            renderPlanDetalle(root, planId);
          } catch (e) {
            toast(e.message, 'error');
          }
        });
      });
    });
  }

  async function vistaFichaPaciente(id) {
    const puedeFinanzas = DOVA.tieneAlguno('pagos.view', 'presupuestos.view', 'facturacion.ver', 'facturacion.ver_propias');
    const puedeHistorial = DOVA.tienePermiso('historia_clinica.view');
    const puedeOdontograma = DOVA.tienePermiso('odontograma.view');
    const puedePlanes = DOVA.tienePermiso('planes_tratamiento.view');
    const [paciente, planes, presupuestos, resumen, timeline, odontograma] = await Promise.all([
      manejarError(() => DOVA.get(`/pacientes/${id}`)),
      DOVA.tienePermiso('planes_tratamiento.view') ? manejarError(() => DOVA.get(`/planes-tratamiento/paciente/${id}`)).catch(() => []) : [],
      DOVA.tienePermiso('presupuestos.view') ? manejarError(() => DOVA.get(`/presupuestos/paciente/${id}`)).catch(() => []) : [],
      DOVA.tienePermiso('pagos.view') ? manejarError(() => DOVA.get(`/pagos/paciente/${id}/resumen`)).catch(() => null) : null,
      DOVA.tienePermiso('historia_clinica.view') ? manejarError(() => DOVA.get(`/historia-clinica/paciente/${id}/timeline`)).catch(() => []) : [],
      DOVA.tienePermiso('odontograma.view') ? manejarError(() => DOVA.get(`/odontograma/paciente/${id}`)).catch(() => []) : [],
    ]);

    const edad = calcularEdad(paciente.fecha_nacimiento);

    return `
      <button class="dova-btn-link" data-volver-pacientes>&larr; Volver a pacientes</button>
      <div class="dova-ficha-header">
        <div>
          <h2 class="dova-view-title">${esc(paciente.nombre)} ${esc(paciente.apellido)}</h2>
          <p class="dova-subtitulo">
            ${edad !== null ? edad + ' años · ' : ''}${esc(paciente.sexo || '')}
            ${paciente.sexo ? ' · ' : ''}C.I. ${esc(paciente.ci || '-')} · Tel. ${esc(paciente.telefono || '-')}
          </p>
        </div>
        <div class="dova-ficha-acciones">
          ${DOVA.tienePermiso('historia_clinica.edit') && paciente.activo !== false ? `<button class="dova-btn-primary" data-iniciar-consulta="${id}">Iniciar consulta</button>` : ''}
          ${DOVA.tienePermiso('pacientes.delete') && paciente.activo !== false ? `<button class="dova-btn-secundario dova-btn-peligro" data-eliminar-ficha="${id}" data-nombre="${esc(paciente.nombre)} ${esc(paciente.apellido)}">Eliminar paciente</button>` : ''}
        </div>
      </div>
      ${paciente.activo === false ? `<div class="dova-alerta-eliminado">Este paciente está <strong>eliminado</strong>. ${DOVA.tienePermiso('pacientes.delete') ? `<button class="dova-btn-link" data-restaurar-ficha="${id}">Restaurar</button>` : ''}</div>` : ''}

      ${alertasClinicasHtml(paciente)}

      <div class="dova-tabs" id="ficha-tabs">
        <button class="dova-tab activo" data-tab="resumen">Resumen</button>
        ${puedeHistorial ? '<button class="dova-tab" data-tab="historial">Historial clínico</button>' : ''}
        ${puedeOdontograma ? '<button class="dova-tab" data-tab="odontograma">Odontograma</button>' : ''}
        <button class="dova-tab" data-tab="documentacion">Consentimientos</button>
        ${puedeFinanzas ? '<button class="dova-tab" data-tab="administrativo">Pagos y presupuestos</button>' : ''}
        <button class="dova-tab" data-tab="agenda">Agenda</button>
      </div>

      <div class="dova-tab-panel" data-panel="resumen">
        ${resumen ? `
        <div class="dova-cards-grid">
          <div class="dova-card"><div class="dova-card-valor">${fmtGs(resumen.totalPresupuestado)}</div><div class="dova-card-label">Presupuestado</div></div>
          <div class="dova-card"><div class="dova-card-valor">${fmtGs(resumen.totalPagado)}</div><div class="dova-card-label">Pagado</div></div>
          <div class="dova-card dova-card-${resumen.saldoPendiente > 0 ? 'alerta' : 'ok'}"><div class="dova-card-valor">${fmtGs(resumen.saldoPendiente)}</div><div class="dova-card-label">Saldo pendiente</div></div>
        </div>` : ''}
        ${puedePlanes ? `
        <h3 class="dova-section-title">Planes de tratamiento</h3>
        <table class="dova-tabla">
          <thead><tr><th>Nombre</th><th>Progreso</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${(planes || []).map((p) => `
              <tr>
                <td>${esc(p.nombre)}</td><td>${p.sesiones_realizadas}/${p.sesiones_totales}</td><td>${esc(p.estado)}</td>
                <td><button class="dova-btn-link" data-ver-plan="${p.id}">Ver etapas</button></td>
              </tr>
            `).join('') || '<tr><td colspan="4">Este paciente todavía no tiene planes de tratamiento.</td></tr>'}
          </tbody>
        </table>
        <div id="plan-etapas-root"></div>` : ''}
      </div>

      <div class="dova-tab-panel" data-panel="historial" style="display:none;">
        <div class="dova-toolbar">
          <h3 class="dova-section-title" style="margin:0;">Línea de tiempo clínica</h3>
          ${DOVA.tienePermiso('historia_clinica.edit') ? `<button class="dova-btn-primary" data-nueva-evolucion="${id}">+ Nueva evolución</button>` : ''}
        </div>
        <div class="dova-timeline">
          ${(timeline || []).map((ev) => `
            <div class="dova-timeline-item">
              <div class="dova-timeline-icono">${(ICONOS_TIMELINE[ev.tipo] && DovaIcono(ICONOS_TIMELINE[ev.tipo], 14)) || '•'}</div>
              <div class="dova-timeline-contenido">
                <div class="dova-timeline-fecha">${fmtFecha(ev.fecha)} — ${LABELS_TIMELINE[ev.tipo] || ev.tipo}</div>
                <div class="dova-timeline-titulo">${esc(ev.titulo || 'Sin título')}</div>
                ${ev.subtitulo ? `<div class="dova-timeline-subtitulo">${esc(ev.subtitulo)}</div>` : ''}
              </div>
            </div>
          `).join('') || '<p class="dova-nota">Este paciente todavía no tiene eventos clínicos registrados.</p>'}
        </div>
      </div>

      <div class="dova-tab-panel" data-panel="odontograma" style="display:none;">
        <h3 class="dova-section-title">Odontograma</h3>
        <p class="dova-nota">Seleccioná una pieza para ver su expediente histórico completo.</p>
        <div class="dova-odontograma-grid">
          ${['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
             '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38']
            .map((p) => {
              const estado = (odontograma || []).find((o) => o.pieza === p);
              const clase = estado ? `pieza-${estado.estado}` : 'pieza-sano';
              return `<button class="dova-pieza ${clase}" data-ver-pieza="${p}" title="Pieza ${p}${estado ? ' — ' + estado.estado : ''}">${p}</button>`;
            }).join('')}
        </div>
        <div id="pieza-expediente-root"></div>
      </div>

      <div class="dova-tab-panel" data-panel="documentacion" style="display:none;">
        <p class="dova-nota">Fotos, estudios, consentimientos y recetas de este paciente aparecen en la línea de tiempo (pestaña Historial clínico) y pueden gestionarse desde el Modo Consulta.</p>
      </div>

      ${puedeFinanzas ? `
      <div class="dova-tab-panel" data-panel="administrativo" style="display:none;">
        <h3 class="dova-section-title">Presupuestos</h3>
        <table class="dova-tabla">
          <thead><tr><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${(presupuestos || []).map((p) => `
              <tr>
                <td>${fmtFecha(p.fecha)}</td><td>${fmtGs(p.total)}</td><td>${esc(p.estado)}</td>
                <td><button class="dova-btn-link" data-descargar-presupuesto="${p.id}">Descargar PDF</button></td>
              </tr>
            `).join('') || '<tr><td colspan="4">Sin presupuestos.</td></tr>'}
          </tbody>
        </table>
      </div>` : ''}

      <div class="dova-tab-panel" data-panel="agenda" style="display:none;">
        <p class="dova-nota">El historial de citas de este paciente se ve desde el módulo Agenda, filtrando por paciente.</p>
      </div>

      <div id="modal-root"></div>
    `;
  }

  function initFichaPaciente(pacienteId, volver, navegarAConsulta) {
    const btnVolver = document.querySelector('[data-volver-pacientes]');
    if (btnVolver) btnVolver.addEventListener('click', volver);

    document.querySelectorAll('[data-descargar-presupuesto]').forEach((btn) => {
      btn.addEventListener('click', () => DOVA.descargarPdf(`/comprobantes/presupuesto/${btn.dataset.descargarPresupuesto}`, `presupuesto-${btn.dataset.descargarPresupuesto}.pdf`));
    });

    const btnConsulta = document.querySelector('[data-iniciar-consulta]');
    if (btnConsulta) btnConsulta.addEventListener('click', () => navegarAConsulta(btnConsulta.dataset.iniciarConsulta));
    const btnEliminar = document.querySelector('[data-eliminar-ficha]');
    if (btnEliminar) btnEliminar.addEventListener('click', () => confirmarEliminarPaciente(btnEliminar.dataset.eliminarFicha, btnEliminar.dataset.nombre, volver));
    const btnRestaurar = document.querySelector('[data-restaurar-ficha]');
    if (btnRestaurar) btnRestaurar.addEventListener('click', async () => {
      btnRestaurar.disabled = true;
      try { await DOVA.post(`/pacientes/${btnRestaurar.dataset.restaurarFicha}/restaurar`, {}); toast('Paciente restaurado', 'ok'); location.reload(); } catch (e) { toast(e.message, 'error'); btnRestaurar.disabled = false; }
    });

    // Tabs
    document.querySelectorAll('.dova-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.dova-tab').forEach((t) => t.classList.remove('activo'));
        tab.classList.add('activo');
        document.querySelectorAll('.dova-tab-panel').forEach((p) => { p.style.display = 'none'; });
        const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
        if (panel) panel.style.display = '';
      });
    });

    // Ver expediente de pieza
    document.querySelectorAll('[data-ver-pieza]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pieza = btn.dataset.verPieza;
        const root = document.getElementById('pieza-expediente-root');
        root.innerHTML = '<div class="dova-cargando">Cargando expediente…</div>';
        try {
          const exp = await DOVA.get(`/odontograma/paciente/${pacienteId}/pieza/${pieza}/expediente`);
          root.innerHTML = `
            <div class="dova-expediente-pieza">
              <h4>Pieza ${esc(pieza)}</h4>
              ${exp.estadoActual.length ? exp.estadoActual.map((e) => `<p><strong>Estado actual:</strong> ${esc(e.estado)} ${e.tratamiento ? '— ' + esc(e.tratamiento) : ''}</p>`).join('') : '<p class="dova-nota">Sin estado registrado.</p>'}
              <div class="dova-cards-grid">
                <div class="dova-card"><div class="dova-card-valor">${exp.tratamientosPlanificados.length}</div><div class="dova-card-label">Planificados</div></div>
                <div class="dova-card dova-card-alerta"><div class="dova-card-valor">${exp.tratamientosEnCurso.length}</div><div class="dova-card-label">En curso</div></div>
                <div class="dova-card dova-card-ok"><div class="dova-card-valor">${exp.tratamientosTerminados.length}</div><div class="dova-card-label">Terminados</div></div>
              </div>
              ${exp.evoluciones.length ? `
              <h5>Evoluciones</h5>
              <ul class="dova-lista-simple">
                ${exp.evoluciones.map((e) => `<li>${fmtFecha(e.fecha)} — ${esc(e.diagnostico || e.procedimiento || 'Sin detalle')}${e.odontologo_nombre ? ' (' + esc(e.odontologo_nombre) + ')' : ''}</li>`).join('')}
              </ul>` : '<p class="dova-nota">Sin evoluciones registradas para esta pieza.</p>'}
            </div>`;
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">No se pudo cargar el expediente: ${esc(e.message)}</p>`;
        }
      });
    });

    // Ver etapas de un plan (Fase 5: incluye materiales consumidos y generación de presupuesto)
    document.querySelectorAll('[data-ver-plan]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const root = document.getElementById('plan-etapas-root');
        root.innerHTML = '<div class="dova-cargando">Cargando etapas…</div>';
        try {
          await renderPlanDetalle(root, btn.dataset.verPlan);
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });

    // Nueva evolución clínica
    const btnNuevaEv = document.querySelector('[data-nueva-evolucion]');
    if (btnNuevaEv) {
      btnNuevaEv.addEventListener('click', () => {
        abrirModal(`
          <h3>Nueva evolución clínica</h3>
          <form id="form-nueva-evolucion">
            <label>Motivo de consulta</label><input id="ev-motivo" />
            <label>Diagnóstico</label><textarea id="ev-diagnostico" rows="2"></textarea>
            <label>Procedimiento realizado</label><textarea id="ev-procedimiento" rows="2"></textarea>
            <label>Piezas involucradas (separadas por coma)</label><input id="ev-piezas" placeholder="16, 17" />
            <label>Anestesia</label><input id="ev-anestesia" />
            <label>Materiales</label><input id="ev-materiales" />
            <label>Medicación indicada</label><input id="ev-medicacion" />
            <label>Observaciones</label><textarea id="ev-observaciones" rows="2"></textarea>
            <label>Próxima acción</label><input id="ev-proxima-accion" />
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Guardar evolución</button>
            </div>
          </form>
        `);
        document.getElementById('form-nueva-evolucion').addEventListener('submit', async (e) => {
          e.preventDefault();
          const piezasRaw = document.getElementById('ev-piezas').value.trim();
          await manejarError(() => DOVA.post('/historia-clinica', {
            pacienteId: btnNuevaEv.dataset.nuevaEvolucion,
            motivoConsulta: document.getElementById('ev-motivo').value || undefined,
            diagnostico: document.getElementById('ev-diagnostico').value || undefined,
            procedimiento: document.getElementById('ev-procedimiento').value || undefined,
            piezas: piezasRaw ? piezasRaw.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
            anestesia: document.getElementById('ev-anestesia').value || undefined,
            materiales: document.getElementById('ev-materiales').value || undefined,
            medicacion: document.getElementById('ev-medicacion').value || undefined,
            observaciones: document.getElementById('ev-observaciones').value || undefined,
            proximaAccion: document.getElementById('ev-proxima-accion').value || undefined,
          }));
          toast('Evolución registrada', 'ok');
          location.reload();
        });
      });
    }
  }

  // ---------------- AGENDA ----------------
  async function vistaAgenda() {
    const hoy = new Date().toISOString().slice(0, 10);
    const turnos = await manejarError(() => DOVA.get(`/agenda?desde=${hoy}&hasta=${hoy}`)).catch(() => []);
    return `
      <h2 class="dova-view-title">Agenda de hoy</h2>
      <table class="dova-tabla">
        <thead><tr><th></th><th>Hora</th><th>Paciente</th><th>Odontólogo</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${(turnos || []).map((t) => `
            <tr class="dova-fila-turno" data-fila-turno="${t.id}">
              <td><button class="dova-btn-link" data-expandir-turno="${t.id}">▸</button></td>
              <td>${t.hora_inicio}</td><td>${esc(t.paciente_nombre || '')}</td><td>${esc(t.odontologo_nombre || '')}</td><td>${esc(t.estado)}</td>
              <td>
                <button class="dova-btn-link" data-ver-paciente-agenda="${t.paciente_id}">Ver ficha</button>
                ${DOVA.tienePermiso('historia_clinica.edit') ? `· <button class="dova-btn-link" data-iniciar-consulta-agenda="${t.paciente_id}">Iniciar consulta</button>` : ''}
              </td>
            </tr>
            <tr class="dova-fila-contexto" data-contexto-turno="${t.id}" style="display:none;"><td colspan="6"></td></tr>
          `).join('') || '<tr><td colspan="6">Sin turnos para hoy.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderContextoClinicoTurno(ctx) {
    const alertas = [];
    if (ctx.alertas.alergias) alertas.push(`<div class="dova-alerta-clinica"><strong>Alergias:</strong> ${esc(ctx.alertas.alergias)}</div>`);
    if (ctx.alertas.medicamentos) alertas.push(`<div class="dova-alerta-clinica"><strong>Medicación:</strong> ${esc(ctx.alertas.medicamentos)}</div>`);
    if (ctx.alertas.antecedentesMedicos) alertas.push(`<div class="dova-alerta-clinica"><strong>Antecedentes:</strong> ${esc(ctx.alertas.antecedentesMedicos)}</div>`);

    return `
      <div class="dova-contexto-clinico">
        ${alertas.length ? `<div class="dova-alertas-clinicas">${alertas.join('')}</div>` : ''}
        <div class="dova-contexto-grid">
          <div>
            <strong>Última evolución</strong>
            <p class="dova-nota">${ctx.ultimaEvolucion ? `${fmtFecha(ctx.ultimaEvolucion.fecha)} — ${esc(ctx.ultimaEvolucion.procedimiento || ctx.ultimaEvolucion.diagnostico || 'Sin detalle')}` : 'Sin evoluciones registradas.'}</p>
          </div>
          <div>
            <strong>Tratamientos activos</strong>
            <p class="dova-nota">${ctx.tratamientosActivos.length ? ctx.tratamientosActivos.map((t) => esc(t.nombre)).join(', ') : 'Sin tratamientos activos.'}</p>
          </div>
          <div>
            <strong>Próxima acción</strong>
            <p class="dova-nota">${ctx.proximaAccion ? esc(ctx.proximaAccion) : 'No especificada.'}</p>
          </div>
          ${ctx.presupuestos !== null ? `
          <div>
            <strong>Presupuestos</strong>
            <p class="dova-nota">${ctx.presupuestos.length ? ctx.presupuestos.map((p) => `${fmtGs(p.total)} (${esc(p.estado)})`).join(', ') : 'Sin presupuestos.'}</p>
          </div>` : ''}
          ${ctx.saldoPendiente !== null ? `
          <div>
            <strong>Saldo pendiente</strong>
            <p class="dova-nota ${ctx.saldoPendiente > 0 ? 'dova-nota-alerta' : ''}">${fmtGs(ctx.saldoPendiente)}</p>
          </div>` : ''}
        </div>
      </div>`;
  }

  function initAgenda(navegarAFicha, navegarAConsulta) {
    document.querySelectorAll('[data-ver-paciente-agenda]').forEach((btn) => {
      btn.addEventListener('click', () => navegarAFicha(btn.dataset.verPacienteAgenda));
    });
    document.querySelectorAll('[data-iniciar-consulta-agenda]').forEach((btn) => {
      btn.addEventListener('click', () => navegarAConsulta(btn.dataset.iniciarConsultaAgenda));
    });
    document.querySelectorAll('[data-expandir-turno]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const turnoId = btn.dataset.expandirTurno;
        const fila = document.querySelector(`[data-contexto-turno="${turnoId}"]`);
        if (!fila) return;
        const abierto = fila.style.display !== 'none';
        if (abierto) { fila.style.display = 'none'; btn.textContent = '▸'; return; }
        btn.textContent = '▾';
        fila.style.display = '';
        const celda = fila.querySelector('td');
        celda.innerHTML = '<div class="dova-cargando">Cargando contexto clínico…</div>';
        try {
          const ctx = await DOVA.get(`/agenda/${turnoId}/contexto-clinico`);
          celda.innerHTML = renderContextoClinicoTurno(ctx);
        } catch (e) {
          celda.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });
  }

  // ---------------- INVENTARIO ----------------
  async function vistaInventario() {
    const insumos = await manejarError(() => DOVA.get('/inventario/insumos'));
    return `
      <h2 class="dova-view-title">Inventario</h2>
      <table class="dova-tabla">
        <thead><tr><th>Insumo</th><th>Stock</th><th>Mínimo</th><th>Estado</th></tr></thead>
        <tbody>
          ${insumos.map((i) => `
            <tr class="${Number(i.stock_actual) <= Number(i.stock_minimo) ? 'dova-fila-alerta' : ''}">
              <td>${esc(i.nombre)}</td><td>${i.stock_actual}</td><td>${i.stock_minimo}</td>
              <td>${Number(i.stock_actual) <= Number(i.stock_minimo) ? 'Insumos por acabarse' : 'OK'}</td>
            </tr>`).join('') || '<tr><td colspan="4">Sin insumos registrados.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  // ---------------- HELPDESK ----------------
  async function vistaHelpdesk() {
    const tickets = await manejarError(() => DOVA.get('/helpdesk'));
    return `
      <h2 class="dova-view-title">Ayuda técnica</h2>
      <div class="dova-toolbar">
        <button id="btn-nuevo-ticket" class="dova-btn-primary">+ Pedir ayuda</button>
      </div>
      <table class="dova-tabla">
        <thead><tr><th>Título</th><th>Categoría</th><th>Estado</th></tr></thead>
        <tbody>
          ${tickets.map((t) => `<tr><td>${esc(t.titulo)}</td><td>${esc(DovaExt.etiqueta(t.categoria || ''))}</td><td>${esc(DovaExt.etiqueta(t.estado || ''))}</td></tr>`).join('') || '<tr><td colspan="3">No hay pedidos de ayuda.</td></tr>'}
        </tbody>
      </table>
      <div id="modal-root"></div>
    `;
  }
  function initHelpdesk() {
    document.getElementById('btn-nuevo-ticket').addEventListener('click', () => {
      abrirModal(`
        <h3>Pedir ayuda técnica</h3>
        <form id="form-nuevo-ticket">
          <label>Título</label><input required id="nt-titulo" />
          <label>Categoría</label>
          <select id="nt-categoria">
            <option value="error">Error</option>
            <option value="mejora">Pedido de nueva función</option>
            <option value="otro">Otro</option>
          </select>
          <label>Descripción</label><textarea required id="nt-descripcion" rows="4"></textarea>
          <div class="dova-modal-actions">
            <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
            <button type="submit" class="dova-btn-primary">Enviar pedido</button>
          </div>
        </form>
      `);
      document.getElementById('form-nuevo-ticket').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.post('/helpdesk', {
          titulo: document.getElementById('nt-titulo').value,
          categoria: document.getElementById('nt-categoria').value,
          descripcion: document.getElementById('nt-descripcion').value,
        }));
        toast('Pedido de ayuda enviado', 'ok');
        location.reload();
      });
    });
  }

  // ---------------- MODO CONSULTA ----------------
  // Interfaz clínica centralizada para atender a un paciente (sección 3-4
  // del prompt maestro): info + alertas arriba, accesos rápidos contextuales
  // abajo, sin tener que volver al menú principal.
  async function vistaModoConsulta(pacienteId) {
    const [paciente, planes, proximaCita] = await Promise.all([
      manejarError(() => DOVA.get(`/pacientes/${pacienteId}`)),
      DOVA.tienePermiso('planes_tratamiento.view') ? manejarError(() => DOVA.get(`/planes-tratamiento/paciente/${pacienteId}`)).catch(() => []) : [],
      DOVA.tienePermiso('agenda.view') ? manejarError(() => DOVA.get(`/agenda?desde=${new Date().toISOString().slice(0, 10)}&hasta=2100-01-01`)).catch(() => []) : [],
    ]);
    const edad = calcularEdad(paciente.fecha_nacimiento);
    const enCurso = (planes || []).filter((p) => p.estado === 'en_proceso');

    const acciones = [
      { accion: 'evolucion', icono: 'evolucion', label: 'Nueva evolución', permiso: 'historia_clinica.edit' },
      { accion: 'odontograma', icono: 'diente', label: 'Odontograma', permiso: 'odontograma.edit' },
      { accion: 'tratamiento', icono: 'lista', label: 'Tratamiento', permiso: 'planes_tratamiento.manage' },
      { accion: 'foto', icono: 'camara', label: 'Foto clínica', permiso: 'fotos_clinicas.manage' },
      { accion: 'estudio', icono: 'estudio', label: 'Estudio', permiso: 'estudios.manage' },
      { accion: 'receta', icono: 'medicamento', label: 'Receta', permiso: 'recetas.manage' },
      { accion: 'consentimiento', icono: 'firma', label: 'Consentimiento', permiso: 'consentimientos.manage' },
      { accion: 'control-postop', icono: 'curacion', label: 'Control postoperatorio', permiso: 'controles_postoperatorios.manage' },
      { accion: 'derivar', icono: 'flecha', label: 'Derivar paciente', permiso: 'derivaciones.manage' },
      { accion: 'proxima-cita', icono: 'calendario', label: 'Próxima cita', permiso: null },
      { accion: 'ficha', icono: 'persona', label: 'Ver ficha completa', permiso: null },
    ].filter((a) => !a.permiso || DOVA.tienePermiso(a.permiso));

    return `
      <button class="dova-btn-link" data-volver-ficha="${pacienteId}">&larr; Salir del modo consulta</button>

      <div class="dova-consulta-header">
        <div>
          <h2 class="dova-view-title">Consulta — ${esc(paciente.nombre)} ${esc(paciente.apellido)}</h2>
          <p class="dova-subtitulo">${edad !== null ? edad + ' años · ' : ''}Tel. ${esc(paciente.telefono || '-')}</p>
          ${enCurso.length ? `<p class="dova-nota">Tratamiento en curso: ${enCurso.map((p) => esc(p.nombre)).join(', ')}</p>` : ''}
        </div>
      </div>

      ${alertasClinicasHtml(paciente)}

      <h3 class="dova-section-title">Acciones rápidas</h3>
      <div class="dova-consulta-acciones">
        ${acciones.map((a) => `<button class="dova-consulta-accion" data-accion-consulta="${a.accion}">${DovaIcono(a.icono, 20)}<br>${esc(a.label)}</button>`).join('')}
      </div>

      <div id="consulta-panel-root"></div>
      <div id="modal-root"></div>
    `;
  }

  function initModoConsulta(pacienteId, navegarAFicha) {
    const btnVolver = document.querySelector('[data-volver-ficha]');
    if (btnVolver) btnVolver.addEventListener('click', () => navegarAFicha(pacienteId));

    const panelRoot = document.getElementById('consulta-panel-root');

    document.querySelectorAll('[data-accion-consulta]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const accion = btn.dataset.accionConsulta;
        if (accion === 'ficha') { navegarAFicha(pacienteId); return; }
        panelRoot.innerHTML = '<div class="dova-cargando">Cargando…</div>';
        try {
          panelRoot.innerHTML = await renderPanelConsulta(accion, pacienteId);
          initPanelConsulta(accion, pacienteId);
        } catch (e) {
          panelRoot.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });
  }

  // Campos del form de evolución que una plantilla clínica puede rellenar
  // por nombre (sección 7 del prompt: plantillas configurables, sin IA —
  // solo autocompletan texto predefinido, el odontólogo siempre edita).
  const CAMPOS_EVOLUCION_PLANTILLA = {
    motivo: 'cev-motivo', diagnostico: 'cev-diagnostico', procedimiento: 'cev-procedimiento',
    anestesia: 'cev-anestesia', materiales: 'cev-materiales', medicacion: 'cev-medicacion',
    indicaciones: 'cev-indicaciones', complicaciones: 'cev-complicaciones', proximaAccion: 'cev-proxima-accion',
  };

  async function renderPanelConsulta(accion, pacienteId) {
    if (accion === 'evolucion') {
      const plantillas = await DOVA.get('/plantillas-clinicas').catch(() => []);
      return `
        <div class="dova-etapas-box">
          <h4>Nueva evolución clínica</h4>
          ${plantillas.length ? `
            <label>Plantilla clínica (opcional)</label>
            <select id="cev-plantilla">
              <option value="">— Sin plantilla —</option>
              ${plantillas.map((p) => `<option value="${p.id}">${esc(p.nombre)}${p.categoria ? ' — ' + esc(p.categoria) : ''}</option>`).join('')}
            </select>
          ` : ''}
          <form id="form-consulta-evolucion">
            <label>Motivo de consulta</label><input id="cev-motivo" />
            <label>Diagnóstico</label><textarea id="cev-diagnostico" rows="2"></textarea>
            <label>Procedimiento realizado</label><textarea id="cev-procedimiento" rows="2"></textarea>
            <label>Piezas involucradas (separadas por coma)</label><input id="cev-piezas" placeholder="16, 17" />
            <label>Anestesia</label><input id="cev-anestesia" />
            <label>Materiales</label><input id="cev-materiales" />
            <label>Indicaciones</label><textarea id="cev-indicaciones" rows="2"></textarea>
            <label>Medicación indicada</label><input id="cev-medicacion" />
            <label>Complicaciones</label><input id="cev-complicaciones" />
            <label>Próxima acción</label><input id="cev-proxima-accion" />
            <button type="submit" class="dova-btn-primary">Guardar evolución</button>
          </form>
        </div>`;
    }
    if (accion === 'odontograma') {
      const piezas = await DOVA.get(`/odontograma/paciente/${pacienteId}`);
      return `
        <div class="dova-etapas-box">
          <h4>Actualizar odontograma</h4>
          <form id="form-consulta-odontograma">
            <label>Pieza (FDI)</label><input id="cod-pieza" required placeholder="26" />
            <label>Estado</label>
            <select id="cod-estado">
              <option value="sano">Sano</option><option value="caries">Caries</option>
              <option value="restauracion">Restauración</option><option value="corona">Corona</option>
              <option value="endodoncia">Endodoncia</option><option value="extraccion_indicada">Extracción indicada</option>
              <option value="ausente">Ausente</option><option value="tratamiento_realizado">Tratamiento realizado</option>
            </select>
            <label>Observación</label><input id="cod-observacion" />
            <button type="submit" class="dova-btn-primary">Guardar</button>
          </form>
          <p class="dova-nota">Piezas ya registradas: ${piezas.map((p) => esc(p.pieza + ':' + p.estado)).join(', ') || 'ninguna'}</p>
        </div>`;
    }
    if (accion === 'foto') {
      return `
        <div class="dova-etapas-box">
          <h4>Subir foto clínica</h4>
          <form id="form-consulta-foto">
            <label>Categoría</label>
            <select id="cf-categoria">
              <option value="frontal">Frontal</option><option value="lateral">Lateral</option>
              <option value="intraoral">Intraoral</option><option value="oclusal">Oclusal</option>
              <option value="antes">Antes</option><option value="durante">Durante</option><option value="despues">Después</option>
            </select>
            <label>Pieza (opcional)</label><input id="cf-pieza" />
            <label>Archivo</label><input id="cf-archivo" type="file" accept="image/*" required />
            <label>Observación</label><input id="cf-observacion" />
            <button type="submit" class="dova-btn-primary">Subir foto</button>
          </form>
        </div>`;
    }
    if (accion === 'estudio') {
      return `
        <div class="dova-etapas-box">
          <h4>Nuevo estudio</h4>
          <form id="form-consulta-estudio">
            <label>Tipo</label>
            <select id="ce-tipo">
              <option value="panoramica">Panorámica</option><option value="periapical">Periapical</option>
              <option value="bitewing">Bitewing</option><option value="tomografia">Tomografía</option><option value="otro">Otro</option>
            </select>
            <label>Pieza (opcional)</label><input id="ce-pieza" />
            <label>Descripción</label><input id="ce-descripcion" />
            <label>Archivo</label><input id="ce-archivo" type="file" accept="image/*,.pdf" />
            <button type="submit" class="dova-btn-primary">Guardar estudio</button>
          </form>
        </div>`;
    }
    if (accion === 'receta') {
      return `
        <div class="dova-etapas-box">
          <h4>Nueva receta</h4>
          <form id="form-consulta-receta">
            <label>Indicaciones generales</label><textarea id="cr-indicaciones" rows="2"></textarea>
            <label>Medicamento</label><input id="cr-medicamento" required />
            <label>Concentración</label><input id="cr-concentracion" placeholder="500mg" />
            <label>Dosis</label><input id="cr-dosis" placeholder="1 comprimido" />
            <label>Frecuencia</label><input id="cr-frecuencia" placeholder="cada 8hs" />
            <label>Duración</label><input id="cr-duracion" placeholder="7 días" />
            <button type="submit" class="dova-btn-primary">Guardar receta</button>
          </form>
        </div>`;
    }
    if (accion === 'consentimiento') {
      const plantillas = await DOVA.get('/clinico/consentimientos/plantillas');
      return `
        <div class="dova-etapas-box">
          <h4>Nuevo consentimiento informado</h4>
          <form id="form-consulta-consentimiento">
            <label>Procedimiento</label><input id="cc-procedimiento" required />
            <label>Plantilla</label>
            <select id="cc-plantilla">
              ${plantillas.map((p) => `<option value="${p.codigo}">${esc(p.codigo)}</option>`).join('')}
            </select>
            <button type="submit" class="dova-btn-primary">Generar consentimiento</button>
          </form>
        </div>`;
    }
    if (accion === 'tratamiento') {
      return `
        <div class="dova-etapas-box">
          <h4>Nuevo plan de tratamiento</h4>
          <form id="form-consulta-tratamiento">
            <label>Nombre</label><input id="ct-nombre" required placeholder="Endodoncia pieza 26" />
            <label>Pieza (opcional)</label><input id="ct-pieza" />
            <label>Diagnóstico</label><input id="ct-diagnostico" />
            <label>Sesiones totales</label><input id="ct-sesiones" type="number" min="1" value="1" />
            <button type="submit" class="dova-btn-primary">Crear plan</button>
          </form>
        </div>`;
    }
    if (accion === 'control-postop') {
      return `
        <div class="dova-etapas-box">
          <h4>Programar control postoperatorio</h4>
          <form id="form-consulta-control">
            <label>Fecha del procedimiento</label><input id="ccp-fecha-proc" type="date" value="${new Date().toISOString().slice(0, 10)}" />
            <label>Fecha del control</label><input id="ccp-fecha-control" type="date" required />
            <label>Observaciones</label><input id="ccp-observaciones" placeholder="Ej: control post extracción pieza 26" />
            <button type="submit" class="dova-btn-primary">Programar control</button>
          </form>
        </div>`;
    }
    if (accion === 'derivar') {
      const odontologos = await DOVA.get('/odontologos');
      return `
        <div class="dova-etapas-box">
          <h4>Derivar paciente</h4>
          <form id="form-consulta-derivar">
            <label>Odontólogo destino</label>
            <select id="cd-destino" required>
              ${odontologos.map((o) => `<option value="${o.id}">${esc(o.nombre)}${o.especialidad ? ' — ' + esc(o.especialidad) : ''}</option>`).join('')}
            </select>
            <label>Especialidad requerida</label><input id="cd-especialidad" placeholder="Ej: Endodoncia" />
            <label>Motivo</label><textarea id="cd-motivo" rows="2" required></textarea>
            <label>Observaciones</label><input id="cd-observaciones" />
            <label>Archivo adjunto (opcional)</label><input id="cd-archivo" type="file" accept="image/*,.pdf" />
            <button type="submit" class="dova-btn-primary">Derivar</button>
          </form>
        </div>`;
    }
    if (accion === 'proxima-cita') {
      return `
        <div class="dova-etapas-box">
          <h4>Programar próxima cita</h4>
          <p class="dova-nota">La programación de citas se gestiona desde el módulo Agenda. Volvé a la ficha del paciente y accedé a Agenda para reservar el turno.</p>
        </div>`;
    }
    return '<p class="dova-nota">Acción no reconocida.</p>';
  }

  function initPanelConsulta(accion, pacienteId) {
    if (accion === 'evolucion') {
      const selPlantilla = document.getElementById('cev-plantilla');
      if (selPlantilla) {
        selPlantilla.addEventListener('change', async () => {
          if (!selPlantilla.value) return;
          const plantilla = await manejarError(() => DOVA.get(`/plantillas-clinicas/${selPlantilla.value}`));
          // Autocompleta solo los campos vacíos: nunca pisa lo que el
          // odontólogo ya escribió, y siempre queda editable antes de guardar.
          (plantilla.campos || []).forEach((c) => {
            const inputId = CAMPOS_EVOLUCION_PLANTILLA[c.campo];
            const el = inputId ? document.getElementById(inputId) : null;
            if (el && !el.value) el.value = c.label ? `[${c.label}] ` : '';
          });
        });
      }
      document.getElementById('form-consulta-evolucion').addEventListener('submit', async (e) => {
        e.preventDefault();
        const piezasRaw = document.getElementById('cev-piezas').value.trim();
        await manejarError(() => DOVA.post('/historia-clinica', {
          pacienteId,
          motivoConsulta: document.getElementById('cev-motivo').value || undefined,
          diagnostico: document.getElementById('cev-diagnostico').value || undefined,
          procedimiento: document.getElementById('cev-procedimiento').value || undefined,
          piezas: piezasRaw ? piezasRaw.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
          anestesia: document.getElementById('cev-anestesia').value || undefined,
          materiales: document.getElementById('cev-materiales').value || undefined,
          indicaciones: document.getElementById('cev-indicaciones').value || undefined,
          medicacion: document.getElementById('cev-medicacion').value || undefined,
          complicaciones: document.getElementById('cev-complicaciones').value || undefined,
          proximaAccion: document.getElementById('cev-proxima-accion').value || undefined,
        }));
        toast('Evolución guardada', 'ok');
      });
    }
    if (accion === 'odontograma') {
      document.getElementById('form-consulta-odontograma').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.put(`/odontograma/paciente/${pacienteId}`, {
          pieza: document.getElementById('cod-pieza').value,
          estado: document.getElementById('cod-estado').value,
          observacion: document.getElementById('cod-observacion').value || undefined,
        }));
        toast('Odontograma actualizado', 'ok');
      });
    }
    if (accion === 'foto') {
      document.getElementById('form-consulta-foto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const archivo = document.getElementById('cf-archivo').files[0];
        if (!archivo) { toast('Seleccioná un archivo', 'error'); return; }
        const fd = new FormData();
        fd.append('pacienteId', pacienteId);
        fd.append('categoria', document.getElementById('cf-categoria').value);
        if (document.getElementById('cf-pieza').value) fd.append('pieza', document.getElementById('cf-pieza').value);
        if (document.getElementById('cf-observacion').value) fd.append('observacion', document.getElementById('cf-observacion').value);
        fd.append('archivo', archivo);
        await manejarError(() => DOVA.postForm('/clinico/fotos', fd));
        toast('Foto subida', 'ok');
      });
    }
    if (accion === 'estudio') {
      document.getElementById('form-consulta-estudio').addEventListener('submit', async (e) => {
        e.preventDefault();
        const archivo = document.getElementById('ce-archivo').files[0];
        const fd = new FormData();
        fd.append('pacienteId', pacienteId);
        fd.append('tipo', document.getElementById('ce-tipo').value);
        if (document.getElementById('ce-pieza').value) fd.append('pieza', document.getElementById('ce-pieza').value);
        if (document.getElementById('ce-descripcion').value) fd.append('descripcion', document.getElementById('ce-descripcion').value);
        if (archivo) fd.append('archivo', archivo);
        await manejarError(() => DOVA.postForm('/clinico/estudios', fd));
        toast('Estudio guardado', 'ok');
      });
    }
    if (accion === 'receta') {
      // Si cambia el medicamento después de una advertencia, se vuelve a verificar.
      document.getElementById('cr-medicamento').addEventListener('input', () => {
        const f = document.getElementById('form-consulta-receta');
        delete f.dataset.confirmado;
        const b = f.querySelector('[data-advertencias-receta]'); if (b) b.remove();
      });
      document.getElementById('form-consulta-receta').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        // Seguimiento integral: antes de emitir, se verifican alergias,
        // reacción cruzada, medicación actual y condiciones del paciente. Si
        // hay advertencias, el odontólogo las ve y confirma ("Emitir igual").
        const medicamento = document.getElementById('cr-medicamento').value;
        if (form.dataset.confirmado !== '1' && DOVA.tieneAlguno('salud.view', 'salud.edit', 'recetas.manage')) {
          try {
            const v = await DOVA.post('/salud/verificar-medicamentos', { pacienteId: Number(pacienteId), medicamentos: [medicamento] });
            const importantes = v.advertencias.filter((a) => a.nivel !== 'info');
            if (importantes.length) {
              let box = form.querySelector('[data-advertencias-receta]');
              if (!box) { box = document.createElement('div'); box.dataset.advertenciasReceta = '1'; form.appendChild(box); }
              box.innerHTML = `<div class="dova-ext-alertas-medicas" role="alert"><strong>Revisá antes de emitir:</strong><ul class="dova-ext-alertas-lista">${importantes.map((a) => `<li><strong>${esc(a.nivel === 'critica' ? 'Crítica' : 'Atención')}:</strong> ${esc(a.mensaje)}</li>`).join('')}</ul>
                <button type="submit" class="dova-btn-primary">Emitir igual</button> <span class="dova-nota">${esc(v.aviso)}</span></div>`;
              form.dataset.confirmado = '1';
              return;
            }
          } catch (_err) { /* si la verificación falla, no bloquea la receta */ }
        }
        delete form.dataset.confirmado;
        const box = form.querySelector('[data-advertencias-receta]'); if (box) box.remove();
        await manejarError(() => DOVA.post('/clinico/recetas', {
          pacienteId,
          indicaciones: document.getElementById('cr-indicaciones').value || undefined,
          items: [{
            medicamento: document.getElementById('cr-medicamento').value,
            concentracion: document.getElementById('cr-concentracion').value || undefined,
            dosis: document.getElementById('cr-dosis').value || undefined,
            frecuencia: document.getElementById('cr-frecuencia').value || undefined,
            duracion: document.getElementById('cr-duracion').value || undefined,
          }],
        }));
        toast('Receta guardada', 'ok');
      });
    }
    if (accion === 'consentimiento') {
      document.getElementById('form-consulta-consentimiento').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.post('/clinico/consentimientos', {
          pacienteId,
          procedimiento: document.getElementById('cc-procedimiento').value,
          plantilla: document.getElementById('cc-plantilla').value,
        }));
        toast('Consentimiento generado', 'ok');
      });
    }
    if (accion === 'tratamiento') {
      document.getElementById('form-consulta-tratamiento').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.post('/planes-tratamiento', {
          pacienteId,
          nombre: document.getElementById('ct-nombre').value,
          pieza: document.getElementById('ct-pieza').value || undefined,
          diagnostico: document.getElementById('ct-diagnostico').value || undefined,
          sesionesTotales: Number(document.getElementById('ct-sesiones').value) || 1,
        }));
        toast('Plan de tratamiento creado', 'ok');
      });
    }
    if (accion === 'control-postop') {
      document.getElementById('form-consulta-control').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.post('/controles-postoperatorios', {
          pacienteId,
          fechaProcedimiento: document.getElementById('ccp-fecha-proc').value || undefined,
          fechaControlProgramada: document.getElementById('ccp-fecha-control').value,
          observaciones: document.getElementById('ccp-observaciones').value || undefined,
        }));
        toast('Control postoperatorio programado', 'ok');
      });
    }
    if (accion === 'derivar') {
      document.getElementById('form-consulta-derivar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const archivo = document.getElementById('cd-archivo').files[0];
        const fd = new FormData();
        fd.append('pacienteId', pacienteId);
        fd.append('odontologoDestinoId', document.getElementById('cd-destino').value);
        if (document.getElementById('cd-especialidad').value) fd.append('especialidad', document.getElementById('cd-especialidad').value);
        fd.append('motivo', document.getElementById('cd-motivo').value);
        if (document.getElementById('cd-observaciones').value) fd.append('observaciones', document.getElementById('cd-observaciones').value);
        if (archivo) fd.append('archivo', archivo);
        await manejarError(() => DOVA.postForm('/derivaciones', fd));
        toast('Paciente derivado', 'ok');
      });
    }
  }

  // ---------------- ADMINISTRACIÓN: USUARIOS Y ROLES ----------------
  // Sección 29/30/31/32 del prompt: rol personalizado con checkboxes por
  // módulo, excepciones (overrides) por usuario, todo auditado en el
  // backend, con las protecciones administrativas ya aplicadas server-side.
  async function vistaUsuariosAdmin() {
    const [usuarios, roles] = await Promise.all([
      manejarError(() => DOVA.get('/usuarios?pageSize=200')),
      manejarError(() => DOVA.get('/usuarios/roles')),
    ]);
    const items = usuarios.data || usuarios.items || usuarios;
    return `
      <h2 class="dova-view-title">Usuarios y roles</h2>
      <div class="dova-tabs" id="admin-tabs">
        <button class="dova-tab activo" data-tab="usuarios">Usuarios</button>
        <button class="dova-tab" data-tab="roles">Roles y permisos</button>
      </div>

      <div class="dova-tab-panel" data-panel="usuarios">
        <div class="dova-toolbar">
          ${DOVA.tienePermiso('usuarios.manage') ? '<button id="btn-nuevo-usuario" class="dova-btn-primary">+ Nuevo usuario</button>' : ''}
        </div>
        <table class="dova-tabla">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Odontólogo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${items.map((u) => `
              <tr>
                <td>${esc(u.nombre)}</td><td>${esc(u.username)}</td><td>${esc(u.rol_nombre)}</td>
                <td>${u.odontologo_nombre ? esc(u.odontologo_nombre) : '<span class="dova-nota">Sin vincular</span>'}</td>
                <td>${u.activo ? 'Activo' : 'Inactivo'}${u.es_admin_protegido ? ' · Admin protegido' : ''}</td>
                <td class="dova-ext-acciones"><button class="dova-btn-link" data-ver-usuario="${u.id}">Permisos</button>${DOVA.tienePermiso('usuarios.manage') ? ` <button class="dova-btn-link" data-vincular-odo="${u.id}">${u.odontologo_id ? 'Cambiar odontólogo' : 'Vincular odontólogo'}</button>` : ''}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">Sin usuarios.</td></tr>'}
          </tbody>
        </table>
        <div id="usuario-detalle-root"></div>
      </div>

      <div class="dova-tab-panel" data-panel="roles" style="display:none;">
        <div class="dova-toolbar">
          ${DOVA.tienePermiso('roles.manage') ? '<button id="btn-nuevo-rol" class="dova-btn-primary">+ Nuevo rol</button>' : ''}
        </div>
        <table class="dova-tabla">
          <thead><tr><th>Rol</th><th>Código</th><th>Tipo</th><th></th></tr></thead>
          <tbody>
            ${roles.map((r) => `
              <tr>
                <td>${esc(r.nombre)}</td><td>${esc(r.codigo)}</td><td>${r.es_sistema ? 'Sistema' : 'Personalizado'}</td>
                <td><button class="dova-btn-link" data-editar-rol="${r.id}">${r.codigo === 'admin' ? 'Ver' : 'Editar permisos'}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div id="rol-detalle-root"></div>
      </div>
      <div id="modal-root"></div>
    `;
  }

  function agruparPermisosPorModulo(permisos) {
    const grupos = {};
    permisos.forEach((p) => {
      if (!grupos[p.modulo]) grupos[p.modulo] = [];
      grupos[p.modulo].push(p);
    });
    return grupos;
  }

  function checkboxesPermisos(todosLosPermisos, codigosActivos, prefix) {
    const grupos = agruparPermisosPorModulo(todosLosPermisos);
    return `
      <input type="text" id="${prefix}-buscar-permiso" placeholder="Buscar permiso..." class="dova-input-buscar" style="max-width:100%;" />
      <div class="dova-toolbar">
        <button type="button" class="dova-btn-secundario" id="${prefix}-marcar-todos">Marcar todos</button>
        <button type="button" class="dova-btn-secundario" id="${prefix}-desmarcar-todos">Desmarcar todos</button>
      </div>
      <div id="${prefix}-permisos-grupos">
        ${Object.keys(grupos).sort().map((modulo) => `
          <div class="dova-permiso-modulo" data-modulo-grupo="${esc(modulo)}">
            <div class="dova-permiso-modulo-header">
              <strong>${esc(modulo)}</strong>
              <button type="button" class="dova-btn-link" data-marcar-modulo="${esc(modulo)}">todos</button>
              · <button type="button" class="dova-btn-link" data-desmarcar-modulo="${esc(modulo)}">ninguno</button>
            </div>
            ${grupos[modulo].map((p) => `
              <label class="dova-permiso-item" data-permiso-label="${esc(p.codigo)} ${esc(p.descripcion)}">
                <input type="checkbox" class="${prefix}-check-permiso" value="${esc(p.codigo)}" data-modulo="${esc(modulo)}" ${codigosActivos.includes(p.codigo) ? 'checked' : ''} />
                ${esc(p.descripcion)} <span class="dova-nota">(${esc(p.codigo)})</span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  function initCheckboxesPermisos(prefix) {
    const buscar = document.getElementById(`${prefix}-buscar-permiso`);
    if (buscar) {
      buscar.addEventListener('input', () => {
        const q = buscar.value.trim().toLowerCase();
        document.querySelectorAll(`[data-permiso-label]`).forEach((label) => {
          const texto = label.dataset.permisoLabel.toLowerCase();
          label.style.display = !q || texto.includes(q) ? '' : 'none';
        });
      });
    }
    const marcarTodos = document.getElementById(`${prefix}-marcar-todos`);
    if (marcarTodos) marcarTodos.addEventListener('click', () => {
      document.querySelectorAll(`.${prefix}-check-permiso`).forEach((c) => { c.checked = true; });
    });
    const desmarcarTodos = document.getElementById(`${prefix}-desmarcar-todos`);
    if (desmarcarTodos) desmarcarTodos.addEventListener('click', () => {
      document.querySelectorAll(`.${prefix}-check-permiso`).forEach((c) => { c.checked = false; });
    });
    document.querySelectorAll('[data-marcar-modulo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.${prefix}-check-permiso[data-modulo="${btn.dataset.marcarModulo}"]`).forEach((c) => { c.checked = true; });
      });
    });
    document.querySelectorAll('[data-desmarcar-modulo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.${prefix}-check-permiso[data-modulo="${btn.dataset.desmarcarModulo}"]`).forEach((c) => { c.checked = false; });
      });
    });
  }

  async function renderDetalleRol(rolId) {
    const [rol, todosLosPermisos] = await Promise.all([
      DOVA.get(`/usuarios/roles/${rolId}`),
      DOVA.get('/usuarios/permisos'),
    ]);
    const esAdmin = rol.codigo === 'admin';
    const codigosActivos = (rol.permisos || []).map((p) => p.codigo);
    return `
      <div class="dova-etapas-box">
        <h4>Permisos de "${esc(rol.nombre)}"</h4>
        ${esAdmin
          ? '<p class="dova-nota">El rol admin siempre tiene todos los permisos del sistema y no puede modificarse.</p>'
          : `
            <form id="form-permisos-rol">
              ${checkboxesPermisos(todosLosPermisos, codigosActivos, 'rol')}
              <button type="submit" class="dova-btn-primary" style="margin-top:12px;">Guardar permisos</button>
            </form>
          `}
      </div>`;
  }

  async function renderDetalleUsuario(usuarioId) {
    const [usuario, todosLosPermisos] = await Promise.all([
      DOVA.get(`/usuarios/${usuarioId}`),
      DOVA.get('/usuarios/permisos'),
    ]);
    const codigosRol = (usuario.permisosRol || []).map((p) => p.codigo);
    const overridesMap = {};
    (usuario.overrides || []).forEach((o) => { overridesMap[o.codigo] = o.allow; });

    return `
      <div class="dova-etapas-box">
        <h4>Permisos de ${esc(usuario.nombre)} <span class="dova-nota">(rol: ${esc(usuario.rol_nombre)})</span></h4>
        ${usuario.es_admin_protegido
          ? '<p class="dova-nota">El administrador protegido siempre tiene todos los permisos; no admite excepciones.</p>'
          : `
            <p class="dova-nota">Marcá o desmarcá para crear una excepción sobre lo que da su rol. Los que coinciden con el rol no generan excepción.</p>
            <div id="usuario-permisos-checks">
              ${checkboxesPermisos(todosLosPermisos, codigosRol.filter((c) => overridesMap[c] !== false).concat(Object.keys(overridesMap).filter((c) => overridesMap[c] === true)), 'usr')}
            </div>
            <button type="button" id="btn-guardar-overrides" class="dova-btn-primary" style="margin-top:12px;">Guardar excepciones</button>
            ${(usuario.overrides || []).length ? `
              <p class="dova-nota" style="margin-top:10px;">Excepciones activas: ${usuario.overrides.map((o) => `${esc(o.codigo)} (${o.allow ? '+' : '−'})`).join(', ')}</p>
            ` : ''}
          `}
        <div style="margin-top:14px">
          <button type="button" class="dova-btn-secundario" data-cerrar-sesiones="${usuario.id}">Cerrar todas sus sesiones abiertas</button>
          <span class="dova-nota">Útil si perdió el celular o dejó DOVA abierto en otra compu.</span>
        </div>
      </div>`;
  }

  // Odontólogos para vincular a un usuario. Un odontólogo se vincula a un solo
  // usuario activo (su agenda, "Mi día" y sus cobros); el servidor lo valida.
  async function opcionesOdontologos(usuarioId, actualId) {
    const [odos, usuarios] = await Promise.all([DOVA.get('/odontologos'), DOVA.get('/usuarios?pageSize=500')]);
    const lista = usuarios.items || usuarios.data || usuarios;
    const tomado = {};
    lista.forEach((u) => { if (u.activo && u.odontologo_id && Number(u.id) !== Number(usuarioId)) tomado[u.odontologo_id] = u.nombre; });
    return `<option value="">Sin vincular</option>${odos.map((o) => `<option value="${o.id}" ${Number(o.id) === Number(actualId) ? 'selected' : ''} ${tomado[o.id] ? 'disabled' : ''}>${esc(o.nombre)}${o.especialidad ? ` · ${esc(o.especialidad)}` : ''}${tomado[o.id] ? ` (vinculado a ${esc(tomado[o.id])})` : ''}</option>`).join('')}`;
  }

  function initUsuariosAdmin(recargar) {
    document.querySelectorAll('[data-vincular-odo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.vincularOdo;
        try {
          const u = await DOVA.get(`/usuarios/${id}`);
          const opciones = await opcionesOdontologos(id, u.odontologo_id);
          abrirModal(`
            <h3>Odontólogo de ${esc(u.nombre)}</h3>
            <p class="dova-nota">El usuario ve su agenda en "Mi día", inicia consultas a su nombre y sus cobros y comisiones quedan a su nombre. Un odontólogo se vincula a un solo usuario.</p>
            <form id="form-vincular-odo">
              <label for="vo-odo">Odontólogo</label>
              <select id="vo-odo">${opciones}</select>
              <div class="dova-modal-actions">
                <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="dova-btn-primary">Guardar</button>
              </div>
            </form>
          `);
          document.getElementById('form-vincular-odo').addEventListener('submit', async (e) => {
            e.preventDefault();
            const v = document.getElementById('vo-odo').value;
            try {
              await DOVA.put(`/usuarios/${id}`, { odontologoId: v ? Number(v) : null });
            } catch (er) { toast(er.message, 'error'); return; }
            document.getElementById('modal-root').innerHTML = '';
            toast(v ? 'Odontólogo vinculado' : 'Se quitó el vínculo con el odontólogo', 'ok');
            // Si es el propio usuario, su sesión toma el cambio enseguida.
            const yo = DOVA.usuarioActual();
            if (yo && Number(yo.id) === Number(id) && DOVA.actualizarSesion) await DOVA.actualizarSesion().catch(() => {});
            recargar();
          });
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#admin-tabs .dova-tab').forEach((t) => t.classList.remove('activo'));
        tab.classList.add('activo');
        document.querySelectorAll('.dova-tab-panel').forEach((p) => {
          p.style.display = p.dataset.panel === tab.dataset.tab ? '' : 'none';
        });
      });
    });

    document.querySelectorAll('[data-ver-usuario]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const root = document.getElementById('usuario-detalle-root');
        root.innerHTML = '<div class="dova-cargando">Cargando…</div>';
        try {
          root.innerHTML = await renderDetalleUsuario(btn.dataset.verUsuario);
          initCheckboxesPermisos('usr');
          const bc = root.querySelector('[data-cerrar-sesiones]');
          if (bc) bc.addEventListener('click', async () => {
            bc.disabled = true;
            try { await DOVA.post(`/usuarios/${bc.dataset.cerrarSesiones}/cerrar-sesiones`, {}); toast('Se cerraron todas sus sesiones', 'ok'); } catch (e) { toast(e.message, 'error'); }
            bc.disabled = false;
          });
          const btnGuardar = document.getElementById('btn-guardar-overrides');
          if (btnGuardar) {
            btnGuardar.addEventListener('click', async () => {
              const usuario = await manejarError(() => DOVA.get(`/usuarios/${btn.dataset.verUsuario}`));
              const codigosRol = (usuario.permisosRol || []).map((p) => p.codigo);
              const marcados = Array.from(document.querySelectorAll('.usr-check-permiso:checked')).map((c) => c.value);
              const todos = Array.from(document.querySelectorAll('.usr-check-permiso')).map((c) => c.value);
              // Excepción = donde lo marcado difiere de lo que da el rol.
              const cambios = [];
              todos.forEach((codigo) => {
                const marcado = marcados.includes(codigo);
                const porRol = codigosRol.includes(codigo);
                if (marcado !== porRol) cambios.push({ codigo, allow: marcado });
              });
              for (const c of cambios) {
                await manejarError(() => DOVA.put(`/usuarios/${btn.dataset.verUsuario}/permisos`, { codigoPermiso: c.codigo, allow: c.allow }));
              }
              // Quitar excepciones que ya no aplican (coinciden de nuevo con el rol)
              const overridesPrevios = (usuario.overrides || []).map((o) => o.codigo);
              for (const codigo of overridesPrevios) {
                const marcado = marcados.includes(codigo);
                const porRol = codigosRol.includes(codigo);
                if (marcado === porRol) {
                  await manejarError(() => DOVA.request(`/usuarios/${btn.dataset.verUsuario}/permisos/${codigo}`, { method: 'DELETE' })).catch(() => {});
                }
              }
              toast('Excepciones de permisos guardadas', 'ok');
              root.innerHTML = await renderDetalleUsuario(btn.dataset.verUsuario);
              initCheckboxesPermisos('usr');
            });
          }
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });

    document.querySelectorAll('[data-editar-rol]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const root = document.getElementById('rol-detalle-root');
        root.innerHTML = '<div class="dova-cargando">Cargando…</div>';
        try {
          root.innerHTML = await renderDetalleRol(btn.dataset.editarRol);
          initCheckboxesPermisos('rol');
          const form = document.getElementById('form-permisos-rol');
          if (form) {
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const codigos = Array.from(document.querySelectorAll('.rol-check-permiso:checked')).map((c) => c.value);
              await manejarError(() => DOVA.put(`/usuarios/roles/${btn.dataset.editarRol}/permisos`, { codigos }));
              toast('Permisos del rol actualizados', 'ok');
            });
          }
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });

    const btnNuevoRol = document.getElementById('btn-nuevo-rol');
    if (btnNuevoRol) {
      btnNuevoRol.addEventListener('click', () => {
        abrirModal(`
          <h3>Nuevo rol</h3>
          <form id="form-nuevo-rol">
            <label>Nombre</label><input id="nr-nombre" required placeholder="Ej: Higienista" />
            <label>Código (sin espacios)</label><input id="nr-codigo" required placeholder="ej: higienista" />
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Crear</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-rol').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/usuarios/roles', {
            nombre: document.getElementById('nr-nombre').value,
            codigo: document.getElementById('nr-codigo').value,
          }));
          document.getElementById('modal-root').innerHTML = '';
          toast('Rol creado', 'ok');
          recargar();
        });
      });
    }

    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) {
      btnNuevoUsuario.addEventListener('click', async () => {
        const roles = await manejarError(() => DOVA.get('/usuarios/roles'));
        const opcionesOdo = await opcionesOdontologos(null, null).catch(() => '<option value="">Sin vincular</option>');
        abrirModal(`
          <h3>Nuevo usuario</h3>
          <form id="form-nuevo-usuario">
            <label>Nombre completo</label><input id="nu-nombre" required />
            <label>Usuario</label><input id="nu-username" required />
            <label>Contraseña</label><input id="nu-password" type="password" required minlength="6" />
            <label>Rol</label>
            <select id="nu-rol">
              ${roles.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('')}
            </select>
            <label for="nu-odo">Odontólogo vinculado <span class="dova-nota">(solo si atiende pacientes)</span></label>
            <select id="nu-odo">${opcionesOdo}</select>
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Crear</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-usuario').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/usuarios', {
            nombre: document.getElementById('nu-nombre').value,
            username: document.getElementById('nu-username').value,
            password: document.getElementById('nu-password').value,
            rolId: Number(document.getElementById('nu-rol').value),
            ...(document.getElementById('nu-odo').value ? { odontologoId: Number(document.getElementById('nu-odo').value) } : {}),
          }));
          document.getElementById('modal-root').innerHTML = '';
          toast('Usuario creado', 'ok');
          recargar();
        });
      });
    }
  }

  // ---------------- BÚSQUEDA GLOBAL ----------------
  // Búsqueda tradicional rápida (sección 26 del prompt: sin IA) sobre
  // pacientes/citas/tratamientos/presupuestos/pagos/evoluciones/tickets/
  // usuarios, filtrada server-side por permisos reales del usuario.
  const LABELS_BUSQUEDA = {
    pacientes: 'Pacientes', citas: 'Citas', tratamientos: 'Tratamientos',
    presupuestos: 'Presupuestos', pagos: 'Pagos', evoluciones: 'Evoluciones clínicas',
    tickets: 'Pedidos de ayuda técnica', usuarios: 'Usuarios', facturas: 'Facturas',
  };

  function vistaBuscadorGlobal() {
    return `
      <div class="dova-buscador-global">
        <input type="text" id="buscador-global-input" placeholder="Buscar pacientes, citas, facturas…" autocomplete="off" />
        <div id="buscador-global-resultados" class="dova-buscador-resultados" style="display:none;"></div>
      </div>`;
  }

  function renderResultadosBusqueda(data) {
    const categorias = Object.keys(LABELS_BUSQUEDA).filter((k) => data[k] && data[k].length);
    if (!categorias.length) {
      return '<p class="dova-nota" style="padding:12px;">Sin resultados.</p>';
    }
    return categorias.map((cat) => `
      <div class="dova-buscador-categoria">
        <div class="dova-buscador-categoria-titulo">${esc(LABELS_BUSQUEDA[cat])}</div>
        ${data[cat].map((item) => renderItemBusqueda(cat, item)).join('')}
      </div>
    `).join('');
  }

  function renderItemBusqueda(cat, item) {
    const nombrePac = item.paciente_nombre ? `${esc(item.paciente_nombre)} ${esc(item.paciente_apellido || '')}` : '';
    switch (cat) {
      case 'pacientes':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.id}">${esc(item.nombre)} ${esc(item.apellido)} <span class="dova-nota">C.I. ${esc(item.ci || '-')}</span></button>`;
      case 'citas':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.motivo || 'sin motivo')} <span class="dova-nota">${fmtFecha(item.fecha)}</span></button>`;
      case 'tratamientos':
        return `<button class="dova-buscador-item" data-tratamiento="${item.id}">${esc(item.nombre)} <span class="dova-nota">${fmtGs(item.precio)}</span></button>`;
      case 'presupuestos':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — Presupuesto <span class="dova-nota">${fmtGs(item.total)} · ${esc(item.estado)}</span></button>`;
      case 'pagos':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.concepto || 'Pago')} <span class="dova-nota">${fmtGs(item.monto)}</span></button>`;
      case 'evoluciones':
        return `<button class="dova-buscador-item" data-ir-paciente="${item.paciente_id}">${nombrePac} — ${esc(item.procedimiento || item.diagnostico || 'Evolución')} <span class="dova-nota">${fmtFecha(item.fecha)}</span></button>`;
      case 'tickets':
        return `<button class="dova-buscador-item" data-ir-helpdesk="${item.id}">${esc(item.titulo)} <span class="dova-nota">${esc(item.estado)}</span></button>`;
      case 'facturas':
        return `<button class="dova-buscador-item" data-ir-factura="${item.id}">${esc(item.numero_completo)} — ${esc(item.cliente_nombre)} <span class="dova-nota">${fmtGs(item.total)} · ${esc(item.estado)}</span></button>`;
      case 'usuarios':
        return `<button class="dova-buscador-item" data-ir-usuarios="${item.id}">${esc(item.nombre)} <span class="dova-nota">@${esc(item.username)}</span></button>`;
      default:
        return '';
    }
  }

  function initBuscadorGlobal(navegar) {
    const input = document.getElementById('buscador-global-input');
    const resultados = document.getElementById('buscador-global-resultados');
    if (!input || !resultados) return;
    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { resultados.style.display = 'none'; resultados.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        try {
          const data = await DOVA.get(`/busqueda?q=${encodeURIComponent(q)}`);
          resultados.innerHTML = renderResultadosBusqueda(data);
          resultados.style.display = '';
          enlazarResultados();
        } catch (_e) { /* búsqueda silenciosa: no interrumpir con toasts por cada tecla */ }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dova-buscador-global')) { resultados.style.display = 'none'; }
    });

    function enlazarResultados() {
      resultados.querySelectorAll('[data-ir-paciente]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('paciente', Number(b.dataset.irPaciente)); });
      });
      resultados.querySelectorAll('[data-ir-helpdesk]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('helpdesk'); });
      });
      resultados.querySelectorAll('[data-ir-factura]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('facturacion', `factura/${b.dataset.irFactura}`); });
      });
      resultados.querySelectorAll('[data-ir-usuarios]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; navegar('usuarios'); });
      });
      resultados.querySelectorAll('[data-tratamiento]').forEach((b) => {
        b.addEventListener('click', () => { resultados.style.display = 'none'; input.value = ''; });
      });
    }
  }

  // ---------------- MODAL genérico ----------------
  function abrirModal(html) {
    // Si la vista no trae su propio contenedor de modales, se crea uno al
    // final del body (antes se usaba el body entero y abrir un modal en una
    // sección sin #modal-root borraba toda la página).
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div class="dova-modal-overlay">
        <div class="dova-modal-box">${html}</div>
      </div>`;
    root.querySelectorAll('[data-cerrar-modal]').forEach((b) => b.addEventListener('click', () => { root.innerHTML = ''; }));
  }

  return {
    fmtGs, fmtFecha, esc, toast, manejarError, abrirModal, renderContextoClinicoTurno,
    vistaLogin, initLogin,
    vistaDashboard,
    initDashboardOdontologo,
    initDashboardSinReportes,
    vistaPacientes, initPacientes,
    vistaFichaPaciente, initFichaPaciente,
    vistaAgenda, initAgenda,
    vistaInventario,
    vistaHelpdesk, initHelpdesk,
    vistaModoConsulta, initModoConsulta, renderPanelConsulta, initPanelConsulta,
    vistaBuscadorGlobal, initBuscadorGlobal,
    vistaUsuariosAdmin, initUsuariosAdmin,
    vistaSelectorDiseno, initSelectorDiseno,
    vistaConfiguracion, initConfiguracion,
  };
})();
