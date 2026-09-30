const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

// Las columnas DATE (sin hora) se devuelven como texto 'AAAA-MM-DD'. Por
// defecto `pg` las convierte a un Date a medianoche del huso del servidor, y
// al serializarlas a JSON (UTC) un navegador en Paraguay (UTC-3/-4) las
// mostraba UN DÍA ANTES. Un día calendario no tiene huso horario: se deja
// como texto de punta a punta.
types.setTypeParser(1082, (v) => v);

// Render (y la mayoría de los Postgres gestionados en la nube) exigen SSL
// pero con un certificado que node no puede validar por su propia CA local,
// así que se pide SSL sin verificar el certificado. En local (DATABASE_URL
// apuntando a localhost) no hace falta y se deja sin SSL para no romper el
// desarrollo en la compu.
const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const necesitaSSL = process.env.PGSSL === 'true' || (!esLocal && process.env.NODE_ENV === 'production');

// Huso horario de la clínica para la base: "hoy" (current_date, now()::date)
// tiene que ser el día de Paraguay, no el de UTC. Sin esto, en un servidor en
// UTC después de las 21 h la base ya estaría en "mañana".
const HUSO = process.env.DOVA_TZ || 'America/Asuncion';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: necesitaSSL ? { rejectUnauthorized: false } : false,
  options: `-c TimeZone=${HUSO}`,
});

pool.on('error', (err) => {
  console.error('[db] Error inesperado en cliente de PostgreSQL inactivo', err);
});

// Transacción en curso del pedido actual (si la hay). Todas las consultas
// del sistema pasan por query(); si el código corre dentro de conCandado(),
// usan esa misma conexión y quedan dentro de la misma transacción.
const contexto = new AsyncLocalStorage();

async function query(text, params) {
  const actual = contexto.getStore();
  return (actual ? actual.client : pool).query(text, params);
}

/* Ejecuta fn() en una transacción, con candados exclusivos sobre las claves
   indicadas (ej. 'turno:1:5:2026-10-01'). Dos pedidos simultáneos con una
   misma clave se atienden uno detrás del otro: el segundo ve lo que guardó
   el primero, así "verificar y después guardar" deja de poder duplicarse.
   Si fn() lanza un error, se deshace todo. Anidable: dentro de otro
   conCandado reutiliza la transacción y solo suma candados. */
async function conCandado(claves, fn) {
  const lista = [...new Set((Array.isArray(claves) ? claves : [claves]).filter(Boolean).map(String))].sort();
  const actual = contexto.getStore();
  if (actual) {
    for (const k of lista) await actual.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [k]);
    return fn();
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const k of lista) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [k]);
    const r = await contexto.run({ client }, fn);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient, conCandado };
