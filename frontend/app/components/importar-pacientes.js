/* Importar pacientes desde Excel o CSV (Pacientes → "Importar desde Excel").
   Paso 1: elegir el archivo → DOVA lo revisa sin guardar nada.
   Paso 2: ver qué columnas reconoció, los errores y los que ya existen → "Importar". */
(function () {
  'use strict';
  const { esc, toast } = DovaAyudantes;
  const lista = (items, fn) => `<ul class="dova-imp-lista">${items.map(fn).join('')}</ul>`;

  function abrir(alTerminar) {
    let archivo = null;
    Vistas.abrirModal(`<div class="dova-imp">
      <h3>Importar pacientes</h3>
      <p class="dova-nota">Subí la planilla de pacientes que ya tenían (Excel .xlsx o CSV). La primera fila tiene que tener los títulos de las columnas. Antes de guardar, DOVA te muestra cómo la leyó.</p>
      <p><button type="button" class="dova-btn-link" data-plantilla>Descargar planilla modelo</button></p>
      <form data-imp-form>
        <label for="imp-archivo">Archivo</label>
        <input id="imp-archivo" type="file" name="archivo" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        <fieldset class="dova-imp-dup"><legend>Si la C.I. ya existe en DOVA</legend>
          <label class="dova-check"><input type="radio" name="duplicados" value="saltar" checked /> No tocarlo (recomendado)</label>
          ${DOVA.tienePermiso('pacientes.edit') ? '<label class="dova-check"><input type="radio" name="duplicados" value="completar" /> Completar solo los datos que le faltan</label>' : ''}
        </fieldset>
        <p class="dova-error-text" data-imp-error hidden></p>
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar>Cancelar</button><button class="dova-btn-primary" data-revisar>Revisar</button></div>
      </form>
      <div data-imp-resultado></div>
    </div>`);
    const caja = document.querySelector('.dova-imp');
    const form = caja.querySelector('[data-imp-form]');
    const err = caja.querySelector('[data-imp-error]');
    const out = caja.querySelector('[data-imp-resultado]');
    const cerrar = () => { const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; };
    const mostrarError = (m) => { err.textContent = m; err.hidden = false; };
    caja.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    caja.querySelector('[data-plantilla]').addEventListener('click', async () => {
      try { await DOVA.descargarPdf('/pacientes/importar/plantilla', 'DOVA-planilla-pacientes.xlsx'); } catch (e) { toast(e.message, 'error'); }
    });
    form.archivo.addEventListener('change', () => { archivo = form.archivo.files[0] || null; out.innerHTML = ''; err.hidden = true; });

    const enviar = async (modo) => {
      const fd = new FormData();
      fd.append('modo', modo);
      fd.append('duplicados', (form.querySelector('[name=duplicados]:checked') || {}).value || 'saltar');
      fd.append('archivo', archivo);
      return DOVA.postForm('/pacientes/importar', fd);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.hidden = true;
      if (!archivo) { mostrarError('Elegí un archivo'); return; }
      if (archivo.size > 5 * 1024 * 1024) { mostrarError('El archivo pesa más de 5 MB'); return; }
      const b = caja.querySelector('[data-revisar]'); b.disabled = true; b.textContent = 'Revisando…';
      try { mostrarRevision(await enviar('revisar')); } catch (ex) { mostrarError(ex.message); } finally { b.disabled = false; b.textContent = 'Revisar'; }
    });

    function mostrarRevision(r) {
      const dup = (form.querySelector('[name=duplicados]:checked') || {}).value;
      const aImportar = r.nuevos + (dup === 'completar' ? r.yaExisten : 0);
      out.innerHTML = `<div class="dova-imp-revision">
        <h4>Revisión del archivo</h4>
        <div class="dova-imp-cifras">
          <div><strong>${r.total}</strong><span>filas</span></div>
          <div><strong>${r.nuevos}</strong><span>pacientes nuevos</span></div>
          <div><strong>${r.yaExisten}</strong><span>ya están en DOVA</span></div>
          <div class="${r.conErrores ? 'dova-imp-mal' : ''}"><strong>${r.conErrores}</strong><span>con errores (no se importan)</span></div>
        </div>
        <p class="dova-nota"><strong>Columnas reconocidas:</strong> ${r.columnas.map((c) => `${esc(c.columna)} → ${esc(c.etiqueta)}`).join(' · ')}${r.ignoradas.length ? `<br><strong>Se ignoran:</strong> ${r.ignoradas.map(esc).join(', ')}` : ''}</p>
        ${r.columnas.some((c) => c.campo === 'nombreCompleto') ? '<p class="dova-nota dova-nota-alerta">El nombre viene en una sola columna: DOVA lo separa en nombre y apellido. Revisá la muestra; si hay una coma ("Pérez, Juan") se usa como separador.</p>' : ''}
        ${r.errores.length ? `<details open><summary>Filas con errores (${r.conErrores})</summary>${lista(r.errores, (x) => `<li>Fila ${x.fila}: ${x.errores.map(esc).join('; ')}</li>`)}</details>` : ''}
        ${r.duplicados.length ? `<details><summary>Ya están en DOVA (${r.yaExisten})</summary>${lista(r.duplicados, (x) => `<li>Fila ${x.fila}: ${esc(x.nombre)} — C.I. ${esc(x.ci)} (en DOVA: ${esc(x.existente.nombre)}${x.existente.activo ? '' : ', eliminado'})</li>`)}</details>` : ''}
        ${r.avisos.length ? `<details><summary>Avisos (${r.avisos.length})</summary>${lista(r.avisos, (x) => `<li>Fila ${x.fila}: ${x.avisos.map(esc).join('; ')}</li>`)}</details>` : ''}
        ${r.muestra.length ? `<h4>Así se van a cargar (primeras ${r.muestra.length})</h4>
          <div class="dova-imp-tabla"><table class="dova-tabla"><thead><tr><th>Fila</th><th>Nombre</th><th>Apellido</th><th>C.I.</th><th>Teléfono</th><th>Nacimiento</th></tr></thead><tbody>
          ${r.muestra.map((m) => `<tr><td>${m.fila}</td><td>${esc(m.nombre)}</td><td>${esc(m.apellido)}</td><td>${esc(m.ci || '-')}</td><td>${esc(m.telefono || '-')}</td><td>${esc(m.fechaNacimiento ? m.fechaNacimiento.split('-').reverse().join('/') : '-')}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <div class="dova-modal-actions">
          ${aImportar ? `<button type="button" class="dova-btn-primary" data-importar>Importar ${aImportar} paciente${aImportar === 1 ? '' : 's'}</button>` : '<p class="dova-nota">No hay pacientes para importar. Corregí la planilla y volvé a elegirla.</p>'}
        </div>
      </div>`;
      const bi = out.querySelector('[data-importar]');
      if (bi) bi.addEventListener('click', async () => {
        bi.disabled = true; bi.textContent = 'Importando…';
        try {
          const x = await enviar('importar');
          out.innerHTML = `<div class="dova-imp-listo"><h4>Importación terminada</h4>
            <p>${x.creados} paciente${x.creados === 1 ? '' : 's'} nuevo${x.creados === 1 ? '' : 's'}${x.completados ? ` · ${x.completados} completado${x.completados === 1 ? '' : 's'}` : ''}${x.omitidos ? ` · ${x.omitidos} ya existían (sin cambios)` : ''}${x.conErrores ? ` · ${x.conErrores} con errores, no importados` : ''}.</p>
            <div class="dova-modal-actions"><button type="button" class="dova-btn-primary" data-listo>Listo</button></div></div>`;
          form.hidden = true;
          out.querySelector('[data-listo]').addEventListener('click', cerrar);
          toast('Pacientes importados', 'ok');
          if (alTerminar) alTerminar();
        } catch (ex) { bi.disabled = false; bi.textContent = `Importar ${aImportar} pacientes`; toast(ex.message, 'error'); }
      });
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.DovaImportar = { abrir };
}());
