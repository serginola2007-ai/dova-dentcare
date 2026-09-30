const authService = require('./auth.service');

async function login(req, res, next) {
  try {
    const { username, password, clinicaSlug } = req.body;
    const resultado = await authService.login({ username, password, clinicaSlug, ip: req.ip });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const resultado = await authService.refresh(refreshToken);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function cambiarClave(req, res, next) {
  try { res.json(await authService.cambiarClavePropia(req.usuario.id, req.body || {})); } catch (err) { next(err); }
}

module.exports = { login, refresh, logout, cambiarClave };
