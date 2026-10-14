/* Accesos rápidos (tira de íconos del diseño mecánico):
   - turno(): "Nuevo turno" directo, sin abrir la agenda. Solo deja elegir
     odontólogos libres en esa fecha y hora; si no hay ninguno, no reserva
     (el servidor lo vuelve a verificar con soloDisponible).
   - paciente(navegar): buscar un paciente para abrir su ficha, o darlo de alta.
     No lista todos los pacientes: solo los que coinciden con lo que se escribe.
   Uso: DovaRapido.turno(), DovaRapido.paciente(navegar) */
const DovaRapido = (() => {
  const X = DovaExt;
  const { esc, puede, toast } = X;

  async function turno() {
    if (!puede('agenda.create')) { toast('No tenés permiso para reservar turnos', 'error'); return; }
    await DovaOperativo.modalTurno({ soloDisponibles: true });
  }

  function paciente(navegar) {
    const crear = puede('pacientes.create');
    const box = X.modal('Pacientes', `
      <div class="dova-rap-pac">
        <div class="dova-rap-pestanas" role="tablist">
          <button type="button" role="tab" class="activa" data-rap-tab="buscar" aria-selected="true">Ver ficha</button>
          ${crear ? '<button type="button" role="tab" data-rap-tab="nuevo" aria-selected="false">+ Nuevo paciente</button>' : ''}
        </div>
        <div data-rap-panel="buscar">
          <label for="rap-q">Buscar por nombre, apellido o C.I.</label>
          <input type="search" id="rap-q" autocomplete="off" placeholder="Escribí al menos 2 letras o números…" />
          <div class="dova-rap-res" data-rap-res aria-live="polite"></div>
        </div>
        ${crear ? `<form data-rap-panel="nuevo" hidden class="dova-rap-form">
          <div class="dova-ext-form-grid">
            <div class="dova-ext-campo"><label for="rap-nombre">Nombre *</label><input id="rap-nombre" required maxlength="100" /></div>
            <div class="dova-ext-campo"><label for="rap-apellido">Apellido *</label><input id="rap-apellido" required maxlength="100" /></div>
            <div class="dova-ext-campo"><label for="rap-ci">C.I.</label><input id="rap-ci" maxlength="30" inputmode="numeric" /></div>
            <div class="dova-ext-campo"><label for="rap-tel">Teléfono</label><input id="rap-tel" maxlength="40" inputmode="tel" /></div>
            <div class="dova-ext-campo"><label for="rap-nac">Fecha de nacimiento</label><input id="rap-nac" type="date" /></div>
            <div class="dova-ext-campo"><label for="rap-mail">Correo</label><input id="rap-mail" type="email" maxlength="150" /></div>
          </div>
          <p class="dova-error-text" data-rap-error hidden></p>
          <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button type="submit" class="dova-btn-primary">Guardar paciente</button></div>
        </form>` : ''}
      </div>`, { ancho: 'ancho' });
    if (!box) return;
    const ir = (id) => { X.cerrarModal(); navegar('paciente', String(id)); };
    box.querySelectorAll('[data-rap-tab]').forEach((b) => b.addEventListener('click', () => {
      box.querySelectorAll('[data-rap-tab]').forEach((o) => { const a = o === b; o.classList.toggle('activa', a); o.setAttribute('aria-selected', String(a)); });
      box.querySelectorAll('[data-rap-panel]').forEach((p) => { p.hidden = p.dataset.rapPanel !== b.dataset.rapTab; });
      const f = box.querySelector(`[data-rap-panel="${b.dataset.rapTab}"] input`); if (f) f.focus();
    }));

    // ---- Buscar ----
    const q = box.querySelector('#rap-q'); const res = box.querySelector('[data-rap-res]');
    let t = null; let pedido = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      const txt = q.value.trim();
      if (txt.length < 2) { res.innerHTML = ''; return; }
      t = setTimeout(async () => {
        const n = ++pedido;
        try {
          const r = await DOVA.get(`/pacientes?q=${encodeURIComponent(txt)}&pageSize=8`);
          if (n !== pedido) return;
          const lista = r.data || r.items || r;
          res.innerHTML = lista.length ? `<ul class="dova-rap-lista">${lista.map((p) => `<li>
              <span><strong>${esc(p.nombre)} ${esc(p.apellido)}</strong> <span class="dova-nota">${p.ci ? `C.I. ${esc(p.ci)}` : 'Sin C.I.'}${p.telefono ? ` · ${esc(p.telefono)}` : ''}</span></span>
              <button type="button" class="dova-btn-primary" data-rap-ficha="${esc(p.id)}">Ver ficha</button></li>`).join('')}</ul>`
            : `<p class="dova-vacio">No se encontró ningún paciente con "${esc(txt)}".${crear ? ' <button type="button" class="dova-btn-link" data-rap-alta>Darlo de alta</button>' : ''}</p>`;
          res.querySelectorAll('[data-rap-ficha]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.rapFicha)));
          const alta = res.querySelector('[data-rap-alta]');
          if (alta) alta.addEventListener('click', () => {
            box.querySelector('[data-rap-tab="nuevo"]').click();
            const partes = txt.split(/\s+/);
            if (/^\d[\d.]*$/.test(txt)) box.querySelector('#rap-ci').value = txt.replace(/\./g, '');
            else { box.querySelector('#rap-nombre').value = partes[0] || ''; box.querySelector('#rap-apellido').value = partes.slice(1).join(' '); }
          });
        } catch (e) { if (n === pedido) res.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`; }
      }, 250);
    });
    q.focus();

    // ---- Nuevo ----
    const form = box.querySelector('[data-rap-panel="nuevo"]');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('[data-rap-error]'); err.hidden = true;
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      const v = (id) => form.querySelector(id).value.trim() || undefined;
      try {
        const p = await DOVA.post('/pacientes', {
          nombre: v('#rap-nombre'), apellido: v('#rap-apellido'), ci: v('#rap-ci'), telefono: v('#rap-tel'),
          fechaNacimiento: v('#rap-nac'), email: v('#rap-mail'),
        });
        toast('Paciente guardado', 'ok');
        const id = p && (p.id || (p.paciente && p.paciente.id));
        form.outerHTML = `<div class="dova-rap-listo" data-rap-panel="nuevo">
          <p><strong>${esc(v('#rap-nombre') || '')} ${esc(v('#rap-apellido') || '')}</strong> quedó registrado.</p>
          <div class="dova-modal-actions">
            ${puede('agenda.create') ? '<button type="button" class="dova-btn-secundario" data-rap-turno>Reservarle un turno</button>' : ''}
            ${id ? '<button type="button" class="dova-btn-primary" data-rap-ver>Ver la ficha</button>' : ''}
          </div></div>`;
        const ver = box.querySelector('[data-rap-ver]'); if (ver) ver.addEventListener('click', () => ir(id));
        const tb = box.querySelector('[data-rap-turno]');
        if (tb) tb.addEventListener('click', () => DovaOperativo.modalTurno({ soloDisponibles: true, fijo: { pacienteId: id, pacienteNombre: `${v('#rap-nombre') || ''} ${v('#rap-apellido') || ''}`.trim() } }));
      } catch (ex) {
        err.textContent = ex.message || 'No se pudo guardar el paciente'; err.hidden = false; btn.disabled = false;
      }
    });
  }

  return { turno, paciente };
})();
window.DovaRapido = DovaRapido;
