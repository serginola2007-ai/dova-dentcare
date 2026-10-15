/* Pagopar (Paraguay): tarjetas, QR y billeteras.
   Se configura con variables de entorno (las claves nunca se guardan en la base):
     PAGOPAR_PUBLIC_KEY, PAGOPAR_PRIVATE_KEY
     PAGOPAR_API_URL (opcional; por defecto https://api.pagopar.com)
   Según la documentación de Pagopar:
   - crear pedido:  POST /api/comercios/2.0/iniciar-transaccion  (token = sha1(privada + id_pedido + monto))
   - consultar:     POST /api/pedidos/1.1/traer                   (token = sha1(privada + "CONSULTA"))
   - aviso de pago: POST a la URL de respuesta configurada en Pagopar; trae resultado[0].token = sha1(privada + hash_pedido)
   Importante: el aviso NO se toma como prueba de pago. Siempre se vuelve a consultar el pedido a Pagopar. */
const crypto = require('crypto');

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const cfg = () => ({
  publica: process.env.PAGOPAR_PUBLIC_KEY || '',
  privada: process.env.PAGOPAR_PRIVATE_KEY || '',
  url: (process.env.PAGOPAR_API_URL || 'https://api.pagopar.com').replace(/\/+$/, ''),
  pagina: (process.env.PAGOPAR_PAGOS_URL || 'https://www.pagopar.com/pagos').replace(/\/+$/, ''),
});
const configurado = () => { const c = cfg(); return !!(c.publica && c.privada); };

async function post(ruta, cuerpo) {
  let r;
  try {
    r = await fetch(`${cfg().url}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000) });
  } catch (_e) { throw new Error('No se pudo comunicar con la pasarela de pago. Probá de nuevo en unos minutos.'); }
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('La pasarela de pago respondió algo inesperado.');
  return j;
}

const fechaPagopar = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

async function crearCobro({ pedidoComercio, monto, descripcion, vence, comprador }) {
  const c = cfg();
  const total = Math.round(Number(monto));
  const j = await post('/api/comercios/2.0/iniciar-transaccion', {
    token: sha1(`${c.privada}${pedidoComercio}${String(parseFloat(total))}`),
    public_key: c.publica,
    monto_total: total,
    tipo_pedido: 'VENTA-COMERCIO',
    id_pedido_comercio: pedidoComercio,
    fecha_maxima_pago: fechaPagopar(vence),
    descripcion_resumen: String(descripcion || '').slice(0, 100),
    comprador: {
      nombre: comprador.nombre, email: comprador.email, documento: comprador.documento, tipo_documento: 'CI', telefono: comprador.telefono || '',
      ruc: '', ciudad: 1, direccion: '', coordenadas: '', razon_social: '', direccion_referencia: '',
    },
    compras_items: [{ nombre: String(descripcion || 'Pago').slice(0, 100), cantidad: 1, categoria: '909', public_key: c.publica, url_imagen: '', descripcion: '', id_producto: 1, precio_total: total, ciudad: 1, vendedor_telefono: '', vendedor_direccion: '', vendedor_direccion_referencia: '', vendedor_direccion_coordenadas: '' }],
  });
  const dato = j.respuesta === true && Array.isArray(j.resultado) && j.resultado[0] && j.resultado[0].data;
  if (!dato) throw new Error(`La pasarela no aceptó el cobro${typeof j.resultado === 'string' ? `: ${j.resultado}` : ''}`.slice(0, 300));
  return { hash: String(dato), url: `${c.pagina}/${encodeURIComponent(String(dato))}` };
}

// Aviso de Pagopar: devuelve el hash del pedido si la firma es válida, o null.
function leerAviso(cuerpo) {
  const r = cuerpo && Array.isArray(cuerpo.resultado) ? cuerpo.resultado[0] : null;
  if (!r || typeof r.hash_pedido !== 'string' || typeof r.token !== 'string' || !r.hash_pedido || r.hash_pedido.length > 200) return null;
  const esperado = Buffer.from(sha1(`${cfg().privada}${r.hash_pedido}`));
  const recibido = Buffer.from(r.token);
  if (esperado.length !== recibido.length || !crypto.timingSafeEqual(esperado, recibido)) return null;
  return r.hash_pedido;
}

// Estado real del pedido, consultado a Pagopar.
async function consultar(hash) {
  const c = cfg();
  const j = await post('/api/pedidos/1.1/traer', { hash_pedido: hash, token: sha1(`${c.privada}CONSULTA`), token_publico: c.publica });
  const r = j.respuesta === true && Array.isArray(j.resultado) ? j.resultado[0] : null;
  if (!r) throw new Error('La pasarela no devolvió el estado del pedido.');
  return { pagado: r.pagado === true, cancelado: r.cancelado === true, monto: Math.round(Number(r.monto)), formaPago: r.forma_pago ? String(r.forma_pago).slice(0, 80) : null, hash: String(r.hash_pedido || hash) };
}

module.exports = { nombre: 'pagopar', configurado, crearCobro, leerAviso, consultar };
