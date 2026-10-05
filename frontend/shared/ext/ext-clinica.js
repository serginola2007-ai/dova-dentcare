/* DOVA — Clínica integral (Fase 1).
   - Modo Consulta: pantalla de trabajo del odontólogo para el turno del
     paciente. La consulta se guarda sola en la base como borrador mientras
     se escribe; "Finalizar consulta" la firma (queda inmutable: las
     correcciones van por enmienda), actualiza el odontograma de las piezas
     tratadas y cierra el turno.
   - Ficha 360°: pestañas Fotos y estudios (galería, visor, antes/después),
     Recetas y Notas internas, y un resumen con última consulta, próxima cita
     y notas importantes.
   Todo usa la API real; nada se guarda en el navegador. */
const DovaClinica = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtFechaHora, toast, puede, badge, cargando } = X;
  const SEXO = { F: 'Femenino', M: 'Masculino', X: 'Otro' };
  const CATEGORIAS = [['inicial', 'Inicial'], ['durante', 'Durante el tratamiento'], ['final', 'Final'], ['intraoral', 'Intraoral'], ['extraoral', 'Extraoral'],
    ['frontal', 'Frontal'], ['lateral', 'Lateral'], ['oclusal', 'Oclusal'], ['personalizada', 'Otra']];
  const CAT_NOMBRE = { ...Object.fromEntries(CATEGORIAS), antes: 'Antes', despues: 'Después' };
  const TIPOS_ESTUDIO = [['radiografia', 'Radiografía'], ['panoramica', 'Panorámica'], ['periapical', 'Periapical'], ['bitewing', 'Bitewing'],
    ['tomografia', 'Tomografía'], ['cefalometria', 'Cefalometría'], ['laboratorio', 'Laboratorio'], ['otro', 'Otro']];
  const TIPO_NOMBRE = Object.fromEntries(TIPOS_ESTUDIO);
  const ESTADOS_PIEZA = [['', 'No cambiar el odontograma'], ['caries', 'Caries'], ['restauracion', 'Restauración'], ['endodoncia', 'Endodoncia'], ['corona', 'Corona'],
    ['extraccion_indicada', 'Extracción indicada'], ['ausente', 'Ausente / extraída'], ['tratamiento_realizado', 'Tratamiento realizado'], ['sano', 'Sano']];

  const edad = (f) => {
    if (!f) return null;
    const n = new Date(`${String(f).slice(0, 10)}T12:00:00`); const h = new Date();
    let a = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a -= 1;
    return a >= 0 ? a : null;
  };
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '');
  const piezasTexto = (p) => (Array.isArray(p) ? p.join(', ') : (p || ''));

  // Imágenes/archivos protegidos: se piden con el token y se muestran como blob.
  const blobs = new Map();
  async function urlArchivo(ruta) {
    if (blobs.has(ruta)) return blobs.get(ruta);
    const r = await DOVA.request(ruta, { raw: true });
    if (!r.ok) { let m = 'No se pudo abrir el archivo'; try { m = (await r.json()).error.message; } catch (_e) { /* */ } throw new Error(m); }
    const u = URL.createObjectURL(await r.blob());
    blobs.set(ruta, u);
    return u;
  }
  // Carga diferida: las miniaturas se piden recién cuando aparecen en pantalla.
  const observador = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return; observador.unobserve(e.target); cargarImg(e.target);
  }), { rootMargin: '200px' }) : null;
  function cargarImg(img) {
    urlArchivo(img.dataset.src).then((u) => { img.src = u; img.classList.add('cargada'); })
      .catch(() => { img.replaceWith(Object.assign(document.createElement('div'), { className: 'dova-cli-sinimg', textContent: 'Archivo no disponible' })); });
  }
  function activarImgs(c) { c.querySelectorAll('img[data-src]').forEach((img) => (observador ? observador.observe(img) : cargarImg(img))); }

  // =================================================================
  // MODO CONSULTA
  // =================================================================
  const CAMPOS = [
    ['motivoConsulta', 'Motivo de consulta', 1, '¿Por qué viene hoy?'],
    ['anamnesis', 'Anamnesis', 3, 'Lo que cuenta el paciente: síntomas, desde cuándo, qué tomó…'],
    ['diagnostico', 'Diagnóstico', 2, ''],
    ['piezas', 'Piezas tratadas (FDI)', 1, 'Ej.: 36, 37'],
    ['procedimiento', 'Procedimientos realizados', 3, ''],
    ['evolucion', 'Evolución', 2, 'Cómo respondió, cómo quedó'],
    ['observaciones', 'Observaciones', 2, ''],
    ['indicaciones', 'Indicaciones al paciente', 2, 'Cuidados, qué evitar, cuándo volver'],
    ['medicacion', 'Medicación indicada', 1, 'Si hace falta receta, usá "Nueva receta"'],
    ['proximaAccion', 'Próximo paso', 1, 'Ej.: control en 7 días, segunda sesión de endodoncia'],
  ];
  const COL = { motivoConsulta: 'motivo_consulta', proximaAccion: 'proxima_accion' };
  const valorHC = (hc, k) => { const v = hc[COL[k] || k]; return k === 'piezas' ? piezasTexto(v) : (v || ''); };

  async function consulta(root, params, navegar) {
    const [pidTxt, extra] = String(params || '').split('/');
    const pid = Number(pidTxt);
    const turnoId = extra && /^t\d+$/.test(extra) ? Number(extra.slice(1)) : null;
    if (!pid) { root.innerHTML = '<p class="dova-error-text">Falta el paciente.</p>'; return; }
    root.innerHTML = cargando;
    let ctx = await DOVA.get(`/historia-clinica/paciente/${pid}/contexto${turnoId ? `?turnoId=${turnoId}` : ''}`);
    // Al abrir la consulta de un turno, el paciente pasa a "en consulta" (sillón).
    if (ctx.turno && !ctx.turno.en_sillon_en && !ctx.turno.finalizado_en && !ctx.finalizada && puede('agenda.edit', 'historia_clinica.edit')) {
      try { await DOVA.post(`/operaciones/flujo/${ctx.turno.id}/sillon`, {}); ctx.turno.en_sillon_en = new Date().toISOString(); } catch (_e) { /* no impide trabajar */ }
    }
    const p = ctx.paciente;
    const nombre = `${p.nombre} ${p.apellido}`;
    const ed = puede('historia_clinica.edit', 'pacientes.clinical.edit');
    const hcFin = ctx.finalizada;
    let hc = ctx.borrador; // borrador en curso (o null)

    const estadoTurno = (t) => {
      if (!t) return '';
      if (t.finalizado_en || t.estado === 'atendido') return badge('Finalizado', 'ok');
      if (t.en_sillon_en) return badge(`En consulta desde ${hora(t.en_sillon_en)}`, 'atencion');
      if (t.llegada_en) return badge(`En espera desde ${hora(t.llegada_en)}`, 'info');
      return badge(t.estado === 'confirmado' ? 'Confirmado' : 'Reservado', 'info');
    };
    const chips = (arr, fn, vacio) => (arr.length ? `<ul class="dova-cli-chips">${arr.map(fn).join('')}</ul>` : `<p class="dova-nota">${vacio}</p>`);
    const alergiasTxt = [...ctx.alergias.map((a) => `${a.sustancia}${a.severidad ? ` (${a.severidad})` : ''}`), ...(p.alergias ? [p.alergias] : [])];
    const medTxt = [...ctx.medicacion.map((m) => [m.medicamento, m.dosis, m.frecuencia].filter(Boolean).join(' ')), ...(p.medicamentos ? [p.medicamentos] : [])];

    const ACCIONES = [
      ['odontograma', '🦷', 'Odontograma', puede('odontograma.edit')],
      ['tratamiento', '📋', 'Plan de tratamiento', puede('planes_tratamiento.manage')],
      ['foto', '📷', 'Agregar fotografía', puede('fotos_clinicas.manage')],
      ['estudio', '🩻', 'Agregar estudio', puede('estudios.manage')],
      ['receta', '💊', 'Nueva receta', puede('recetas.manage')],
      ['consentimiento', '📝', 'Consentimiento', puede('consentimientos.manage')],
      ['presupuesto', '🧾', 'Presupuesto', puede('presupuestos.view')],
      ['pago', '💳', 'Registrar pago', puede('pagos.create')],
      ['proxima', '📅', 'Próxima cita', puede('agenda.create')],
      ['control-postop', '🩹', 'Control postoperatorio', puede('controles_postoperatorios.manage')],
      ['derivar', '↪️', 'Derivar', puede('derivaciones.manage')],
      ['historial', '🕘', 'Consultas anteriores', puede('historia_clinica.view', 'pacientes.clinical.view')],
    ].filter((a) => a[3]);

    root.innerHTML = `
      <div class="dova-cli-barra">
        <button class="dova-btn-link" data-salir>&larr; ${ctx.turno ? 'Volver a la agenda' : 'Volver a la ficha'}</button>
        <span class="dova-cli-guardado" data-guardado aria-live="polite"></span>
      </div>
      <header class="dova-cli-cab">
        <div>
          <h2 class="dova-view-title">${esc(nombre)}</h2>
          <p class="dova-subtitulo">${[edad(p.fecha_nacimiento) !== null ? `${edad(p.fecha_nacimiento)} años` : null, SEXO[p.sexo], p.ci ? `C.I. ${esc(p.ci)}` : null, p.telefono ? `Tel. ${esc(p.telefono)}` : null].filter(Boolean).join(' · ')}</p>
          ${ctx.turno ? `<p class="dova-cli-turno">Turno ${esc(fmtFecha(ctx.turno.fecha))} ${esc(ctx.turno.hora)} · ${esc(ctx.turno.tratamiento || ctx.turno.motivo || 'Consulta')}${ctx.turno.sillon ? ` · ${esc(ctx.turno.sillon)}` : ''} <span data-estado-turno>${estadoTurno(ctx.turno)}</span></p>` : ''}
        </div>
        <div class="dova-cli-cab-acc">
          <button class="dova-btn-secundario" data-ficha>Ficha completa</button>
          ${ed && !hcFin ? '<button class="dova-btn-primary" data-finalizar>Finalizar consulta</button>' : ''}
        </div>
      </header>
      <div data-alertas></div>
      <div class="dova-cli-grid">
        <aside class="dova-cli-lado">
          <section class="dova-cli-caja dova-cli-alerta-caja"><h4>Alergias</h4>${chips(alergiasTxt, (a) => `<li class="dova-cli-chip-alerta">${esc(a)}</li>`, 'Sin alergias registradas')}</section>
          <section class="dova-cli-caja"><h4>Medicación actual</h4>${chips(medTxt, (m) => `<li>${esc(m)}</li>`, 'Sin medicación registrada')}</section>
          <section class="dova-cli-caja"><h4>Antecedentes</h4>
            ${p.antecedentes_medicos ? `<p><strong>Médicos:</strong> ${esc(p.antecedentes_medicos)}</p>` : ''}
            ${p.antecedentes_odontologicos ? `<p><strong>Odontológicos:</strong> ${esc(p.antecedentes_odontologicos)}</p>` : ''}
            ${p.grupo_sanguineo ? `<p><strong>Grupo sanguíneo:</strong> ${esc(p.grupo_sanguineo)}</p>` : ''}
            ${!p.antecedentes_medicos && !p.antecedentes_odontologicos && !p.grupo_sanguineo ? '<p class="dova-nota">Sin antecedentes cargados.</p>' : ''}
          </section>
          <section class="dova-cli-caja"><h4>Última consulta</h4>
            ${ctx.ultimaConsulta ? `<p><strong>${esc(fmtFecha(ctx.ultimaConsulta.fecha))}</strong>${ctx.ultimaConsulta.odontologo ? ` · ${esc(ctx.ultimaConsulta.odontologo)}` : ''}</p>
              ${ctx.ultimaConsulta.diagnostico ? `<p>Dx: ${esc(ctx.ultimaConsulta.diagnostico)}</p>` : ''}
              ${ctx.ultimaConsulta.procedimiento ? `<p>${esc(ctx.ultimaConsulta.procedimiento)}</p>` : ''}
              ${ctx.ultimaConsulta.proxima_accion ? `<p class="dova-nota">Próximo paso indicado: ${esc(ctx.ultimaConsulta.proxima_accion)}</p>` : ''}` : '<p class="dova-nota">Es la primera consulta registrada.</p>'}
          </section>
          <section class="dova-cli-caja"><h4>Próxima cita</h4>
            ${ctx.proximaCita ? `<p><strong>${esc(fmtFecha(ctx.proximaCita.fecha))} ${esc(ctx.proximaCita.hora)}</strong></p><p>${esc(ctx.proximaCita.motivo || '')}${ctx.proximaCita.odontologo ? ` · ${esc(ctx.proximaCita.odontologo)}` : ''}</p>` : '<p class="dova-nota">No tiene próximas citas.</p>'}
          </section>
          ${ctx.planes.length ? `<section class="dova-cli-caja"><h4>Tratamientos en curso</h4><ul class="dova-cli-lista">${ctx.planes.map((pl) => `<li>${esc(pl.nombre)}${pl.pieza ? ` · pieza ${esc(pl.pieza)}` : ''} <span class="dova-nota">${pl.sesiones_realizadas || 0}/${pl.sesiones_totales || 1}</span></li>`).join('')}</ul></section>` : ''}
          <section class="dova-cli-caja" data-notas-imp hidden></section>
        </aside>
        <main class="dova-cli-main">
          <section class="dova-cli-caja dova-cli-consulta">
            <div class="dova-cli-consulta-cab"><h3>${hcFin ? 'Consulta finalizada' : 'Consulta actual'}</h3>
              ${hcFin ? badge(`Firmada ${fmtFechaHora(hcFin.firmada_en)}`, 'ok') : ed ? '<select data-plantilla aria-label="Plantilla clínica" hidden><option value="">Usar una plantilla…</option></select>' : ''}</div>
            ${hcFin ? resumenFinalizada(hcFin) : ed ? `<form data-form class="dova-cli-form">${CAMPOS.map(([k, l, filas, ph]) => `
              <label class="${filas > 1 ? 'dova-cli-ancho' : ''}"><span>${l}</span>${filas > 1 ? `<textarea name="${k}" rows="${filas}" placeholder="${esc(ph)}"></textarea>` : `<input name="${k}" placeholder="${esc(ph)}" autocomplete="off" />`}</label>`).join('')}
              <p class="dova-nota dova-cli-ancho">Se guarda solo mientras escribís. Al finalizar, la consulta queda firmada y no se puede modificar: las correcciones se hacen como enmienda (con motivo, usuario y fecha).</p>
            </form>` : '<p class="dova-nota">No tenés permiso para registrar consultas.</p>'}
          </section>
          ${ACCIONES.length ? `<h3 class="dova-section-title">Accesos rápidos</h3>
          <div class="dova-cli-acciones">${ACCIONES.map(([a, ic, t]) => `<button type="button" class="dova-cli-accion" data-accion="${a}"><span aria-hidden="true">${ic}</span>${esc(t)}</button>`).join('')}</div>` : ''}
          <div data-panel class="dova-cli-panel"></div>
        </main>
      </div>
      <div id="modal-root"></div>`;

    X.bannerAlertas(pid, root.querySelector('[data-alertas]'));
    // Notas importantes del equipo.
    if (puede('pacientes.view')) {
      DOVA.get(`/pacientes/${pid}/notas`).then((ns) => {
        const imp = ns.filter((n) => n.importante); const box = root.querySelector('[data-notas-imp]');
        if (imp.length && box) { box.hidden = false; box.innerHTML = `<h4>Notas importantes</h4><ul class="dova-cli-lista">${imp.map((n) => `<li>${esc(n.texto)}</li>`).join('')}</ul>`; }
      }).catch(() => {});
    }
    const salir = () => (ctx.turno ? navegar('agenda') : navegar('paciente', pid));
    root.querySelector('[data-salir]').addEventListener('click', async () => { await guardarYa(); salir(); });
    root.querySelector('[data-ficha]').addEventListener('click', async () => { await guardarYa(); navegar('paciente', pid); });

    // ---------- autoguardado del borrador ----------
    const form = root.querySelector('[data-form]');
    const estado = root.querySelector('[data-guardado]');
    let sucio = false; let timer = null; let guardando = null;
    const datosForm = () => (form ? Object.fromEntries(CAMPOS.map(([k]) => [k, form.elements[k].value.trim()])) : {});
    const vacio = (d) => Object.values(d).every((v) => !v);
    async function guardar() {
      if (!form || !sucio) return;
      const d = datosForm();
      if (!hc && vacio(d)) { sucio = false; return; }
      sucio = false; estado.textContent = 'Guardando…'; estado.className = 'dova-cli-guardado';
      try {
        if (!hc) hc = await DOVA.post('/historia-clinica', { pacienteId: pid, turnoId: ctx.turno ? ctx.turno.id : undefined, ...d, piezas: d.piezas || undefined });
        else hc = await DOVA.put(`/historia-clinica/${hc.id}`, { ...d, piezas: d.piezas || null });
        estado.textContent = `Guardado ${new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (e) {
        sucio = true; estado.textContent = `No se pudo guardar: ${e.message}`; estado.className = 'dova-cli-guardado error';
      }
    }
    async function guardarYa() { clearTimeout(timer); if (guardando) await guardando; guardando = guardar(); await guardando; guardando = null; }
    if (form) {
      if (hc) { CAMPOS.forEach(([k]) => { form.elements[k].value = valorHC(hc, k); }); estado.textContent = 'Borrador recuperado'; }
      else if (ctx.turno && (ctx.turno.tratamiento || ctx.turno.motivo)) form.elements.motivoConsulta.value = ctx.turno.motivo || ctx.turno.tratamiento;
      form.addEventListener('input', () => { sucio = true; estado.textContent = 'Cambios sin guardar…'; clearTimeout(timer); timer = setTimeout(guardarYa, 1200); });
      form.addEventListener('focusout', () => { if (sucio) guardarYa(); });
      window.addEventListener('beforeunload', avisoSalida);
      // Plantillas clínicas (texto predefinido; solo completa lo vacío).
      const sel = root.querySelector('[data-plantilla]');
      if (sel && puede('plantillas_clinicas.view', 'plantillas_clinicas.manage', 'historia_clinica.edit')) {
        DOVA.get('/plantillas-clinicas').then((ps) => {
          if (!ps.length) return; sel.hidden = false;
          sel.insertAdjacentHTML('beforeend', ps.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join(''));
          sel.addEventListener('change', async () => {
            if (!sel.value) return;
            try {
              const pl = await DOVA.get(`/plantillas-clinicas/${sel.value}`);
              const MAP = { motivo: 'motivoConsulta', proximaAccion: 'proximaAccion' };
              (pl.campos || []).forEach((cp) => { const k = MAP[cp.campo] || cp.campo; const el = form.elements[k]; if (el && !el.value) el.value = cp.valor || (cp.label ? `[${cp.label}] ` : ''); });
              sucio = true; guardarYa();
            } catch (e) { toast(e.message, 'error'); }
            sel.value = '';
          });
        }).catch(() => {});
      }
    }
    function avisoSalida(e) { if (sucio && root.isConnected) { e.preventDefault(); e.returnValue = ''; } }

    // ---------- finalizar ----------
    const btnFin = root.querySelector('[data-finalizar]');
    if (btnFin) btnFin.addEventListener('click', async () => {
      sucio = true; await guardarYa();
      const d = datosForm();
      if (!d.diagnostico && !d.procedimiento && !d.evolucion) { toast('Completá al menos el diagnóstico, el procedimiento o la evolución antes de finalizar', 'error'); return; }
      if (!hc) { toast('La consulta todavía no se guardó. Probá de nuevo.', 'error'); return; }
      const piezas = d.piezas ? d.piezas.split(/[\s,;]+/).filter(Boolean) : [];
      X.modal('Finalizar consulta', `
        <p>La consulta queda <strong>firmada</strong> en la historia clínica de ${esc(nombre)}. Después no se puede modificar: cualquier corrección se hace como enmienda.</p>
        ${piezas.length && puede('odontograma.edit') ? `<label class="dova-cli-ancho">Actualizar el odontograma de las piezas <strong>${esc(piezas.join(', '))}</strong> a:
          <select data-estado-pieza>${ESTADOS_PIEZA.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>` : ''}
        ${ctx.turno && !ctx.turno.finalizado_en ? '<p class="dova-nota">El turno se marca como atendido.</p>' : ''}
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Seguir editando</button><button class="dova-btn-primary" data-si>Finalizar y firmar</button></div>`);
      const box = document.querySelector('.dova-modal-box');
      box.querySelector('[data-si]').addEventListener('click', async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Finalizando…';
        try {
          const est = box.querySelector('[data-estado-pieza]');
          if (est && est.value) {
            for (const pz of piezas) {
              await DOVA.put(`/odontograma/paciente/${pid}`, { pieza: pz, estado: est.value, observacion: (d.procedimiento || d.diagnostico || '').slice(0, 300) || undefined });
            }
          }
          await DOVA.post(`/historia-clinica/${hc.id}/firmar`, {});
          if (ctx.turno && !ctx.turno.finalizado_en) { try { await DOVA.post(`/operaciones/flujo/${ctx.turno.id}/finalizado`, {}); } catch (e2) { toast(`La consulta se firmó, pero el turno no se pudo cerrar: ${e2.message}`, 'error'); } }
          sucio = false; window.removeEventListener('beforeunload', avisoSalida);
          X.cerrarModal();
          toast('Consulta finalizada y firmada', 'ok');
          ofrecerSiguiente();
        } catch (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = 'Finalizar y firmar'; }
      });
    });

    function ofrecerSiguiente() {
      const acc = [
        puede('agenda.create') ? '<button class="dova-btn-primary" data-sig="proxima">Programar próxima cita</button>' : '',
        puede('pagos.create') ? '<button class="dova-btn-secundario" data-sig="pago">Registrar pago</button>' : '',
        puede('recetas.manage') ? '<button class="dova-btn-secundario" data-sig="receta">Hacer una receta</button>' : '',
        '<button class="dova-btn-secundario" data-sig="volver">Terminar</button>',
      ].join('');
      X.modal('Consulta finalizada', `<p>¿Qué querés hacer ahora?</p><div class="dova-cli-siguiente">${acc}</div>`);
      document.querySelectorAll('.dova-modal-box [data-sig]').forEach((b) => b.addEventListener('click', () => {
        const s = b.dataset.sig; X.cerrarModal();
        if (s === 'proxima') return DovaOperativo.modalTurno({ fijo: { pacienteId: pid, pacienteNombre: nombre }, alGuardar: () => consulta(root, params, navegar) });
        if (s === 'pago') return DovaOperativo.modalCobro(pid, { alGuardar: () => toast('Pago registrado', 'ok') });
        if (s === 'receta') { consulta(root, params, navegar).then(() => abrirAccion('receta')); return null; }
        return salir();
      }));
    }

    // ---------- accesos rápidos ----------
    const panel = root.querySelector('[data-panel]');
    async function abrirAccion(a) {
      const pn = root.querySelector('[data-panel]');
      root.querySelectorAll('[data-accion]').forEach((b) => b.classList.toggle('activo', b.dataset.accion === a));
      if (a === 'pago') return DovaOperativo.modalCobro(pid, { alGuardar: () => toast('Pago registrado', 'ok') });
      if (a === 'proxima') return DovaOperativo.modalTurno({ fijo: { pacienteId: pid, pacienteNombre: nombre }, alGuardar: () => toast('Próxima cita agendada', 'ok') });
      pn.innerHTML = cargando;
      try {
        if (a === 'foto') return formFoto(pn, pid, { hcId: () => hc && hc.id, asegurar: async () => { sucio = true; await guardarYa(); return hc && hc.id; } });
        if (a === 'estudio') return formEstudio(pn, pid, { hcId: () => hc && hc.id, asegurar: async () => { sucio = true; await guardarYa(); return hc && hc.id; } });
        if (a === 'presupuesto') { pn.innerHTML = '<div></div>'; return DovaOperativo.presupuestos(pn.firstElementChild, pid); }
        if (a === 'historial') return historialCompacto(pn, pid);
        pn.innerHTML = await Vistas.renderPanelConsulta(a, pid);
        Vistas.initPanelConsulta(a, pid);
        if (a === 'odontograma') pn.insertAdjacentHTML('beforeend', '<p><button class="dova-btn-link" data-odo-completo>Abrir el odontograma completo de la ficha</button></p>');
        const oc = pn.querySelector('[data-odo-completo]');
        if (oc) oc.addEventListener('click', async () => { await guardarYa(); navegar('paciente', pid); setTimeout(() => { const t = document.querySelector('#ficha-tabs [data-tab="odontograma"]'); if (t) t.click(); }, 400); });
      } catch (e) { pn.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      return null;
    }
    root.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => abrirAccion(b.dataset.accion)));
    void panel;
  }

  function resumenFinalizada(h) {
    return `<dl class="dova-cli-resumen">${CAMPOS.map(([k, l]) => { const v = valorHC(h, k); return v ? `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>` : ''; }).join('')}</dl>
      <p class="dova-nota">Para corregirla, usá "Enmendar" en el Historial clínico de la ficha (queda registrado quién, cuándo y por qué).</p>`;
  }

  async function historialCompacto(c, pid) {
    const lista = await DOVA.get(`/historia-clinica/paciente/${pid}`);
    c.innerHTML = `<div class="dova-etapas-box"><h4>Consultas anteriores</h4>${lista.length ? `<ol class="dova-cli-timeline">${lista.slice(0, 15).map((h) => `
      <li><strong>${esc(fmtFecha(h.fecha))}</strong> ${h.firmada ? badge('Firmada', 'ok') : badge('Borrador', 'atencion')} ${h.enmendada_de_id ? badge('Enmienda', 'info') : ''}
        ${h.odontologo_nombre ? `<span class="dova-nota">${esc(h.odontologo_nombre)}</span>` : ''}
        ${h.motivo_consulta ? `<p>Motivo: ${esc(h.motivo_consulta)}</p>` : ''}${h.diagnostico ? `<p>Dx: ${esc(h.diagnostico)}</p>` : ''}
        ${h.procedimiento ? `<p>${esc(h.procedimiento)}</p>` : ''}${h.piezas && h.piezas.length ? `<p class="dova-nota">Piezas: ${esc(piezasTexto(h.piezas))}</p>` : ''}</li>`).join('')}</ol>` : '<p class="dova-nota">Sin consultas anteriores.</p>'}</div>`;
  }

  // =================================================================
  // FOTOS Y ESTUDIOS
  // =================================================================
  function formFoto(c, pid, { hcId, asegurar, alGuardar } = {}) {
    c.innerHTML = `<div class="dova-etapas-box"><h4>Agregar fotografía</h4>
      <form data-f class="dova-cli-form">
        <label><span>Foto</span><input type="file" name="archivo" accept="image/jpeg,image/png,image/webp" capture="environment" required /></label>
        <label><span>Categoría</span><select name="categoria">${CATEGORIAS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <label><span>Pieza (opcional)</span><input name="pieza" inputmode="numeric" maxlength="2" placeholder="36" /></label>
        <label><span>Fecha</span><input type="date" name="fecha" value="${X.hoy()}" /></label>
        <label class="dova-cli-ancho"><span>Observación</span><input name="observacion" maxlength="500" /></label>
        ${asegurar ? '<label class="dova-ext-check dova-cli-ancho"><input type="checkbox" name="vincular" checked /> Vincular a esta consulta</label>' : ''}
        <p class="dova-error-text dova-cli-ancho" data-err hidden></p>
        <div class="dova-cli-ancho"><button class="dova-btn-primary">Subir foto</button></div>
      </form></div>`;
    const f = c.querySelector('[data-f]');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = f.querySelector('[data-err]'); err.hidden = true;
      const a = f.archivo.files[0];
      if (!a) { err.textContent = 'Elegí la foto'; err.hidden = false; return; }
      if (a.size > 10 * 1024 * 1024) { err.textContent = 'La foto pesa más de 10 MB'; err.hidden = false; return; }
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Subiendo…';
      try {
        const fd = new FormData();
        fd.append('pacienteId', pid); fd.append('categoria', f.categoria.value); fd.append('fecha', f.fecha.value);
        if (f.pieza.value.trim()) fd.append('pieza', f.pieza.value.trim());
        if (f.observacion.value.trim()) fd.append('observacion', f.observacion.value.trim());
        if (f.vincular && f.vincular.checked) { const id = (hcId && hcId()) || (asegurar && await asegurar()); if (id) fd.append('historiaClinicaId', id); }
        fd.append('archivo', a);
        await DOVA.postForm('/clinico/fotos', fd);
        toast('Foto guardada', 'ok'); f.reset(); f.fecha.value = X.hoy();
        if (alGuardar) alGuardar();
      } catch (e) { err.textContent = e.message; err.hidden = false; }
      b.disabled = false; b.textContent = 'Subir foto';
    });
  }

  function formEstudio(c, pid, { hcId, asegurar, alGuardar } = {}) {
    c.innerHTML = `<div class="dova-etapas-box"><h4>Agregar estudio</h4>
      <form data-f class="dova-cli-form">
        <label><span>Tipo</span><select name="tipo">${TIPOS_ESTUDIO.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <label><span>Archivo (imagen, PDF o DICOM)</span><input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf,.dcm,application/dicom" /></label>
        <label><span>Pieza (opcional)</span><input name="pieza" inputmode="numeric" maxlength="2" /></label>
        <label><span>Fecha</span><input type="date" name="fecha" value="${X.hoy()}" /></label>
        <label class="dova-cli-ancho"><span>Descripción</span><input name="descripcion" maxlength="1000" placeholder="Ej.: Periapical de la 36" /></label>
        <label class="dova-cli-ancho"><span>Observaciones / informe</span><textarea name="observaciones" rows="2" maxlength="2000"></textarea></label>
        ${asegurar ? '<label class="dova-ext-check dova-cli-ancho"><input type="checkbox" name="vincular" checked /> Vincular a esta consulta</label>' : ''}
        <p class="dova-error-text dova-cli-ancho" data-err hidden></p>
        <div class="dova-cli-ancho"><button class="dova-btn-primary">Guardar estudio</button></div>
      </form></div>`;
    const f = c.querySelector('[data-f]');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = f.querySelector('[data-err]'); err.hidden = true;
      const a = f.archivo.files[0];
      if (a && a.size > 25 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 25 MB'; err.hidden = false; return; }
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Guardando…';
      try {
        const fd = new FormData();
        fd.append('pacienteId', pid); fd.append('tipo', f.tipo.value); fd.append('fecha', f.fecha.value);
        for (const k of ['pieza', 'descripcion', 'observaciones']) if (f[k].value.trim()) fd.append(k, f[k].value.trim());
        if (f.vincular && f.vincular.checked) { const id = (hcId && hcId()) || (asegurar && await asegurar()); if (id) fd.append('historiaClinicaId', id); }
        if (a) fd.append('archivo', a);
        await DOVA.postForm('/clinico/estudios', fd);
        toast('Estudio guardado', 'ok'); f.reset(); f.fecha.value = X.hoy();
        if (alGuardar) alGuardar();
      } catch (e) { err.textContent = e.message; err.hidden = false; }
      b.disabled = false; b.textContent = 'Guardar estudio';
    });
  }

  async function panelFotosEstudios(c, pid) {
    const verFotos = puede('fotos_clinicas.manage', 'pacientes.clinical.view', 'historia_clinica.view');
    const verEst = puede('estudios.manage', 'pacientes.clinical.view', 'historia_clinica.view');
    const [fotos, estudios] = await Promise.all([verFotos ? DOVA.get(`/clinico/fotos/paciente/${pid}`) : [], verEst ? DOVA.get(`/clinico/estudios/paciente/${pid}`) : []]);
    let filtroCat = ''; let filtroPieza = '';
    const recargar = () => panelFotosEstudios(c, pid);
    c.innerHTML = `
      <div class="dova-toolbar dova-cli-toolbar">
        <h3 class="dova-section-title" style="margin:0">Fotografías clínicas <span class="dova-nota">(${fotos.length})</span></h3>
        <div class="dova-cli-filtros">
          <select data-fcat aria-label="Categoría"><option value="">Todas las categorías</option>${CATEGORIAS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>
          <input data-fpieza placeholder="Pieza" maxlength="2" inputmode="numeric" aria-label="Pieza" />
          ${fotos.length > 1 ? '<button class="dova-btn-secundario" data-comparar>Comparar antes / después</button>' : ''}
          ${puede('fotos_clinicas.manage') ? '<button class="dova-btn-primary" data-nueva-foto>+ Agregar foto</button>' : ''}
        </div>
      </div>
      <div data-form-foto></div>
      <div class="dova-cli-galeria" data-galeria></div>
      <div class="dova-toolbar dova-cli-toolbar" style="margin-top:28px">
        <h3 class="dova-section-title" style="margin:0">Estudios <span class="dova-nota">(${estudios.length})</span></h3>
        ${puede('estudios.manage') ? '<button class="dova-btn-primary" data-nuevo-estudio>+ Agregar estudio</button>' : ''}
      </div>
      <div data-form-estudio></div>
      <div class="dova-cli-estudios">${estudios.length ? estudios.map((e) => `
        <article class="dova-cli-estudio">
          <div class="dova-cli-estudio-ico" aria-hidden="true">${e.mime === 'application/pdf' ? 'PDF' : e.mime === 'application/dicom' ? 'DICOM' : e.tiene_archivo ? '🩻' : '—'}</div>
          <div><strong>${esc(TIPO_NOMBRE[e.tipo] || e.tipo)}</strong>${e.pieza ? ` · pieza ${esc(e.pieza)}` : ''} <span class="dova-nota">${esc(fmtFecha(e.fecha))}${e.odontologo_nombre ? ` · ${esc(e.odontologo_nombre)}` : ''}</span>
            ${e.descripcion ? `<p>${esc(e.descripcion)}</p>` : ''}${e.observaciones ? `<p class="dova-nota">${esc(e.observaciones)}</p>` : ''}</div>
          <div class="dova-cli-estudio-acc">${e.tiene_archivo ? `<button class="dova-btn-secundario" data-ver-estudio="${e.id}">Ver</button>` : '<span class="dova-nota">Sin archivo</span>'}
            ${puede('estudios.manage') ? `<button class="dova-btn-link dova-ext-peligro" data-borrar-estudio="${e.id}">Eliminar</button>` : ''}</div>
        </article>`).join('') : '<p class="dova-nota">Sin estudios cargados.</p>'}</div>`;

    const gal = c.querySelector('[data-galeria]');
    const pintar = () => {
      const lista = fotos.filter((f) => (!filtroCat || f.categoria === filtroCat) && (!filtroPieza || f.pieza === filtroPieza));
      gal.innerHTML = lista.length ? lista.map((f) => `
        <button type="button" class="dova-cli-foto" data-foto="${f.id}">
          ${f.tiene_archivo ? `<img data-src="/clinico/fotos/${f.id}/archivo" alt="Foto ${esc(CAT_NOMBRE[f.categoria] || f.categoria)}${f.pieza ? ` pieza ${esc(f.pieza)}` : ''}" />` : '<div class="dova-cli-sinimg">Sin archivo</div>'}
          <span class="dova-cli-foto-pie">${esc(CAT_NOMBRE[f.categoria] || f.categoria)}${f.pieza ? ` · ${esc(f.pieza)}` : ''}<br><small>${esc(fmtFecha(f.fecha))}</small></span>
        </button>`).join('') : `<p class="dova-nota">${fotos.length ? 'Ninguna foto con ese filtro.' : 'Sin fotos cargadas.'}</p>`;
      activarImgs(gal);
      gal.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => visorFoto(fotos.find((x) => String(x.id) === b.dataset.foto), recargar)));
    };
    pintar();
    c.querySelector('[data-fcat]').addEventListener('change', (e) => { filtroCat = e.target.value; pintar(); });
    c.querySelector('[data-fpieza]').addEventListener('input', (e) => { filtroPieza = e.target.value.trim(); pintar(); });
    const nf = c.querySelector('[data-nueva-foto]'); if (nf) nf.addEventListener('click', () => formFoto(c.querySelector('[data-form-foto]'), pid, { alGuardar: recargar }));
    const ne = c.querySelector('[data-nuevo-estudio]'); if (ne) ne.addEventListener('click', () => formEstudio(c.querySelector('[data-form-estudio]'), pid, { alGuardar: recargar }));
    const cmp = c.querySelector('[data-comparar]'); if (cmp) cmp.addEventListener('click', () => comparar(fotos));
    c.querySelectorAll('[data-ver-estudio]').forEach((b) => b.addEventListener('click', () => visorEstudio(estudios.find((x) => String(x.id) === b.dataset.verEstudio))));
    c.querySelectorAll('[data-borrar-estudio]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmarBorrado('¿Eliminar este estudio?', 'Se borra el archivo. Queda registrado en la auditoría.'))) return;
      try { await DOVA.del(`/clinico/estudios/${b.dataset.borrarEstudio}`); toast('Estudio eliminado', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  function confirmarBorrado(titulo, texto) {
    return new Promise((ok) => {
      X.modal(titulo, `<p>${esc(texto)}</p><div class="dova-modal-actions"><button class="dova-btn-secundario" data-no>Cancelar</button><button class="dova-btn-primary dova-btn-peligro-fondo" data-si>Eliminar</button></div>`);
      const box = document.querySelector('.dova-modal-box');
      box.querySelector('[data-si]').addEventListener('click', () => { X.cerrarModal(); ok(true); });
      box.querySelector('[data-no]').addEventListener('click', () => { X.cerrarModal(); ok(false); });
    });
  }

  function visorFoto(f, recargar) {
    const ed = puede('fotos_clinicas.manage');
    X.modal(`${CAT_NOMBRE[f.categoria] || f.categoria}${f.pieza ? ` · pieza ${f.pieza}` : ''}`, `
      <div class="dova-cli-visor"><img data-src="/clinico/fotos/${f.id}/archivo" alt="Foto clínica" /></div>
      <p class="dova-nota">${esc(fmtFecha(f.fecha))}${f.subido_por_nombre ? ` · subió ${esc(f.subido_por_nombre)}` : ''}${f.plan_nombre ? ` · ${esc(f.plan_nombre)}` : ''}${f.historia_clinica_id ? ' · vinculada a una consulta' : ''}</p>
      ${ed ? `<form data-ed class="dova-cli-form">
        <label><span>Categoría</span><select name="categoria">${CATEGORIAS.map(([v, t]) => `<option value="${v}" ${v === f.categoria ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label><span>Pieza</span><input name="pieza" maxlength="2" value="${esc(f.pieza || '')}" /></label>
        <label class="dova-cli-ancho"><span>Observación</span><input name="observacion" maxlength="500" value="${esc(f.observacion || '')}" /></label>
        <div class="dova-modal-actions dova-cli-ancho"><button type="button" class="dova-btn-link dova-ext-peligro" data-borrar>Eliminar foto</button><button class="dova-btn-primary">Guardar cambios</button></div>
      </form>` : (f.observacion ? `<p>${esc(f.observacion)}</p>` : '')}`, { ancho: 'ancho' });
    const box = document.querySelector('.dova-modal-box');
    activarImgs(box);
    const fe = box.querySelector('[data-ed]');
    if (fe) {
      fe.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try { await DOVA.patch(`/clinico/fotos/${f.id}`, { categoria: fe.categoria.value, pieza: fe.pieza.value.trim(), observacion: fe.observacion.value.trim(), historiaClinicaId: f.historia_clinica_id || undefined, planId: f.plan_id || undefined }); X.cerrarModal(); toast('Foto actualizada', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
      });
      box.querySelector('[data-borrar]').addEventListener('click', async () => {
        if (!(await confirmarBorrado('¿Eliminar esta foto?', 'Queda registrado en la auditoría.'))) return;
        try { await DOVA.del(`/clinico/fotos/${f.id}`); toast('Foto eliminada', 'ok'); recargar(); } catch (e) { toast(e.message, 'error'); }
      });
    }
  }

  async function visorEstudio(e) {
    const ruta = `/clinico/estudios/${e.id}/archivo`;
    X.modal(`${TIPO_NOMBRE[e.tipo] || e.tipo}${e.pieza ? ` · pieza ${e.pieza}` : ''}`, `<div class="dova-cli-visor" data-v>${cargando}</div>
      <p class="dova-nota">${esc(fmtFecha(e.fecha))}${e.odontologo_nombre ? ` · ${esc(e.odontologo_nombre)}` : ''}</p>
      ${e.descripcion ? `<p>${esc(e.descripcion)}</p>` : ''}${e.observaciones ? `<p class="dova-nota">${esc(e.observaciones)}</p>` : ''}
      <div class="dova-modal-actions"><button class="dova-btn-secundario" data-bajar>Descargar</button><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    const box = document.querySelector('.dova-modal-box'); const v = box.querySelector('[data-v]');
    try {
      const u = await urlArchivo(ruta);
      if (e.mime === 'application/pdf') v.innerHTML = `<iframe src="${u}" title="Estudio" class="dova-cli-pdf"></iframe>`;
      else if (e.mime && e.mime.startsWith('image/')) v.innerHTML = `<img src="${u}" alt="Estudio" />`;
      else v.innerHTML = '<p class="dova-nota">Este formato (DICOM) no se puede ver en el navegador: descargalo y abrilo con el visor del equipo.</p>';
      box.querySelector('[data-bajar]').addEventListener('click', () => { const a = document.createElement('a'); a.href = u; a.download = e.nombre_archivo || `estudio-${e.id}`; document.body.appendChild(a); a.click(); a.remove(); });
    } catch (er) { v.innerHTML = `<p class="dova-error-text">${esc(er.message)}</p>`; }
  }

  function comparar(fotos) {
    const op = (sel) => fotos.map((f) => `<option value="${f.id}" ${sel === f.id ? 'selected' : ''}>${esc(fmtFecha(f.fecha))} · ${esc(CAT_NOMBRE[f.categoria] || f.categoria)}${f.pieza ? ` · ${esc(f.pieza)}` : ''}</option>`).join('');
    const ini = fotos.find((f) => ['inicial', 'antes'].includes(f.categoria)) || fotos[fotos.length - 1];
    const fin = fotos.find((f) => ['final', 'despues'].includes(f.categoria) && f !== ini) || fotos.find((f) => f !== ini);
    X.modal('Antes / después', `
      <div class="dova-cli-form"><label><span>Antes</span><select data-a>${op(ini.id)}</select></label><label><span>Después</span><select data-b>${op(fin.id)}</select></label></div>
      <figure class="dova-cli-comparar" data-cmp>
        <img data-img-b alt="Después" /><div class="dova-cli-comparar-antes" data-capa><img data-img-a alt="Antes" /></div>
        <span class="dova-cli-cmp-et izq">Antes</span><span class="dova-cli-cmp-et der">Después</span><div class="dova-cli-cmp-linea" data-linea></div>
      </figure>
      <input type="range" min="0" max="100" value="50" data-rango aria-label="Mover la división entre antes y después" class="dova-cli-rango" />`, { ancho: 'ancho' });
    const box = document.querySelector('.dova-modal-box');
    const poner = async () => {
      const [a, b] = await Promise.all([urlArchivo(`/clinico/fotos/${box.querySelector('[data-a]').value}/archivo`), urlArchivo(`/clinico/fotos/${box.querySelector('[data-b]').value}/archivo`)]).catch((e) => { toast(e.message, 'error'); return []; });
      if (a) { box.querySelector('[data-img-a]').src = a; box.querySelector('[data-img-b]').src = b; }
    };
    const mover = () => { const v = box.querySelector('[data-rango]').value; box.querySelector('[data-cmp]').style.setProperty('--pos', `${v}%`); };
    box.querySelector('[data-a]').addEventListener('change', poner); box.querySelector('[data-b]').addEventListener('change', poner);
    box.querySelector('[data-rango]').addEventListener('input', mover);
    mover(); poner();
  }

  // =================================================================
  // RECETAS Y NOTAS
  // =================================================================
  async function panelRecetas(c, pid) {
    const lista = await DOVA.get(`/clinico/recetas/paciente/${pid}`);
    c.innerHTML = `<div class="dova-toolbar"><h3 class="dova-section-title" style="margin:0">Recetas <span class="dova-nota">(${lista.length})</span></h3>
        ${puede('recetas.manage', 'historia_clinica.edit') ? '<button class="dova-btn-primary" data-nueva>+ Nueva receta</button>' : ''}</div>
      <div data-form-receta></div>
      ${lista.length ? `<div class="dova-cli-recetas">${lista.map((r) => `<article class="dova-cli-receta">
        <header><strong>${esc(fmtFecha(r.fecha))}</strong> <span class="dova-nota">${esc(r.odontologo_nombre || '')}</span></header>
        ${(r.items || []).length ? `<ul>${r.items.map((i) => `<li><strong>${esc(i.medicamento)}</strong> ${esc([i.concentracion, i.dosis, i.frecuencia, i.duracion].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : ''}
        ${r.indicaciones ? `<p class="dova-nota">${esc(r.indicaciones)}</p>` : ''}
      </article>`).join('')}</div>` : '<p class="dova-nota">Sin recetas.</p>'}`;
    const n = c.querySelector('[data-nueva]');
    if (n) n.addEventListener('click', async () => {
      const box = c.querySelector('[data-form-receta]');
      box.innerHTML = await Vistas.renderPanelConsulta('receta', pid); Vistas.initPanelConsulta('receta', pid);
      const f = box.querySelector('form'); if (f) f.addEventListener('submit', () => setTimeout(() => panelRecetas(c, pid), 900));
    });
  }

  async function panelNotas(c, pid) {
    const lista = await DOVA.get(`/pacientes/${pid}/notas`);
    const yo = (DOVA.usuarioActual() || {}).id; const admin = puede('pacientes.delete');
    const escribe = puede('pacientes.edit', 'historia_clinica.edit', 'pacientes.clinical.edit');
    c.innerHTML = `<h3 class="dova-section-title">Notas internas</h3>
      <p class="dova-nota">Avisos para el equipo (no forman parte de la historia clínica). El paciente no las ve.</p>
      ${escribe ? `<form data-f class="dova-cli-nota-form"><textarea name="texto" rows="2" maxlength="2000" placeholder="Ej.: prefiere turnos a la tarde; avisar al hijo antes de cada cita" required></textarea>
        <label class="dova-ext-check"><input type="checkbox" name="importante" /> Importante (se muestra en la consulta)</label><button class="dova-btn-primary">Agregar nota</button></form>` : ''}
      <ul class="dova-cli-notas">${lista.map((n) => `<li class="${n.importante ? 'importante' : ''}">${n.importante ? badge('Importante', 'atencion') : ''} ${esc(n.texto)}
        <span class="dova-nota">${esc(n.usuario_nombre || '')} · ${esc(fmtFechaHora(n.creado_en))}</span>
        ${n.usuario_id === yo || admin ? `<button class="dova-btn-link dova-ext-peligro" data-quitar="${n.id}">Quitar</button>` : ''}</li>`).join('') || '<li class="dova-nota">Sin notas.</li>'}</ul>`;
    const f = c.querySelector('[data-f]');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await DOVA.post(`/pacientes/${pid}/notas`, { texto: f.texto.value, importante: f.importante.checked }); toast('Nota agregada', 'ok'); panelNotas(c, pid); } catch (er) { toast(er.message, 'error'); }
    });
    c.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
      try { await DOVA.del(`/pacientes/${pid}/notas/${b.dataset.quitar}`); toast('Nota quitada', 'ok'); panelNotas(c, pid); } catch (er) { toast(er.message, 'error'); }
    }));
  }

  // Resumen 360° arriba de la pestaña "Resumen": última consulta, próxima
  // cita, tratamientos en curso y notas importantes.
  async function resumen360(pid) {
    const panel = document.querySelector('.dova-tab-panel[data-panel="resumen"]');
    if (!panel) return;
    const cont = document.createElement('div'); cont.className = 'dova-cli-360';
    panel.prepend(cont);
    const [ctx, notas] = await Promise.all([
      puede('historia_clinica.view', 'pacientes.clinical.view') ? DOVA.get(`/historia-clinica/paciente/${pid}/contexto?sinTurno=1`).catch(() => null) : null,
      puede('pacientes.view') ? DOVA.get(`/pacientes/${pid}/notas`).catch(() => []) : [],
    ]);
    const imp = notas.filter((n) => n.importante);
    const tarj = [];
    if (ctx) {
      tarj.push(`<div class="dova-cli-caja"><h4>Última consulta</h4>${ctx.ultimaConsulta ? `<p><strong>${esc(fmtFecha(ctx.ultimaConsulta.fecha))}</strong>${ctx.ultimaConsulta.odontologo ? ` · ${esc(ctx.ultimaConsulta.odontologo)}` : ''}</p>${ctx.ultimaConsulta.diagnostico ? `<p>Dx: ${esc(ctx.ultimaConsulta.diagnostico)}</p>` : ''}${ctx.ultimaConsulta.proxima_accion ? `<p class="dova-nota">Próximo paso: ${esc(ctx.ultimaConsulta.proxima_accion)}</p>` : ''}` : '<p class="dova-nota">Sin consultas registradas.</p>'}</div>`);
      tarj.push(`<div class="dova-cli-caja"><h4>Próxima cita</h4>${ctx.proximaCita ? `<p><strong>${esc(fmtFecha(ctx.proximaCita.fecha))} ${esc(ctx.proximaCita.hora)}</strong></p><p>${esc(ctx.proximaCita.motivo || '')}</p>` : '<p class="dova-nota">Sin próximas citas.</p>'}</div>`);
      const alerg = [...ctx.alergias.map((a) => a.sustancia), ...(ctx.paciente.alergias ? [ctx.paciente.alergias] : [])];
      tarj.push(`<div class="dova-cli-caja"><h4>Alergias y medicación</h4>${alerg.length ? `<ul class="dova-cli-chips">${alerg.map((a) => `<li class="dova-cli-chip-alerta">${esc(a)}</li>`).join('')}</ul>` : '<p class="dova-nota">Sin alergias registradas.</p>'}${ctx.medicacion.length ? `<p class="dova-nota">Toma: ${esc(ctx.medicacion.map((m) => m.medicamento).join(', '))}</p>` : ''}</div>`);
    }
    if (imp.length) tarj.push(`<div class="dova-cli-caja"><h4>Notas importantes</h4><ul class="dova-cli-lista">${imp.map((n) => `<li>${esc(n.texto)}</li>`).join('')}</ul></div>`);
    cont.innerHTML = tarj.length ? `<div class="dova-cli-360-grid">${tarj.join('')}</div>` : '';
  }

  // Pestañas nuevas de la ficha (se agregan antes de iniciar la ficha, así el
  // manejador de pestañas existente también las controla).
  function extenderFicha(pacienteId) {
    const pid = Number(pacienteId);
    const tabs = document.getElementById('ficha-tabs');
    const ancla = document.getElementById('modal-root');
    if (!tabs || !ancla) return;
    const nuevas = [
      { id: 'fotos', texto: 'Fotos y estudios', visible: puede('fotos_clinicas.manage', 'estudios.manage', 'pacientes.clinical.view', 'historia_clinica.view'), render: panelFotosEstudios },
      { id: 'recetas', texto: 'Recetas', visible: puede('recetas.manage', 'pacientes.clinical.view', 'historia_clinica.view'), render: panelRecetas },
      { id: 'notas', texto: 'Notas internas', visible: puede('pacientes.view'), render: panelNotas },
    ].filter((t) => t.visible);
    // Se ubican después de "Historial clínico" / "Odontograma".
    const despues = tabs.querySelector('[data-tab="documentacion"]') || null;
    for (const t of nuevas) {
      const b = document.createElement('button');
      b.className = 'dova-tab'; b.dataset.tab = t.id; b.textContent = t.texto;
      tabs.insertBefore(b, despues);
      const panel = document.createElement('div');
      panel.className = 'dova-tab-panel'; panel.dataset.panel = t.id; panel.style.display = 'none';
      ancla.parentNode.insertBefore(panel, ancla);
      let cargado = false;
      b.addEventListener('click', () => {
        if (cargado) return; cargado = true; panel.innerHTML = cargando;
        Promise.resolve(t.render(panel, pid)).catch((e) => { panel.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; cargado = false; });
      });
    }
    resumen360(pid).catch(() => {});
  }

  return { consulta, extenderFicha, panelFotosEstudios, formFoto, formEstudio };
})();
window.DovaClinica = DovaClinica;
