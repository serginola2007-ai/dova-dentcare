/* DOVA — ficha del paciente: la base de la ficha (resumen, historial clínico, odontograma,
   consentimientos, pagos y presupuestos). Las demás pestañas se suman desde ficha.js,
   ficha-operativa.js y clinica.js. */
const DovaFichaPaciente = (() => {
  const { fmtGs, fmtFecha, esc, toast, manejarError, abrirModal } = DovaAyudantes;
  const { confirmarEliminarPaciente } = DovaPacientes;

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
    // Mediodía local: new Date('2000-05-10') es medianoche UTC y en Paraguay
    // quedaba en el día anterior (la edad cumplía un día antes).
    const nac = new Date(`${String(fechaNacimiento).slice(0, 10)}T12:00:00`);
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
              </ul>` : '<p class="dova-vacio">Sin evoluciones registradas para esta pieza.</p>'}
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

  return { vistaFichaPaciente, initFichaPaciente, calcularEdad, alertasClinicasHtml };
})();
window.DovaFichaPaciente = DovaFichaPaciente;
