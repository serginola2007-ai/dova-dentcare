/* DOVA — cliente API compartido por los 3 diseños de frontend.
   Nada de localStorage como base de datos: todo pasa por el backend real.
   localStorage se usa SOLO para persistir el par de tokens JWT entre
   recargas de página (comportamiento normal de cualquier SPA). */

const DOVA = (() => {
  /* Sesión (auditoría de seguridad):
     - El token de ACCESO vive solo en memoria (se pierde al cerrar la pestaña y
       se pide uno nuevo al abrir).
     - El token de RENOVACIÓN está en una cookie HttpOnly que el JavaScript no
       puede leer (ni un script inyectado).
     - En el navegador solo se guarda el perfil visible (nombre, permisos para
       mostrar u ocultar botones, diseño). El servidor vuelve a validar todo. */
  const STORAGE_KEY = 'dova_session';
  const CSRF = { 'X-DOVA-CSRF': '1' };
  // Sin config.js (p. ej. la app instalada abierta sin internet): la API del mismo sitio.
  let apiBase = window.DOVA_API_BASE || (/^https?:$/.test(location.protocol) ? '/api' : 'http://localhost:4000/api');
  let accessToken = null;
  let renovando = null;

  /* Al abrir DOVA siempre se pide la contraseña: la sesión vale solo en la
     pestaña donde se inició (sobrevive a recargar la página o cambiar de
     diseño, que es la misma pestaña). Una pestaña, ventana o app nueva
     arranca en la pantalla de ingreso. */
  const MARCA_PESTANA = 'dova_pestana';
  function pestanaConSesion() { try { return sessionStorage.getItem(MARCA_PESTANA) === '1'; } catch (_e) { return false; } }
  function marcarPestana(si) { try { if (si) sessionStorage.setItem(MARCA_PESTANA, '1'); else sessionStorage.removeItem(MARCA_PESTANA); } catch (_e) { /* sin almacenamiento */ } }

  function getPerfil() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_e) { return null; }
  }
  function setPerfil(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ usuario: p.usuario, clinica: p.clinica })); } catch (_e) { /* almacenamiento no disponible */ }
  }
  function getSession() {
    const p = getPerfil();
    return p ? { ...p, accessToken } : null;
  }
  function clearSession() {
    accessToken = null;
    marcarPestana(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* no crítico */ }
  }
  // Pestaña nueva con una sesión guardada de antes: se pide ingresar de nuevo.
  if (getPerfil() && !pestanaConSesion()) clearSession();

  // Una sola renovación a la vez por pestaña (varios pedidos pueden vencer juntos).
  function refrescarToken() {
    if (renovando) return renovando;
    renovando = (async () => {
      const perfil = getPerfil();
      if (!perfil) throw new Error('Sin sesión');
      // Migración: sesiones guardadas por versiones anteriores tenían el token en el navegador.
      const viejo = perfil.refreshToken;
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...CSRF },
        body: JSON.stringify(viejo ? { refreshToken: viejo } : {}),
      });
      if (res.status === 423) { avisarBloqueo(); const e = new Error('La pantalla está bloqueada'); e.status = 423; throw e; }
      if (!res.ok) { clearSession(); throw new Error('Sesión expirada'); }
      const data = await res.json();
      accessToken = data.accessToken;
      const actual = getPerfil() || perfil;
      if (Array.isArray(data.permisos) && actual.usuario) actual.usuario.permisos = data.permisos;
      // Vínculo con el odontólogo (se puede cambiar desde Usuarios sin volver a entrar).
      if (actual.usuario && 'odontologoId' in data) actual.usuario.odontologoId = data.odontologoId;
      setPerfil(actual); // también borra cualquier token viejo del navegador
      return accessToken;
    })();
    renovando.finally(() => { renovando = null; }).catch(() => {});
    return renovando;
  }

  /* Pantalla bloqueada (por inactividad o desde otra pestaña): el servidor
     responde 423 hasta que se ingrese la contraseña. bloqueo.js muestra el
     candado; mientras tanto no se mandan pedidos. */
  let bloqueada = false;
  function avisarBloqueo() {
    accessToken = null;
    if (!bloqueada) { bloqueada = true; try { window.dispatchEvent(new CustomEvent('dova:bloqueada')); } catch (_e) { /* sin DOM */ } }
  }
  function errorBloqueo() { const e = new Error('La pantalla está bloqueada'); e.status = 423; return e; }

  // Aviso de pedido en curso (app.js muestra la barra de progreso y el botón "ocupado").
  function avisar(delta) { try { window.dispatchEvent(new CustomEvent('dova:pedido', { detail: delta })); } catch (_e) { /* sin DOM */ } }
  async function request(path, opciones) {
    avisar(1);
    try { return await pedir(path, opciones); } finally { avisar(-1); }
  }

  async function pedir(path, { method = 'GET', body, isForm = false, reintentar = true, raw = false } = {}) {
    if (bloqueada && !path.startsWith('/auth/')) throw errorBloqueo();
    if (!accessToken && getPerfil() && reintentar) {
      try { await refrescarToken(); } catch (e) { if (e && e.status === 423) throw errorBloqueo(); /* si no, el pedido sigue y responderá 401 */ }
    }
    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });

    if (res.status === 423 && !path.startsWith('/auth/desbloquear')) { avisarBloqueo(); throw errorBloqueo(); }
    if (res.status === 401 && reintentar && getPerfil()) {
      try {
        await refrescarToken();
        return pedir(path, { method, body, isForm, reintentar: false, raw });
      } catch (e) {
        if (e && e.status === 423) throw errorBloqueo();
        clearSession();
        window.location.reload();
        throw new Error('Sesión expirada');
      }
    }

    if (raw) return res; // para PDFs / binarios

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || 'Error en la solicitud';
      const err = new Error(msg);
      err.status = res.status;
      err.details = data && data.error && data.error.details;
      throw err;
    }
    return data;
  }

  function abrirSesion(data) {
    accessToken = data.accessToken;
    bloqueada = false;
    setPerfil({ usuario: data.usuario, clinica: data.clinica });
    marcarPestana(true);
    return data;
  }
  async function login(username, password) {
    return abrirSesion(await request('/auth/login', { method: 'POST', body: { username, password }, reintentar: false }));
  }
  // Bloqueo de pantalla: el servidor deja de aceptar esta sesión hasta que
  // se ingrese la contraseña (aunque se recargue la página).
  async function bloquear() {
    try { await request('/auth/bloquear', { method: 'POST', reintentar: false }); } catch (_e) { /* igual se bloquea acá */ }
    accessToken = null; bloqueada = true;
  }
  async function desbloquear(clave) {
    const res = await fetch(`${apiBase}/auth/desbloquear`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...CSRF }, body: JSON.stringify({ clave }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((data.error && data.error.message) || 'No se pudo desbloquear'); e.status = res.status; throw e; }
    accessToken = data.accessToken; bloqueada = false;
    const actual = getPerfil();
    if (actual && actual.usuario && Array.isArray(data.permisos)) { actual.usuario.permisos = data.permisos; setPerfil(actual); }
    return data;
  }
  // Otra pestaña desbloqueó: esta pide un acceso nuevo cuando lo necesite.
  function marcarDesbloqueada() { bloqueada = false; accessToken = null; }
  function marcarBloqueada() { bloqueada = true; accessToken = null; }

  async function logout() {
    try {
      await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...CSRF, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: '{}' });
    } catch (_e) { /* sin conexión: igual se cierra acá */ }
    clearSession();
  }

  function usuarioActual() {
    const s = getSession();
    return s ? s.usuario : null;
  }
  function clinicaActual() {
    const s = getSession();
    return s ? s.clinica : null;
  }
  function tienePermiso(codigo) {
    const u = usuarioActual();
    return !!(u && u.permisos && u.permisos.includes(codigo));
  }
  function tieneAlguno(...codigos) {
    return codigos.some(tienePermiso);
  }
  function estaAutenticado() {
    return !!getPerfil();
  }
  // Cerrar la sesión en todos los dispositivos (celular perdido, compu compartida…).
  async function logoutTodas() {
    try { await request('/auth/logout-todas', { method: 'POST', reintentar: false }); } finally { clearSession(); }
  }

  /* Mensaje "flash": sobrevive una navegación de página completa (como el
     cambio de carpeta de diseño) para poder mostrar una confirmación DESPUÉS
     de aterrizar en la página nueva, en vez de un toast que se corta a la
     mitad porque la página se descarga enseguida. Se consume una sola vez. */
  const FLASH_KEY = 'dova_flash';
  function setFlash(msg) {
    try { localStorage.setItem(FLASH_KEY, msg); } catch (_e) { /* no crítico */ }
  }
  function consumeFlash() {
    try {
      const msg = localStorage.getItem(FLASH_KEY);
      if (msg) localStorage.removeItem(FLASH_KEY);
      return msg;
    } catch (_e) { return null; }
  }

  /* Selector de diseño (moderno/minimalista/tecnico): el backend es la
     fuente de verdad (se guarda en la BD, ligado al usuario). Acá solo
     actualizamos la sesión en caché para que usuarioActual().disenoPreferido
     quede al día sin forzar un nuevo login. */
  async function actualizarDisenoPreferido(disenoPreferido) {
    const data = await request('/usuarios/me/preferencias', { method: 'PATCH', body: { disenoPreferido } });
    const perfil = getPerfil();
    if (perfil && perfil.usuario) {
      perfil.usuario.disenoPreferido = data.disenoPreferido;
      setPerfil(perfil);
    }
    return data;
  }

  // Cambio de la contraseña propia (obligatorio en el primer ingreso con la clave inicial).
  async function cambiarClave(actual, nueva) {
    const data = await request('/auth/cambiar-clave', { method: 'POST', body: { actual, nueva } });
    const perfil = getPerfil();
    // Al cambiar la contraseña se cierran las demás sesiones; esta sigue con tokens nuevos.
    if (data && data.accessToken) accessToken = data.accessToken;
    if (perfil && perfil.usuario) { perfil.usuario.debeCambiarClave = false; setPerfil(perfil); }
    return data;
  }

  async function descargarPdf(path, nombreArchivo) {
    const res = await request(path, { raw: true });
    if (!res.ok) throw new Error('No se pudo generar el comprobante');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo || 'comprobante.pdf';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return {
    setApiBase: (b) => { apiBase = b; },
    // Al abrir DOVA: trae los permisos vigentes (módulos nuevos o cambios de rol) sin cerrar sesión.
    actualizarSesion: () => refrescarToken().then(() => true).catch(() => false),
    // Para la conexión en tiempo real (ver tiempo-real.js).
    tokenActual: () => accessToken,
    refrescar: () => refrescarToken(),
    apiBase: () => apiBase,
    request, login, bloquear, desbloquear, marcarDesbloqueada, marcarBloqueada, estaBloqueada: () => bloqueada, limpiarSesion: () => clearSession(), logout, logoutTodas, usuarioActual, clinicaActual, tienePermiso, tieneAlguno, estaAutenticado, descargarPdf,
    actualizarDisenoPreferido, cambiarClave, setFlash, consumeFlash,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    put: (p, body) => request(p, { method: 'PUT', body }),
    patch: (p, body) => request(p, { method: 'PATCH', body }),
    del: (p) => request(p, { method: 'DELETE' }),
    postForm: (p, formData) => request(p, { method: 'POST', body: formData, isForm: true }),
  };
})();
