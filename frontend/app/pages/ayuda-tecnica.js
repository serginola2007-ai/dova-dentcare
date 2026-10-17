/* DOVA — Ayuda técnica (Administración → Ayuda técnica): pedidos de ayuda y su estado. */
const DovaAyudaTecnica = (() => {
  const { esc, toast, manejarError, abrirModal } = DovaAyudantes;

  // ---------------- HELPDESK ----------------
  async function vistaHelpdesk() {
    const tickets = await manejarError(() => DOVA.get('/helpdesk'));
    return `
      <h2 class="dova-view-title">Ayuda técnica</h2>
      <div class="dova-toolbar">
        <button id="btn-nuevo-ticket" class="dova-btn-primary">+ Pedir ayuda</button>
      </div>
      <table class="dova-tabla">
        <thead><tr><th>Título</th><th>Categoría</th><th>Estado</th></tr></thead>
        <tbody>
          ${tickets.map((t) => `<tr><td>${esc(t.titulo)}</td><td>${esc(DovaExt.etiqueta(t.categoria || ''))}</td><td>${esc(DovaExt.etiqueta(t.estado || ''))}</td></tr>`).join('') || '<tr><td colspan="3">No hay pedidos de ayuda.</td></tr>'}
        </tbody>
      </table>
      <div id="modal-root"></div>
    `;
  }
  function initHelpdesk() {
    document.getElementById('btn-nuevo-ticket').addEventListener('click', () => {
      abrirModal(`
        <h3>Pedir ayuda técnica</h3>
        <form id="form-nuevo-ticket">
          <label>Título</label><input required id="nt-titulo" />
          <label>Categoría</label>
          <select id="nt-categoria">
            <option value="error">Error</option>
            <option value="mejora">Pedido de nueva función</option>
            <option value="otro">Otro</option>
          </select>
          <label>Descripción</label><textarea required id="nt-descripcion" rows="4"></textarea>
          <div class="dova-modal-actions">
            <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
            <button type="submit" class="dova-btn-primary">Enviar pedido</button>
          </div>
        </form>
      `);
      document.getElementById('form-nuevo-ticket').addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarError(() => DOVA.post('/helpdesk', {
          titulo: document.getElementById('nt-titulo').value,
          categoria: document.getElementById('nt-categoria').value,
          descripcion: document.getElementById('nt-descripcion').value,
        }));
        toast('Pedido de ayuda enviado', 'ok');
        location.reload();
      });
    });
  }

  return { vistaHelpdesk, initHelpdesk };
})();
window.DovaAyudaTecnica = DovaAyudaTecnica;
