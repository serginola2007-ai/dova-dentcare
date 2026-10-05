/* DOVA — pestañas nuevas de la ficha del paciente (seguimiento integral).
   Se enganchan a la ficha existente sin reescribirla: agrega botones a
   #ficha-tabs y paneles "data-panel" que el manejador de pestañas ya
   existente muestra/oculta. Cada panel se carga recién al abrirlo. */
const DovaFicha = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtGs, puede, badge, badgeFecha, etiqueta } = X;

  const OPC = (arr) => arr.map((v) => [v, etiqueta(v)]);
  const siNo = (b) => (b ? 'Sí' : 'No');

  // Tras cargar algo de salud, el banner de alertas de la ficha se actualiza.
  function refrescarBanner(pid) {
    const viejo = document.querySelector('.dova-ext-alertas-medicas');
    const cont = viejo ? viejo.parentElement : null;
    if (viejo) viejo.remove();
    if (cont) X.bannerAlertas(pid, cont, { emergentes: false });
  }
  const NIVEL_TXT = { critica: 'Crítica', atencion: 'Atención', info: 'Info' };

  // ============================== SALUD ==============================
  async function panelSalud(root, pid, refrescar) {
    if (refrescar) refrescarBanner(pid);
    const edita = puede('salud.edit');
    const cat = await X.catalogo('salud', '/salud/catalogos');
    root.innerHTML = `
      <div id="salud-verificar"></div>
      <div class="dova-ext-dos-col">
        <div><div id="salud-alergias"></div><div id="salud-condiciones"></div></div>
        <div><div id="salud-medicacion"></div><div id="salud-alertas-man"></div></div>
      </div>
      <div id="salud-anamnesis"></div>
      <div id="salud-signos"></div>`;
    // Verificador de medicamentos antes de recetar
    if (puede('salud.view', 'salud.edit', 'recetas.manage')) {
      const v = root.querySelector('#salud-verificar');
      v.innerHTML = `<div class="dova-ext-caja"><h4>Verificar medicamentos antes de indicar</h4>
        <p class="dova-nota">Escribí uno o más medicamentos separados por coma: DOVA revisa alergias (incluida la reacción cruzada), la medicación actual y las condiciones del paciente.</p>
        <form data-verificar class="dova-ext-filtros"><div style="flex:1;min-width:240px"><input name="meds" placeholder="Ej.: amoxicilina, ibuprofeno" required/></div><button class="dova-btn-primary">Verificar</button></form>
        <div data-resultado></div></div>`;
      v.querySelector('[data-verificar]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const meds = e.target.meds.value.split(',').map((s) => s.trim()).filter(Boolean);
        const out = v.querySelector('[data-resultado]');
        try {
          const r = await DOVA.post('/salud/verificar-medicamentos', { pacienteId: pid, medicamentos: meds });
          out.innerHTML = r.advertencias.length
            ? `<ul class="dova-ext-alertas-lista">${r.advertencias.map((a) => `<li>${badge(a.nivel === 'critica' ? 'Crítica' : a.nivel === 'atencion' ? 'Atención' : 'Info', a.nivel)} <strong>${esc(a.medicamento)}</strong>: ${esc(a.mensaje)}</li>`).join('')}</ul><p class="dova-nota">${esc(r.aviso)}</p>`
            : `<p>${badge('Sin advertencias', 'ok')} No se encontraron conflictos con lo registrado. <span class="dova-nota">${esc(r.aviso)}</span></p>`;
        } catch (ex) { out.innerHTML = `<p class="dova-error-text">${esc(ex.message)}</p>`; }
      });
    }
    X.tablaCrud({
      root: root.querySelector('#salud-alergias'), titulo: 'Alergias', endpoint: '/salud/alergias', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: edita, puedeEditar: edita, puedeBorrar: edita, vacio: 'Sin alergias registradas.',
      columnas: [
        { t: 'Sustancia', v: (r) => `<strong>${esc(r.sustancia)}</strong>` },
        { t: 'Severidad', v: (r) => badge(etiqueta(r.severidad), ['severa', 'anafilaxia'].includes(r.severidad) ? 'critica' : 'atencion') },
        { t: 'Reacción', v: (r) => esc(r.reaccion || '-') },
        { t: 'Activa', v: (r) => siNo(r.activa) },
      ],
      campos: [
        { k: 'sustancia', label: 'Sustancia', req: true },
        { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['medicamento', 'alimento', 'material', 'ambiental', 'otro']) },
        { k: 'severidad', label: 'Severidad', tipo: 'select', opciones: OPC(['leve', 'moderada', 'severa', 'anafilaxia']) },
        { k: 'reaccion', label: 'Reacción' },
        { k: 'activa', label: 'Activa', tipo: 'bool', soloEditar: true },
        { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      alGuardar: () => panelSalud(root, pid, true),
    });
    X.tablaCrud({
      root: root.querySelector('#salud-medicacion'), titulo: 'Medicación actual', endpoint: '/salud/medicacion', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: edita, puedeEditar: edita, puedeBorrar: edita, vacio: 'Sin medicación registrada.',
      columnas: [
        { t: 'Medicamento', v: (r) => `<strong>${esc(r.medicamento)}</strong>${r.activa ? '' : ' ' + badge('suspendida')}` },
        { t: 'Dosis', v: (r) => esc([r.dosis, r.frecuencia].filter(Boolean).join(' · ') || '-') },
        { t: 'Indicación', v: (r) => esc(r.indicacion || '-') },
      ],
      campos: [
        { k: 'medicamento', label: 'Medicamento', req: true }, { k: 'dosis', label: 'Dosis' }, { k: 'frecuencia', label: 'Frecuencia' },
        { k: 'indicacion', label: 'Indicación / motivo' }, { k: 'fechaInicio', label: 'Desde', tipo: 'fecha' }, { k: 'fechaFin', label: 'Hasta', tipo: 'fecha' },
        { k: 'activa', label: 'La toma actualmente', tipo: 'bool', soloEditar: true }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      alGuardar: () => panelSalud(root, pid, true),
    });
    X.tablaCrud({
      root: root.querySelector('#salud-condiciones'), titulo: 'Enfermedades generales', endpoint: '/salud/condiciones', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: edita, puedeEditar: edita, puedeBorrar: edita, vacio: 'Sin condiciones registradas.',
      columnas: [
        { t: 'Condición', v: (r) => `<strong>${esc((cat.condiciones.find((c) => c.codigo === r.condicion) || {}).nombre || r.condicion)}</strong>${r.detalle ? `<br><span class="dova-nota">${esc(r.detalle)}</span>` : ''}` },
        { t: 'Estado', v: (r) => esc(etiqueta(r.estado)) },
        { t: 'Premedicación', v: (r) => (r.requiere_premedicacion ? badge('Sí', 'critica') : 'No') },
      ],
      campos: [
        { k: 'condicion', label: 'Condición', tipo: 'select', req: true, opciones: cat.condiciones.map((c) => [c.codigo, c.nombre]) },
        { k: 'detalle', label: 'Detalle (tipo, control, médico tratante…)' },
        { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['activa', 'controlada', 'resuelta']) },
        { k: 'fechaDiagnostico', label: 'Diagnosticada', tipo: 'fecha' },
        { k: 'requierePremedicacion', label: 'Requiere premedicación antibiótica', tipo: 'bool' },
        { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      alGuardar: () => panelSalud(root, pid, true),
    });
    X.tablaCrud({
      root: root.querySelector('#salud-alertas-man'), titulo: 'Avisos del equipo', endpoint: '/salud/alertas-manuales', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Notas visibles para todos (ej.: "siempre llega tarde", "muy ansioso", "pide turnos por la tarde"). Las marcadas como emergentes aparecen en una ventana al abrir la ficha.',
      puedeCrear: puede('salud.edit', 'seguimiento.manage'), puedeEditar: puede('salud.edit', 'seguimiento.manage'), puedeBorrar: puede('salud.edit', 'seguimiento.manage'),
      columnas: [{ t: 'Aviso', v: (r) => esc(r.texto) }, { t: 'Nivel', v: (r) => badge(NIVEL_TXT[r.nivel] || r.nivel, r.nivel) }, { t: 'Aparece al abrir la ficha', v: (r) => siNo(r.emergente) }],
      alGuardar: () => panelSalud(root, pid, true),
      campos: [{ k: 'texto', label: 'Aviso', req: true, ancho: 'completo' }, { k: 'nivel', label: 'Nivel', tipo: 'select', opciones: Object.entries(NIVEL_TXT) }, { k: 'emergente', label: 'Mostrar en ventana emergente', tipo: 'bool' }, { k: 'activa', label: 'Activo', tipo: 'bool', soloEditar: true }],
    });
    // Anamnesis (cuestionario de salud con vencimiento)
    const anRoot = root.querySelector('#salud-anamnesis');
    const listaAn = await X.tablaCrud({
      root: anRoot, titulo: 'Cuestionario de salud (anamnesis)', endpoint: '/salud/anamnesis', query: `pacienteId=${pid}`,
      descripcion: 'Se recomienda actualizarlo al menos una vez por año: DOVA avisa cuando está vencido.',
      columnas: [
        { t: 'Fecha', v: (r) => fmtFecha(r.fecha) },
        { t: 'Firmada', v: (r) => (r.firmada ? badge('Firmada', 'ok') : badge('Sin firma', 'atencion')) },
        { t: 'Vigencia', v: (r) => `${r.vigencia_meses} meses` },
        { t: 'Respuestas "sí"', v: (r) => esc(Object.entries(r.respuestas || {}).filter(([, x]) => x && x.r === 'si').map(([k]) => (cat.preguntasAnamnesis.find((p) => p.codigo === k) || { texto: k }).texto.replace(/^¿|\?$/g, '')).join(' · ') || '—') },
      ],
      acciones: [{ texto: 'Ver', fn: (r) => verAnamnesis(r, cat) }],
    });
    if (edita && anRoot.querySelector('.dova-ext-toolbar')) {
      const b = document.createElement('button');
      b.className = 'dova-btn-primary'; b.textContent = (listaAn || []).length ? '+ Actualizar cuestionario' : '+ Completar cuestionario';
      anRoot.querySelector('.dova-ext-toolbar').appendChild(b);
      b.addEventListener('click', () => nuevaAnamnesis(pid, cat, (listaAn || [])[0], () => panelSalud(root, pid, true)));
    }
    X.tablaCrud({
      root: root.querySelector('#salud-signos'), titulo: 'Signos vitales', endpoint: '/salud/signos', query: `pacienteId=${pid}&limite=30`, fijos: { pacienteId: pid },
      puedeCrear: edita, puedeBorrar: edita, nuevoTexto: '+ Registrar signos',
      columnas: [
        { t: 'Fecha', v: (r) => X.fmtFechaHora(r.fecha) },
        { t: 'Presión', v: (r) => (r.presion_sistolica ? `${r.presion_sistolica}/${r.presion_diastolica || '-'} ${r.presion_sistolica >= 180 || r.presion_diastolica >= 110 ? badge('muy alta', 'critica') : r.presion_sistolica >= 140 || r.presion_diastolica >= 90 ? badge('elevada', 'atencion') : ''}` : '-') },
        { t: 'Pulso', v: (r) => esc(r.pulso ?? '-') }, { t: 'SpO₂', v: (r) => (r.spo2 ? `${r.spo2}%` : '-') },
        { t: 'Glucemia', v: (r) => esc(r.glucemia ?? '-') }, { t: 'Temp.', v: (r) => esc(r.temperatura ?? '-') },
        { t: 'Peso / IMC', v: (r) => (r.peso_kg ? `${r.peso_kg} kg${r.imc ? ` · IMC ${r.imc}` : ''}` : '-') },
      ],
      campos: [
        { k: 'presionSistolica', label: 'Presión sistólica', tipo: 'numero' }, { k: 'presionDiastolica', label: 'Presión diastólica', tipo: 'numero' },
        { k: 'pulso', label: 'Pulso (lpm)', tipo: 'numero' }, { k: 'spo2', label: 'Saturación O₂ (%)', tipo: 'numero' },
        { k: 'frecuenciaRespiratoria', label: 'Frec. respiratoria', tipo: 'numero' }, { k: 'temperatura', label: 'Temperatura (°C)', tipo: 'numero', paso: '0.1' },
        { k: 'glucemia', label: 'Glucemia (mg/dL)', tipo: 'numero' }, { k: 'pesoKg', label: 'Peso (kg)', tipo: 'numero', paso: '0.1' },
        { k: 'tallaCm', label: 'Talla (cm)', tipo: 'numero' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      alGuardar: () => panelSalud(root, pid, true),
    });
  }

  function verAnamnesis(r, cat) {
    X.modal(`Cuestionario del ${fmtFecha(r.fecha)}`, `
      <table class="dova-tabla"><tbody>${cat.preguntasAnamnesis.map((p) => { const x = (r.respuestas || {})[p.codigo]; return `<tr><td>${esc(p.texto)}</td><td><strong>${esc(x ? (x.r === 'si' ? 'Sí' : x.r === 'no' ? 'No' : '—') : '—')}</strong>${x && x.d ? ` — ${esc(x.d)}` : ''}</td></tr>`; }).join('')}</tbody></table>
      ${r.observaciones ? `<p><strong>Observaciones:</strong> ${esc(r.observaciones)}</p>` : ''}
      ${r.firma ? `<p><strong>Firma:</strong><br><img src="${esc(r.firma)}" alt="Firma del paciente" style="max-width:280px;border:1px solid var(--border)"/></p>` : ''}
      <div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
  }

  function nuevaAnamnesis(pid, cat, previa, listo) {
    const prev = (previa && previa.respuestas) || {};
    X.modal('Cuestionario de salud', `
      <form data-anamnesis>
        <p class="dova-nota">Se precargan las respuestas del último cuestionario: revisalas con el paciente.</p>
        ${cat.preguntasAnamnesis.map((p) => `<div class="dova-ext-pregunta"><span>${esc(p.texto)}</span>
          <div><select name="r_${p.codigo}"><option value="">—</option><option value="no" ${prev[p.codigo] && prev[p.codigo].r === 'no' ? 'selected' : ''}>No</option><option value="si" ${prev[p.codigo] && prev[p.codigo].r === 'si' ? 'selected' : ''}>Sí</option></select>
          <input name="d_${p.codigo}" placeholder="Detalle" value="${esc((prev[p.codigo] && prev[p.codigo].d) || '')}"/></div></div>`).join('')}
        <label style="margin-top:12px">Observaciones</label><textarea name="obs" rows="2"></textarea>
        <label>Firma del paciente (opcional)</label>
        <canvas data-firma width="420" height="120" style="border:1px solid var(--border-strong);border-radius:4px;touch-action:none;max-width:100%;background:#fff"></canvas>
        <div><button type="button" class="dova-btn-link" data-limpiar-firma>Limpiar firma</button></div>
        <label>Vigencia (meses)</label><input type="number" name="vig" value="12" min="1" max="60"/>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Guardar</button></div>
      </form>`, { ancho: 'ancho' });
    const form = document.querySelector('[data-anamnesis]');
    const canvas = form.querySelector('[data-firma]');
    const ctx = canvas.getContext('2d'); let dibujando = false; let firmo = false;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#2B2420';
    const pos = (e) => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * (canvas.width / b.width), (e.clientY - b.top) * (canvas.height / b.height)]; };
    canvas.addEventListener('pointerdown', (e) => { dibujando = true; firmo = true; ctx.beginPath(); ctx.moveTo(...pos(e)); });
    canvas.addEventListener('pointermove', (e) => { if (dibujando) { ctx.lineTo(...pos(e)); ctx.stroke(); } });
    window.addEventListener('pointerup', () => { dibujando = false; });
    form.querySelector('[data-limpiar-firma]').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); firmo = false; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const respuestas = {};
      for (const p of cat.preguntasAnamnesis) {
        const r = form[`r_${p.codigo}`].value; const d = form[`d_${p.codigo}`].value.trim();
        if (r || d) respuestas[p.codigo] = { r: r || null, d: d || null };
      }
      try {
        await DOVA.post('/salud/anamnesis', { pacienteId: pid, respuestas, observaciones: form.obs.value || undefined, firmada: firmo, firma: firmo ? canvas.toDataURL('image/png') : undefined, vigenciaMeses: Number(form.vig.value) || 12 });
        X.cerrarModal(); X.toast('Cuestionario guardado', 'ok'); listo();
      } catch (ex) { const er = form.querySelector('[data-error]'); er.textContent = ex.message; er.style.display = 'block'; }
    });
  }

  // =========================== PERIODONCIA ===========================
  const SUP = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
  const INF = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
  // Orden visual de los sitios: la cara distal siempre queda hacia afuera.
  const sitiosDe = (pieza, cara) => {
    const derecha = ['1', '4'].includes(pieza[0]);
    const v = derecha ? ['DV', 'V', 'MV'] : ['MV', 'V', 'DV'];
    const l = derecha ? ['DL', 'L', 'ML'] : ['ML', 'L', 'DL'];
    return cara === 'V' ? v : l;
  };

  function tablaPerio(piezas, datos, soloLectura, arcada) {
    const d = (p) => datos[p] || { sitios: {} };
    const s = (p, si) => (d(p).sitios && d(p).sitios[si]) || {};
    const aus = (p) => (d(p).ausente ? 'ausente' : '');
    const cab = `<tr><th class="dova-perio-rot">${arcada}</th>${piezas.map((p) => `<th colspan="3" class="dova-perio-pieza ${aus(p)}">${p}</th>`).join('')}</tr>`;
    const filaPieza = (rot, campo, opciones) => `<tr><th class="dova-perio-rot">${rot}</th>${piezas.map((p) => {
      const v = d(p)[campo];
      if (soloLectura) return `<td colspan="3" class="${aus(p)}">${campo === 'ausente' || campo === 'implante' ? (v ? '✓' : '') : (v ?? '')}</td>`;
      if (opciones) return `<td colspan="3" class="${aus(p)}"><select data-p="${p}" data-c="${campo}"><option value=""></option>${opciones.map((o) => `<option ${String(v) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select></td>`;
      return `<td colspan="3"><input type="checkbox" data-p="${p}" data-c="${campo}" ${v ? 'checked' : ''} aria-label="${rot} ${p}"/></td>`;
    }).join('')}</tr>`;
    const filaSitios = (rot, cara, med) => `<tr><th class="dova-perio-rot">${rot}</th>${piezas.map((p) => sitiosDe(p, cara).map((si) => {
      const x = s(p, si)[med];
      if (['sang', 'placa', 'sup'].includes(med)) {
        if (soloLectura) return `<td class="${aus(p)} ${x ? (med === 'placa' ? 'placa-si' : 'sang-si') : ''}">${x ? '•' : ''}</td>`;
        return `<td class="${aus(p)}"><input type="checkbox" data-p="${p}" data-s="${si}" data-m="${med}" ${x ? 'checked' : ''} aria-label="${rot} ${p} ${si}"/></td>`;
      }
      const clase = med === 'ps' && x !== undefined && x !== null ? (x >= 6 ? 'ps-alto' : x >= 4 ? 'ps-medio' : '') : '';
      if (soloLectura) return `<td class="${aus(p)} ${clase}">${x ?? ''}</td>`;
      return `<td class="${aus(p)}"><input type="text" inputmode="${med === 'mg' ? 'text' : 'numeric'}" data-p="${p}" data-s="${si}" data-m="${med}" value="${x ?? ''}" class="${clase}" aria-label="${rot} ${p} ${si}"/></td>`;
    }).join('')).join('')}</tr>`;
    const esSup = arcada === 'Superior';
    const cara2 = esSup ? 'Palatino' : 'Lingual';
    return `<table class="dova-perio">${cab}
      ${filaPieza('Ausente', 'ausente')}${filaPieza('Implante', 'implante')}${filaPieza('Movilidad', 'movilidad', [0, 1, 2, 3])}${filaPieza('Furca', 'furca', [0, 1, 2, 3])}
      ${filaSitios('Vest. sangrado', 'V', 'sang')}${filaSitios('Vest. placa', 'V', 'placa')}${filaSitios('Vest. supuración', 'V', 'sup')}
      ${filaSitios('Vest. margen (MG)', 'V', 'mg')}${filaSitios('Vest. sondaje (PS)', 'V', 'ps')}
      <tr class="dova-perio-sep"><td colspan="${piezas.length * 3 + 1}"></td></tr>
      ${filaSitios(`${cara2} sondaje (PS)`, 'L', 'ps')}${filaSitios(`${cara2} margen (MG)`, 'L', 'mg')}
      ${filaSitios(`${cara2} sangrado`, 'L', 'sang')}${filaSitios(`${cara2} placa`, 'L', 'placa')}${filaSitios(`${cara2} supuración`, 'L', 'sup')}
    </table>`;
  }

  function leerPerio(cont) {
    const datos = {};
    const pz = (p) => datos[p] || (datos[p] = { sitios: {} });
    cont.querySelectorAll('[data-c]').forEach((el) => {
      const p = pz(el.dataset.p);
      if (el.type === 'checkbox') p[el.dataset.c] = el.checked; else if (el.value !== '') p[el.dataset.c] = Number(el.value);
    });
    cont.querySelectorAll('[data-s]').forEach((el) => {
      const p = pz(el.dataset.p); const si = p.sitios[el.dataset.s] || (p.sitios[el.dataset.s] = {});
      if (el.type === 'checkbox') si[el.dataset.m] = el.checked; else if (el.value.trim() !== '') si[el.dataset.m] = Number(el.value.replace(',', '.'));
    });
    // Solo piezas con algún dato
    for (const [p, v] of Object.entries(datos)) {
      const tiene = v.ausente || v.implante || v.movilidad !== undefined || v.furca !== undefined || Object.values(v.sitios).some((s) => s.ps !== undefined || s.mg !== undefined || s.sang || s.placa || s.sup);
      if (!tiene) delete datos[p];
    }
    return datos;
  }

  const LEYENDA_PERIO = `<div class="dova-perio-leyenda"><span style="--c:var(--dova-ext-critica-bg)">PS ≥ 6 mm</span><span style="--c:var(--dova-ext-atencion-bg)">PS 4–5 mm</span><span style="--c:var(--rust)">Sangrado / supuración</span><span style="--c:#3F6FA1">Placa</span>
    <span style="--c:transparent">MG negativo = recesión · NIC = PS − MG</span></div>`;

  function indicesHtml(ix) {
    if (!ix) return '';
    const k = (v, l, alerta) => `<div class="dova-ext-kpi ${alerta ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${v ?? '—'}</div><div class="dova-ext-kpi-label">${l}</div></div>`;
    return `<div class="dova-ext-kpis">
      ${k(`${ix.sangradoPct}%`, 'Sangrado al sondaje (BOP)', ix.sangradoPct >= 10)}${k(`${ix.placaPct}%`, 'Índice de placa', ix.placaPct >= 20)}
      ${k(ix.psMedia, 'PS media (mm)')}${k(ix.nicMedio, 'NIC medio (mm)')}${k(ix.sitiosPs4a5, 'Sitios PS 4–5 mm', ix.sitiosPs4a5 > 0)}${k(ix.sitiosPs6oMas, 'Sitios PS ≥ 6 mm', ix.sitiosPs6oMas > 0)}
      ${k(ix.piezasPresentes, 'Piezas presentes')}${k(ix.piezasConMovilidad, 'Con movilidad', ix.piezasConMovilidad > 0)}${k(ix.piezasConFurca, 'Con lesión de furca', ix.piezasConFurca > 0)}
    </div>${ix.sugerencia ? `<p>${badge('Sugerencia automática', 'info')} <strong>${esc(ix.sugerencia.texto)}</strong> <span class="dova-nota">(clasificación AAP/EFP 2017 simplificada; confirmá con radiografías)</span></p>` : ''}`;
  }

  async function panelPerio(root, pid) {
    const edita = puede('periodoncia.edit');
    const [examenes, evol] = await Promise.all([DOVA.get(`/periodoncia/examenes?pacienteId=${pid}`), DOVA.get(`/periodoncia/paciente/${pid}/evolucion`)]);
    root.innerHTML = `
      <div class="dova-ext-toolbar"><h3 class="dova-section-title" style="margin:0">Periodontogramas</h3>
        <div>${edita ? `<button class="dova-btn-primary" data-nuevo-perio>+ Nuevo periodontograma</button>` : ''}</div></div>
      ${evol.length >= 2 ? `<div class="dova-ext-graficos" data-graf></div>` : ''}
      <table class="dova-tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>BOP</th><th>Placa</th><th>PS ≥ 4</th><th>Diagnóstico</th><th></th></tr></thead><tbody>
        ${examenes.map((e) => `<tr><td>${fmtFecha(e.fecha)}</td><td>${esc(etiqueta(e.tipo))}</td><td>${e.indices.sangradoPct}%</td><td>${e.indices.placaPct}%</td>
          <td>${(e.indices.sitiosPs4a5 || 0) + (e.indices.sitiosPs6oMas || 0)}</td>
          <td>${e.estadio ? `Estadio ${esc(e.estadio)}${e.grado ? ' grado ' + esc(e.grado) : ''}${e.extension ? ', ' + esc(e.extension) : ''}` : `<span class="dova-nota">${esc((e.indices.sugerencia || {}).texto || '-')}</span>`}</td>
          <td class="dova-ext-acciones"><button class="dova-btn-link" data-ver="${e.id}">Ver</button>${edita ? `<button class="dova-btn-link" data-editar="${e.id}">Editar</button><button class="dova-btn-link" data-clonar="${e.id}">Usar como base</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Todavía no hay periodontogramas.</td></tr>'}
      </tbody></table>
      ${examenes.length >= 2 ? `<div class="dova-ext-caja" style="margin-top:14px"><h4>Comparar exámenes</h4><div class="dova-ext-filtros">
        <div><label>Desde</label><select data-cmp-a>${examenes.map((e, i) => `<option value="${e.id}" ${i === examenes.length - 1 ? 'selected' : ''}>${fmtFecha(e.fecha)}</option>`).join('')}</select></div>
        <div><label>Hasta</label><select data-cmp-b>${examenes.map((e) => `<option value="${e.id}">${fmtFecha(e.fecha)}</option>`).join('')}</select></div>
        <button class="dova-btn-secundario" data-comparar>Comparar</button></div><div data-cmp-res></div></div>` : ''}
      <div data-perio-detalle></div>
      <div id="perio-psr" style="margin-top:18px"></div>`;
    if (evol.length >= 2) {
      const et = evol.map((e) => fmtFecha(e.fecha));
      const series = [
        { titulo: 'Sangrado al sondaje (%)', etiquetas: et, valores: evol.map((e) => e.indices.sangradoPct), tipo: 'lineas', formato: 'pct' },
        { titulo: 'Profundidad de sondaje media (mm)', etiquetas: et, valores: evol.map((e) => e.indices.psMedia), tipo: 'lineas' },
      ];
      const g = root.querySelector('[data-graf]');
      g.innerHTML = series.map((s) => X.grafico(s)).join('');
      X.activarGraficos(g, series);
    }
    const detalle = root.querySelector('[data-perio-detalle]');
    root.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
      const e = examenes.find((x) => x.id === Number(b.dataset.ver));
      detalle.innerHTML = `<div class="dova-ext-caja"><h4>Periodontograma del ${fmtFecha(e.fecha)} ${e.odontologo_nombre ? '— ' + esc(e.odontologo_nombre) : ''}</h4>
        ${indicesHtml(e.indices)}${LEYENDA_PERIO}
        <div class="dova-perio-wrap">${tablaPerio(SUP, e.datos, true, 'Superior')}<br>${tablaPerio(INF, e.datos, true, 'Inferior')}</div>
        ${e.diagnostico ? `<p><strong>Diagnóstico:</strong> ${esc(e.diagnostico)}</p>` : ''}${e.notas ? `<p><strong>Notas:</strong> ${esc(e.notas)}</p>` : ''}
        <button class="dova-btn-secundario" data-imprimir-perio>Imprimir</button></div>`;
      detalle.querySelector('[data-imprimir-perio]').addEventListener('click', () => X.imprimir('Periodontograma', `<h1>Periodontograma — ${fmtFecha(e.fecha)}</h1>${detalle.querySelector('.dova-ext-kpis').outerHTML.replace(/class="[^"]*"/g, '')}${detalle.querySelector('.dova-perio-wrap').innerHTML}`));
      detalle.scrollIntoView({ behavior: 'smooth' });
    }));
    const abrirEditor = (base, editandoId) => editorPerio(detalle, pid, base, editandoId, () => panelPerio(root, pid));
    const btnNuevo = root.querySelector('[data-nuevo-perio]');
    if (btnNuevo) btnNuevo.addEventListener('click', () => abrirEditor(null));
    root.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirEditor(examenes.find((x) => x.id === Number(b.dataset.editar)), Number(b.dataset.editar))));
    root.querySelectorAll('[data-clonar]').forEach((b) => b.addEventListener('click', () => {
      const e = examenes.find((x) => x.id === Number(b.dataset.clonar));
      abrirEditor({ ...e, fecha: X.hoy(), tipo: 'reevaluacion', estadio: null, grado: null, extension: null, diagnostico: '', notas: '' });
    }));
    const btnCmp = root.querySelector('[data-comparar]');
    if (btnCmp) btnCmp.addEventListener('click', async () => {
      const out = root.querySelector('[data-cmp-res]');
      try {
        const c = await DOVA.get(`/periodoncia/examenes/comparar?a=${root.querySelector('[data-cmp-a]').value}&b=${root.querySelector('[data-cmp-b]').value}`);
        const d = (v, inverso) => (v === null ? '—' : `<strong style="color:${(inverso ? v < 0 : v > 0) ? 'var(--rust)' : v === 0 ? 'inherit' : 'var(--sage-dark)'}">${v > 0 ? '+' : ''}${v}</strong>`);
        out.innerHTML = `<p>Del ${fmtFecha(c.desde.fecha)} al ${fmtFecha(c.hasta.fecha)}:</p>
          <div class="dova-ext-kpis">
            <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${d(c.indices.sangradoPct)} pp</div><div class="dova-ext-kpi-label">Sangrado</div></div>
            <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${d(c.indices.placaPct)} pp</div><div class="dova-ext-kpi-label">Placa</div></div>
            <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${d(c.indices.psMedia)} mm</div><div class="dova-ext-kpi-label">PS media</div></div>
            <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${d(c.indices.nicMedio)} mm</div><div class="dova-ext-kpi-label">NIC medio</div></div>
          </div>
          <p>${c.piezasQueEmpeoran.length ? `${badge('Empeoran', 'critica')} ${c.piezasQueEmpeoran.join(', ')}` : ''} ${c.piezasQueMejoran.length ? `${badge('Mejoran', 'ok')} ${c.piezasQueMejoran.join(', ')}` : ''}
          <span class="dova-nota">(cambio de ≥ 2 mm en PS o NIC en algún sitio)</span></p>`;
      } catch (ex) { out.innerHTML = `<p class="dova-error-text">${esc(ex.message)}</p>`; }
    });
    // PSR
    const edPsr = puede('periodoncia.edit');
    const opPsr = ['0', '1', '2', '3', '4', '0*', '1*', '2*', '3*', '4*', 'X'].map((v) => [v, v]);
    X.tablaCrud({
      root: root.querySelector('#perio-psr'), titulo: 'PSR / Examen periodontal básico', endpoint: '/periodoncia/psr', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Código por sextante (0–4; * = furca/movilidad/recesión ≥ 3,5 mm; X = sextante sin dientes). Código 3 o 4 indica hacer el periodontograma completo.',
      puedeCrear: edPsr, puedeBorrar: edPsr,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, ...['s1', 's2', 's3', 's4', 's5', 's6'].map((s, i) => ({ t: `S${i + 1}`, v: (r) => (r[s] && /[34]/.test(r[s]) ? badge(r[s], 'critica') : esc(r[s] || '-')) }))],
      campos: [{ k: 'fecha', label: 'Fecha', tipo: 'fecha' }, ...['s1', 's2', 's3', 's4', 's5', 's6'].map((s, i) => ({ k: s, label: `Sextante ${i + 1} (${['18-14', '13-23', '24-28', '38-34', '33-43', '44-48'][i]})`, tipo: 'select', opciones: opPsr })), { k: 'notas', label: 'Notas', tipo: 'textarea' }],
    });
  }

  async function editorPerio(cont, pid, base, editandoId, listo) {
    const datos = (base && base.datos) || {};
    const ods = await X.opcionesOdontologos();
    cont.innerHTML = `<div class="dova-ext-caja"><h4>${editandoId ? 'Editar' : 'Nuevo'} periodontograma</h4>
      <form data-perio-form>
        <div class="dova-ext-filtros">
          <div><label>Fecha</label><input type="date" name="fecha" value="${esc((base && String(base.fecha).slice(0, 10)) || X.hoy())}"/></div>
          <div><label>Tipo</label><select name="tipo">${['inicial', 'completo', 'reevaluacion', 'mantenimiento'].map((t) => `<option value="${t}" ${base && base.tipo === t ? 'selected' : ''}>${etiqueta(t)}</option>`).join('')}</select></div>
          <div><label>Odontólogo</label><select name="odontologoId"><option value="">—</option>${ods.map(([id, n]) => `<option value="${id}" ${base && base.odontologo_id === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          <div><label class="dova-ext-check"><input type="checkbox" name="fumador" ${base && base.fumador ? 'checked' : ''}/> Fumador</label></div>
          <div><label class="dova-ext-check"><input type="checkbox" name="diabetes" ${base && base.diabetes ? 'checked' : ''}/> Diabetes</label></div>
          <div><label class="dova-ext-check"><input type="checkbox" name="avance" checked/> Avance automático en PS (1 dígito)</label></div>
        </div>
        ${LEYENDA_PERIO}
        <div class="dova-perio-wrap" data-grilla>${tablaPerio(SUP, datos, false, 'Superior')}<br>${tablaPerio(INF, datos, false, 'Inferior')}</div>
        <div class="dova-ext-filtros" style="margin-top:12px">
          <div><label>Estadio (confirmado)</label><select name="estadio"><option value="">—</option>${['I', 'II', 'III', 'IV'].map((v) => `<option ${base && base.estadio === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label>Grado</label><select name="grado"><option value="">—</option>${['A', 'B', 'C'].map((v) => `<option ${base && base.grado === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label>Extensión</label><select name="extension"><option value="">—</option>${['localizada', 'generalizada', 'incisivo_molar'].map((v) => `<option value="${v}" ${base && base.extension === v ? 'selected' : ''}>${etiqueta(v)}</option>`).join('')}</select></div>
          <div style="flex:1;min-width:220px"><label>Diagnóstico / notas</label><input name="diagnostico" value="${esc((base && base.diagnostico) || '')}"/></div>
        </div>
        <p class="dova-nota">Al confirmar un estadio de periodontitis, DOVA programa solo el mantenimiento periodontal (cada 3 meses; 4 si es estadio I).</p>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cancelar>Cancelar</button><button class="dova-btn-primary">Guardar periodontograma</button></div>
      </form></div>`;
    const form = cont.querySelector('[data-perio-form]');
    const grilla = form.querySelector('[data-grilla]');
    // Avance automático: al escribir un dígito en PS salta al próximo sitio; colorea en vivo.
    const ps = () => Array.from(grilla.querySelectorAll('input[data-m="ps"]'));
    grilla.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.m === 'ps') {
        const n = Number(el.value);
        el.classList.toggle('ps-alto', el.value !== '' && n >= 6); el.classList.toggle('ps-medio', el.value !== '' && n >= 4 && n < 6);
        if (form.avance.checked && /^\d$/.test(el.value)) { const l = ps(); const i = l.indexOf(el); if (l[i + 1]) { l[i + 1].focus(); l[i + 1].select(); } }
      }
      if (el.dataset.c === 'ausente') grilla.querySelectorAll(`[data-p="${el.dataset.p}"]`).forEach((x) => { if (x !== el) x.closest('td').classList.toggle('ausente', el.checked); });
    });
    form.querySelector('[data-cancelar]').addEventListener('click', () => { cont.innerHTML = ''; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        fecha: form.fecha.value, tipo: form.tipo.value, odontologoId: form.odontologoId.value || null, fumador: form.fumador.checked, diabetes: form.diabetes.checked,
        estadio: form.estadio.value || null, grado: form.grado.value || null, extension: form.extension.value || null, diagnostico: form.diagnostico.value || null,
        datos: leerPerio(grilla),
      };
      try {
        if (editandoId) await DOVA.put(`/periodoncia/examenes/${editandoId}`, body);
        else await DOVA.post('/periodoncia/examenes', { ...body, pacienteId: pid });
        X.toast('Periodontograma guardado', 'ok'); listo();
      } catch (ex) { const er = form.querySelector('[data-error]'); er.textContent = ex.message; er.style.display = 'block'; }
    });
    cont.scrollIntoView({ behavior: 'smooth' });
    const primero = ps()[0]; if (primero) primero.focus();
  }

  // ========================== ESPECIALIDADES ==========================
  async function panelEspecialidades(root, pid) {
    const ed = puede('especialidades.edit');
    const ods = await X.opcionesOdontologos();
    X.subPestanas(root, [
      { id: 'implantes', texto: 'Implantes', render: (c) => subImplantes(c, pid, ed, ods) },
      { id: 'endo', texto: 'Endodoncia', render: (c) => subEndo(c, pid, ed, ods) },
      { id: 'orto', texto: 'Ortodoncia', render: (c) => subOrto(c, pid, ed, ods) },
      { id: 'prev', texto: 'Prevención', render: (c) => subPrevencion(c, pid, ed, ods) },
      { id: 'eval', texto: 'Evaluaciones', render: (c) => subEvaluaciones(c, pid, ed, ods) },
      { id: 'biopsias', texto: 'Biopsias', render: (c) => subBiopsias(c, pid, ed, ods) },
      { id: 'anestesia', texto: 'Anestesia', render: (c) => subAnestesia(c, pid, ed, ods) },
      { id: 'lab', texto: 'Laboratorio', visible: puede('laboratorio.manage', 'pacientes.clinical.view'), render: (c) => subLaboratorio(c, pid, ods) },
    ]);
  }

  function subImplantes(c, pid, ed, ods) {
    c.innerHTML = '<div data-t></div><div data-pasaporte></div>';
    X.tablaCrud({
      root: c.querySelector('[data-t]'), titulo: 'Implantes', endpoint: '/especialidades/implantes', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Registrar lote y número de serie permite ubicar al paciente si el fabricante retira un lote. Al colocar y al cargar el implante, DOVA programa solos los controles.',
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [
        { t: 'Pieza', v: (r) => `<strong>${esc(r.pieza)}</strong>` }, { t: 'Implante', v: (r) => esc([r.fabricante, r.sistema, r.diametro_mm && `Ø${r.diametro_mm}`, r.longitud_mm && `${r.longitud_mm} mm`].filter(Boolean).join(' · ')) },
        { t: 'Lote / serie', v: (r) => esc([r.lote, r.numero_serie].filter(Boolean).join(' / ') || '-') }, { t: 'Colocado', v: (r) => fmtFecha(r.fecha_colocacion) },
        { t: 'Torque / ISQ', v: (r) => esc([r.torque_insercion_ncm && `${r.torque_insercion_ncm} Ncm`, r.isq_inicial && `ISQ ${r.isq_inicial}`].filter(Boolean).join(' · ') || '-') },
        { t: 'Estado', v: (r) => badge(etiqueta(r.estado), ['fracaso', 'retirado'].includes(r.estado) ? 'critica' : r.estado === 'cargado' ? 'ok' : 'info') },
      ],
      campos: [
        { k: 'pieza', label: 'Pieza (FDI)', tipo: 'pieza', req: true }, { k: 'fabricante', label: 'Fabricante', req: true }, { k: 'sistema', label: 'Sistema / línea' }, { k: 'modeloRef', label: 'Referencia' },
        { k: 'lote', label: 'Lote' }, { k: 'numeroSerie', label: 'N.º de serie' }, { k: 'diametroMm', label: 'Diámetro (mm)', tipo: 'numero', paso: '0.1' }, { k: 'longitudMm', label: 'Longitud (mm)', tipo: 'numero', paso: '0.5' },
        { k: 'fechaColocacion', label: 'Fecha de colocación', tipo: 'fecha' }, { k: 'cirujanoId', label: 'Cirujano', tipo: 'select', opciones: ods },
        { k: 'torqueInsercionNcm', label: 'Torque de inserción (Ncm)', tipo: 'numero' }, { k: 'isqInicial', label: 'ISQ inicial', tipo: 'numero' }, { k: 'isqSegundaFase', label: 'ISQ 2.ª fase', tipo: 'numero' },
        { k: 'tipoOseo', label: 'Tipo óseo', tipo: 'select', opciones: OPC(['D1', 'D2', 'D3', 'D4']) }, { k: 'tecnica', label: 'Técnica', tipo: 'select', opciones: OPC(['una_etapa', 'dos_etapas', 'post_extraccion_inmediato', 'guiada']) },
        { k: 'carga', label: 'Carga', tipo: 'select', opciones: OPC(['inmediata', 'temprana', 'convencional']) }, { k: 'injerto', label: 'Injerto' }, { k: 'membrana', label: 'Membrana' },
        { k: 'fechaSegundaFase', label: 'Fecha 2.ª fase', tipo: 'fecha' }, { k: 'pilarTipo', label: 'Pilar' }, { k: 'pilarLote', label: 'Lote del pilar' }, { k: 'pilarTorqueNcm', label: 'Torque del pilar (Ncm)', tipo: 'numero' },
        { k: 'restauracionTipo', label: 'Restauración', tipo: 'select', opciones: OPC(['atornillada', 'cementada', 'sobredentadura', 'provisoria']) }, { k: 'fechaCarga', label: 'Fecha de carga', tipo: 'fecha' },
        { k: 'laboratorio', label: 'Laboratorio' }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['colocado', 'osteointegrado', 'cargado', 'fracaso', 'retirado']) },
        { k: 'fechaRetiro', label: 'Fecha de retiro', tipo: 'fecha', soloEditar: true }, { k: 'motivoRetiro', label: 'Motivo del retiro/fracaso', tipo: 'textarea', soloEditar: true }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
    }).then((filas) => {
      if (!filas || !filas.length) return;
      const p = c.querySelector('[data-pasaporte]');
      p.innerHTML = '<button class="dova-btn-secundario" data-pas>Imprimir tarjeta de implantes para el paciente</button>';
      p.querySelector('[data-pas]').addEventListener('click', async () => {
        const d = await DOVA.get(`/especialidades/implantes-pasaporte/${pid}`);
        X.imprimir('Pasaporte de implantes', `<h1>Pasaporte de implantes dentales</h1>
          <p><strong>${esc(d.paciente.nombre)} ${esc(d.paciente.apellido)}</strong> · C.I. ${esc(d.paciente.ci || '-')}</p>
          <table><thead><tr><th>Pieza</th><th>Fabricante / sistema</th><th>Medidas</th><th>Lote</th><th>Serie</th><th>Colocado</th><th>Cirujano</th></tr></thead><tbody>
          ${d.implantes.map((i) => `<tr><td>${esc(i.pieza)}</td><td>${esc(i.fabricante)} ${esc(i.sistema || '')}</td><td>${i.diametro_mm ? 'Ø' + esc(i.diametro_mm) : ''} ${i.longitud_mm ? esc(i.longitud_mm) + ' mm' : ''}</td><td>${esc(i.lote || '')}</td><td>${esc(i.numero_serie || '')}</td><td>${fmtFecha(i.fecha_colocacion)}</td><td>${esc(i.cirujano_nombre || '')}${i.cirujano_matricula ? ' (Mat. ' + esc(i.cirujano_matricula) + ')' : ''}</td></tr>`).join('')}
          </tbody></table><p class="nota">${esc(d.clinica.nombre)} ${d.clinica.telefono ? '· ' + esc(d.clinica.telefono) : ''}. Presentá este documento ante cualquier profesional que te atienda.</p>`);
      });
    });
  }

  const DX_PULPAR = ['normal', 'pulpitis_reversible', 'pulpitis_irreversible_sintomatica', 'pulpitis_irreversible_asintomatica', 'necrosis', 'previamente_tratado', 'previamente_iniciado'];
  const DX_PERI = ['normal', 'periodontitis_apical_sintomatica', 'periodontitis_apical_asintomatica', 'absceso_apical_agudo', 'absceso_apical_cronico', 'osteitis_condensante'];
  const PRUEBAS = ['frio', 'calor', 'ept', 'percusion_vertical', 'percusion_horizontal', 'palpacion', 'movilidad', 'sondaje', 'mordida'];

  function subEndo(c, pid, ed, ods) {
    X.tablaCrud({
      root: c, titulo: 'Endodoncias', endpoint: '/especialidades/endodoncias', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Al finalizar, DOVA programa los controles clínico-radiográficos a 6, 12 y 24 meses para seguir la curación.',
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [
        { t: 'Pieza', v: (r) => `<strong>${esc(r.pieza)}</strong>` }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) },
        { t: 'Diagnóstico', v: (r) => esc([r.diagnostico_pulpar, r.diagnostico_periapical].filter(Boolean).map(etiqueta).join(' / ') || '-') },
        { t: 'Conductos', v: (r) => esc((r.conductos || []).map((k) => `${k.conducto}${k.longitud_trabajo_mm ? ' ' + k.longitud_trabajo_mm + ' mm' : ''}${k.lima_maestra ? ' #' + k.lima_maestra : ''}`).join(' · ') || '-') },
        { t: 'Fechas', v: (r) => `${fmtFecha(r.fecha_inicio)}${r.fecha_fin ? ' → ' + fmtFecha(r.fecha_fin) : ''}` },
        { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'finalizada' ? 'ok' : r.estado === 'fracaso' ? 'critica' : 'info') },
      ],
      campos: [
        { k: 'pieza', label: 'Pieza', tipo: 'pieza', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['tratamiento', 'retratamiento', 'pulpotomia', 'pulpectomia', 'apicoformacion', 'regenerativa', 'cirugia_apical']) },
        { k: 'fechaInicio', label: 'Inicio', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods },
        { k: 'diagnosticoPulpar', label: 'Diagnóstico pulpar (AAE)', tipo: 'select', opciones: OPC(DX_PULPAR) }, { k: 'diagnosticoPeriapical', label: 'Diagnóstico periapical (AAE)', tipo: 'select', opciones: OPC(DX_PERI) },
        ...PRUEBAS.map((p) => ({ k: `prueba_${p}`, label: `Prueba: ${etiqueta(p)}`, tipo: 'select', opciones: OPC(['positivo', 'negativo', 'aumentado', 'retardado', 'dudoso', 'no_realizado']) })),
        { k: 'tecnicaInstrumentacion', label: 'Técnica de instrumentación' }, { k: 'sistemaLimas', label: 'Sistema de limas' }, { k: 'irrigacion', label: 'Irrigación' },
        { k: 'medicacionIntraconducto', label: 'Medicación intraconducto' }, { k: 'restauracionProvisoria', label: 'Restauración provisoria' },
        { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['en_curso', 'finalizada', 'fracaso', 'derivada', 'abandonada']) }, { k: 'fechaFin', label: 'Fin', tipo: 'fecha', soloEditar: true },
        { k: 'complicaciones', label: 'Complicaciones', tipo: 'textarea' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      preparar: (d, fila) => {
        const pr = { ...((fila && fila.pruebas) || {}) };
        for (const p of PRUEBAS) { const k = `prueba_${p}`; if (k in d) { if (d[k]) pr[p] = d[k]; else delete pr[p]; delete d[k]; } }
        d.pruebas = pr;
      },
      // Las pruebas se guardan como un objeto; en el formulario son campos planos.
      valoresEditar: (r) => ({ ...r, ...Object.fromEntries(Object.entries(r.pruebas || {}).map(([k, v]) => [`prueba_${k}`, v])) }),
      acciones: [{ texto: 'Conductos', fn: (r, recargar) => editarConductos(r, ed, recargar) }],
    });
  }

  function editarConductos(endo, ed, recargar) {
    const filas = (endo.conductos || []).length ? endo.conductos : [{ conducto: '' }];
    const col = [['conducto', 'Conducto'], ['referencia', 'Referencia'], ['longitudTentativaMm', 'LT (mm)'], ['longitudTrabajoMm', 'LW (mm)'], ['limaInicial', 'Lima inicial'], ['limaMaestra', 'Lima maestra'], ['conicidad', 'Conicidad'], ['tecnicaObturacion', 'Obturación'], ['conoPrincipal', 'Cono'], ['sellador', 'Sellador'], ['longitudObturacionMm', 'Long. obt.']];
    const snake = (k) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
    const filaHtml = (f) => `<tr>${col.map(([k]) => `<td><input data-k="${k}" value="${esc(f[k] ?? f[snake(k)] ?? '')}" style="min-width:60px;margin:0" ${ed ? '' : 'disabled'}/></td>`).join('')}${ed ? '<td><button type="button" class="dova-btn-link dova-ext-peligro" data-quitar>✕</button></td>' : ''}</tr>`;
    X.modal(`Conductos — pieza ${endo.pieza}`, `
      <p class="dova-nota">LT = longitud tentativa; LW = longitud de trabajo (conductometría / localizador apical).</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla" data-cond><thead><tr>${col.map(([, t]) => `<th>${t}</th>`).join('')}${ed ? '<th></th>' : ''}</tr></thead><tbody>${filas.map(filaHtml).join('')}</tbody></table></div>
      ${ed ? '<button type="button" class="dova-btn-link" data-agregar>+ Agregar conducto</button>' : ''}
      <p class="dova-error-text" data-error style="display:none"></p>
      <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button>${ed ? '<button class="dova-btn-primary" data-guardar>Guardar conductos</button>' : ''}</div>`, { ancho: 'muyancho' });
    const tb = document.querySelector('[data-cond] tbody');
    const enlazar = () => tb.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => b.closest('tr').remove(); });
    enlazar();
    const ag = document.querySelector('[data-agregar]');
    if (ag) ag.addEventListener('click', () => { tb.insertAdjacentHTML('beforeend', filaHtml({})); enlazar(); });
    const g = document.querySelector('[data-guardar]');
    if (g) g.addEventListener('click', async () => {
      const conductos = Array.from(tb.querySelectorAll('tr')).map((tr) => Object.fromEntries(Array.from(tr.querySelectorAll('[data-k]')).map((i) => [i.dataset.k, i.value.trim() === '' ? null : i.value.trim().replace(',', '.')]))).filter((x) => x.conducto);
      try { await DOVA.put(`/especialidades/endodoncias/${endo.id}/conductos`, { conductos }); X.cerrarModal(); X.toast('Conductos guardados', 'ok'); recargar(); } catch (ex) { const e = document.querySelector('[data-error]'); e.textContent = ex.message; e.style.display = 'block'; }
    });
  }

  function subOrto(c, pid, ed, ods) {
    c.innerHTML = '<div data-casos></div><div data-visitas></div>';
    const CL = OPC(['I', 'II', 'II_1', 'II_2', 'III', 'no_evaluable']);
    X.tablaCrud({
      root: c.querySelector('[data-casos]'), titulo: 'Casos de ortodoncia', endpoint: '/especialidades/orto-casos', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Fase activa: DOVA programa el control mensual. Al pasar a contención: controles a 1, 3, 6 y 12 meses y control de retenedores cada 6 meses.',
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [
        { t: 'Aparatología', v: (r) => esc(etiqueta(r.tipo_aparatologia) + (r.marca ? ` (${r.marca})` : '')) },
        { t: 'Diagnóstico', v: (r) => esc([r.clase_molar_derecha && `Molar D ${r.clase_molar_derecha}`, r.clase_molar_izquierda && `Molar I ${r.clase_molar_izquierda}`, r.overjet_mm != null && `OJ ${r.overjet_mm}`, r.overbite_mm != null && `OB ${r.overbite_mm}`].filter(Boolean).join(' · ') || '-') },
        { t: 'Instalación / retiro', v: (r) => `${fmtFecha(r.fecha_instalacion)} → ${fmtFecha(r.fecha_retiro_real || r.fecha_retiro_estimada)}` },
        { t: 'Progreso', v: (r) => (r.total_alineadores ? `Alineador ${r.alineador_actual || 0}/${r.total_alineadores}` : `${r.cantidad_visitas} visitas`) },
        { t: 'Colaboración', v: (r) => esc(r.colaboracion_promedio ? `${r.colaboracion_promedio}/5 · higiene ${r.higiene_promedio}/5 · ${r.total_brackets_despegados} brackets despegados` : '-') },
        { t: 'Fase', v: (r) => badge(etiqueta(r.fase), r.fase === 'abandonada' ? 'critica' : r.fase === 'finalizada' ? 'ok' : 'info') },
      ],
      campos: [
        { k: 'odontologoId', label: 'Ortodoncista', tipo: 'select', opciones: ods }, { k: 'fase', label: 'Fase', tipo: 'select', opciones: OPC(['diagnostico', 'activa', 'contencion', 'finalizada', 'abandonada']) },
        { k: 'claseMolarDerecha', label: 'Clase molar der.', tipo: 'select', opciones: CL }, { k: 'claseMolarIzquierda', label: 'Clase molar izq.', tipo: 'select', opciones: CL },
        { k: 'claseCaninaDerecha', label: 'Clase canina der.', tipo: 'select', opciones: CL }, { k: 'claseCaninaIzquierda', label: 'Clase canina izq.', tipo: 'select', opciones: CL },
        { k: 'overjetMm', label: 'Overjet (mm)', tipo: 'numero', paso: '0.5' }, { k: 'overbiteMm', label: 'Overbite (mm)', tipo: 'numero', paso: '0.5' },
        { k: 'mordidaCruzada', label: 'Mordida cruzada' }, { k: 'apinamiento', label: 'Apiñamiento' }, { k: 'lineaMedia', label: 'Línea media' },
        { k: 'tipoAparatologia', label: 'Aparatología', tipo: 'select', opciones: OPC(['brackets_metalicos', 'brackets_esteticos', 'autoligado', 'linguales', 'alineadores', 'removible', 'funcional', 'expansor', 'otro']) },
        { k: 'marca', label: 'Marca' }, { k: 'totalAlineadores', label: 'Total de alineadores', tipo: 'numero' }, { k: 'diasPorAlineador', label: 'Días por alineador', tipo: 'numero' },
        { k: 'fechaInstalacion', label: 'Instalación', tipo: 'fecha' }, { k: 'fechaRetiroEstimada', label: 'Retiro estimado', tipo: 'fecha' }, { k: 'fechaRetiroReal', label: 'Retiro real', tipo: 'fecha', soloEditar: true },
        { k: 'honorarioTotal', label: 'Honorario total (Gs.)', tipo: 'numero' }, { k: 'entregaInicial', label: 'Entrega inicial', tipo: 'numero' }, { k: 'cuotaMensual', label: 'Cuota mensual', tipo: 'numero' },
        { k: 'contencionSuperior', label: 'Contención superior' }, { k: 'contencionInferior', label: 'Contención inferior' },
        { k: 'diagnostico', label: 'Diagnóstico', tipo: 'textarea' }, { k: 'objetivos', label: 'Objetivos del tratamiento', tipo: 'textarea' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
      acciones: [{ texto: 'Visitas', fn: (r) => visitasOrto(c.querySelector('[data-visitas]'), r, ed, ods) }],
    });
  }

  function visitasOrto(cont, caso, ed, ods) {
    X.tablaCrud({
      root: cont, titulo: `Visitas del caso (${etiqueta(caso.tipo_aparatologia)})`, endpoint: '/especialidades/orto-visitas', query: `casoId=${caso.id}`, fijos: { casoId: caso.id },
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed, nuevoTexto: '+ Registrar visita',
      columnas: [
        { t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Arcos', v: (r) => esc([r.arco_superior && `Sup: ${r.arco_superior}`, r.arco_inferior && `Inf: ${r.arco_inferior}`].filter(Boolean).join(' · ') || '-') },
        { t: 'Elásticos', v: (r) => esc(r.elasticos || '-') }, { t: 'Alineador', v: (r) => esc(r.alineador_actual ?? '-') },
        { t: 'Higiene / colab.', v: (r) => `${r.higiene ?? '-'} / ${r.colaboracion ?? '-'}` }, { t: 'Brackets desp.', v: (r) => (r.brackets_despegados ? badge(r.brackets_despegados, 'atencion') : '0') },
        { t: 'Próximo paso', v: (r) => esc(r.proximo_paso || '-') },
      ],
      campos: [
        { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods },
        { k: 'arcoSuperior', label: 'Arco superior (ej. 0.016 NiTi)' }, { k: 'arcoInferior', label: 'Arco inferior' }, { k: 'elasticos', label: 'Elásticos' },
        { k: 'alineadorActual', label: 'Alineador actual', tipo: 'numero' }, { k: 'bracketsDespegados', label: 'Brackets despegados', tipo: 'numero' },
        { k: 'higiene', label: 'Higiene (1–5)', tipo: 'select', opciones: [1, 2, 3, 4, 5].map((n) => [n, n]) }, { k: 'colaboracion', label: 'Colaboración (1–5)', tipo: 'select', opciones: [1, 2, 3, 4, 5].map((n) => [n, n]) },
        { k: 'procedimiento', label: 'Procedimiento', tipo: 'textarea' }, { k: 'proximoPaso', label: 'Próximo paso', tipo: 'textarea' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
    });
    cont.scrollIntoView({ behavior: 'smooth' });
  }

  async function subPrevencion(c, pid, ed, ods) {
    c.innerHTML = '<div data-prev></div><div data-riesgo></div>';
    X.tablaCrud({
      root: c.querySelector('[data-prev]'), titulo: 'Aplicaciones preventivas', endpoint: '/especialidades/preventivos', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Sellantes, flúor y profilaxis actualizan solos el próximo control.',
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Pieza', v: (r) => esc(r.pieza || '-') }, { t: 'Producto / lote', v: (r) => esc([r.producto, r.lote].filter(Boolean).join(' / ') || '-') }, { t: 'Retención', v: (r) => (r.estado_retencion ? badge(etiqueta(r.estado_retencion), r.estado_retencion === 'perdida' ? 'critica' : r.estado_retencion === 'parcial' ? 'atencion' : 'ok') : '-') }],
      campos: [
        { k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: OPC(['sellante', 'fluor_barniz', 'fluor_gel', 'profilaxis', 'ionomero_preventivo', 'clorhexidina', 'diamino_fluoruro_plata', 'infiltracion_resina', 'otro']) },
        { k: 'pieza', label: 'Pieza (si aplica)', tipo: 'pieza' }, { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods },
        { k: 'producto', label: 'Producto' }, { k: 'lote', label: 'Lote' }, { k: 'estadoRetencion', label: 'Retención (en controles)', tipo: 'select', opciones: OPC(['completa', 'parcial', 'perdida']) },
        { k: 'fechaRevision', label: 'Revisado el', tipo: 'fecha' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
    });
    const cat = await X.catalogo('riesgoCaries', '/especialidades/riesgo-caries-catalogo');
    const grupo = (nombre, claves) => `<h4>${nombre}</h4><div class="dova-ext-grupo-checks">${claves.map((k) => `<label class="dova-ext-check"><input type="checkbox" data-grupo="${nombre}" value="${k}"/> ${esc(etiqueta(k))}</label>`).join('')}</div>`;
    const rc = c.querySelector('[data-riesgo]');
    await X.tablaCrud({
      root: rc, titulo: 'Riesgo de caries', endpoint: '/especialidades/riesgo-caries', query: `pacienteId=${pid}`, puedeBorrar: ed,
      descripcion: 'Evaluación tipo CAMBRA: el nivel y el intervalo de control se calculan solos y actualizan los controles periódicos de control y flúor.',
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Nivel', v: (r) => badge(etiqueta(r.nivel), r.nivel === 'bajo' ? 'ok' : r.nivel === 'moderado' ? 'atencion' : 'critica') }, { t: 'Control sugerido', v: (r) => `cada ${r.recall_sugerido_meses} meses` }, { t: 'Recomendaciones', v: (r) => `<span class="dova-nota">${esc(r.recomendaciones || '')}</span>` }],
    });
    if (ed) {
      const b = document.createElement('button'); b.className = 'dova-btn-primary'; b.textContent = '+ Evaluar riesgo';
      rc.querySelector('.dova-ext-toolbar').appendChild(b);
      b.addEventListener('click', () => {
        X.modal('Evaluación de riesgo de caries', `<form data-rc>${grupo('Indicadores de enfermedad', cat.indicadores)}${grupo('Factores de riesgo', cat.riesgo)}${grupo('Factores de protección', cat.proteccion)}
          <label>Notas</label><textarea name="notas" rows="2"></textarea><p class="dova-error-text" data-error style="display:none"></p>
          <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Calcular y guardar</button></div></form>`, { ancho: 'ancho' });
        const f = document.querySelector('[data-rc]');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const sel = (g) => Object.fromEntries(Array.from(f.querySelectorAll(`[data-grupo="${g}"]:checked`)).map((i) => [i.value, true]));
          try {
            const r = await DOVA.post('/especialidades/riesgo-caries', { pacienteId: pid, indicadores: sel('Indicadores de enfermedad'), factoresRiesgo: sel('Factores de riesgo'), factoresProteccion: sel('Factores de protección'), notas: f.notas.value || undefined });
            X.cerrarModal(); X.toast(`Riesgo ${r.nivel}: control cada ${r.recall_sugerido_meses} meses`, 'ok'); subPrevencion(c, pid, ed, ods);
          } catch (ex) { const er = f.querySelector('[data-error]'); er.textContent = ex.message; er.style.display = 'block'; }
        });
      });
    }
  }

  function subEvaluaciones(c, pid, ed, ods) {
    const AYUDA = { asa: 'I sano · II enfermedad leve · III grave · IV amenaza vital · V moribundo', frankl: '1 definitivamente negativo · 2 negativo · 3 positivo · 4 definitivamente positivo', eva_dolor: '0 sin dolor — 10 máximo', corah: 'Escala de ansiedad dental (4–20; ≥ 15 ansiedad alta)', oleary: '% de superficies con placa', mallampati: 'Clase I–IV', bruxismo: 'Ausente / posible / probable / definitivo', apertura_bucal_mm: 'Apertura máxima interincisal (mm)' };
    X.tablaCrud({
      root: c, titulo: 'Evaluaciones clínicas', endpoint: '/especialidades/evaluaciones', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: Object.entries(AYUDA).map(([k, v]) => `<strong>${esc(etiqueta(k))}</strong>: ${esc(v)}`).join(' · '),
      puedeCrear: ed, puedeBorrar: ed,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Escala', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Valor', v: (r) => `<strong>${esc(r.valor)}</strong>` }, { t: 'Notas', v: (r) => esc(r.notas || '-') }],
      campos: [{ k: 'tipo', label: 'Escala', tipo: 'select', req: true, opciones: OPC(Object.keys(AYUDA)) }, { k: 'valor', label: 'Valor', req: true }, { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
    });
  }

  function subBiopsias(c, pid, ed, ods) {
    X.tablaCrud({
      root: c, titulo: 'Biopsias', endpoint: '/especialidades/biopsias', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Seguí cada muestra hasta que el resultado esté informado al paciente. Si requiere seguimiento, se programan controles a 3 y 6 meses.',
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [{ t: 'Toma', v: (r) => fmtFecha(r.fecha_toma) }, { t: 'Zona', v: (r) => esc(r.zona) }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Resultado', v: (r) => esc(r.diagnostico_histopatologico || '-') }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), ['tomada', 'enviada'].includes(r.estado) ? 'atencion' : 'ok') }],
      campos: [
        { k: 'zona', label: 'Zona / lesión', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: OPC(['incisional', 'excisional', 'puncion', 'citologia', 'cepillado']) },
        { k: 'fechaToma', label: 'Fecha de toma', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'laboratorioPatologia', label: 'Laboratorio de patología' },
        { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['tomada', 'enviada', 'resultado_recibido', 'informada_paciente', 'cerrada']) },
        { k: 'fechaEnvio', label: 'Enviada', tipo: 'fecha', soloEditar: true }, { k: 'fechaResultado', label: 'Resultado', tipo: 'fecha', soloEditar: true },
        { k: 'descripcionLesion', label: 'Descripción clínica de la lesión', tipo: 'textarea' }, { k: 'diagnosticoHistopatologico', label: 'Diagnóstico histopatológico', tipo: 'textarea', soloEditar: true },
        { k: 'requiereSeguimiento', label: 'Requiere seguimiento', tipo: 'bool' }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
      ],
    });
  }

  function subAnestesia(c, pid, ed, ods) {
    c.innerHTML = `<div class="dova-ext-caja"><h4>Dosis máxima según peso</h4><form class="dova-ext-filtros" data-dosis><div><label>Peso (kg)</label><input type="number" name="peso" min="1" max="300" required/></div><button class="dova-btn-secundario">Calcular</button></form><div data-dosis-res></div></div><div data-t></div>`;
    c.querySelector('[data-dosis]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await DOVA.get(`/especialidades/anestesia-dosis-maxima?pesoKg=${e.target.peso.value}`);
      c.querySelector('[data-dosis-res]').innerHTML = `<table class="dova-tabla"><thead><tr><th>Anestésico</th><th>mg máx.</th><th>Cartuchos máx. (1,8 ml)</th></tr></thead><tbody>${r.dosis.map((d) => `<tr><td>${esc(d.anestesico)}</td><td>${d.mgMaximos}</td><td><strong>${d.cartuchosMaximos}</strong></td></tr>`).join('')}</tbody></table><p class="dova-nota">${esc(r.aviso)}</p>`;
    });
    X.tablaCrud({
      root: c.querySelector('[data-t]'), titulo: 'Registro de anestesia', endpoint: '/especialidades/anestesias', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: ed, puedeBorrar: ed,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Anestésico', v: (r) => esc([etiqueta(r.anestesico), r.concentracion, r.vasoconstrictor].filter(Boolean).join(' ')) }, { t: 'Cartuchos', v: (r) => esc(r.cartuchos) }, { t: 'Técnica / zona', v: (r) => esc([r.tecnica && etiqueta(r.tecnica), r.zona].filter(Boolean).join(' · ') || '-') }, { t: 'Lote', v: (r) => esc(r.lote || '-') }, { t: 'Reacción', v: (r) => (r.reaccion_adversa ? badge(r.reaccion_adversa, 'critica') : '-') }],
      campos: [
        { k: 'anestesico', label: 'Anestésico', tipo: 'select', req: true, opciones: OPC(['lidocaina', 'articaina', 'mepivacaina', 'prilocaina', 'bupivacaina', 'topica', 'otro']) }, { k: 'concentracion', label: 'Concentración' },
        { k: 'vasoconstrictor', label: 'Vasoconstrictor' }, { k: 'cartuchos', label: 'Cartuchos', tipo: 'numero', paso: '0.25' },
        { k: 'tecnica', label: 'Técnica', tipo: 'select', opciones: OPC(['infiltrativa', 'troncular_dentario_inferior', 'mentoniana', 'infraorbitaria', 'palatina', 'nasopalatina', 'intraligamentaria', 'intrapulpar', 'topica', 'otra']) },
        { k: 'zona', label: 'Zona' }, { k: 'lote', label: 'Lote' }, { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods },
        { k: 'reaccionAdversa', label: 'Reacción adversa (si hubo)', tipo: 'textarea' },
      ],
    });
  }

  function subLaboratorio(c, pid, ods) {
    const ed = puede('laboratorio.manage');
    X.catalogo('laboratorios', '/operaciones/laboratorios').catch(() => []).then((labs) => X.tablaCrud({
      root: c, titulo: 'Trabajos de laboratorio', endpoint: '/operaciones/trabajos-laboratorio', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: ed, puedeEditar: ed,
      claseFila: (r) => (r.atrasado ? 'dova-ext-fila-alerta' : ''),
      columnas: [{ t: 'Trabajo', v: (r) => `<strong>${esc(r.trabajo)}</strong>${r.pieza ? ` — ${esc(r.pieza)}` : ''}${r.color_tono ? ` · ${esc(r.color_tono)}` : ''}` }, { t: 'Laboratorio', v: (r) => esc(r.laboratorio_nombre || '-') }, { t: 'Enviado', v: (r) => fmtFecha(r.fecha_envio) }, { t: 'Estimado', v: (r) => `${fmtFecha(r.fecha_estimada)} ${r.atrasado ? badge('atrasado', 'critica') : ''}` }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'rehacer' ? 'critica' : ['instalado', 'entregado', 'controlado'].includes(r.estado) ? 'ok' : 'info') }],
      campos: camposTrabajoLab(labs, ods),
      acciones: [{ texto: 'Archivos', fn: (r) => archivosLab(r) }],
    }));
  }


  // Archivos de un trabajo de laboratorio: fotos de color, PDF de la orden y modelos STL.
  async function archivosLab(t) {
    const ed = puede('laboratorio.manage');
    X.modal(`Archivos — ${t.trabajo}`, `<div data-lista>${X.cargando}</div>
      ${ed ? `<form data-subir class="dova-ext-form-grid"><div class="dova-ext-campo dova-ext-campo-completo"><label>Agregar archivo (foto, PDF o STL, hasta 30 MB)</label><input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf,.stl" required/></div>
        <p class="dova-error-text" data-error hidden></p><button class="dova-btn-primary">Subir</button></form>` : ''}
      <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    const box = document.querySelector('.dova-modal-box');
    const tam = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    const cargar = async () => {
      const cont = box.querySelector('[data-lista]');
      try {
        const lista = await DOVA.get(`/clinico/laboratorio/${t.id}/archivos`);
        cont.innerHTML = lista.length ? `<ul class="dova-cli-doclista">${lista.map((a) => `<li><span><button class="dova-btn-link" data-ver="${a.id}" data-nombre="${esc(a.nombre)}">${a.mime === 'model/stl' ? '🧊' : a.mime === 'application/pdf' ? '📄' : '🖼'} ${esc(a.nombre)}</button>
          ${ed && (a.subido_por === (DOVA.usuarioActual() || {}).id || puede('usuarios.manage')) ? `<button class="dova-btn-link dova-ext-peligro" data-borrar="${a.id}">Quitar</button>` : ''}</span><span class="dova-nota">${tam(a.tamano)} · ${esc(a.subido_por_nombre || '')} · ${X.fmtFechaHora(a.creado_en)}</span></li>`).join('')}</ul>` : '<p class="dova-nota">Todavía no hay archivos.</p>';
        cont.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', async () => {
          try {
            const r = await DOVA.request(`/clinico/laboratorio/archivos/${b.dataset.ver}`, { raw: true });
            if (!r.ok) throw new Error('No se pudo abrir el archivo');
            const blob = await r.blob(); const u = URL.createObjectURL(blob);
            if (/^image\/|pdf/.test(blob.type)) window.open(u, '_blank', 'noopener');
            else { const a = document.createElement('a'); a.href = u; a.download = b.dataset.nombre; document.body.appendChild(a); a.click(); a.remove(); }
          } catch (e) { X.toast(e.message, 'error'); }
        }));
        cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
          if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Tocá de nuevo'; return; }
          try { await DOVA.del(`/clinico/laboratorio/archivos/${b.dataset.borrar}`); X.toast('Archivo quitado', 'ok'); cargar(); } catch (e) { X.toast(e.message, 'error'); }
        }));
      } catch (e) { cont.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
    };
    const f = box.querySelector('[data-subir]');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = f.querySelector('[data-error]'); err.hidden = true;
      const a = f.archivo.files[0];
      if (!a) return;
      if (a.size > 30 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 30 MB'; err.hidden = false; return; }
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Subiendo…';
      try { const fd = new FormData(); fd.append('archivo', a); await DOVA.postForm(`/clinico/laboratorio/${t.id}/archivos`, fd); X.toast('Archivo guardado', 'ok'); f.reset(); cargar(); } catch (er) { err.textContent = er.message; err.hidden = false; }
      b.disabled = false; b.textContent = 'Subir';
    });
    cargar();
  }

  function camposTrabajoLab(labs, ods) {
    return [
      { k: 'trabajo', label: 'Trabajo', req: true }, { k: 'pieza', label: 'Pieza(s)' }, { k: 'laboratorioId', label: 'Laboratorio', tipo: 'select', opciones: (labs || []).map((l) => [l.id, l.nombre]) },
      { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'material', label: 'Material' }, { k: 'colorTono', label: 'Color / tono' },
      { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['solicitado', 'enviado', 'en_proceso', 'recibido', 'controlado', 'instalado', 'rehacer', 'entregado', 'cancelado']) },
      { k: 'fechaEnvio', label: 'Envío', tipo: 'fecha' }, { k: 'fechaEstimada', label: 'Entrega estimada', tipo: 'fecha', ayuda: 'Si la dejás vacía se calcula con los días hábiles del laboratorio.' },
      { k: 'costo', label: 'Costo del laboratorio', tipo: 'numero' }, { k: 'precioPaciente', label: 'Precio al paciente', tipo: 'numero' }, { k: 'facturaNumero', label: 'Factura N.º' },
      { k: 'instrucciones', label: 'Instrucciones', tipo: 'textarea' }, { k: 'motivoRehacer', label: 'Motivo (si se rehace)', tipo: 'textarea', soloEditar: true }, { k: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
    ];
  }

  // ============================ SEGUIMIENTO ============================
  async function panelSeguimiento(root, pid) {
    const man = puede('recalls.manage');
    const [tipos, seg] = await Promise.all([X.catalogo('recallTipos', '/recalls/tipos').catch(() => []), DOVA.get(`/seguimiento/paciente/${pid}`)]);
    const ods = await X.opcionesOdontologos();
    root.innerHTML = `
      <div class="dova-ext-toolbar"><h3 class="dova-section-title" style="margin:0">Controles periódicos</h3>${man ? '<button class="dova-btn-primary" data-asignar>+ Programar control periódico</button>' : ''}</div>
      <table class="dova-tabla"><thead><tr><th>Tipo</th><th>Cada</th><th>Última</th><th>Próxima</th><th>Estado</th><th>Contactos</th><th></th></tr></thead><tbody>
      ${seg.recalls.map((r) => `<tr><td><strong>${esc(r.tipo_nombre)}</strong></td><td>${r.intervalo_efectivo} meses</td><td>${fmtFecha(r.ultima_fecha)}</td><td>${r.estado === 'activo' ? badgeFecha(r.proxima_fecha) : fmtFecha(r.proxima_fecha)}</td>
        <td>${badge(etiqueta(r.estado), r.estado === 'activo' ? 'ok' : 'info')}${r.pausado_hasta ? `<br><span class="dova-nota">hasta ${fmtFecha(r.pausado_hasta)}</span>` : ''}</td>
        <td>${r.intentos_contacto}${r.ultimo_contacto_resultado ? ` · ${esc(etiqueta(r.ultimo_contacto_resultado))}` : ''}</td>
        <td class="dova-ext-acciones">${man ? `<button class="dova-btn-link" data-rec-contacto="${r.id}">Contacto</button><button class="dova-btn-link" data-rec-completar="${r.id}">Realizado hoy</button><button class="dova-btn-link" data-rec-editar="${r.id}">Editar</button>
          ${r.estado === 'activo' ? `<button class="dova-btn-link" data-rec-pausar="${r.id}">Pausar</button>` : `<button class="dova-btn-link" data-rec-activar="${r.id}">Reactivar</button>`}` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Sin recalls. Se crean solos al atender tratamientos con control periódico, o podés asignarlos.</td></tr>'}
      </tbody></table>
      <div id="seg-controles"></div><div id="seg-observaciones"></div><div id="seg-comunicaciones"></div><div id="seg-tareas"></div><div id="seg-encuestas"></div><div id="seg-datos"></div>`;
    const recargar = () => panelSeguimiento(root, pid);
    const b = (sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(seg.recalls.find((r) => r.id === Number(Object.values(el.dataset)[0])))));
    const ba = root.querySelector('[data-asignar]');
    if (ba) ba.addEventListener('click', () => X.modalForm('Programar control periódico', [
      { k: 'recallTipoId', label: 'Tipo de control', tipo: 'select', req: true, opciones: tipos.filter((t) => t.activo).map((t) => [t.id, `${t.nombre} (cada ${t.intervalo_meses} m)`]) },
      { k: 'intervaloMeses', label: 'Cada cuántos meses (solo para este paciente)', tipo: 'numero', ayuda: 'Vacío = el del tipo' }, { k: 'ultimaFecha', label: 'Última vez realizado', tipo: 'fecha', ayuda: 'Vacío = hoy' },
      { k: 'proximaFecha', label: 'Próxima fecha (opcional)', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'notas', label: 'Notas', tipo: 'textarea' },
    ], {}, async (d) => { await DOVA.post('/recalls', { ...d, pacienteId: pid }); X.toast('Recall asignado', 'ok'); recargar(); }));
    b('[data-rec-contacto]', (r) => modalContactoRecall(r, recargar));
    b('[data-rec-completar]', async (r) => { try { await DOVA.post(`/recalls/${r.id}/completar`, {}); X.toast('Registrado: próxima fecha recalculada', 'ok'); recargar(); } catch (e) { X.toast(e.message, 'error'); } });
    b('[data-rec-editar]', (r) => X.modalForm(`Editar control periódico — ${r.tipo_nombre}`, [{ k: 'intervaloMeses', label: 'Cada cuántos meses (solo para este paciente)', tipo: 'numero' }, { k: 'proximaFecha', label: 'Próxima fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
      { intervaloMeses: r.intervalo_meses, proximaFecha: r.proxima_fecha, odontologoId: r.odontologo_id, notas: r.notas }, async (d) => { await DOVA.put(`/recalls/${r.id}`, d); recargar(); }, { editando: true }));
    b('[data-rec-pausar]', (r) => X.modalForm('Pausar recall', [{ k: 'pausadoHasta', label: 'Pausar hasta', tipo: 'fecha', req: true }, { k: 'motivo', label: 'Motivo' }], {}, async (d) => { await DOVA.post(`/recalls/${r.id}/estado`, { estado: 'pausado', ...d }); recargar(); }));
    b('[data-rec-activar]', async (r) => { await DOVA.post(`/recalls/${r.id}/estado`, { estado: 'activo' }); recargar(); });

    const edSeg = puede('seguimiento.manage', 'especialidades.edit');
    X.tablaCrud({
      root: root.querySelector('#seg-controles'), titulo: 'Controles programados', endpoint: '/especialidades/controles', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: edSeg, puedeEditar: edSeg, puedeBorrar: edSeg, nuevoTexto: '+ Programar control',
      claseFila: (r) => (r.estado === 'pendiente' && r.fecha_programada < X.hoy() ? 'dova-ext-fila-alerta' : ''),
      columnas: [{ t: 'Control', v: (r) => esc(r.titulo) }, { t: 'Origen', v: (r) => esc(etiqueta(r.origen_tipo)) }, { t: 'Fecha', v: (r) => (r.estado === 'pendiente' ? badgeFecha(r.fecha_programada) : fmtFecha(r.fecha_programada)) }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'realizado' ? 'ok' : r.estado === 'no_asistio' ? 'critica' : 'info') }, { t: 'Resultado', v: (r) => esc(r.resultado ? etiqueta(r.resultado) : '-') }],
      campos: [
        { k: 'titulo', label: 'Control', req: true, ancho: 'completo' }, { k: 'fechaProgramada', label: 'Fecha', tipo: 'fecha', req: true },
        { k: 'origenTipo', label: 'Origen', tipo: 'select', opciones: OPC(['endodoncia', 'implante', 'ortodoncia', 'biopsia', 'periodoncia', 'protesis', 'cirugia', 'preventivo', 'observacion', 'otro']) },
        { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['pendiente', 'realizado', 'no_asistio', 'cancelado']), soloEditar: true },
        { k: 'resultado', label: 'Resultado', tipo: 'select', soloEditar: true, opciones: OPC(['sanado', 'en_curacion', 'no_sanado', 'incierto', 'sano', 'mucositis', 'periimplantitis', 'estable', 'progreso', 'recidiva', 'retencion_completa', 'retencion_parcial', 'perdido', 'requiere_tratamiento', 'normal']) },
        { k: 'notas', label: 'Notas / hallazgos', tipo: 'textarea' },
      ],
    });
    X.tablaCrud({
      root: root.querySelector('#seg-observaciones'), titulo: 'Piezas en observación', endpoint: '/especialidades/observaciones', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Lesiones que no se tratan todavía pero hay que reevaluar (manchas blancas, fisuras, restauraciones dudosas…).',
      puedeCrear: puede('especialidades.edit', 'pacientes.clinical.edit', 'odontograma.edit'), puedeEditar: puede('especialidades.edit', 'pacientes.clinical.edit', 'odontograma.edit'), puedeBorrar: puede('especialidades.edit'),
      columnas: [{ t: 'Pieza', v: (r) => `<strong>${esc(r.pieza)}</strong>${r.superficie ? ' ' + esc(r.superficie) : ''}` }, { t: 'Hallazgo', v: (r) => esc(r.hallazgo) }, { t: 'Detectado', v: (r) => fmtFecha(r.fecha_deteccion) }, { t: 'Reevaluar', v: (r) => (r.estado === 'en_observacion' ? badgeFecha(r.fecha_reevaluacion) : fmtFecha(r.fecha_reevaluacion)) }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'progreso' ? 'critica' : 'info') }],
      campos: [{ k: 'pieza', label: 'Pieza', tipo: 'pieza', req: true }, { k: 'superficie', label: 'Superficie' }, { k: 'hallazgo', label: 'Hallazgo', req: true }, { k: 'fechaDeteccion', label: 'Detectado', tipo: 'fecha' }, { k: 'fechaReevaluacion', label: 'Reevaluar el', tipo: 'fecha' }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['en_observacion', 'estable', 'progreso', 'tratada', 'descartada']) }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'detalle', label: 'Detalle', tipo: 'textarea' }, { k: 'resultado', label: 'Resultado de la reevaluación', tipo: 'textarea', soloEditar: true }],
    });
    comunicacionesPaciente(root.querySelector('#seg-comunicaciones'), pid);
    if (puede('tareas.manage')) {
      const usuarios = await X.catalogo('usuarios', '/seguimiento/equipo').catch(() => []);
      X.tablaCrud({
        root: root.querySelector('#seg-tareas'), titulo: 'Tareas sobre este paciente', endpoint: '/seguimiento/tareas', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
        puedeCrear: true, puedeEditar: true, puedeBorrar: true,
        columnas: [{ t: 'Tarea', v: (r) => esc(r.titulo) }, { t: 'Asignada a', v: (r) => esc(r.asignado_nombre || '-') }, { t: 'Vence', v: (r) => (['hecha', 'cancelada'].includes(r.estado) ? fmtFecha(r.vencimiento) : badgeFecha(r.vencimiento)) }, { t: 'Prioridad', v: (r) => badge(etiqueta(r.prioridad), ['alta', 'urgente'].includes(r.prioridad) ? 'critica' : 'info') }, { t: 'Estado', v: (r) => esc(etiqueta(r.estado)) }],
        campos: camposTarea(usuarios),
      });
    }
    X.tablaCrud({
      root: root.querySelector('#seg-encuestas'), titulo: 'Encuestas de satisfacción', endpoint: '/seguimiento/encuestas', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: puede('seguimiento.manage', 'recalls.manage'), puedeBorrar: puede('seguimiento.manage'),
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Recomendaría (0–10)', v: (r) => (r.nps === null ? '-' : badge(r.nps, r.nps >= 9 ? 'ok' : r.nps <= 6 ? 'critica' : 'atencion')) }, { t: 'Atención / puntualidad / limpieza / explicación', v: (r) => [r.atencion, r.puntualidad, r.limpieza, r.explicacion].map((x) => x ?? '-').join(' / ') }, { t: 'Comentario', v: (r) => esc(r.comentario || '-') }],
      campos: [{ k: 'nps', label: '¿Nos recomendaría? (0–10)', tipo: 'numero', min: 0, max: 10 }, ...['atencion', 'puntualidad', 'limpieza', 'explicacion'].map((k) => ({ k, label: `${etiqueta(k)} (1–5)`, tipo: 'select', opciones: [1, 2, 3, 4, 5].map((n) => [n, n]) })), { k: 'canal', label: 'Canal', tipo: 'select', opciones: OPC(['presencial', 'whatsapp', 'telefono', 'email', 'formulario']) }, { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'odontologoId', label: 'Odontólogo', tipo: 'select', opciones: ods }, { k: 'comentario', label: 'Comentario', tipo: 'textarea' }],
    });
    if (puede('pacientes.edit')) datosSeguimientoPaciente(root.querySelector('#seg-datos'), pid);
  }

  function camposTarea(usuarios) {
    return [{ k: 'titulo', label: 'Tarea', req: true, ancho: 'completo' }, { k: 'asignadoA', label: 'Asignar a', tipo: 'select', opciones: (usuarios || []).filter((u) => u.activo !== false).map((u) => [u.id, u.nombre]) }, { k: 'vencimiento', label: 'Vence', tipo: 'fecha' }, { k: 'prioridad', label: 'Prioridad', tipo: 'select', opciones: OPC(['baja', 'media', 'alta', 'urgente']) }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['pendiente', 'en_curso', 'hecha', 'cancelada']), soloEditar: true }, { k: 'descripcion', label: 'Detalle', tipo: 'textarea' }];
  }

  function modalContactoRecall(r, listo) {
    X.modalForm(`Contacto — ${r.tipo_nombre}`, [
      { k: 'canal', label: 'Canal', tipo: 'select', req: true, opciones: OPC(['whatsapp', 'llamada', 'sms', 'email', 'presencial', 'carta']) },
      { k: 'resultado', label: 'Resultado', tipo: 'select', req: true, opciones: OPC(['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar']) },
      { k: 'nota', label: 'Nota', tipo: 'textarea' },
    ], { canal: 'whatsapp' }, async (d) => { await DOVA.post(`/recalls/${r.id}/contacto`, d); X.toast('Contacto registrado', 'ok'); listo(); }, { extraHtml: r.whatsapp_link ? `<p>${X.linkWhatsapp(r.whatsapp_link, 'Abrir WhatsApp con el mensaje preparado')}</p>` : '' });
  }

  function comunicacionesPaciente(cont, pid) {
    const puedeEnviar = puede('seguimiento.manage', 'recalls.manage', 'whatsapp.send');
    X.tablaCrud({
      root: cont, titulo: 'Registro de comunicaciones', endpoint: '/seguimiento/comunicaciones', query: `pacienteId=${pid}&limite=50`, fijos: { pacienteId: pid },
      puedeCrear: puedeEnviar, nuevoTexto: '+ Registrar contacto',
      columnas: [{ t: 'Fecha', v: (r) => X.fmtFechaHora(r.fecha) }, { t: 'Canal', v: (r) => `${esc(etiqueta(r.canal))} ${r.direccion === 'entrante' ? '←' : '→'}` }, { t: 'Motivo', v: (r) => esc(etiqueta(r.motivo)) }, { t: 'Resultado', v: (r) => esc(r.resultado ? etiqueta(r.resultado) : '-') }, { t: 'Detalle', v: (r) => esc(r.contenido || '-') }, { t: 'Por', v: (r) => esc(r.usuario_nombre || '-') }],
      campos: [
        { k: 'canal', label: 'Canal', tipo: 'select', opciones: OPC(['whatsapp', 'llamada', 'sms', 'email', 'presencial', 'carta']) }, { k: 'direccion', label: 'Dirección', tipo: 'select', opciones: [['saliente', 'La clínica contactó'], ['entrante', 'El paciente contactó']] },
        { k: 'motivo', label: 'Motivo', tipo: 'select', opciones: OPC(['recall', 'recordatorio_turno', 'confirmacion', 'cumpleanos', 'reactivacion', 'tratamiento_pendiente', 'presupuesto', 'cobranza', 'postoperatorio', 'encuesta', 'resultado', 'laboratorio', 'consulta', 'reclamo', 'otro']) },
        { k: 'resultado', label: 'Resultado', tipo: 'select', opciones: OPC(['contactado', 'no_contesta', 'mensaje_dejado', 'numero_erroneo', 'rechaza', 'agendado', 'volvera_a_llamar', 'confirmado', 'enviado']) }, { k: 'contenido', label: 'Detalle', tipo: 'textarea' },
      ],
    }).then(() => {
      if (!puedeEnviar) return;
      const tb = cont.querySelector('.dova-ext-toolbar');
      const b = document.createElement('button'); b.className = 'dova-btn-secundario'; b.textContent = 'Enviar WhatsApp'; b.style.marginLeft = '8px';
      tb.appendChild(b);
      b.addEventListener('click', () => X.modalForm('Mensaje de WhatsApp', [{ k: 'plantilla', label: 'Plantilla', tipo: 'select', req: true, opciones: [['postoperatorio', 'Seguimiento postoperatorio'], ['encuesta', 'Encuesta de satisfacción'], ['reactivacion', 'Reactivación'], ['cumpleanos', 'Cumpleaños'], ['cobranza', 'Recordatorio de saldo']] }, { k: 'monto', label: 'Monto (solo cobranza)', tipo: 'numero' }],
        {}, async (d) => {
          const r = await DOVA.post('/seguimiento/mensaje', { pacienteId: pid, plantilla: d.plantilla, datos: { meses: 12, monto: d.monto } });
          if (!r.whatsapp_link) throw new Error('El paciente no tiene un teléfono válido cargado');
          window.open(r.whatsapp_link, '_blank', 'noopener');
          await DOVA.post('/seguimiento/comunicaciones', { pacienteId: pid, canal: 'whatsapp', motivo: d.plantilla === 'cumpleanos' ? 'cumpleanos' : d.plantilla === 'cobranza' ? 'cobranza' : d.plantilla === 'encuesta' ? 'encuesta' : d.plantilla === 'reactivacion' ? 'reactivacion' : 'postoperatorio', resultado: 'enviado', contenido: r.texto });
          comunicacionesPaciente(cont, pid);
        }, { textoBoton: 'Abrir WhatsApp y registrar' }));
    });
  }

  async function datosSeguimientoPaciente(cont, pid) {
    const [p, listas] = await Promise.all([DOVA.get(`/pacientes/${pid}`), puede('listas_precios.manage', 'presupuestos.view', 'tratamientos.view') ? X.catalogo('listasPrecios', '/finanzas/listas-precios').catch(() => []) : []]);
    const campos = [
      { k: 'fuenteReferencia', label: '¿Cómo nos conoció?', tipo: 'select', opciones: OPC(['recomendacion_paciente', 'recomendacion_profesional', 'redes_sociales', 'google', 'instagram', 'facebook', 'tiktok', 'cartel', 'seguro_convenio', 'paso_por_la_zona', 'campana', 'otro']) },
      { k: 'grupoSanguineo', label: 'Grupo sanguíneo', tipo: 'select', opciones: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => [g, g]) },
      { k: 'responsableNombre', label: 'Responsable / tutor' }, { k: 'responsableParentesco', label: 'Parentesco' }, { k: 'responsableTelefono', label: 'Teléfono del responsable' }, { k: 'responsableCi', label: 'C.I. del responsable' },
      { k: 'grupoFamiliar', label: 'Grupo familiar', ayuda: 'Mismo texto para toda la familia (ej. "Familia Benítez")' },
      { k: 'listaPrecioId', label: 'Lista de precios', tipo: 'select', opciones: listas.map((l) => [l.id, l.nombre]) },
      { k: 'aceptaWhatsapp', label: 'Acepta mensajes de WhatsApp', tipo: 'bool' }, { k: 'aceptaRecordatorios', label: 'Acepta recordatorios de controles', tipo: 'bool' },
    ];
    cont.innerHTML = `<div class="dova-ext-caja"><h4>Datos de seguimiento del paciente</h4><form data-datos-seg>${X.formHtml(campos, p)}<button class="dova-btn-primary">Guardar datos</button> <button type="button" class="dova-btn-secundario" data-exportar style="display:${puede('pacientes.export') ? '' : 'none'}">Descargar ficha completa</button></form></div>`;
    const f = cont.querySelector('[data-datos-seg]');
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { await DOVA.put(`/pacientes/${pid}`, X.leerForm(f, campos, true)); X.toast('Datos guardados', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); } });
    // Grupo familiar: para agendar a la familia junta y ver quién es responsable de quién.
    DOVA.get(`/seguimiento/familia/${pid}`).then((fam) => {
      if (!fam.length) return;
      const REL = { responsable: 'Responsable', a_cargo: 'A su cargo', grupo_familiar: 'Mismo grupo familiar' };
      const div = document.createElement('div');
      div.className = 'dova-ext-caja';
      div.innerHTML = `<h4>Familia</h4><table class="dova-tabla"><thead><tr><th>Paciente</th><th>Relación</th><th>Próximo turno</th></tr></thead><tbody>
        ${fam.map((x) => `<tr><td><a class="dova-btn-link" href="#paciente/${x.id}" data-recargar>${esc(x.nombre)} ${esc(x.apellido)}</a></td><td>${esc(REL[x.relacion])}</td><td>${x.proximo_turno ? fmtFecha(x.proximo_turno) : badge('sin turno', 'atencion')}</td></tr>`).join('')}</tbody></table>`;
      cont.appendChild(div);
      div.querySelectorAll('[data-recargar]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); location.hash = a.getAttribute('href').slice(1); location.reload(); }));
    }).catch(() => {});
    f.querySelector('[data-exportar]').addEventListener('click', async () => { try { const d = await DOVA.get(`/kpis/exportar-paciente/${pid}`); X.descargarJson(`expediente-${p.apellido}-${p.nombre}-${X.hoy()}.json`.replace(/\s+/g, '_'), d); } catch (ex) { X.toast(ex.message, 'error'); } });
  }

  // =========================== CUENTA ===========================
  async function panelCuenta(root, pid) {
    X.subPestanas(root, [
      { id: 'cc', texto: 'Cuenta corriente', visible: puede('cuenta_corriente.view', 'pagos.view'), render: (c) => cuentaCorriente(c, pid) },
      { id: 'cob', texto: 'Seguros y coberturas', visible: puede('aseguradoras.manage', 'pacientes.edit', 'presupuestos.view', 'pagos.view'), render: (c) => coberturas(c, pid) },
      { id: 'aut', texto: 'Autorizaciones', visible: puede('aseguradoras.manage'), render: (c) => autorizaciones(c, pid) },
    ]);
  }

  async function cuentaCorriente(c, pid) {
    const cc = await DOVA.get(`/finanzas/cuenta-corriente/${pid}`);
    const t = cc.tramos;
    c.innerHTML = `
      <div class="dova-ext-kpis">
        <div class="dova-ext-kpi ${cc.saldo > 0 ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${fmtGs(Math.max(cc.saldo, 0))}</div><div class="dova-ext-kpi-label">Debe</div></div>
        ${cc.saldoAFavor > 0 ? `<div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(cc.saldoAFavor)}</div><div class="dova-ext-kpi-label">Saldo a favor</div></div>` : ''}
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t['0_30'])}</div><div class="dova-ext-kpi-label">Deuda 0–30 días</div></div>
        <div class="dova-ext-kpi"><div class="dova-ext-kpi-valor">${fmtGs(t['31_60'])}</div><div class="dova-ext-kpi-label">31–60 días</div></div>
        <div class="dova-ext-kpi ${t['61_90'] > 0 ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${fmtGs(t['61_90'])}</div><div class="dova-ext-kpi-label">61–90 días</div></div>
        <div class="dova-ext-kpi ${t['90_mas'] > 0 ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${fmtGs(t['90_mas'])}</div><div class="dova-ext-kpi-label">Más de 90 días</div></div>
        <div class="dova-ext-kpi ${cc.cuotasVencidas ? 'alerta' : ''}"><div class="dova-ext-kpi-valor">${cc.cuotasPendientes.length}</div><div class="dova-ext-kpi-label">Cuotas pendientes (${cc.cuotasVencidas} vencidas)</div></div>
      </div>
      <h3 class="dova-section-title">Movimientos</h3>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr><th>Fecha</th><th>Concepto</th><th>Cargos</th><th>Pagos</th><th>Saldo</th></tr></thead><tbody>
      ${cc.movimientos.map((m) => `<tr><td>${fmtFecha(m.fecha)}</td><td>${esc(m.concepto)}</td><td>${m.debe ? fmtGs(m.debe) : ''}</td><td>${m.haber ? fmtGs(m.haber) : ''}</td><td><strong>${fmtGs(m.saldo)}</strong></td></tr>`).join('') || '<tr><td colspan="5">Sin movimientos.</td></tr>'}
      </tbody></table></div>
      <div data-ajustes></div>`;
    const ed = puede('ajustes.manage');
    X.tablaCrud({
      root: c.querySelector('[data-ajustes]'), titulo: 'Ajustes de cuenta', endpoint: '/finanzas/ajustes', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      descripcion: 'Descuentos, bonificaciones, cortesías, incobrables y notas de crédito reducen la deuda; los recargos la aumentan. Un ajuste no se borra: se anula.',
      puedeCrear: ed,
      columnas: [{ t: 'Fecha', v: (r) => fmtFecha(r.fecha) }, { t: 'Tipo', v: (r) => esc(etiqueta(r.tipo)) }, { t: 'Monto', v: (r) => fmtGs(r.monto) }, { t: 'Motivo', v: (r) => esc(r.motivo) }, { t: 'Por', v: (r) => esc(r.usuario_nombre || '-') }, { t: 'Estado', v: (r) => (r.anulado ? badge('Anulado', 'critica') : badge('Vigente', 'ok')) }],
      campos: [{ k: 'tipo', label: 'Tipo', tipo: 'select', req: true, opciones: OPC(['descuento', 'bonificacion', 'cortesia', 'incobrable', 'nota_credito', 'recargo']) }, { k: 'monto', label: 'Monto (Gs.)', tipo: 'numero', req: true, min: 1 }, { k: 'fecha', label: 'Fecha', tipo: 'fecha' }, { k: 'motivo', label: 'Motivo', req: true, ancho: 'completo' }],
      acciones: ed ? [{ texto: 'Anular', visible: (r) => !r.anulado, fn: async (r) => { try { await DOVA.put(`/finanzas/ajustes/${r.id}`, { anulado: true }); X.toast('Ajuste anulado', 'ok'); cuentaCorriente(c, pid); } catch (e) { X.toast(e.message, 'error'); } } }] : [],
      alGuardar: () => cuentaCorriente(c, pid),
    });
  }

  async function coberturas(c, pid) {
    const planes = await X.catalogo('planesCobertura', '/finanzas/planes-cobertura').catch(() => []);
    const ed = puede('aseguradoras.manage', 'pacientes.edit');
    c.innerHTML = '<div data-cob></div><div data-precio></div>';
    X.tablaCrud({
      root: c.querySelector('[data-cob]'), titulo: 'Seguros, prepagas y convenios', endpoint: '/finanzas/coberturas', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: ed, puedeEditar: ed, puedeBorrar: ed,
      columnas: [{ t: 'Aseguradora', v: (r) => `<strong>${esc(r.aseguradora_nombre)}</strong> — ${esc(r.plan_nombre)}` }, { t: 'Afiliado', v: (r) => esc(r.numero_afiliado || '-') }, { t: 'Cobertura', v: (r) => `${Number(r.cobertura_general)}% general${r.requiere_autorizacion ? ' · requiere autorización' : ''}` }, { t: 'Vigencia', v: (r) => `${fmtFecha(r.vigencia_desde)} → ${fmtFecha(r.vigencia_hasta)}` }, { t: '', v: (r) => (r.principal ? badge('Principal', 'ok') : '') }],
      campos: [{ k: 'planId', label: 'Plan', tipo: 'select', req: true, opciones: planes.map((p) => [p.id, `${p.aseguradora_nombre} — ${p.nombre}`]) }, { k: 'numeroAfiliado', label: 'N.º de afiliado' }, { k: 'titular', label: 'Titular' }, { k: 'parentesco', label: 'Parentesco con el titular' }, { k: 'vigenciaDesde', label: 'Vigente desde', tipo: 'fecha' }, { k: 'vigenciaHasta', label: 'Vigente hasta', tipo: 'fecha' }, { k: 'principal', label: 'Cobertura principal', tipo: 'bool' }, { k: 'activa', label: 'Activa', tipo: 'bool', soloEditar: true }],
      valoresNuevo: () => ({ principal: true }),
    });
    const trats = await X.catalogo('tratamientos', '/tratamientos').catch(() => []);
    const p = c.querySelector('[data-precio]');
    p.innerHTML = `<div class="dova-ext-caja"><h4>¿Cuánto paga este paciente?</h4><form class="dova-ext-filtros" data-cot><div style="flex:1;min-width:220px"><select name="t">${trats.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div><button class="dova-btn-secundario">Calcular</button></form><div data-cot-res></div></div>`;
    p.querySelector('[data-cot]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await DOVA.get(`/finanzas/precio?pacienteId=${pid}&tratamientoId=${e.target.t.value}`);
        p.querySelector('[data-cot-res]').innerHTML = `<p>Precio: <strong>${fmtGs(r.precio)}</strong> <span class="dova-nota">(${esc(r.origenPrecio)})</span><br>
          ${r.cobertura ? `Cubre ${esc(r.cobertura.aseguradora)} (${r.cobertura.porcentaje}%): <strong>${fmtGs(r.montoCubierto)}</strong>${r.cobertura.requiereAutorizacion ? ' ' + badge('requiere autorización', 'atencion') : ''}<br>` : 'Sin cobertura vigente.<br>'}
          A cargo del paciente: <strong>${fmtGs(r.aCargoPaciente)}</strong></p>`;
      } catch (ex) { X.toast(ex.message, 'error'); }
    });
  }

  function autorizaciones(c, pid) {
    DOVA.get(`/finanzas/coberturas?pacienteId=${pid}`).catch(() => []).then((cobs) => X.tablaCrud({
      root: c, titulo: 'Autorizaciones', endpoint: '/finanzas/autorizaciones', query: `pacienteId=${pid}`, fijos: { pacienteId: pid },
      puedeCrear: true, puedeEditar: true, puedeBorrar: true,
      columnas: [{ t: 'Solicitada', v: (r) => fmtFecha(r.fecha_solicitud) }, { t: 'Aseguradora', v: (r) => esc(r.aseguradora_nombre || '-') }, { t: 'Detalle', v: (r) => esc(r.descripcion || '-') }, { t: 'N.º', v: (r) => esc(r.numero || '-') }, { t: 'Montos', v: (r) => `${r.monto_solicitado ? fmtGs(r.monto_solicitado) : '-'} → ${r.monto_aprobado ? fmtGs(r.monto_aprobado) : '-'}` }, { t: 'Estado', v: (r) => badge(etiqueta(r.estado), r.estado === 'aprobada' ? 'ok' : r.estado === 'rechazada' ? 'critica' : 'atencion') }],
      campos: [{ k: 'coberturaId', label: 'Cobertura', tipo: 'select', opciones: cobs.map((x) => [x.id, `${x.aseguradora_nombre} — ${x.plan_nombre}`]) }, { k: 'descripcion', label: 'Qué se solicita', ancho: 'completo' }, { k: 'numero', label: 'N.º de autorización' }, { k: 'fechaSolicitud', label: 'Solicitada', tipo: 'fecha' }, { k: 'montoSolicitado', label: 'Monto solicitado', tipo: 'numero' }, { k: 'montoAprobado', label: 'Monto aprobado', tipo: 'numero', soloEditar: true }, { k: 'estado', label: 'Estado', tipo: 'select', opciones: OPC(['solicitada', 'aprobada', 'parcial', 'rechazada', 'vencida']) }, { k: 'notas', label: 'Notas', tipo: 'textarea' }],
    }));
  }

  // =========================== ENGANCHE ===========================
  function extender(pacienteId) {
    const pid = Number(pacienteId);
    const tabs = document.getElementById('ficha-tabs');
    if (!tabs) return;
    const nuevas = [
      { id: 'salud', texto: 'Salud', visible: puede('salud.view', 'salud.edit', 'pacientes.clinical.view'), render: panelSalud },
      { id: 'perio', texto: 'Periodoncia', visible: puede('periodoncia.edit', 'pacientes.clinical.view', 'odontograma.view'), render: panelPerio },
      { id: 'especialidades', texto: 'Especialidades', visible: puede('especialidades.edit', 'pacientes.clinical.view'), render: panelEspecialidades },
      { id: 'seguimiento', texto: 'Controles y contactos', visible: puede('seguimiento.view', 'recalls.view', 'seguimiento.manage'), render: panelSeguimiento },
      { id: 'cuenta', texto: 'Estado de cuenta', visible: puede('cuenta_corriente.view', 'pagos.view', 'aseguradoras.manage'), render: panelCuenta },
    ].filter((t) => t.visible);
    const ancla = document.getElementById('modal-root');
    for (const t of nuevas) {
      const b = document.createElement('button');
      b.className = 'dova-tab'; b.dataset.tab = t.id; b.textContent = t.texto;
      tabs.appendChild(b);
      const panel = document.createElement('div');
      panel.className = 'dova-tab-panel'; panel.dataset.panel = t.id; panel.style.display = 'none';
      ancla.parentNode.insertBefore(panel, ancla);
      let cargado = false;
      b.addEventListener('click', () => {
        if (cargado) return; cargado = true;
        panel.innerHTML = X.cargando;
        Promise.resolve(t.render(panel, pid)).catch((e) => { panel.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; cargado = false; });
      });
    }
    // Banner de alertas médicas bajo el encabezado de la ficha.
    const header = document.querySelector('.dova-ficha-header');
    if (header) {
      const cont = document.createElement('div');
      header.insertAdjacentElement('afterend', cont);
      X.bannerAlertas(pid, cont);
    }
  }

  return { extender, camposTarea, camposTrabajoLab, modalContactoRecall, archivosLab };
})();
window.DovaFicha = DovaFicha;
