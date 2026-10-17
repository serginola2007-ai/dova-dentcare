/* Avisos al dueño y al paciente, y orden de los pendientes:
   - Resumen del día (Configuración → Resumen del día): por correo y/o WhatsApp a la hora elegida.
   - Indicaciones después del tratamiento: texto por tratamiento (con textos sugeridos),
     se mandan solas al terminar la atención o a mano desde el turno.
   - Archivar pendientes viejos (Seguimiento): controles atrasados hace más de N meses,
     sin borrar nada y con opción de restaurar. */
const DovaAvisos = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, puede, toast } = X;

  /* ============================================================ Resumen del día */
  async function tarjetaResumen(elMain) {
    if (!puede('clinica.config.manage')) return;
    let cfg; try { cfg = await DOVA.get('/resumen/config'); } catch (_e) { return; }
    const cont = document.createElement('section');
    cont.id = 'cfg-resumen'; cont.className = 'dova-cfg-resumen';
    const pintar = () => {
      const correos = [...cfg.correos, '', '', ''].slice(0, 3);
      const avisos = [];
      if (cfg.correos.length && !cfg.correoConfigurado) avisos.push('El envío de correos todavía no está configurado en el servidor (variables BREVO_* o SMTP_*).');
      if (cfg.whatsapp && !cfg.whatsappConectado) avisos.push('WhatsApp Business no está conectado: el resumen por WhatsApp se puede mandar a mano con "Mandar ahora".');
      cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Resumen del día</h2>
        <p class="dova-nota">Al final del día te llega lo que pasó: cobrado, pacientes atendidos, quién faltó, presupuestos aceptados, la caja y cuántos turnos hay mañana.</p>
        <form data-cfg-resumen>
          <label class="dova-check"><input type="checkbox" name="activo" ${cfg.activo ? 'checked' : ''}/> <strong>Mandarlo todos los días</strong></label>
          <div class="dova-ext-filtros">
            <div><label for="res-hora">A las</label><select id="res-hora" name="hora">${Array.from({ length: 12 }, (_, i) => i + 12).map((h) => `<option value="${h}" ${cfg.hora === h ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
            <div style="flex:1;min-width:220px"><label for="res-wa">Por WhatsApp a</label><input id="res-wa" name="whatsapp" type="tel" maxlength="30" placeholder="0981 123 456" value="${esc(cfg.whatsapp || '')}"/></div>
          </div>
          <div class="dova-ext-filtros">${correos.map((c, i) => `<div style="flex:1;min-width:200px"><label for="res-c${i}">${i ? 'Otro correo (opcional)' : 'Por correo a'}</label><input id="res-c${i}" name="correo${i}" type="email" maxlength="200" value="${esc(c)}"/></div>`).join('')}</div>
          ${avisos.map((a) => `<p class="dova-nota dova-nota-alerta">${esc(a)}</p>`).join('')}
          ${cfg.ultimo ? `<p class="dova-nota">Último: ${fmtFecha(cfg.ultimo.fecha)} · ${cfg.ultimo.estado === 'enviado' ? `enviado (${esc(cfg.ultimo.canales || '')})` : cfg.ultimo.estado === 'fallo' ? `no se pudo mandar: ${esc(cfg.ultimo.error || '')}` : 'enviándose'}</p>` : ''}
          <div class="dova-modal-actions" style="justify-content:flex-start">
            <button class="dova-btn-primary">Guardar</button>
            <button type="button" class="dova-btn-secundario" data-res-ver>Ver el de hoy</button>
            <button type="button" class="dova-btn-secundario" data-res-mandar>Mandar ahora</button>
          </div>
        </form>`;
      const f = cont.querySelector('[data-cfg-resumen]');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          cfg = await DOVA.put('/resumen/config', { activo: f.activo.checked, hora: Number(f.hora.value), whatsapp: f.whatsapp.value.trim() || null, correos: [f.correo0.value, f.correo1.value, f.correo2.value].map((x) => x.trim()).filter(Boolean) });
          toast('Resumen del día guardado', 'ok'); pintar();
        } catch (ex) { toast(ex.message, 'error'); }
      });
      cont.querySelector('[data-res-ver]').addEventListener('click', async () => {
        try {
          const v = await DOVA.get('/resumen/vista');
          X.modal(`Resumen de hoy · ${v.fechaTexto}`, `<pre class="dova-res-texto">${esc(v.texto)}</pre><div class="dova-modal-actions"><button type="button" class="dova-btn-primary" data-cerrar-modal>Cerrar</button></div>`);
        } catch (ex) { toast(ex.message, 'error'); }
      });
      cont.querySelector('[data-res-mandar]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const r = await DOVA.post('/resumen/enviar', {});
          if (r.whatsappManual) window.open(r.whatsappManual, '_blank', 'noopener');
          toast(r.canales.length ? `Resumen enviado (${r.canales.length})` : (r.whatsappManual ? 'Abrimos WhatsApp para que lo mandes' : `No se pudo mandar: ${r.errores.join(' · ')}`), r.canales.length || r.whatsappManual ? 'ok' : 'error');
          cfg = await DOVA.get('/resumen/config'); pintar();
        } catch (ex) { toast(ex.message, 'error'); b.disabled = false; }
      });
    };
    pintar();
    elMain.appendChild(cont);
  }

  /* ============================================================ Indicaciones */
  // Textos sugeridos (se pueden editar). Lenguaje simple, sin dosis de medicamentos.
  const SUGERIDAS = [
    ['Extracción', `Durante la primera hora mordé la gasa sin moverla.
Hoy no hagas buches ni escupas, no uses sorbete y no fumes.
Comé blando y tibio o frío; masticá del otro lado.
Podés ponerte hielo por fuera, 15 minutos sí y 15 no, durante el primer día.
Desde mañana cepillate con cuidado y hacé buches suaves con agua tibia y sal.
Tomá solo los medicamentos que te indicó tu odontólogo.
Si sangra mucho, hay mucha hinchazón o fiebre, llamanos.`],
    ['Implante', `Seguí las mismas indicaciones de una extracción durante los primeros días.
No apoyes ni mastiques sobre la zona del implante hasta que te lo indiquemos.
Hielo por fuera el primer día; dormí con la cabeza un poco más alta.
Mantené la zona limpia con cepillo suave y el enjuague que te indicaron.
No fumes: retrasa la cicatrización y puede hacer fracasar el implante.
Ante dolor que aumenta, fiebre o si algo se mueve, llamanos.`],
    ['Endodoncia', `Es normal sentir molestia al masticar durante unos días.
Hasta colocar la restauración definitiva, no mastiques cosas duras con esa pieza.
Si se cae o se gasta el empaste provisorio, avisanos.
Tomá solo los medicamentos que te indicó tu odontólogo.
Recordá volver para la restauración definitiva: protege el diente.`],
    ['Blanqueamiento', `Durante 48 horas evitá alimentos y bebidas con color: café, té, mate cocido, vino tinto, gaseosas oscuras, salsas y remolacha.
No fumes en esos días.
Puede haber sensibilidad unos días; usá pasta para dientes sensibles.
Si la sensibilidad es fuerte o dura más de una semana, avisanos.`],
    ['Limpieza', `Las encías pueden estar sensibles o sangrar un poco 1 o 2 días: es normal.
Cepillate con cepillo suave 3 veces por día y usá hilo dental.
Si te indicamos un enjuague, usalo como te explicamos.
Nos vemos en tu próximo control.`],
    ['Ortodoncia (colocación o ajuste)', `Los primeros días puede haber molestia: comé blando.
Evitá alimentos duros o pegajosos (caramelos, chicles, maní, hielo).
Cepillate después de cada comida, con cuidado alrededor de los brackets.
Si un bracket se despega o un alambre lastima, avisanos; mientras tanto podés cubrirlo con cera de ortodoncia.`],
  ];

  // Agrega "Usar un texto sugerido" a cualquier campo de indicaciones que aparezca (editar tratamiento).
  function activarSugerencias(raiz) {
    raiz.querySelectorAll('textarea[name="indicaciones"]:not([data-sug])').forEach((ta) => {
      ta.dataset.sug = '1';
      ta.rows = Math.max(ta.rows || 0, 6);
      const sel = document.createElement('select');
      sel.className = 'dova-indic-sugeridas'; sel.setAttribute('aria-label', 'Usar un texto sugerido');
      sel.innerHTML = `<option value="">Usar un texto sugerido…</option>${SUGERIDAS.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join('')}`;
      sel.addEventListener('change', () => {
        if (sel.value === '') return;
        ta.value = SUGERIDAS[Number(sel.value)][1]; sel.value = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      ta.parentNode.insertBefore(sel, ta);
    });
  }
  new MutationObserver(() => { if (document.querySelector('textarea[name="indicaciones"]:not([data-sug])')) activarSugerencias(document); }).observe(document.documentElement, { childList: true, subtree: true });

  // En el detalle de un turno atendido: "Mandar indicaciones" (desde el WhatsApp de quien atiende).
  async function botonIndicaciones(cont, turnoId) {
    if (!cont || !puede('whatsapp.send', 'historia_clinica.edit', 'agenda.edit')) return;
    let r; try { r = await DOVA.get(`/mensajes/indicaciones/${turnoId}`); } catch (_e) { return; }
    if (!r.disponible || !cont.isConnected) return;
    cont.innerHTML = `<div class="dova-indic-turno">
      <p><strong>Indicaciones para después</strong> · ${esc(r.tratamiento)}${r.enviado ? ` <span class="dova-nota">(ya se mandaron ${r.enviado.canal === 'whatsapp_manual' ? 'a mano' : 'por WhatsApp Business'} el ${fmtFecha(r.enviado.creado_en)})</span>` : ''}</p>
      <button type="button" class="dova-btn-secundario dova-link-wa" data-indic-enviar>${r.enviado ? 'Volver a mandar por mi WhatsApp' : 'Mandar por mi WhatsApp'}</button></div>`;
    cont.querySelector('[data-indic-enviar]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const x = await DOVA.post(`/mensajes/indicaciones/${turnoId}/enviar`, {}); if (x.url) window.open(x.url, '_blank', 'noopener'); toast('Indicaciones listas para mandar', 'ok'); } catch (ex) { toast(ex.message, 'error'); } finally { b.disabled = false; }
    });
  }

  /* ============================================================ Archivar pendientes viejos */
  const NOMBRE = { recalls: 'controles periódicos', controles: 'controles después de un tratamiento' };
  async function bannerArchivo(c, tipo, recargar) {
    if (!c) return;
    let r; try { r = await DOVA.get('/seguimiento/archivar?meses=6'); } catch (_e) { return; }
    const viejos = r[tipo]; const archivados = r[`${tipo}Archivados`];
    if (!viejos && !archivados) return;
    const maneja = tipo === 'recalls' ? puede('recalls.manage', 'seguimiento.manage') : puede('seguimiento.manage', 'especialidades.edit');
    const div = document.createElement('div');
    div.className = 'dova-archivo';
    const frase = (n, m) => `Hay <strong>${n}</strong> ${NOMBRE[tipo]} atrasados hace más de ${m} meses.`;
    div.innerHTML = `${viejos ? `<span data-arch-txt>${frase(viejos, 6)}</span>${maneja ? `<label class="dova-archivo-meses">más de <select data-arch-meses aria-label="Antigüedad">${[3, 6, 12, 24].map((m) => `<option value="${m}" ${m === 6 ? 'selected' : ''}>${m} meses</option>`).join('')}</select></label><button type="button" class="dova-btn-secundario" data-arch-ok>Archivar</button>` : ''}` : ''}
      ${archivados ? `<button type="button" class="dova-btn-link" data-arch-ver>Ver archivados (${archivados})</button>` : ''}`;
    c.prepend(div);
    const sel = div.querySelector('[data-arch-meses]');
    if (sel) sel.addEventListener('change', async () => {
      try {
        const x = await DOVA.get(`/seguimiento/archivar?meses=${sel.value}`);
        div.querySelector('[data-arch-txt]').innerHTML = frase(x[tipo], sel.value);
        const b = div.querySelector('[data-arch-ok]'); if (b) { b.dataset.seguro = ''; b.textContent = 'Archivar'; b.disabled = !x[tipo]; }
      } catch (_e) { /* */ }
    });
    const ok = div.querySelector('[data-arch-ok]');
    if (ok) ok.addEventListener('click', async () => {
      const meses = sel ? Number(sel.value) : 6;
      const n = div.querySelector('strong').textContent;
      if (ok.dataset.seguro !== '1') { ok.dataset.seguro = '1'; ok.textContent = `¿Archivar ${n}? Tocá de nuevo`; return; }
      ok.disabled = true;
      try { const x = await DOVA.post('/seguimiento/archivar', { tipo, meses }); toast(x.mensaje, 'ok'); div.remove(); if (recargar) recargar(); bannerArchivo(c, tipo, recargar); } catch (ex) { toast(ex.message, 'error'); ok.disabled = false; }
    });
    const ver = div.querySelector('[data-arch-ver]');
    if (ver) ver.addEventListener('click', () => verArchivados(tipo, maneja, () => { div.remove(); if (recargar) recargar(); bannerArchivo(c, tipo, recargar); }));
  }
  async function verArchivados(tipo, maneja, alCambiar) {
    let r; try { r = await DOVA.get(`/seguimiento/archivados?tipo=${tipo}`); } catch (e) { toast(e.message, 'error'); return; }
    const box = X.modal(`${NOMBRE[tipo].charAt(0).toUpperCase() + NOMBRE[tipo].slice(1)} archivados (${r.total})`, `
      <p class="dova-nota">No se borró nada: al restaurarlos vuelven a las listas y a los avisos.</p>
      <div class="dova-ext-tabla-wrap"><table class="dova-tabla"><thead><tr>${maneja ? '<th><input type="checkbox" data-todos aria-label="Elegir todos"/></th>' : ''}<th>Paciente</th><th>Control</th><th>Fecha</th></tr></thead>
      <tbody>${r.items.map((x) => `<tr>${maneja ? `<td><input type="checkbox" data-id="${x.id}" aria-label="Elegir"/></td>` : ''}<td>${esc(`${x.paciente_nombre} ${x.paciente_apellido}`)}</td><td>${esc(x.titulo || '-')}</td><td>${fmtFecha(x.fecha)}</td></tr>`).join('')}</tbody></table></div>
      ${r.total > r.items.length ? `<p class="dova-nota">Se muestran los ${r.items.length} más recientes.</p>` : ''}
      <div class="dova-modal-actions">${maneja ? '<button type="button" class="dova-btn-secundario" data-rest-todos>Restaurar todos</button><button type="button" class="dova-btn-primary" data-rest>Restaurar los elegidos</button>' : ''}<button type="button" class="dova-btn-secundario" data-cerrar-modal>Cerrar</button></div>`, { ancho: 'ancho' });
    if (!box || !maneja) return;
    box.querySelector('[data-todos]').addEventListener('change', (e) => box.querySelectorAll('[data-id]').forEach((x) => { x.checked = e.target.checked; }));
    const restaurar = async (cuerpo) => {
      try { const x = await DOVA.post('/seguimiento/archivados/restaurar', { tipo, ...cuerpo }); X.cerrarModal(); toast(`Se restauraron ${x.restaurados}`, 'ok'); if (alCambiar) alCambiar(); } catch (e) { toast(e.message, 'error'); }
    };
    box.querySelector('[data-rest]').addEventListener('click', () => {
      const ids = [...box.querySelectorAll('[data-id]:checked')].map((x) => Number(x.dataset.id));
      if (!ids.length) { toast('Elegí al menos uno', 'error'); return; }
      restaurar({ ids });
    });
    box.querySelector('[data-rest-todos]').addEventListener('click', () => restaurar({ todos: true }));
  }

  return { tarjetaResumen, botonIndicaciones, bannerArchivo, activarSugerencias, SUGERIDAS };
})();
window.DovaAvisos = DovaAvisos;
