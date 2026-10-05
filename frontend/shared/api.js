/* DOVA — cliente API compartido por los 3 diseños de frontend.
   Nada de localStorage como base de datos: todo pasa por el backend real.
   localStorage se usa SOLO para persistir el par de tokens JWT entre
   recargas de página (comportamiento normal de cualquier SPA). */

const DOVA = (() => {
  const STORAGE_KEY = 'dova_session';
  // Sin config.js (p. ej. la app instalada abierta sin internet): la API del mismo sitio.
  let apiBase = window.DOVA_API_BASE || (/^https?:$/.test(location.protocol) ? '/api' : 'http://localhost:4000/api');

  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_e) { return null; }
  }
  function setSession(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_e) { /* almacenamiento no disponible */ }
  }
  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* no crítico */ }
  }

  async function refrescarToken() {
    const sesion = getSession();
    if (!sesion || !sesion.refreshToken) throw new Error('Sin sesión');
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sesion.refreshToken }),
    });
    if (!res.ok) { const a = getSession(); if (a && a.refreshToken === sesion.refreshToken) clearSession(); throw new Error('Sesión expirada'); }
    const data = await res.json();
    // Si mientras tanto se cerró la sesión (o entró otra persona), no se la revive.
    const actual = getSession();
    if (!actual || actual.refreshToken !== sesion.refreshToken) throw new Error('Sesión cerrada');
    actual.accessToken = data.accessToken;
    if (Array.isArray(data.permisos) && actual.usuario) actual.usuario.permisos = data.permisos;
    setSession(actual);
    return actual.accessToken;
  }

  async function request(path, { method = 'GET', body, isForm = false, reintentar = true, raw = false } = {}) {
    const sesion = getSession();
    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (sesion && sesion.accessToken) headers.Authorization = `Bearer ${sesion.accessToken}`;

    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });

    if (res.status === 401 && reintentar && sesion && sesion.refreshToken) {
      try {
        await refrescarToken();
        return request(path, { method, body, isForm, reintentar: false, raw });
      } catch (_e) {
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

  async function login(username, password) {
    const data = await request('/auth/login', { method: 'POST', body: { username, password }, reintentar: false });
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, usuario: data.usuario, clinica: data.clinica });
    return data;
  }

  async function logout() {
    const sesion = getSession();
    if (sesion && sesion.refreshToken) {
      try { await request('/auth/logout', { method: 'POST', body: { refreshToken: sesion.refreshToken }, reintentar: false }); } catch (_e) { /* no crítico */ }
    }
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
    return !!getSession();
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
    const sesion = getSession();
    if (sesion && sesion.usuario) {
      sesion.usuario.disenoPreferido = data.disenoPreferido;
      setSession(sesion);
    }
    return data;
  }

  // Cambio de la contraseña propia (obligatorio en el primer ingreso con la clave inicial).
  async function cambiarClave(actual, nueva) {
    const data = await request('/auth/cambiar-clave', { method: 'POST', body: { actual, nueva } });
    const sesion = getSession();
    if (sesion && sesion.usuario) { sesion.usuario.debeCambiarClave = false; setSession(sesion); }
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
    tokenActual: () => (getSession() || {}).accessToken || null,
    refrescar: () => refrescarToken(),
    apiBase: () => apiBase,
    request, login, logout, usuarioActual, clinicaActual, tienePermiso, tieneAlguno, estaAutenticado, descargarPdf,
    actualizarDisenoPreferido, cambiarClave, setFlash, consumeFlash,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    put: (p, body) => request(p, { method: 'PUT', body }),
    patch: (p, body) => request(p, { method: 'PATCH', body }),
    del: (p) => request(p, { method: 'DELETE' }),
    postForm: (p, formData) => request(p, { method: 'POST', body: formData, isForm: true }),
  };
})();
