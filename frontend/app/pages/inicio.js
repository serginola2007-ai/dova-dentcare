/* DOVA — Inicio (queda siempre de fondo en el escritorio).
   - Recepción y administración: saludo, Turnos de hoy y "Para atender" (lo urgente primero).
   - Odontólogo: su día (components/mi-dia.js) y sus pendientes agrupados.
   - Si no hay nada pendiente se ve entera la marca de la clínica. */
const DovaInicio = (() => {
  const { esc, manejarError } = DovaAyudantes;

  // ---------------- DASHBOARD ----------------
  // Inicio limpio: saludo, una línea con el día y una sola lista "Para atender"
  // que muestra únicamente lo que tiene algo pendiente (lo que está en cero no
  // aparece). Las extensiones (seguimiento) suman filas a esa misma lista.
  function saludo(usuario) {
    const h = new Date().getHours();
    // Primer nombre, sin el título ("Dra. Carmen Rodríguez" → "Carmen").
    const palabras = usuario && (usuario.nombre || usuario.username) ? String(usuario.nombre || usuario.username).trim().split(/\s+/) : [];
    const nombre = palabras.find((w) => !/^(dra?|lic|od|odont|prof|sr|sra)\.?$/i.test(w)) || '';
    return `${h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + esc(nombre) : ''}`;
  }
  function fechaLarga() {
    const t = new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Una fila de "Para atender". Solo se dibuja si n > 0.
  // nivel: 'urgente' (plata o pacientes en juego), 'aviso' (conviene mirarlo) o nada.
  function filaAtender(n, label, ruta, sub, nivel) {
    if (!n) return '';
    return `<li><button type="button" class="dova-atender-fila" data-ir-ruta="${esc(ruta)}"${sub ? ` data-ir-sub-ruta="${esc(sub)}"` : ''}${nivel ? ` data-nivel="${esc(nivel)}"` : ''}><span class="dova-atender-txt">${esc(label)}</span><span class="dova-atender-n">${Number(n).toLocaleString('es-PY')}</span></button></li>`;
  }
  // Lo urgente arriba, después los avisos y al final lo informativo (las filas pueden venir de varias partes).
  function ordenarAtender(root) {
    const ul = root && root.querySelector('[data-para-atender] .dova-atender-lista');
    if (!ul) return;
    const peso = (li) => { const n = (li.querySelector('[data-nivel]') || {}).dataset; return n && n.nivel === 'urgente' ? 0 : n && n.nivel === 'aviso' ? 1 : 2; };
    Array.from(ul.children).map((li, i) => [li, i]).sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1]).forEach(([li]) => ul.appendChild(li));
  }
  // Turnos de hoy en Inicio (recepción y administración): hora, paciente, profesional y estado.
  const ESTADO_TURNO = { reservado: 'Reservado', pendiente: 'Pendiente', confirmado: 'Confirmado', en_sala: 'En sala', en_atencion: 'En atención', en_consulta: 'En consulta', atendido: 'Atendido', finalizado: 'Atendido', no_asistio: 'No vino' };
  function seccionHoy() {
    return DOVA.tienePermiso('agenda.view') ? '<section class="dova-inicio-hoy" data-inicio-hoy><h3 class="dova-section-title">Turnos de hoy</h3><div data-hoy-lista><p class="dova-nota">Cargando…</p></div></section>' : '';
  }
  async function cargarHoy(root, irA) {
    const box = root && root.querySelector('[data-inicio-hoy] [data-hoy-lista]');
    if (!box) return;
    const ahora = new Date();
    const hoyIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
    const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora);
    let lista;
    try { lista = await DOVA.get(`/agenda?desde=${hoyIso}&hasta=${hoyIso}`); } catch (_e) { box.innerHTML = '<p class="dova-nota">No se pudo cargar la agenda de hoy.</p>'; return; }
    const turnos = (Array.isArray(lista) ? lista : (lista.items || [])).filter((t) => !['cancelado', 'reprogramado'].includes(t.estado));
    if (!turnos.length) { box.innerHTML = '<p class="dova-nota">No hay turnos para hoy.</p>'; return; }
    const proximo = turnos.find((t) => String(t.hora_inicio).slice(0, 5) >= hhmm && !['atendido', 'finalizado', 'no_asistio'].includes(t.estado));
    const MAX = 10;
    box.innerHTML = `<ul class="dova-hoy-lista">${turnos.slice(0, MAX).map((t) => {
      const pasado = String(t.hora_inicio).slice(0, 5) < hhmm || ['atendido', 'finalizado', 'no_asistio'].includes(t.estado);
      return `<li><button type="button" class="dova-hoy-fila${t === proximo ? ' proximo' : ''}${pasado ? ' pasado' : ''}" data-hoy-paciente="${esc(t.paciente_id)}">
        <span class="dova-hoy-hora">${esc(String(t.hora_inicio).slice(0, 5))}</span>
        <span class="dova-hoy-quien"><strong>${esc(t.paciente_nombre)} ${esc(t.paciente_apellido)}</strong><span class="dova-nota">${esc(t.odontologo_nombre || '')}${t.motivo ? ` · ${esc(t.motivo)}` : ''}</span></span>
        <span class="dova-hoy-estado">${t === proximo ? 'Próximo' : esc(ESTADO_TURNO[t.estado] || t.estado || '')}</span></button></li>`;
    }).join('')}</ul>
    <button type="button" class="dova-btn-link" data-hoy-agenda>${turnos.length > MAX ? `Ver los ${turnos.length} en la agenda` : 'Abrir la agenda'}</button>`;
    box.querySelectorAll('[data-hoy-paciente]').forEach((b) => b.addEventListener('click', () => irA('paciente', b.dataset.hoyPaciente)));
    box.querySelector('[data-hoy-agenda]').addEventListener('click', () => irA('agenda'));
  }
  function seccionAtender(filas) {
    return `<section class="dova-atender" data-para-atender>
        <h3 class="dova-section-title">Para atender</h3>
        <ul class="dova-atender-lista">${filas}</ul>
        <p class="dova-atender-vacio">Todo al día.</p>
      </section>`;
  }

  // Logo y nombre de la clínica: de fondo y difuminado cuando hay novedades; entero cuando no hay nada.
  const DIENTE_SVG = '<svg viewBox="12 13 76 76" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M50 24C42 18 30 14 22 20C13 27 15 44 20 56C24 66 27 82 33 84C39 86 40 70 45 64C47 62 53 62 55 64C60 70 61 86 67 84C73 82 76 66 80 56C85 44 87 27 78 20C70 14 58 18 50 24Z"/></svg>';
  function marcaClinica() {
    const c = DOVA.clinicaActual() || {};
    const nombre = String(c.nombre || 'DentCareRC').trim();
    const texto = /^dent\s*care\s*rc$/i.test(nombre) ? 'Dent<span class="care">Care</span><span class="rc">RC</span>' : esc(nombre);
    return `<div class="dova-inicio-marca atenuada" data-inicio-marca aria-hidden="true"><span>
        <span class="dova-inicio-marca-logo">${DIENTE_SVG}</span>
        <span class="dova-inicio-marca-nombre">${texto}</span>
      </span></div>`;
  }
  // Decide si Inicio está "vacío" (nada para atender) y muestra la marca en su lugar.
  function revisarInicioVacio(root) {
    const marca = root && root.querySelector('[data-inicio-marca]');
    if (!marca) return;
    let vacio; let ocultar = [];
    const miDia = root.querySelector('[data-mi-dia]');
    if (miDia) {
      if (miDia.dataset.turnos === undefined) return; // la agenda todavía carga
      const pend = root.querySelector('.dova-mis-pendientes');
      vacio = miDia.dataset.turnos === '0' && !(pend && pend.querySelector('.dova-atender-fila')) && !miDia.querySelector('.dova-midia-labs');
      ocultar = [pend, miDia.querySelector('.dova-midia-vacio')];
    } else {
      const atender = root.querySelector('[data-para-atender]');
      if (!atender || !atender.dataset.listo) return; // faltan las filas de seguimiento
      vacio = !atender.querySelector('.dova-atender-fila') && !root.querySelector('.dova-puesta');
      ocultar = [atender];
    }
    // Con novedades la marca queda de fondo, difuminada; sin nada, se ve entera.
    marca.classList.toggle('atenuada', !vacio);
    ocultar.forEach((el) => { if (el) el.hidden = vacio; });
  }

  async function vistaDashboard() {
    const usuario = DOVA.usuarioActual();
    if (usuario && usuario.odontologoId) {
      return vistaDashboardOdontologo();
    }
    if (!DOVA.tienePermiso('reportes.view')) {
      return vistaDashboardSinReportes(usuario);
    }
    const a = await manejarError(() => DOVA.get('/reportes/dashboard/alertas'));
    const linea = [fechaLarga(), a.turnosHoy ? `${a.turnosHoy} turno${a.turnosHoy === 1 ? '' : 's'} hoy` : 'Sin turnos hoy',
      a.cajaAbierta ? 'Caja abierta' : '<span class="dova-inicio-alerta">Sin caja abierta</span>'];
    return `
      <div class="dova-inicio">
      <h2 class="dova-view-title dova-inicio-titulo">${saludo(usuario)}</h2>
      <p class="dova-inicio-sub">${linea.join(' · ')}</p>
      <div class="dova-inicio-cols">
      ${seccionHoy()}
      ${seccionAtender([
        filaAtender(a.cuotasVencidas, 'Cuotas vencidas', 'finanzas', 'deuda', 'urgente'),
        filaAtender(a.stockBajo, 'Insumos por acabarse', 'inventario', 'insumos', 'urgente'),
        filaAtender(a.insumosPorVencer, 'Insumos que vencen en 30 días', 'inventario', 'vencen', 'aviso'),
        filaAtender(a.listaEsperaPendiente, 'Pacientes en lista de espera', 'agenda', 'espera'),
        filaAtender(a.ticketsHelpdeskAbiertos, 'Pedidos de ayuda técnica sin resolver', 'helpdesk', 'aviso'),
      ].join(''))}
      </div>
      ${marcaClinica()}
      </div>
    `;
  }

  // Inicio para roles sin 'reportes.view' (recepción, asistente, helpdesk):
  // saludo, accesos directos en una línea y "Para atender" (lo completa
  // la extensión de seguimiento si el rol lo puede ver).
  function vistaDashboardSinReportes(usuario) {
    const accesos = [
      { ruta: 'agenda', label: 'Agenda', icono: 'calendario' },
      { ruta: 'pacientes', label: 'Pacientes', icono: 'pacientes' },
      { ruta: 'inventario', label: 'Inventario', icono: 'caja' },
      { ruta: 'helpdesk', label: 'Ayuda técnica', icono: 'ticket' },
    ].filter((x) => DOVA.tienePermiso(`${x.ruta}.view`));
    return `
      <div class="dova-inicio">
      <h2 class="dova-view-title dova-inicio-titulo">${saludo(usuario)}</h2>
      <p class="dova-inicio-sub">${fechaLarga()}</p>
      ${accesos.length ? `<div class="dova-inicio-accesos">${accesos.map((x) => `
          <button type="button" class="dova-btn-secundario" data-ir-a="${esc(x.ruta)}">${DovaIcono(x.icono, 16)} ${esc(x.label)}</button>`).join('')}
      </div>` : ''}
      <div class="dova-inicio-cols">
      ${seccionHoy()}
      ${seccionAtender('')}
      </div>
      ${marcaClinica()}
      </div>
    `;
  }

  // Botones de "Para atender" y accesos: se enlazan una sola vez por pantalla.
  function initInicio(irA) {
    cargarHoy(document, irA);
    const atender = document.querySelector('[data-para-atender]');
    if (atender) atender.addEventListener('click', (e) => {
      const f = e.target.closest('[data-ir-ruta]');
      if (!f) return;
      window.DovaSubPendiente = f.dataset.irSubRuta || null;
      Promise.resolve(irA(f.dataset.irRuta)).finally(() => { window.DovaSubPendiente = null; });
    });
    document.querySelectorAll('.dova-inicio-accesos [data-ir-a]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.irA)));
  }

  // Inicio del odontólogo: su agenda (components/mi-dia.js) y, debajo, sus pendientes
  // agrupados en filas que se despliegan solo si se tocan.
  const CATEGORIAS_PENDIENTES = [
    { key: 'evolucionesSinFirmar', label: 'Evoluciones sin firmar' },
    { key: 'consentimientosPendientes', label: 'Consentimientos pendientes' },
    { key: 'recetasPendientes', label: 'Recetas pendientes' },
    { key: 'estudiosPendientes', label: 'Estudios sin resultado' },
    { key: 'controlesVencidos', label: 'Controles después de un tratamiento vencidos' },
    { key: 'derivacionesRecibidas', label: 'Derivaciones recibidas' },
    { key: 'pacientesParaRevisar', label: 'Pacientes para revisar' },
    { key: 'presupuestosPendientes', label: 'Presupuestos sin aceptar' },
    { key: 'pacientesSinProximaCita', label: 'Tratamientos sin próxima cita' },
    { key: 'tratamientosAbiertos', label: 'Tratamientos abiertos' },
  ];
  const MAX_PEND = 15;

  function nombrePaciente(item) {
    return esc((item.paciente_nombre || '') + ' ' + (item.paciente_apellido || ''));
  }
  function textoPendiente(item) {
    return esc(item.nombre || item.tratamiento_nombre || item.procedimiento || (item.medicacion ? `Indicó: ${item.medicacion}` : '') || (item.total !== undefined && item.estado ? `Presupuesto ${item.estado} · Gs. ${Number(item.total).toLocaleString('es-PY')}` : '') || item.motivo || item.detalle || '');
  }

  async function vistaDashboardOdontologo() {
    const pendientes = await manejarError(() => DOVA.get('/pendientes'));
    const cats = CATEGORIAS_PENDIENTES.filter((c) => (pendientes[c.key] || []).length);
    return `
      <div class="dova-inicio">
      <h2 class="dova-view-title dova-inicio-titulo">${saludo(DOVA.usuarioActual())}</h2>

      <section class="dova-midia" data-mi-dia><div class="dova-cargando">Preparando tu día…</div></section>

      <section class="dova-atender dova-mis-pendientes">
        <h3 class="dova-section-title">Mis pendientes</h3>
        ${cats.length ? `<ul class="dova-atender-lista">${cats.map((c) => {
          const items = pendientes[c.key];
          return `<li>
            <button type="button" class="dova-atender-fila" data-tab-pend="${c.key}" aria-expanded="false" aria-controls="pend-${c.key}"><span class="dova-atender-txt">${esc(c.label)}</span><span class="dova-atender-n">${items.length}</span></button>
            <div class="dova-atender-panel" id="pend-${c.key}" data-panel-pend="${c.key}" hidden>
              <ul class="dova-lista-simple">${items.slice(0, MAX_PEND).map((item) => `
                <li><button type="button" class="dova-btn-link" data-ir-paciente="${item.paciente_id}">${nombrePaciente(item)}</button>${textoPendiente(item) ? ` — ${textoPendiente(item)}` : ''}</li>`).join('')}
              </ul>
              ${items.length > MAX_PEND ? `<p class="dova-nota">Y ${items.length - MAX_PEND} más.</p>` : ''}
            </div>
          </li>`;
        }).join('')}</ul>` : '<p class="dova-atender-vacio">No tenés pendientes.</p>'}
      </section>
      ${marcaClinica()}
      </div>
    `;
  }

  function initDashboardOdontologo(navegarAConsulta, navegarAFicha) {
    const miDia = document.querySelector('[data-mi-dia]');
    if (miDia && window.DovaMiDia) DovaMiDia.montar(miDia, { navegarAConsulta, navegarAFicha }).catch(() => { miDia.innerHTML = '<p class="dova-nota">No se pudo cargar la agenda del día.</p>'; });
    document.querySelectorAll('[data-tab-pend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = document.querySelector(`[data-panel-pend="${btn.dataset.tabPend}"]`);
        if (!panel) return;
        panel.hidden = !panel.hidden;
        btn.setAttribute('aria-expanded', String(!panel.hidden));
      });
    });
    document.querySelectorAll('.dova-mis-pendientes [data-ir-paciente]').forEach((btn) => {
      btn.addEventListener('click', () => navegarAFicha(Number(btn.dataset.irPaciente)));
    });
  }

  return { vistaDashboard, initInicio, initDashboardOdontologo, ordenarAtender, revisarInicioVacio };
})();
window.DovaInicio = DovaInicio;
