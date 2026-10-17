/* DOVA — Configuración (Administración → Configuración): apariencia (claro/oscuro y letra),
   contraseña, cerrar sesión en todos los dispositivos, seguridad, instalar app y avisos.
   Otras partes se suman desde pages/inicio-extras.js (Mi WhatsApp, datos de la clínica, Mi plan…). */
const DovaConfiguracion = (() => {
  const { toast } = DovaAyudantes;
  const { formCambioClaveHtml, initCambioClave } = DovaIngreso;

  // ---------------- CONFIGURACIÓN ----------------
  function vistaConfiguracion() {
    const modo = (DOVA.usuarioActual() || {}).temaPreferido === 'oscuro' ? 'oscuro' : 'claro';
    const letra = (DOVA.usuarioActual() || {}).letraPreferida === 'grande' ? 'grande' : 'normal';
    return `
      <h2 class="dova-view-title">Configuración</h2>
      <p class="dova-subtitulo">Preferencias de tu cuenta en DOVA.</p>

      <h3 class="dova-section-title">Apariencia</h3>
      <div class="dova-card dova-card-clave" data-apariencia>
        <p class="dova-nota">Elegí cómo ver DOVA: con fondo claro o con fondo oscuro. El cambio se guarda en tu cuenta y te acompaña en cualquier dispositivo donde inicies sesión. Esta es la única parte de DOVA donde se cambia.</p>
        <h4 class="dova-apariencia-sub">Colores</h4>
        <div class="dova-modo-opciones" role="radiogroup" aria-label="Modo de color">
          <label class="dova-modo-opcion${modo === 'claro' ? ' seleccionado' : ''}"><input type="radio" name="modo-color" value="claro" ${modo === 'claro' ? 'checked' : ''} /> <span><strong>Claro</strong><br><span class="dova-nota">Fondo crema, ideal con buena luz.</span></span></label>
          <label class="dova-modo-opcion${modo === 'oscuro' ? ' seleccionado' : ''}"><input type="radio" name="modo-color" value="oscuro" ${modo === 'oscuro' ? 'checked' : ''} /> <span><strong>Oscuro</strong><br><span class="dova-nota">Fondo oscuro, descansa la vista en ambientes con poca luz.</span></span></label>
        </div>
        <h4 class="dova-apariencia-sub">Tamaño de letra</h4>
        <div class="dova-modo-opciones" role="radiogroup" aria-label="Tamaño de letra">
          <label class="dova-modo-opcion${letra === 'normal' ? ' seleccionado' : ''}"><input type="radio" name="tam-letra" value="normal" ${letra === 'normal' ? 'checked' : ''} /> <span><strong>Letra normal</strong><br><span class="dova-nota">Entra más información en pantalla.</span></span></label>
          <label class="dova-modo-opcion${letra === 'grande' ? ' seleccionado' : ''}"><input type="radio" name="tam-letra" value="grande" ${letra === 'grande' ? 'checked' : ''} /> <span><strong>Letra grande</strong><br><span class="dova-nota">Se lee más cómodo, sobre todo de lejos.</span></span></label>
        </div>
      </div>

      <h3 class="dova-section-title">Seguridad</h3>
      <div class="dova-card dova-card-clave">
        <p class="dova-nota">Cambiá tu contraseña de ingreso a DOVA.</p>
        ${formCambioClaveHtml()}
        <hr class="dova-separador" />
        <p class="dova-nota">¿Dejaste DOVA abierto en otra compu o perdiste el celular? Cerrá tu sesión en todos los dispositivos (también en este).</p>
        <button type="button" class="dova-btn-secundario" id="btn-logout-todas">Cerrar sesión en todos los dispositivos</button>
      </div>
      ${window.DovaSeguridad ? DovaSeguridad.seccionHtml() : ''}
      ${window.DovaPWA ? DovaPWA.tarjetaHtml() + DovaPWA.avisosHtml() : ''}
    `;
  }

  function initConfiguracion() {
    const fc = document.getElementById('form-cambio-clave');
    if (fc) initCambioClave(fc, () => fc.actual.value, () => { fc.reset(); toast('Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.', 'ok'); });
    const bt = document.getElementById('btn-logout-todas');
    if (bt) bt.addEventListener('click', async () => {
      if (bt.dataset.seguro !== '1') { bt.dataset.seguro = '1'; bt.textContent = '¿Seguro? Tocá de nuevo para cerrar todas'; return; }
      bt.disabled = true;
      try { await DOVA.logoutTodas(); } catch (_e) { /* igual se cierra acá */ }
      location.reload();
    });
    if (window.DovaPWA) { DovaPWA.activarTarjeta(); DovaPWA.activarAvisosUI(); }
    if (window.DovaSeguridad) DovaSeguridad.activar();
    document.querySelectorAll('[name="tam-letra"]').forEach((radio) => {
      radio.addEventListener('change', async () => {
        const v = radio.value;
        const radios = document.querySelectorAll('[name="tam-letra"]');
        radios.forEach((r) => { r.disabled = true; });
        try {
          await DOVA.actualizarLetra(v);
          DovaApp.aplicarLetra(v);
          radios.forEach((r) => r.closest('.dova-modo-opcion').classList.toggle('seleccionado', r.value === v));
          toast(v === 'grande' ? 'Letra grande activada' : 'Letra normal activada', 'ok');
        } catch (e) {
          toast(e.message || 'No se pudo cambiar la letra', 'error');
          radios.forEach((r) => { r.checked = r.value !== v; });
        } finally { radios.forEach((r) => { r.disabled = false; }); }
      });
    });
    document.querySelectorAll('[name="modo-color"]').forEach((radio) => {
      radio.addEventListener('change', async () => {
        const tema = radio.value;
        const opciones = document.querySelectorAll('.dova-modo-opcion');
        document.querySelectorAll('[name="modo-color"]').forEach((r) => { r.disabled = true; });
        try {
          await DOVA.actualizarTema(tema);
          DovaApp.aplicarModo(tema);
          opciones.forEach((o) => o.classList.toggle('seleccionado', o.querySelector('input').value === tema));
          toast(tema === 'oscuro' ? 'Modo oscuro activado' : 'Modo claro activado', 'ok');
        } catch (e) {
          toast(e.message || 'No se pudo cambiar el modo', 'error');
          const antes = tema === 'oscuro' ? 'claro' : 'oscuro';
          document.querySelectorAll('[name="modo-color"]').forEach((r) => { r.checked = r.value === antes; });
        } finally { document.querySelectorAll('[name="modo-color"]').forEach((r) => { r.disabled = false; }); }
      });
    });
  }

  return { vistaConfiguracion, initConfiguracion };
})();
window.DovaConfiguracion = DovaConfiguracion;
