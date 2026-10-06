const service = require('./derivaciones.service');

async function listar(req, res, next) {
  try {
    res.json(await service.listar(req.clinicaId, {
      pacienteId: req.query.pacienteId ? Number(req.query.pacienteId) : undefined,
      odontologoDestinoId: req.query.odontologoDestinoId ? Number(req.query.odontologoDestinoId) : undefined,
      estado: req.query.estado,
    }));
  } catch (e) { next(e); }
}
async function obtener(req, res, next) { try { res.json(await service.obtener(req.clinicaId, Number(req.params.id))); } catch (e) { next(e); } }
async function crear(req, res, next) {
  try {
    res.status(201).json(await service.crear(req.clinicaId, { ...req.body }, req.usuario, req.file));
  } catch (e) { next(e); }
}
async function cambiarEstado(req, res, next) { try { res.json(await service.cambiarEstado(req.clinicaId, Number(req.params.id), req.body.estado, req.usuario)); } catch (e) { next(e); } }

async function archivo(req, res, next) {
  try {
    const a = await service.archivo(req.clinicaId, Number(req.params.id), req.usuario);
    const inline = /^image\/|application\/pdf/.test(a.mime);
    res.set({ 'Content-Type': a.mime, 'Content-Length': a.datos.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=600',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${String(a.nombre || 'adjunto').replace(/[^\w.\- ]/g, '_')}"` });
    res.end(a.datos);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, cambiarEstado, archivo };
