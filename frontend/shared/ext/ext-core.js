/* DOVA — núcleo del frontend de "seguimiento integral" (migración 0020).
   Compartido por los 3 diseños. Aporta piezas reutilizables:
   - formularios declarativos (lista de campos -> HTML + lectura),
   - tabla CRUD genérica (listar / nuevo / editar / borrar contra un endpoint),
   - sub-pestañas, banner de alertas médicas, gráficos de barras y líneas
     accesibles (una serie por gráfico, tooltip, tabla alternativa).
   Nada acá conoce reglas clínicas: esas viven en el backend. */
const DovaExt = (() => {
  const V = () => Vistas; // global léxico de views.js (script clásico)
  const esc = (s) => V().esc(s);
  const fmtFecha = (f) => V().fmtFecha(f);
  const fmtGs = (n) => V().fmtGs(n);
  const toast = (m, t) => V().toast(m, t);
  const puede = (...c) => c.some((x) => DOVA.tienePermiso(x));
  const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ETIQ = {
    whatsapp: 'WhatsApp', sms: 'SMS', ept: 'EPT (eléctrica)', ips: 'IPS', atencion: 'Atención', critica: 'Crítica', reevaluacion: 'Reevaluación', asa: 'ASA', eva_dolor: 'EVA dolor', oleary: "O'Leary", psr: 'PSR',
    // Palabras con tilde y nombres técnicos en lenguaje simple
    no_asistio: 'No asistió', administracion: 'Administración', esterilizacion: 'Esterilización', historia_clinica: 'Historia clínica', odontologos: 'Odontólogos',
    prevencion: 'Prevención', planes_pago: 'Planes de pago', planes_tratamiento: 'Planes de tratamiento', listas_precios: 'Listas de precios', helpdesk: 'Ayuda técnica',
    protesis: 'Prótesis', cirugia: 'Cirugía', observacion: 'Observación', produccion: 'Trabajos realizados (Gs.)', tasa_aceptacion: 'Presupuestos aceptados (%)',
    recomendacion_paciente: 'Recomendación de un paciente', recomendacion_profesional: 'Recomendación de un profesional', seguro_convenio: 'Seguro o convenio',
    paso_por_la_zona: 'Pasó por la zona', campana: 'Campaña', tiktok: 'TikTok', aspiracion: 'Aspiración', lampara_fotocurado: 'Lámpara de fotocurado',
    escaner_intraoral: 'Escáner intraoral', sensor_rx: 'Sensor de rayos X', rayos_x: 'Rayos X', sillon: 'Sillón', motor_endo: 'Motor de endodoncia',
    recall: 'Control periódico', recalls: 'Controles periódicos', recordatorio_turno: 'Recordatorio de turno', confirmacion: 'Confirmación', cumpleanos: 'Cumpleaños',
    reactivacion: 'Paciente que no volvió', tratamiento_pendiente: 'Tratamiento pendiente', cobranza: 'Cobranza', fichaje: 'Asistencia del personal',
    kpis: 'Estadísticas', seguimiento: 'Seguimiento', operaciones: 'Clínica', en_proceso: 'En curso', en_curso: 'En curso', en_cuarentena: 'Esperando control biológico',
    sin_confirmar: 'Sin confirmar', recordatorio_enviado: 'Recordatorio enviado', no_responde: 'No responde', pide_reprogramar: 'Pide reprogramar',
    inicio_pausa: 'Inicio de pausa', fin_pausa: 'Fin de pausa', nota_credito: 'Nota de crédito', bonificacion: 'Bonificación', cortesia: 'Cortesía',
    tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito', qr: 'QR', pagada: 'Pagada', anulada: 'Anulada', emitida: 'Emitida', credito: 'Crédito', contado: 'Contado',
    diagnostico: 'Diagnóstico', estetica: 'Estética', periodoncia: 'Periodoncia', ortodoncia: 'Ortodoncia', endodoncia: 'Endodoncia', implantologia: 'Implantología',
    odontopediatria: 'Odontopediatría', radiologia: 'Radiología', panoramica: 'Panorámica', tomografia: 'Tomografía', electronico: 'Electrónico',
  };
  const etiqueta = (s) => ETIQ[s] || String(s ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const fmtFechaHora = (f) => (f ? new Date(f).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '-');
  const cargando = '<div class="dova-cargando">Cargando…</div>';

  // ---------------- Formularios declarativos ----------------
  // campo: { k, label, tipo: texto|numero|fecha|fechahora|hora|select|textarea|bool|pieza, opciones: [[valor, texto]], req, ayuda, paso, ancho }
  function inputCampo(c, v) {
    const id = `f-${c.k}`;
    const val = v === undefined || v === null ? '' : v;
    const req = c.req ? 'required' : '';
    switch (c.tipo) {
      case 'textarea': return `<textarea id="${id}" name="${c.k}" rows="${c.filas || 2}" ${req}>${esc(val)}</textarea>`;
      case 'select': return `<select id="${id}" name="${c.k}" ${req}>${c.req ? '' : '<option value="">—</option>'}${(c.opciones || []).map(([o, t]) => `<option value="${esc(o)}" ${String(o) === String(val) ? 'selected' : ''}>${esc(t ?? etiqueta(o))}</option>`).join('')}</select>`;
      case 'bool': return `<label class="dova-ext-check"><input type="checkbox" id="${id}" name="${c.k}" ${val === true ? 'checked' : ''}/> ${esc(c.textoCheck || 'Sí')}</label>`;
      case 'numero': return `<input type="number" id="${id}" name="${c.k}" value="${esc(val)}" step="${c.paso || 'any'}" ${c.min !== undefined ? `min="${c.min}"` : ''} ${c.max !== undefined ? `max="${c.max}"` : ''} ${req}/>`;
      case 'fecha': return `<input type="date" id="${id}" name="${c.k}" value="${esc(String(val).slice(0, 10))}" ${req}/>`;
      case 'fechahora': return `<input type="datetime-local" id="${id}" name="${c.k}" value="${esc(val ? new Date(val).toISOString().slice(0, 16) : '')}" ${req}/>`;
      case 'hora': return `<input type="time" id="${id}" name="${c.k}" value="${esc(String(val).slice(0, 5))}" ${req}/>`;
      case 'color': {
        const v = /^#[0-9a-f]{6}$/i.test(val) ? val.toUpperCase() : '';
        const muestras = COLORES.map(([hex, nom]) => `<label class="dova-ext-color" title="${nom}"><input type="radio" name="${c.k}" value="${hex}" ${v === hex ? 'checked' : ''}/><span style="background:${hex}"></span><em>${nom}</em></label>`).join('');
        const propio = v && !COLORES.some(([h]) => h === v);
        return `<div class="dova-ext-colores" role="radiogroup" aria-label="${esc(c.label)}">
          <label class="dova-ext-color" title="Automático"><input type="radio" name="${c.k}" value="" ${!v ? 'checked' : ''}/><span class="auto">A</span><em>Automático</em></label>
          ${muestras}
          <label class="dova-ext-color" title="Otro color"><input type="radio" name="${c.k}" value="${propio ? v : '#888888'}" data-color-propio ${propio ? 'checked' : ''}/><input type="color" value="${propio ? v : '#888888'}" data-color-input aria-label="Otro color"/><em>Otro</em></label>
        </div>`;
      }
      case 'pieza': return `<input id="${id}" name="${c.k}" value="${esc(val)}" placeholder="FDI, ej. 16" inputmode="numeric" maxlength="2" ${req}/>`;
      default: return `<input id="${id}" name="${c.k}" value="${esc(val)}" ${c.max ? `maxlength="${c.max}"` : ''} ${req}/>`;
    }
  }
  // Colores para elegir con un toque (agenda de odontólogos, etc.).
  const COLORES = [['#2E7D32', 'Verde'], ['#1565C0', 'Azul'], ['#00838F', 'Turquesa'], ['#6A1B9A', 'Violeta'], ['#AD1457', 'Fucsia'],
    ['#C62828', 'Rojo'], ['#EF6C00', 'Naranja'], ['#F9A825', 'Amarillo'], ['#5D4037', 'Marrón'], ['#455A64', 'Gris azulado']];
  // El selector "Otro" copia el color elegido a su opción.
  document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('[data-color-input]')) return;
    const r = e.target.parentElement.querySelector('[data-color-propio]');
    r.value = e.target.value.toUpperCase(); r.checked = true;
  });
  function formHtml(campos, valores = {}) {
    return `<div class="dova-ext-form-grid">${campos.map((c) => `
      <div class="dova-ext-campo ${c.ancho === 'completo' || c.tipo === 'textarea' ? 'dova-ext-campo-completo' : ''}">
        ${c.tipo === 'bool' || c.tipo === 'color' ? `<label>${esc(c.label)}</label>` : `<label for="f-${c.k}">${esc(c.label)}${c.req ? ' *' : ''}</label>`}
        ${inputCampo(c, valores[c.k] !== undefined ? valores[c.k] : valores[snake(c.k)])}
        ${c.ayuda ? `<p class="dova-ext-ayuda">${esc(c.ayuda)}</p>` : ''}
      </div>`).join('')}</div>`;
  }
  function snake(k) { return k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()); }
  // editando=true: los vacíos se mandan como null (para poder borrar un dato).
  function leerForm(form, campos, editando) {
    const out = {};
    for (const c of campos) {
      if (c.tipo === 'color') {
        const r = form.querySelector(`[name="${c.k}"]:checked`);
        if (r) { if (r.value) out[c.k] = r.value; else if (editando) out[c.k] = null; }
        continue;
      }
      const el = form.querySelector(`[name="${c.k}"]`);
      if (!el) continue;
      if (c.tipo === 'bool') { out[c.k] = el.checked; continue; }
      const v = el.value.trim();
      if (v === '') { if (editando) out[c.k] = null; continue; }
      out[c.k] = c.tipo === 'numero' ? Number(v) : c.tipo === 'fechahora' ? new Date(v).toISOString() : v;
    }
    return out;
  }

  function modal(titulo, cuerpo, { ancho } = {}) {
    V().abrirModal(`<div class="dova-ext-modal ${ancho ? 'dova-ext-modal-' + ancho : ''}"><h3>${esc(titulo)}</h3>${cuerpo}</div>`);
    const box = document.querySelector('.dova-modal-box');
    if (box && ancho) box.classList.add('dova-ext-modal-box-' + ancho);
    return box;
  }
  function cerrarModal() { const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; else document.querySelectorAll('.dova-modal-overlay').forEach((o) => o.remove()); }

  // Modal con formulario; onGuardar recibe los datos y debe devolver una promesa.
  function modalForm(titulo, campos, valores, onGuardar, { editando, textoBoton = 'Guardar', ancho, extraHtml = '' } = {}) {
    modal(titulo, `
      <form class="dova-ext-modal-form">
        ${formHtml(campos, valores || {})}
        ${extraHtml}
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-modal-actions">
          <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="dova-btn-primary">${esc(textoBoton)}</button>
        </div>
      </form>`, { ancho: ancho || (campos.length > 6 ? 'ancho' : undefined) });
    const form = document.querySelector('.dova-ext-modal-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('[data-error]');
      err.style.display = 'none';
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await onGuardar(leerForm(form, campos, editando), form);
        cerrarModal();
      } catch (ex) {
        err.textContent = ex.message || 'No se pudo guardar';
        err.style.display = 'block';
      } finally { btn.disabled = false; }
    });
    return form;
  }

  // ---------------- Tabla CRUD genérica ----------------
  /* cfg: { root, titulo, endpoint, query (string), columnas: [{t, v(row)}], campos, fijos (obj, se agregan al crear),
            puedeCrear, puedeEditar, puedeBorrar, acciones: [{texto, visible(row), fn(row, recargar)}], vacio, nuevoTexto,
            alGuardar(), preparar(datos, row) } */
  async function tablaCrud(cfg) {
    const root = typeof cfg.root === 'string' ? document.querySelector(cfg.root) : cfg.root;
    if (!root) return;
    root.innerHTML = cargando;
    let filas;
    try { filas = await DOVA.get(cfg.endpoint + (cfg.query ? (cfg.endpoint.includes('?') ? '&' : '?') + cfg.query : '')); } catch (e) {
      root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; return;
    }
    const recargar = () => tablaCrud(cfg);
    const hayAcciones = cfg.puedeEditar || cfg.puedeBorrar || (cfg.acciones || []).length;
    root.innerHTML = `
      <div class="dova-toolbar dova-ext-toolbar">
        ${cfg.titulo ? `<h3 class="dova-section-title" style="margin:0">${esc(cfg.titulo)}</h3>` : '<span></span>'}
        ${cfg.puedeCrear && cfg.campos ? `<button class="dova-btn-primary" data-nuevo>${esc(cfg.nuevoTexto || '+ Nuevo')}</button>` : ''}
      </div>
      ${cfg.descripcion ? `<p class="dova-nota">${cfg.descripcion}</p>` : ''}
      <div class="dova-ext-tabla-wrap">
      <table class="dova-tabla">
        <thead><tr>${cfg.columnas.map((c) => `<th>${esc(c.t)}</th>`).join('')}${hayAcciones ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${filas.map((f, i) => `<tr ${cfg.claseFila ? `class="${cfg.claseFila(f) || ''}"` : ''}>${cfg.columnas.map((c) => `<td>${c.v(f)}</td>`).join('')}
            ${hayAcciones ? `<td class="dova-ext-acciones">
              ${(cfg.acciones || []).filter((a) => !a.visible || a.visible(f)).map((a, j) => `<button class="dova-btn-link" data-accion="${j}" data-fila="${i}">${esc(typeof a.texto === 'function' ? a.texto(f) : a.texto)}</button>`).join('')}
              ${cfg.puedeEditar && cfg.campos ? `<button class="dova-btn-link" data-editar="${i}">Editar</button>` : ''}
              ${cfg.puedeBorrar ? `<button class="dova-btn-link dova-ext-peligro" data-borrar="${i}">Borrar</button>` : ''}
            </td>` : ''}</tr>`).join('') || `<tr><td colspan="${cfg.columnas.length + (hayAcciones ? 1 : 0)}">${esc(cfg.vacio || 'Sin registros.')}</td></tr>`}
        </tbody>
      </table></div>`;
    const campos = typeof cfg.campos === 'function' ? await cfg.campos() : cfg.campos;
    const btnNuevo = root.querySelector('[data-nuevo]');
    if (btnNuevo) btnNuevo.addEventListener('click', () => modalForm(cfg.tituloModal || cfg.titulo || 'Nuevo registro', campos.filter((c) => !c.soloEditar), cfg.valoresNuevo ? cfg.valoresNuevo() : {}, async (d) => {
      const datos = { ...d, ...(cfg.fijos || {}) };
      if (cfg.preparar) cfg.preparar(datos);
      await DOVA.post(cfg.endpoint.split('?')[0], datos);
      toast('Guardado', 'ok');
      if (cfg.alGuardar) cfg.alGuardar(); else recargar();
    }));
    root.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      const f = filas[Number(b.dataset.editar)];
      modalForm(`Editar — ${cfg.tituloModal || cfg.titulo || 'registro'}`, campos.filter((c) => !c.soloCrear), cfg.valoresEditar ? cfg.valoresEditar(f) : f, async (d) => {
        if (cfg.preparar) cfg.preparar(d, f);
        await DOVA.put(`${cfg.endpoint.split('?')[0]}/${f.id}`, d);
        toast('Cambios guardados', 'ok');
        if (cfg.alGuardar) cfg.alGuardar(); else recargar();
      }, { editando: true });
    }));
    root.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => {
      const f = filas[Number(b.dataset.borrar)];
      modal('¿Borrar este registro?', `<p>Esta acción no se puede deshacer. Queda registrada en la auditoría.</p>
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary" data-confirmar>Borrar</button></div>`);
      document.querySelector('[data-confirmar]').addEventListener('click', async () => {
        try { await DOVA.del(`${cfg.endpoint.split('?')[0]}/${f.id}`); cerrarModal(); toast('Borrado', 'ok'); if (cfg.alGuardar) cfg.alGuardar(); else recargar(); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    root.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => {
      const lista = (cfg.acciones || []).filter((a) => !a.visible || a.visible(filas[Number(b.dataset.fila)]));
      lista[Number(b.dataset.accion)].fn(filas[Number(b.dataset.fila)], recargar);
    }));
    return filas;
  }

  // ---------------- Sub-pestañas ----------------
  // pestanas: [{ id, texto, visible(bool), render(contenedor) }]
  function subPestanas(root, pestanas, { inicial } = {}) {
    const vis = pestanas.filter((p) => p.visible !== false);
    root.innerHTML = `
      <div class="dova-ext-subtabs" role="tablist">${vis.map((p, i) => `<button class="dova-ext-subtab ${(inicial ? p.id === inicial : i === 0) ? 'activo' : ''}" data-subtab="${p.id}" role="tab">${esc(p.texto)}</button>`).join('')}</div>
      <div class="dova-ext-subpanel"></div>`;
    const panel = root.querySelector('.dova-ext-subpanel');
    const abrir = (id) => {
      root.querySelectorAll(':scope > .dova-ext-subtabs .dova-ext-subtab').forEach((b) => b.classList.toggle('activo', b.dataset.subtab === id));
      const p = vis.find((x) => x.id === id);
      // Cada apertura dibuja en su propio contenedor: si el usuario cambia de
      // pestaña antes de que termine de cargar, lo viejo se descarta sin errores.
      const cont = document.createElement('div');
      cont.innerHTML = cargando;
      panel.replaceChildren(cont);
      Promise.resolve(p.render(cont)).catch((e) => { if (cont.isConnected) cont.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; });
    };
    root.querySelectorAll(':scope > .dova-ext-subtabs .dova-ext-subtab').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.subtab)));
    if (vis.length) abrir(inicial && vis.some((p) => p.id === inicial) ? inicial : vis[0].id);
  }

  // ---------------- Badges ----------------
  const NIVEL = { critica: 'dova-ext-badge-critica', atencion: 'dova-ext-badge-atencion', info: 'dova-ext-badge-info', ok: 'dova-badge-ok' };
  const badge = (texto, nivel = 'info') => `<span class="dova-badge ${NIVEL[nivel] || ''}">${esc(texto)}</span>`;
  function badgeFecha(fechaIso) {
    if (!fechaIso) return '-';
    const f = String(fechaIso).slice(0, 10); const h = hoy();
    if (f < h) return `${fmtFecha(f)} ${badge('vencido', 'critica')}`;
    if (f <= sumarDias(h, 7)) return `${fmtFecha(f)} ${badge('esta semana', 'atencion')}`;
    return fmtFecha(f);
  }
  function linkWhatsapp(url, texto = 'WhatsApp') {
    return url ? `<a class="dova-btn-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(texto)}</a>` : '<span class="dova-nota">sin teléfono / no acepta</span>';
  }

  // ---------------- Banner de alertas médicas ----------------
  async function bannerAlertas(pacienteId, contenedor, { emergentes = true } = {}) {
    if (!puede('salud.view', 'salud.edit', 'pacientes.clinical.view', 'pacientes.view')) return;
    let data;
    try { data = await DOVA.get(`/salud/paciente/${pacienteId}/alertas`); } catch (_e) { return; }
    const relevantes = data.alertas.filter((a) => a.nivel !== 'info' || a.tipo === 'medicacion');
    if (!relevantes.length) return;
    const div = document.createElement('div');
    div.className = 'dova-ext-alertas-medicas';
    div.setAttribute('role', 'alert');
    div.innerHTML = `
      <div class="dova-ext-alertas-cab"><strong>⚕ Alertas médicas</strong>
        ${data.resumen.criticas ? badge(`${data.resumen.criticas} crítica(s)`, 'critica') : ''} ${data.resumen.atencion ? badge(`${data.resumen.atencion} de atención`, 'atencion') : ''}
        <button class="dova-btn-link" data-toggle-alertas>Ver detalle</button></div>
      <ul class="dova-ext-alertas-lista" style="display:${data.resumen.criticas ? '' : 'none'}">
        ${relevantes.map((a) => `<li class="dova-ext-alerta-${a.nivel}">${badge(a.nivel === 'critica' ? 'Crítica' : a.nivel === 'atencion' ? 'Atención' : 'Info', a.nivel)} <strong>${esc(a.titulo)}</strong>${a.detalle ? ` — ${esc(a.detalle)}` : ''}</li>`).join('')}
      </ul>`;
    contenedor.prepend(div);
    div.querySelector('[data-toggle-alertas]').addEventListener('click', () => {
      const ul = div.querySelector('ul'); ul.style.display = ul.style.display === 'none' ? '' : 'none';
    });
    // Alertas "emergentes": se muestran en un modal una vez por sesión y paciente.
    const clave = `dova-alerta-emergente-${pacienteId}`;
    if (emergentes && data.resumen.emergentes.length) {
      let ya = false; try { ya = sessionStorage.getItem(clave) === '1'; sessionStorage.setItem(clave, '1'); } catch (_e) { /* sin storage */ }
      if (!ya) modal('Aviso importante sobre este paciente', `<ul class="dova-lista-simple">${data.resumen.emergentes.map((a) => `<li><strong>${esc(a.titulo)}</strong></li>`).join('')}</ul>
        <div class="dova-modal-actions"><button class="dova-btn-primary" data-cerrar-modal>Entendido</button></div>`);
    }
  }

  // ---------------- Gráficos ----------------
  /* Una sola serie por gráfico (sin leyenda: el título la nombra), un solo eje,
     columnas finas con extremo redondeado, grilla recesiva, tooltip al pasar
     el mouse y tabla alternativa accesible. Color de marca validado para
     claro (#C1673F) y oscuro (#CC7550) — ver --dova-ext-marca en ext.css. */
  function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function fmtEje(v, formato) {
    if (formato === 'gs') return v >= 1e6 ? `${Math.round(v / 1e5) / 10} M` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(v);
    if (formato === 'pct') return `${v}%`;
    return Number(v).toLocaleString('es-PY');
  }
  function fmtValor(v, formato) { return v === null || v === undefined ? '—' : formato === 'gs' ? fmtGs(v) : formato === 'pct' ? `${v}%` : Number(v).toLocaleString('es-PY'); }

  function grafico({ titulo, etiquetas, valores, tipo = 'barras', formato, alto = 210, subtitulo }) {
    const W = 400; const H = alto; const m = { t: 18, r: 14, b: 26, l: 58 };
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const max = niceMax(Math.max(...valores.filter((v) => v !== null), 0));
    const y = (v) => m.t + ih - (v / max) * ih;
    const banda = iw / Math.max(etiquetas.length, 1);
    const x = (i) => m.l + banda * i + banda / 2;
    const ticks = [0, max / 2, max];
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const paso = Math.ceil(etiquetas.length / 5);
    let marcas = '';
    if (tipo === 'barras') {
      const bw = Math.min(20, Math.max(4, banda - 6));
      marcas = valores.map((v, i) => {
        if (v === null) return '';
        const h = Math.max(0, m.t + ih - y(v)); const x0 = x(i) - bw / 2; const r = Math.min(4, h);
        const d = `M${x0},${m.t + ih} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
        return `<path d="${d}" class="dova-ext-marca"/><rect x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ih}" fill="transparent" data-i="${i}" class="dova-ext-hit"/>`;
      }).join('');
    } else {
      const pts = valores.map((v, i) => (v === null ? null : [x(i), y(v)]));
      const seg = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      marcas = `<path d="${seg}" fill="none" class="dova-ext-linea"/>` + pts.map((p, i) => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="dova-ext-punto"/><rect x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ih}" fill="transparent" data-i="${i}" class="dova-ext-hit"/>` : '')).join('');
    }
    const ultimo = valores.length - 1;
    const etiquetaFinal = valores[ultimo] !== null && valores[ultimo] !== undefined ? `<text x="${Math.min(x(ultimo), W - m.r)}" y="${y(valores[ultimo]) - 8}" text-anchor="end" class="dova-ext-g-valor">${esc(fmtValor(valores[ultimo], formato))}</text>` : '';
    return `
      <figure class="dova-ext-grafico" id="${id}">
        <figcaption><strong>${esc(titulo)}</strong>${subtitulo ? ` <span class="dova-nota">${esc(subtitulo)}</span>` : ''}</figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}" preserveAspectRatio="xMidYMid meet">
          ${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="dova-ext-grid"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end" class="dova-ext-g-eje">${esc(fmtEje(t, formato))}</text>`).join('')}
          ${etiquetas.map((e, i) => (i % paso === 0 || i === ultimo ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="dova-ext-g-eje">${esc(e)}</text>` : '')).join('')}
          ${marcas}${etiquetaFinal}
        </svg>
        <div class="dova-ext-tooltip" hidden></div>
        <details class="dova-ext-g-tabla"><summary>Ver datos en tabla</summary>
          <table class="dova-tabla"><thead><tr><th>Período</th><th>${esc(titulo)}</th></tr></thead>
          <tbody>${etiquetas.map((e, i) => `<tr><td>${esc(e)}</td><td>${esc(fmtValor(valores[i], formato))}</td></tr>`).join('')}</tbody></table>
        </details>
      </figure>`;
  }
  // Activa los tooltips de todos los gráficos dentro de un contenedor.
  function activarGraficos(cont, series) {
    cont.querySelectorAll('.dova-ext-grafico').forEach((fig, k) => {
      const s = series[k]; if (!s) return;
      const tip = fig.querySelector('.dova-ext-tooltip');
      fig.querySelectorAll('.dova-ext-hit').forEach((r) => {
        r.addEventListener('mouseenter', () => {
          const i = Number(r.dataset.i);
          tip.innerHTML = `<strong>${esc(s.etiquetas[i])}</strong><br>${esc(fmtValor(s.valores[i], s.formato))}`;
          tip.hidden = false;
          const box = fig.getBoundingClientRect(); const rb = r.getBoundingClientRect();
          tip.style.left = `${Math.min(rb.left - box.left + rb.width / 2, box.width - 120)}px`;
          tip.style.top = '28px';
          r.classList.add('dova-ext-hit-activo');
        });
        r.addEventListener('mouseleave', () => { tip.hidden = true; r.classList.remove('dova-ext-hit-activo'); });
      });
    });
  }

  function descargarJson(nombre, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function descargarCsv(nombre, filas, columnas) {
    const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const txt = [columnas.map((c) => escCsv(c.t)).join(';'), ...filas.map((f) => columnas.map((c) => escCsv(c.csv ? c.csv(f) : '')).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  // Ventana imprimible (pasaporte de implantes, orden de laboratorio, etc.).
  function imprimir(titulo, html) {
    const w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana de impresión', 'error'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
      <style>body{font-family:system-ui,sans-serif;color:#2B2420;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #D8C9B2;padding:6px;text-align:left}.nota{color:#6B6055;font-size:12px}</style>
      </head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  // Catálogos que se piden una sola vez por carga de página.
  const cache = {};
  async function catalogo(nombre, url) {
    if (!cache[nombre]) cache[nombre] = DOVA.get(url).catch((e) => { delete cache[nombre]; throw e; });
    return cache[nombre];
  }
  // Después de crear/editar algo de un catálogo, se vuelve a pedir.
  function olvidarCatalogo(nombre) { delete cache[nombre]; }
  async function opcionesOdontologos() {
    try { const l = await catalogo('odontologos', '/odontologos'); return l.filter((o) => o.activo !== false).map((o) => [o.id, o.nombre]); } catch (_e) { return []; }
  }

  // Tiempo real: la pantalla se vuelve a dibujar sola cuando cambian esas tablas.
  const vivo = (cont, tablas, fn) => { if (window.DovaVivo) DovaVivo.vivo(cont, tablas, fn); };

  return {
    vivo,
    esc, fmtFecha, fmtFechaHora, fmtGs, toast, puede, hoy, sumarDias, etiqueta, cargando,
    formHtml, leerForm, modal, modalForm, cerrarModal, tablaCrud, subPestanas, badge, badgeFecha, linkWhatsapp,
    bannerAlertas, grafico, activarGraficos, descargarJson, descargarCsv, imprimir, catalogo, olvidarCatalogo, opcionesOdontologos,
  };
})();
window.DovaExt = DovaExt;
