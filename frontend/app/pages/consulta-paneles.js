/* DOVA — paneles del modo consulta (evolución, receta, odontograma, etc.).
   Los usa pages/clinica.js: renderPanelConsulta(accion, idPaciente) + initPanelConsulta(accion, idPaciente). */
const DovaPanelesConsulta = (() => {
  const { hoyPy, esc, toast, manejarError } = DovaAyudantes;


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
            <label>Fecha del procedimiento</label><input id="ccp-fecha-proc" type="date" value="${hoyPy()}" />
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

  return { renderPanelConsulta, initPanelConsulta };
})();
window.DovaPanelesConsulta = DovaPanelesConsulta;
