/* DOVA — Usuarios (Administración → Usuarios): usuarios, roles y permisos. */
const DovaUsuarios = (() => {
  const { esc, toast, manejarError, abrirModal } = DovaAyudantes;

  // ---------------- ADMINISTRACIÓN: USUARIOS Y ROLES ----------------
  // Sección 29/30/31/32 del prompt: rol personalizado con checkboxes por
  // módulo, excepciones (overrides) por usuario, todo auditado en el
  // backend, con las protecciones administrativas ya aplicadas server-side.
  async function vistaUsuariosAdmin() {
    const [usuarios, roles] = await Promise.all([
      manejarError(() => DOVA.get('/usuarios?pageSize=200')),
      manejarError(() => DOVA.get('/usuarios/roles')),
    ]);
    const items = usuarios.data || usuarios.items || usuarios;
    return `
      <h2 class="dova-view-title">Usuarios y roles</h2>
      <div class="dova-tabs" id="admin-tabs">
        <button class="dova-tab activo" data-tab="usuarios">Usuarios</button>
        <button class="dova-tab" data-tab="roles">Roles y permisos</button>
      </div>

      <div class="dova-tab-panel" data-panel="usuarios">
        <div class="dova-toolbar">
          ${DOVA.tienePermiso('usuarios.manage') ? '<button id="btn-nuevo-usuario" class="dova-btn-primary">+ Nuevo usuario</button>' : ''}
        </div>
        <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-tabla-usuarios">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Odontólogo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${items.map((u) => `
              <tr>
                <td>${esc(u.nombre)}</td><td>${esc(u.username)}</td><td>${esc(u.rol_nombre)}</td>
                <td>${u.odontologo_nombre ? esc(u.odontologo_nombre) : '<span class="dova-nota">Sin vincular</span>'}</td>
                <td>${u.activo ? 'Activo' : 'Inactivo'}${u.es_admin_protegido ? ' · Admin protegido' : ''}</td>
                <td class="dova-usuario-acciones"><button class="dova-btn-link" data-ver-usuario="${u.id}">Permisos</button>${DOVA.tienePermiso('usuarios.manage') ? ` <button class="dova-btn-link" data-vincular-odo="${u.id}">${u.odontologo_id ? 'Cambiar odontólogo' : 'Vincular odontólogo'}</button>` : ''}${DOVA.tienePermiso('usuarios.manage') && !u.es_admin_protegido && Number(u.id) !== Number((DOVA.usuarioActual() || {}).id) ? ` <button class="dova-btn-link dova-link-peligro" data-eliminar-usuario="${u.id}" data-nombre="${esc(u.nombre)}">Eliminar</button>` : ''}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">Sin usuarios.</td></tr>'}
          </tbody>
        </table></div>
        <div id="usuario-detalle-root"></div>
      </div>

      <div class="dova-tab-panel" data-panel="roles" style="display:none;">
        <div class="dova-toolbar">
          ${DOVA.tienePermiso('roles.manage') ? '<button id="btn-nuevo-rol" class="dova-btn-primary">+ Nuevo rol</button>' : ''}
        </div>
        <table class="dova-tabla">
          <thead><tr><th>Rol</th><th>Código</th><th>Tipo</th><th></th></tr></thead>
          <tbody>
            ${roles.map((r) => `
              <tr>
                <td>${esc(r.nombre)}</td><td>${esc(r.codigo)}</td><td>${r.es_sistema ? 'Sistema' : 'Personalizado'}</td>
                <td><button class="dova-btn-link" data-editar-rol="${r.id}">${r.codigo === 'admin' ? 'Ver' : 'Editar permisos'}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div id="rol-detalle-root"></div>
      </div>
      <div id="modal-root"></div>
    `;
  }

  function agruparPermisosPorModulo(permisos) {
    const grupos = {};
    permisos.forEach((p) => {
      if (!grupos[p.modulo]) grupos[p.modulo] = [];
      grupos[p.modulo].push(p);
    });
    return grupos;
  }

  function checkboxesPermisos(todosLosPermisos, codigosActivos, prefix) {
    const grupos = agruparPermisosPorModulo(todosLosPermisos);
    return `
      <input type="text" id="${prefix}-buscar-permiso" placeholder="Buscar permiso..." class="dova-input-buscar" style="max-width:100%;" />
      <div class="dova-toolbar">
        <button type="button" class="dova-btn-secundario" id="${prefix}-marcar-todos">Marcar todos</button>
        <button type="button" class="dova-btn-secundario" id="${prefix}-desmarcar-todos">Desmarcar todos</button>
      </div>
      <div id="${prefix}-permisos-grupos">
        ${Object.keys(grupos).sort().map((modulo) => `
          <div class="dova-permiso-modulo" data-modulo-grupo="${esc(modulo)}">
            <div class="dova-permiso-modulo-header">
              <strong>${esc(modulo)}</strong>
              <button type="button" class="dova-btn-link" data-marcar-modulo="${esc(modulo)}">todos</button>
              · <button type="button" class="dova-btn-link" data-desmarcar-modulo="${esc(modulo)}">ninguno</button>
            </div>
            ${grupos[modulo].map((p) => `
              <label class="dova-permiso-item" data-permiso-label="${esc(p.codigo)} ${esc(p.descripcion)}">
                <input type="checkbox" class="${prefix}-check-permiso" value="${esc(p.codigo)}" data-modulo="${esc(modulo)}" ${codigosActivos.includes(p.codigo) ? 'checked' : ''} />
                ${esc(p.descripcion)} <span class="dova-nota">(${esc(p.codigo)})</span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  function initCheckboxesPermisos(prefix) {
    const buscar = document.getElementById(`${prefix}-buscar-permiso`);
    if (buscar) {
      buscar.addEventListener('input', () => {
        const q = buscar.value.trim().toLowerCase();
        document.querySelectorAll(`[data-permiso-label]`).forEach((label) => {
          const texto = label.dataset.permisoLabel.toLowerCase();
          label.style.display = !q || texto.includes(q) ? '' : 'none';
        });
      });
    }
    const marcarTodos = document.getElementById(`${prefix}-marcar-todos`);
    if (marcarTodos) marcarTodos.addEventListener('click', () => {
      document.querySelectorAll(`.${prefix}-check-permiso`).forEach((c) => { c.checked = true; });
    });
    const desmarcarTodos = document.getElementById(`${prefix}-desmarcar-todos`);
    if (desmarcarTodos) desmarcarTodos.addEventListener('click', () => {
      document.querySelectorAll(`.${prefix}-check-permiso`).forEach((c) => { c.checked = false; });
    });
    document.querySelectorAll('[data-marcar-modulo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.${prefix}-check-permiso[data-modulo="${btn.dataset.marcarModulo}"]`).forEach((c) => { c.checked = true; });
      });
    });
    document.querySelectorAll('[data-desmarcar-modulo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.${prefix}-check-permiso[data-modulo="${btn.dataset.desmarcarModulo}"]`).forEach((c) => { c.checked = false; });
      });
    });
  }

  async function renderDetalleRol(rolId) {
    const [rol, todosLosPermisos] = await Promise.all([
      DOVA.get(`/usuarios/roles/${rolId}`),
      DOVA.get('/usuarios/permisos'),
    ]);
    const esAdmin = rol.codigo === 'admin';
    const codigosActivos = (rol.permisos || []).map((p) => p.codigo);
    return `
      <div class="dova-etapas-box">
        <h4>Permisos de "${esc(rol.nombre)}"</h4>
        ${esAdmin
          ? '<p class="dova-nota">El rol admin siempre tiene todos los permisos del sistema y no puede modificarse.</p>'
          : `
            <form id="form-permisos-rol">
              ${checkboxesPermisos(todosLosPermisos, codigosActivos, 'rol')}
              <button type="submit" class="dova-btn-primary" style="margin-top:12px;">Guardar permisos</button>
            </form>
          `}
      </div>`;
  }

  async function renderDetalleUsuario(usuarioId) {
    const [usuario, todosLosPermisos] = await Promise.all([
      DOVA.get(`/usuarios/${usuarioId}`),
      DOVA.get('/usuarios/permisos'),
    ]);
    const codigosRol = (usuario.permisosRol || []).map((p) => p.codigo);
    const overridesMap = {};
    (usuario.overrides || []).forEach((o) => { overridesMap[o.codigo] = o.allow; });

    return `
      <div class="dova-etapas-box">
        <h4>Permisos de ${esc(usuario.nombre)} <span class="dova-nota">(rol: ${esc(usuario.rol_nombre)})</span></h4>
        ${usuario.es_admin_protegido
          ? '<p class="dova-nota">El administrador protegido siempre tiene todos los permisos; no admite excepciones.</p>'
          : `
            <p class="dova-nota">Marcá o desmarcá para crear una excepción sobre lo que da su rol. Los que coinciden con el rol no generan excepción.</p>
            <div id="usuario-permisos-checks">
              ${checkboxesPermisos(todosLosPermisos, codigosRol.filter((c) => overridesMap[c] !== false).concat(Object.keys(overridesMap).filter((c) => overridesMap[c] === true)), 'usr')}
            </div>
            <button type="button" id="btn-guardar-overrides" class="dova-btn-primary" style="margin-top:12px;">Guardar excepciones</button>
            ${(usuario.overrides || []).length ? `
              <p class="dova-nota" style="margin-top:10px;">Excepciones activas: ${usuario.overrides.map((o) => `${esc(o.codigo)} (${o.allow ? '+' : '−'})`).join(', ')}</p>
            ` : ''}
          `}
        <div style="margin-top:14px">
          <button type="button" class="dova-btn-secundario" data-cerrar-sesiones="${usuario.id}">Cerrar todas sus sesiones abiertas</button>
          <span class="dova-nota">Útil si perdió el celular o dejó DOVA abierto en otra compu.</span>
        </div>
      </div>`;
  }

  // Odontólogos para vincular a un usuario. Un odontólogo se vincula a un solo
  // usuario activo (su agenda, "Mi día" y sus cobros); el servidor lo valida.
  async function opcionesOdontologos(usuarioId, actualId) {
    const [odos, usuarios] = await Promise.all([DOVA.get('/odontologos'), DOVA.get('/usuarios?pageSize=500')]);
    const lista = usuarios.items || usuarios.data || usuarios;
    const tomado = {};
    lista.forEach((u) => { if (u.activo && u.odontologo_id && Number(u.id) !== Number(usuarioId)) tomado[u.odontologo_id] = u.nombre; });
    return `<option value="">Sin vincular</option>${odos.map((o) => `<option value="${o.id}" ${Number(o.id) === Number(actualId) ? 'selected' : ''} ${tomado[o.id] ? 'disabled' : ''}>${esc(o.nombre)}${o.especialidad ? ` · ${esc(o.especialidad)}` : ''}${tomado[o.id] ? ` (vinculado a ${esc(tomado[o.id])})` : ''}</option>`).join('')}`;
  }

  function initUsuariosAdmin(recargar) {
    document.querySelectorAll('[data-eliminar-usuario]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.eliminarUsuario;
        abrirModal(`
          <h3>Eliminar a ${esc(btn.dataset.nombre)}</h3>
          <p>Deja de poder entrar a DOVA y se cierran sus sesiones abiertas.</p>
          <p class="dova-nota">Si nunca usó el sistema, se borra por completo. Si ya registró algo (turnos, cobros, consultas), su nombre se mantiene en ese historial, pero sale de la lista de usuarios y quedan libres su nombre de usuario y su odontólogo para usarlos de nuevo.</p>
          <div class="dova-modal-actions">
            <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
            <button type="button" class="dova-btn-secundario dova-btn-peligro" id="btn-confirmar-eliminar">Eliminar usuario</button>
          </div>
        `);
        const ok = document.getElementById('btn-confirmar-eliminar');
        ok.addEventListener('click', async () => {
          ok.disabled = true;
          try {
            await DOVA.request(`/usuarios/${id}`, { method: 'DELETE' });
          } catch (e) { ok.disabled = false; toast(e.message, 'error'); return; }
          document.getElementById('modal-root').innerHTML = '';
          toast('Usuario eliminado', 'ok');
          recargar();
        });
      });
    });

    document.querySelectorAll('[data-vincular-odo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.vincularOdo;
        try {
          const u = await DOVA.get(`/usuarios/${id}`);
          const opciones = await opcionesOdontologos(id, u.odontologo_id);
          abrirModal(`
            <h3>Odontólogo de ${esc(u.nombre)}</h3>
            <p class="dova-nota">El usuario ve su agenda en "Mi día", inicia consultas a su nombre y sus cobros y comisiones quedan a su nombre. Un odontólogo se vincula a un solo usuario.</p>
            <form id="form-vincular-odo">
              <label for="vo-odo">Odontólogo</label>
              <select id="vo-odo">${opciones}</select>
              <div class="dova-modal-actions">
                <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="dova-btn-primary">Guardar</button>
              </div>
            </form>
          `);
          document.getElementById('form-vincular-odo').addEventListener('submit', async (e) => {
            e.preventDefault();
            const v = document.getElementById('vo-odo').value;
            try {
              await DOVA.put(`/usuarios/${id}`, { odontologoId: v ? Number(v) : null });
            } catch (er) { toast(er.message, 'error'); return; }
            document.getElementById('modal-root').innerHTML = '';
            toast(v ? 'Odontólogo vinculado' : 'Se quitó el vínculo con el odontólogo', 'ok');
            // Si es el propio usuario, su sesión toma el cambio enseguida.
            const yo = DOVA.usuarioActual();
            if (yo && Number(yo.id) === Number(id) && DOVA.actualizarSesion) await DOVA.actualizarSesion().catch(() => {});
            recargar();
          });
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#admin-tabs .dova-tab').forEach((t) => t.classList.remove('activo'));
        tab.classList.add('activo');
        document.querySelectorAll('.dova-tab-panel').forEach((p) => {
          p.style.display = p.dataset.panel === tab.dataset.tab ? '' : 'none';
        });
      });
    });

    document.querySelectorAll('[data-ver-usuario]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const root = document.getElementById('usuario-detalle-root');
        root.innerHTML = '<div class="dova-cargando">Cargando…</div>';
        try {
          root.innerHTML = await renderDetalleUsuario(btn.dataset.verUsuario);
          initCheckboxesPermisos('usr');
          const bc = root.querySelector('[data-cerrar-sesiones]');
          if (bc) bc.addEventListener('click', async () => {
            bc.disabled = true;
            try { await DOVA.post(`/usuarios/${bc.dataset.cerrarSesiones}/cerrar-sesiones`, {}); toast('Se cerraron todas sus sesiones', 'ok'); } catch (e) { toast(e.message, 'error'); }
            bc.disabled = false;
          });
          const btnGuardar = document.getElementById('btn-guardar-overrides');
          if (btnGuardar) {
            btnGuardar.addEventListener('click', async () => {
              const usuario = await manejarError(() => DOVA.get(`/usuarios/${btn.dataset.verUsuario}`));
              const codigosRol = (usuario.permisosRol || []).map((p) => p.codigo);
              const marcados = Array.from(document.querySelectorAll('.usr-check-permiso:checked')).map((c) => c.value);
              const todos = Array.from(document.querySelectorAll('.usr-check-permiso')).map((c) => c.value);
              // Excepción = donde lo marcado difiere de lo que da el rol.
              const cambios = [];
              todos.forEach((codigo) => {
                const marcado = marcados.includes(codigo);
                const porRol = codigosRol.includes(codigo);
                if (marcado !== porRol) cambios.push({ codigo, allow: marcado });
              });
              for (const c of cambios) {
                await manejarError(() => DOVA.put(`/usuarios/${btn.dataset.verUsuario}/permisos`, { codigoPermiso: c.codigo, allow: c.allow }));
              }
              // Quitar excepciones que ya no aplican (coinciden de nuevo con el rol)
              const overridesPrevios = (usuario.overrides || []).map((o) => o.codigo);
              for (const codigo of overridesPrevios) {
                const marcado = marcados.includes(codigo);
                const porRol = codigosRol.includes(codigo);
                if (marcado === porRol) {
                  await manejarError(() => DOVA.request(`/usuarios/${btn.dataset.verUsuario}/permisos/${codigo}`, { method: 'DELETE' })).catch(() => {});
                }
              }
              toast('Excepciones de permisos guardadas', 'ok');
              root.innerHTML = await renderDetalleUsuario(btn.dataset.verUsuario);
              initCheckboxesPermisos('usr');
            });
          }
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });

    document.querySelectorAll('[data-editar-rol]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const root = document.getElementById('rol-detalle-root');
        root.innerHTML = '<div class="dova-cargando">Cargando…</div>';
        try {
          root.innerHTML = await renderDetalleRol(btn.dataset.editarRol);
          initCheckboxesPermisos('rol');
          const form = document.getElementById('form-permisos-rol');
          if (form) {
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const codigos = Array.from(document.querySelectorAll('.rol-check-permiso:checked')).map((c) => c.value);
              await manejarError(() => DOVA.put(`/usuarios/roles/${btn.dataset.editarRol}/permisos`, { codigos }));
              toast('Permisos del rol actualizados', 'ok');
            });
          }
        } catch (e) {
          root.innerHTML = `<p class="dova-error-text">${esc(e.message)}</p>`;
        }
      });
    });

    const btnNuevoRol = document.getElementById('btn-nuevo-rol');
    if (btnNuevoRol) {
      btnNuevoRol.addEventListener('click', () => {
        abrirModal(`
          <h3>Nuevo rol</h3>
          <form id="form-nuevo-rol">
            <label>Nombre</label><input id="nr-nombre" required placeholder="Ej: Higienista" />
            <label>Código (sin espacios)</label><input id="nr-codigo" required placeholder="ej: higienista" />
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Crear</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-rol').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/usuarios/roles', {
            nombre: document.getElementById('nr-nombre').value,
            codigo: document.getElementById('nr-codigo').value,
          }));
          document.getElementById('modal-root').innerHTML = '';
          toast('Rol creado', 'ok');
          recargar();
        });
      });
    }

    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) {
      btnNuevoUsuario.addEventListener('click', async () => {
        const roles = await manejarError(() => DOVA.get('/usuarios/roles'));
        const opcionesOdo = await opcionesOdontologos(null, null).catch(() => '<option value="">Sin vincular</option>');
        abrirModal(`
          <h3>Nuevo usuario</h3>
          <form id="form-nuevo-usuario">
            <label>Nombre completo</label><input id="nu-nombre" required />
            <label>Usuario</label><input id="nu-username" required />
            <label>Contraseña</label><input id="nu-password" type="password" required minlength="6" />
            <label>Rol</label>
            <select id="nu-rol">
              ${roles.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('')}
            </select>
            <label for="nu-odo">Odontólogo vinculado <span class="dova-nota">(solo si atiende pacientes)</span></label>
            <select id="nu-odo">${opcionesOdo}</select>
            <div class="dova-modal-actions">
              <button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button>
              <button type="submit" class="dova-btn-primary">Crear</button>
            </div>
          </form>
        `);
        document.getElementById('form-nuevo-usuario').addEventListener('submit', async (e) => {
          e.preventDefault();
          await manejarError(() => DOVA.post('/usuarios', {
            nombre: document.getElementById('nu-nombre').value,
            username: document.getElementById('nu-username').value,
            password: document.getElementById('nu-password').value,
            rolId: Number(document.getElementById('nu-rol').value),
            ...(document.getElementById('nu-odo').value ? { odontologoId: Number(document.getElementById('nu-odo').value) } : {}),
          }));
          document.getElementById('modal-root').innerHTML = '';
          toast('Usuario creado', 'ok');
          recargar();
        });
      });
    }
  }

  return { vistaUsuariosAdmin, initUsuariosAdmin };
})();
window.DovaUsuarios = DovaUsuarios;
