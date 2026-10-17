/* DOVA — Tratamientos y odontólogos (Reportes → Tratamientos).
   Pestañas: Tratamientos y precios, Odontólogos (con su horario de atención).
   Uso: DovaCatalogo.catalogo(contenedor). */
const DovaCatalogo = (() => {
  const X = DovaExt;
  const { esc, fmtGs, toast, puede, badge } = X;
  const { colorOdo } = DovaTurnos;
  const num = (valor) => Number(valor || 0);

  // =================================================================
  // CATÁLOGO: tratamientos y odontólogos
  // =================================================================
  async function catalogo(root) {
    root.innerHTML = `<h2 class="dova-view-title">Tratamientos y odontólogos</h2><div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'trat', texto: 'Tratamientos y precios', visible: puede('tratamientos.manage'), render: tratamientos },
      { id: 'odo', texto: 'Odontólogos', visible: puede('usuarios.manage'), render: odontologos },
    ]);
  }

  async function tratamientos(c) {
    const tipos = await DOVA.get('/recalls/tipos').catch(() => []);
    await X.tablaCrud({
      root: c, endpoint: '/tratamientos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true, nuevoTexto: '+ Nuevo tratamiento', tituloModal: 'Tratamiento',
      descripcion: 'Lo que se elige al dar turnos y armar presupuestos. El control periódico hace que DOVA agende solo el próximo control cuando se termina el tratamiento.',
      claseFila: (r) => (r.activo === false ? 'dova-op-fila-apagada' : ''),
      columnas: [
        { t: 'Tratamiento', v: (r) => esc(r.nombre) }, { t: 'Categoría', v: (r) => esc(r.categoria || '-') }, { t: 'Precio', v: (r) => fmtGs(r.precio) },
        { t: 'Duración', v: (r) => (r.duracion_minutos ? `${r.duracion_minutos} min` : '-') },
        { t: 'Control periódico', v: (r) => esc((tipos.find((x) => x.id === r.recall_tipo_id) || {}).nombre || '-') },
        { t: 'Indicaciones', v: (r) => (r.indicaciones ? badge('Cargadas', 'ok') : '<span class="dova-nota">—</span>') },
        { t: 'Estado', v: (r) => (r.activo === false ? badge('Inactivo', 'critica') : badge('Activo', 'ok')) },
      ],
      campos: [
        { k: 'nombre', label: 'Nombre', req: true, max: 150 }, { k: 'categoria', label: 'Categoría', max: 80 },
        { k: 'precio', label: 'Precio (Gs.)', tipo: 'numero', req: true, min: 0 }, { k: 'duracionMinutos', label: 'Duración (min)', tipo: 'numero', min: 5, max: 480 },
        { k: 'recallTipoId', label: 'Control periódico al terminar', tipo: 'select', opciones: tipos.map((x) => [x.id, `${x.nombre} (cada ${x.intervalo_meses} meses)`]) },
        { k: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { k: 'indicaciones', label: 'Indicaciones para después (las recibe el paciente por WhatsApp)', tipo: 'textarea' },
        { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true },
      ],
      valoresEditar: (r) => ({ nombre: r.nombre, categoria: r.categoria, precio: num(r.precio), duracionMinutos: r.duracion_minutos, recallTipoId: r.recall_tipo_id, descripcion: r.descripcion, indicaciones: r.indicaciones || '', activo: r.activo !== false }),
      preparar: (d) => { if (d.recallTipoId !== undefined) d.recallTipoId = d.recallTipoId ? Number(d.recallTipoId) : null; if (typeof d.indicaciones === 'string') d.indicaciones = d.indicaciones.trim() || null; },
      alGuardar: () => { X.olvidarCatalogo('tratamientos'); tratamientos(c); },
    });
  }

  // Horario de cada profesional: lo usa la reserva online (si no tiene, se usa el de la clínica).
  const DIAS_SEM = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
  function resumenHorario(h) {
    const partes = DIAS_SEM.filter(([d]) => (h[d] || []).length).map(([d, n]) => `${n.slice(0, 2)} ${h[d].map(([a, b]) => `${a}–${b}`).join(' y ')}`);
    return partes.join(' · ') || 'Sin días';
  }
  async function modalHorario(o, alGuardar) {
    let base = o.horarios;
    if (!base) { try { base = (await DOVA.get('/web/config')).horarios; } catch (_e) { base = null; } }
    base = base || { 1: [['08:00', '12:00'], ['14:00', '19:00']], 2: [['08:00', '12:00'], ['14:00', '19:00']], 3: [['08:00', '12:00'], ['14:00', '19:00']], 4: [['08:00', '12:00'], ['14:00', '19:00']], 5: [['08:00', '12:00'], ['14:00', '19:00']], 6: [['08:00', '12:00']] };
    const fila = ([d, n]) => {
      const h = base[d] || []; const m = h[0] || []; const t = h[1] || [];
      return `<tr><td><label class="dova-check" style="margin:0"><input type="checkbox" data-abre="${d}" ${h.length ? 'checked' : ''}/> ${n}</label></td>
        <td><input type="time" data-d="${d}" data-i="0" data-j="0" value="${m[0] || '08:00'}" aria-label="${n}: desde"/> a <input type="time" data-d="${d}" data-i="0" data-j="1" value="${m[1] || '12:00'}" aria-label="${n}: hasta"/></td>
        <td><label class="dova-check" style="margin:0"><input type="checkbox" data-tarde="${d}" ${t.length ? 'checked' : ''}/> y</label> <input type="time" data-d="${d}" data-i="1" data-j="0" value="${t[0] || '14:00'}" aria-label="${n}: segundo horario desde"/> a <input type="time" data-d="${d}" data-i="1" data-j="1" value="${t[1] || '19:00'}" aria-label="${n}: segundo horario hasta"/></td></tr>`;
    };
    const box = X.modal(`Horario de ${o.nombre}`, `<form data-horario>
      <p class="dova-nota">Días y horas en que atiende. La página web ofrece turnos con este profesional solo en estos horarios (y si hay un sillón libre).</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-web-horario"><tbody>${DIAS_SEM.map(fila).join('')}</tbody></table></div>
      <p class="dova-error-text" data-err hidden></p>
      <div class="dova-modal-actions">${o.horarios ? '<button type="button" class="dova-btn-secundario" data-clinica>Usar el horario de la clínica</button>' : ''}<button type="button" class="dova-btn-secundario" data-cerrar>Cancelar</button><button class="dova-btn-primary">Guardar horario</button></div>
    </form>`, { ancho: 'ancho' });
    const f = box.querySelector('[data-horario]'); const err = f.querySelector('[data-err]');
    const guardar = async (horarios) => {
      err.hidden = true;
      try { await DOVA.put(`/odontologos/${o.id}/horarios`, { horarios }); X.cerrarModal(); toast('Horario guardado', 'ok'); alGuardar(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    f.querySelector('[data-cerrar]').addEventListener('click', () => X.cerrarModal());
    const bc = f.querySelector('[data-clinica]'); if (bc) bc.addEventListener('click', () => guardar(null));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const horarios = {};
      for (const [d] of DIAS_SEM) {
        horarios[d] = [];
        if (!f.querySelector(`[data-abre="${d}"]`).checked) continue;
        const v = (i, j) => f.querySelector(`[data-d="${d}"][data-i="${i}"][data-j="${j}"]`).value;
        horarios[d].push([v(0, 0), v(0, 1)]);
        if (f.querySelector(`[data-tarde="${d}"]`).checked) horarios[d].push([v(1, 0), v(1, 1)]);
      }
      guardar(horarios);
    });
  }

  async function odontologos(c) {
    await X.tablaCrud({
      root: c, endpoint: '/odontologos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true, nuevoTexto: '+ Nuevo odontólogo', tituloModal: 'Odontólogo',
      descripcion: 'Para que un odontólogo entre a DOVA con su usuario, crealo acá y después vinculalo en Usuarios.',
      claseFila: (r) => (r.activo === false ? 'dova-op-fila-apagada' : ''),
      columnas: [
        { t: 'Nombre', v: (r) => `<span class="dova-ext-punto-color" style="background:${colorOdo(r)}"></span>${esc(r.nombre)}` }, { t: 'Especialidad', v: (r) => esc(r.especialidad || '-') }, { t: 'Matrícula', v: (r) => esc(r.matricula || '-') },
        { t: 'Contacto', v: (r) => esc([r.telefono, r.email].filter(Boolean).join(' · ') || '-') },
        { t: 'Atiende', v: (r) => (r.horarios ? esc(resumenHorario(r.horarios)) : '<span class="dova-nota">Horario de la clínica</span>') },
        { t: 'Estado', v: (r) => (r.activo === false ? badge('Inactivo', 'critica') : badge('Activo', 'ok')) },
      ],
      acciones: [{ texto: 'Horario', visible: (r) => r.activo !== false, fn: (r) => modalHorario(r, () => { X.olvidarCatalogo('odontologos'); odontologos(c); }) }],
      campos: [
        { k: 'nombre', label: 'Nombre completo', req: true, max: 150 }, { k: 'especialidad', label: 'Especialidad', max: 100 }, { k: 'matricula', label: 'Matrícula', max: 50 },
        { k: 'telefono', label: 'Teléfono', max: 40 }, { k: 'email', label: 'Email', max: 150 }, { k: 'colorAgenda', label: 'Color en la agenda', tipo: 'color', ancho: 'completo', ayuda: 'Tocá un color. Así se distinguen sus turnos en el calendario.' },
        { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true },
      ],
      valoresEditar: (r) => ({ nombre: r.nombre, especialidad: r.especialidad, matricula: r.matricula, telefono: r.telefono, email: r.email, colorAgenda: r.color_agenda, activo: r.activo !== false }),
      alGuardar: () => { X.olvidarCatalogo('odontologos'); odontologos(c); },
    });
  }

  return { catalogo };
})();
window.DovaCatalogo = DovaCatalogo;

DovaPantallas.registrar('catalogo', { dibujar: (contenedor) => DovaCatalogo.catalogo(contenedor) });
