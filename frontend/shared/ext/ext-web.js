/* DOVA — Página web: lo que llega desde la web de la clínica (turnos,
   fichas de pacientes nuevos y consultas) y la configuración de la página. */
const DovaWeb = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtFechaHora, toast, puede, badge, cargando } = X;
  const TIPO = { turno: ['Turno', 'info'], registro: ['Ficha', 'ok'], consulta: ['Consulta', 'atencion'] };
  const ESTADO = { pendiente: ['Pendiente', 'atencion'], resuelta: ['Atendida', 'ok'], descartada: ['Descartada', 'critica'] };
  const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
  const SALUD = { alergias: 'Alergias', medicacion: 'Medicación', anticoagulantes: 'Anticoagulantes o aspirina', corazon: 'Corazón o presión', diabetes: 'Diabetes', enfermedades: 'Otras enfermedades', embarazo: 'Embarazo' };
  const urlWeb = () => `${location.origin}/web/`;

  async function seccion(root, navegar) {
    root.innerHTML = `<h2 class="dova-view-title">Página web</h2>
      <p class="dova-nota">La página de la clínica está en <a href="${urlWeb()}" target="_blank" rel="noopener">${esc(urlWeb())}</a>. Los turnos que se reservan ahí entran directo a la Agenda.</p>
      <div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'solicitudes', texto: 'Lo que llegó', visible: puede('web.ver', 'web.configurar'), render: (c) => solicitudes(c, navegar, { estado: 'pendiente' }) },
      { id: 'config', texto: 'Configurar la página', visible: puede('web.configurar'), render: (c) => configuracion(c) },
    ]);
  }

  // ---------------- Lo que llegó ----------------
  async function solicitudes(c, navegar, fl) {
    const q = new URLSearchParams(Object.entries(fl).filter(([, v]) => v));
    const r = await DOVA.get(`/web/solicitudes?${q}`);
    const filtro = (k, v, t) => `<button class="dova-ext-subtab ${fl[k] === v ? 'activo' : ''}" data-f="${k}" data-v="${v}">${t}</button>`;
    c.innerHTML = `
      <div class="dova-web-filtros">${filtro('estado', 'pendiente', `Pendientes (${r.pendientes})`)}${filtro('estado', '', 'Todas')}
        <span class="dova-web-sep"></span>${filtro('tipo', '', 'Todo')}${filtro('tipo', 'turno', 'Turnos')}${filtro('tipo', 'registro', 'Fichas')}${filtro('tipo', 'consulta', 'Consultas')}</div>
      ${r.items.length ? `<div class="dova-web-lista">${r.items.map(tarjeta).join('')}</div>`
        : `<div class="dova-fac-vacio"><div class="dova-fac-vacio-icono">📭</div><h3>${fl.estado === 'pendiente' ? 'No hay nada pendiente' : 'Todavía no llegó nada'}</h3>
           <p class="dova-nota">Cuando alguien reserve un turno, complete su ficha o mande una consulta desde la página, aparece acá y te llega un aviso.</p></div>`}`;
    const recargar = (cambio) => solicitudes(c, navegar, { ...fl, ...cambio });
    c.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => recargar({ [b.dataset.f]: b.dataset.v })));
    c.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
    c.querySelectorAll('[data-agenda]').forEach((b) => b.addEventListener('click', () => navegar('agenda')));
    c.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await DOVA.patch(`/web/solicitudes/${b.dataset.id}`, { estado: b.dataset.estado }); toast(b.dataset.estado === 'resuelta' ? 'Marcada como atendida' : b.dataset.estado === 'descartada' ? 'Descartada' : 'Vuelve a pendientes', 'ok'); recargar({}); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    }));
    c.querySelectorAll('[data-aplicar]').forEach((b) => b.addEventListener('click', () => {
      const s = r.items.find((x) => String(x.id) === b.dataset.aplicar);
      const d = s.datos || {};
      const op = [['telefono', 'Teléfono', s.telefono], ['email', 'Email', s.email], ['direccion', 'Dirección', d.direccion], ['ciudad', 'Ciudad', d.ciudad], ['fechaNacimiento', 'Fecha de nacimiento', d.fechaNacimiento && fmtFecha(d.fechaNacimiento)], ['contactoEmergencia', 'Contacto de emergencia', d.contactoEmergencia]].filter(([, , v]) => v);
      X.modal('Pasar datos a la ficha', `<p class="dova-nota">${esc(s.nombre)} ya era paciente. Marcá los datos nuevos que querés guardar en su ficha (reemplazan a los actuales).</p>
        <form data-aplicar-form>${op.map(([k, t, v]) => `<label class="dova-ext-check"><input type="checkbox" name="${k}" checked/> <strong>${esc(t)}:</strong> ${esc(v)}</label>`).join('')}
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Guardar en la ficha</button></div></form>`);
      document.querySelector('[data-aplicar-form]').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const campos = op.map(([k]) => k).filter((k) => ev.target[k].checked);
        try { await DOVA.post(`/web/solicitudes/${s.id}/aplicar`, { campos }); X.cerrarModal(); toast('Datos guardados en la ficha', 'ok'); recargar({}); } catch (e) { toast(e.message, 'error'); }
      });
    }));
  }

  function tarjeta(s) {
    const d = s.datos || {};
    const salud = Object.entries(d.salud || {}).filter(([, v]) => v && v.r === 'si');
    const contacto = [s.telefono && `📞 ${esc(s.telefono)}`, s.email && `✉️ ${esc(s.email)}`, s.ci && `C.I. ${esc(s.ci)}`].filter(Boolean).join(' &nbsp; ');
    const wa = s.telefono ? `https://wa.me/${(() => { const n = s.telefono.replace(/\D/g, ''); return n.startsWith('0') ? `595${n.slice(1)}` : n; })()}` : null;
    let cuerpo = '';
    if (s.tipo === 'turno') {
      cuerpo = `<p><strong>${s.turno_fecha ? `${esc(fmtFecha(s.turno_fecha))} a las ${esc(s.turno_hora)}` : `${esc(d.fecha || '')} ${esc(d.hora || '')}`}</strong> · ${esc(d.tratamiento || 'Consulta general')} · ${esc(s.turno_odontologo || d.odontologo || '')}
        ${s.turno_estado === 'cancelado' ? badge('Cancelado por el paciente', 'critica') : ''}</p>
        ${s.mensaje ? `<p class="dova-nota">“${esc(s.mensaje)}”</p>` : ''}`;
    } else if (s.tipo === 'registro') {
      cuerpo = `${salud.length ? `<p><strong>Salud:</strong> ${salud.map(([k, v]) => `${esc(SALUD[k] || k)}${v.d ? ` (${esc(v.d)})` : ''}`).join(' · ')}</p>` : '<p class="dova-nota">No marcó problemas de salud.</p>'}
        ${d.direccion || d.ciudad ? `<p class="dova-nota">${esc([d.direccion, d.ciudad].filter(Boolean).join(', '))}</p>` : ''}
        ${d.comoNosConocio ? `<p class="dova-nota">Nos conoció por: ${esc(d.comoNosConocio)}</p>` : ''}
        ${s.mensaje ? `<p class="dova-nota">“${esc(s.mensaje)}”</p>` : ''}`;
    } else cuerpo = `<p class="dova-web-msg">${esc(s.mensaje)}</p>`;
    return `<article class="dova-web-card ${s.estado !== 'pendiente' ? 'cerrada' : ''}">
      <header>${badge(TIPO[s.tipo][0], TIPO[s.tipo][1])} <strong>${esc(s.nombre)}</strong> ${s.paciente_nuevo ? badge('Paciente nuevo', 'ok') : s.paciente_id ? badge('Ya era paciente', 'info') : ''}
        <span class="dova-nota dova-web-cuando">${esc(fmtFechaHora(s.creado_en))}</span></header>
      ${cuerpo}
      <p class="dova-nota">${contacto}</p>
      <div class="dova-web-acciones">
        ${s.paciente_id ? `<button class="dova-btn-secundario" data-pac="${s.paciente_id}">Ver ficha</button>` : ''}
        ${s.turno_id ? '<button class="dova-btn-secundario" data-agenda>Ver agenda</button>' : ''}
        ${wa ? `<a class="dova-btn-secundario" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${s.tipo === 'registro' && !s.paciente_nuevo && s.paciente_id && s.estado === 'pendiente' && puede('pacientes.edit') ? `<button class="dova-btn-secundario" data-aplicar="${s.id}">Pasar datos a la ficha</button>` : ''}
        ${s.estado === 'pendiente' ? `<button class="dova-btn-primary" data-estado="resuelta" data-id="${s.id}">Marcar atendida</button><button class="dova-btn-link dova-ext-peligro" data-estado="descartada" data-id="${s.id}">Descartar</button>`
          : `<span class="dova-nota">${badge(ESTADO[s.estado][0], ESTADO[s.estado][1])} ${esc(s.resuelta_por_nombre || '')}</span><button class="dova-btn-link" data-estado="pendiente" data-id="${s.id}">Volver a pendiente</button>`}
      </div></article>`;
  }

  // ---------------- Configuración ----------------
  async function configuracion(c) {
    const [cfg, trats, odos] = await Promise.all([DOVA.get('/web/config'), DOVA.get('/tratamientos').catch(() => []), DOVA.get('/odontologos').catch(() => [])]);
    const tAct = trats.filter((t) => t.activo !== false); const oAct = odos.filter((o) => o.activo !== false);
    const marcado = (lista, id) => !lista || lista.includes(id);
    const horas = (d) => (cfg.horarios[d] || []);
    const filaDia = ([d, n]) => {
      const h = horas(d); const m = h[0] || []; const t = h[1] || [];
      return `<tr><td><label class="dova-ext-check" style="margin:0"><input type="checkbox" data-abre="${d}" ${h.length ? 'checked' : ''}/> ${n}</label></td>
        <td><input type="time" data-d="${d}" data-i="0" data-j="0" value="${m[0] || '08:00'}"/> a <input type="time" data-d="${d}" data-i="0" data-j="1" value="${m[1] || '12:00'}"/></td>
        <td><label class="dova-ext-check" style="margin:0"><input type="checkbox" data-tarde="${d}" ${t.length ? 'checked' : ''}/> y</label> <input type="time" data-d="${d}" data-i="1" data-j="0" value="${t[0] || '14:00'}"/> a <input type="time" data-d="${d}" data-i="1" data-j="1" value="${t[1] || '19:00'}"/></td></tr>`;
    };
    c.innerHTML = `
      <form data-cfg>
        <section class="dova-ext-caja"><h4>Reservas online</h4>
          <label class="dova-ext-check"><input type="checkbox" name="reservasActivas" ${cfg.reservas_activas ? 'checked' : ''}/> Permitir que los pacientes reserven turnos desde la página</label>
          <div class="dova-fac-filtros-form">
            <div><label>Cada cuántos minutos se ofrece un turno</label><select name="intervaloMinutos">${[15, 20, 30, 45, 60].map((v) => `<option ${cfg.intervalo_minutos === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div><label>Días hacia adelante que se pueden reservar</label><input type="number" name="diasAdelante" min="1" max="180" value="${cfg.dias_adelante}"/></div>
            <div><label>Horas mínimas de anticipación</label><input type="number" name="anticipacionHoras" min="0" max="168" value="${cfg.anticipacion_horas}"/></div>
            <div><label>Cancelar online hasta (horas antes)</label><input type="number" name="cancelacionHoras" min="0" max="168" value="${cfg.cancelacion_horas}"/></div>
            <div><label>Turnos web por persona a la vez</label><input type="number" name="maxTurnosPorPersona" min="1" max="10" value="${cfg.max_turnos_por_persona}"/></div>
          </div>
          <p class="dova-nota">Los bloqueos de agenda (feriados, vacaciones) y los turnos ya dados se respetan solos: esos horarios no aparecen en la página.</p>
        </section>
        <section class="dova-ext-caja"><h4>Horario de atención</h4>
          <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-web-horario"><tbody>${DIAS.map(filaDia).join('')}</tbody></table></div>
          <p class="dova-nota">Marcá los días que atienden. "y" agrega un segundo horario (por ejemplo, a la tarde).</p>
        </section>
        <section class="dova-ext-caja"><h4>Qué se puede reservar</h4>
          <p class="dova-nota">Tratamientos que se ofrecen en la página (la duración del turno es la del tratamiento).</p>
          <div class="dova-web-checks">${tAct.map((t) => `<label class="dova-ext-check"><input type="checkbox" data-trat="${t.id}" ${marcado(cfg.tratamientos_web, t.id) ? 'checked' : ''}/> ${esc(t.nombre)}</label>`).join('')}</div>
          <label class="dova-ext-check"><input type="checkbox" name="mostrarPrecios" ${cfg.mostrar_precios ? 'checked' : ''}/> Mostrar el precio ("desde Gs. …")</label>
          <p class="dova-nota" style="margin-top:12px">Profesionales que atienden turnos online.</p>
          <div class="dova-web-checks">${oAct.map((o) => `<label class="dova-ext-check"><input type="checkbox" data-odo="${o.id}" ${marcado(cfg.odontologos_web, o.id) ? 'checked' : ''}/> ${esc(o.nombre)}</label>`).join('')}</div>
        </section>
        <section class="dova-ext-caja"><h4>Textos y contacto</h4>
          ${X.formHtml([
            { k: 'titulo', label: 'Nombre de la clínica en la página', max: 150 }, { k: 'eslogan', label: 'Frase de bienvenida', max: 250 },
            { k: 'presentacion', label: 'Presentación (aparece en Tratamientos)', tipo: 'textarea' },
            { k: 'direccion', label: 'Dirección', max: 300, ancho: 'completo' }, { k: 'telefono', label: 'Teléfono', max: 60 }, { k: 'whatsapp', label: 'WhatsApp', max: 60 },
            { k: 'email', label: 'Email', max: 150 }, { k: 'instagram', label: 'Instagram', max: 150 }, { k: 'facebook', label: 'Facebook', max: 150 },
            { k: 'mapaUrl', label: 'Mapa (enlace "Insertar mapa" de Google Maps)', ancho: 'completo', ayuda: 'En Google Maps: Compartir → Insertar un mapa → copiá solo lo que está entre comillas después de src=' },
          ], { titulo: cfg.titulo, eslogan: cfg.eslogan, presentacion: cfg.presentacion, direccion: cfg.direccion, telefono: cfg.telefono, whatsapp: cfg.whatsapp, email: cfg.email, instagram: cfg.instagram, facebook: cfg.facebook, mapaUrl: cfg.mapa_url })}
          <p class="dova-nota">El logo es el mismo de los comprobantes (Facturación → Configuración).</p>
        </section>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-fac-form-pie"><a class="dova-btn-secundario" href="${urlWeb()}" target="_blank" rel="noopener">Ver la página</a><button class="dova-btn-primary">Guardar cambios</button></div>
      </form>`;
    const f = c.querySelector('[data-cfg]');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = f.querySelector('[data-error]'); err.style.display = 'none';
      const horarios = {};
      for (const [d] of DIAS) {
        horarios[d] = [];
        if (!f.querySelector(`[data-abre="${d}"]`).checked) continue;
        const v = (i, j) => f.querySelector(`[data-d="${d}"][data-i="${i}"][data-j="${j}"]`).value;
        horarios[d].push([v(0, 0), v(0, 1)]);
        if (f.querySelector(`[data-tarde="${d}"]`).checked) horarios[d].push([v(1, 0), v(1, 1)]);
      }
      const trat = [...f.querySelectorAll('[data-trat]')]; const odo = [...f.querySelectorAll('[data-odo]')];
      const sel = (l, k) => (l.every((x) => x.checked) ? null : l.filter((x) => x.checked).map((x) => Number(x.dataset[k])));
      const textos = X.leerForm(f, ['titulo', 'eslogan', 'presentacion', 'direccion', 'telefono', 'whatsapp', 'email', 'instagram', 'facebook', 'mapaUrl'].map((k) => ({ k })), true);
      const datos = {
        ...textos, horarios, reservasActivas: f.reservasActivas.checked, mostrarPrecios: f.mostrarPrecios.checked,
        intervaloMinutos: Number(f.intervaloMinutos.value), diasAdelante: Number(f.diasAdelante.value), anticipacionHoras: Number(f.anticipacionHoras.value),
        cancelacionHoras: Number(f.cancelacionHoras.value), maxTurnosPorPersona: Number(f.maxTurnosPorPersona.value),
        tratamientosWeb: sel(trat, 'trat'), odontologosWeb: sel(odo, 'odo'),
      };
      if (datos.odontologosWeb && !datos.odontologosWeb.length && datos.reservasActivas) { err.textContent = 'Elegí al menos un profesional para las reservas online.'; err.style.display = 'block'; return; }
      const btn = f.querySelector('button.dova-btn-primary'); btn.disabled = true;
      try { await DOVA.put('/web/config', datos); toast('Página web actualizada', 'ok'); } catch (e) { err.textContent = e.message; err.style.display = 'block'; } finally { btn.disabled = false; }
    });
  }

  return { seccion };
})();
window.DovaWeb = DovaWeb;
