# Copias de seguridad de la base

## Qué hace
- Todos los días a las 03:17 (hora de Paraguay), GitHub hace una copia completa de la base de DOVA (`.github/workflows/copias.yml`).
- Antes de guardarla, verifica que se puede leer y que trae pacientes, turnos, usuarios y el historial de cambios.
- La copia se **cifra con AES-256** antes de salir del servidor de GitHub. Sin la clave, el archivo no sirve para nada.
- Se guardan las copias de los **últimos 30 días** (GitHub → Actions → "Copia de seguridad" → cada ejecución → *Artifacts*).
- Cada copia tiene su huella SHA-256: al restaurar se comprueba que nadie la alteró.

## Activarlo (una sola vez, 5 minutos)
1. Render → `dova-db` → **Connect** → copiar la **External Database URL**.
2. GitHub → repositorio → **Settings → Secrets and variables → Actions → New repository secret**:
   - `DOVA_BACKUP_DATABASE_URL` = la URL del paso 1.
   - `DOVA_BACKUP_CLAVE` = una frase larga que solo sepan ustedes (20 caracteres o más; por ejemplo cuatro palabras sueltas y números).
3. **Guardar la clave también fuera de GitHub** (gestor de contraseñas o papel en un lugar seguro). Si se pierde, las copias no se pueden abrir.
4. Actions → "Copia de seguridad" → **Run workflow** para probarla. Tiene que terminar en verde y mostrar el archivo en *Artifacts*.

## Restaurar
1. Descargar el archivo de la copia (Actions → la ejecución del día → *Artifacts*) y descomprimir el `.zip`: quedan `dova-…dump.gpg` y su `.sha256`.
2. **Probar primero en una base vacía** (por ejemplo, una base nueva en Render o una local):
   ```bash
   scripts/restaurar-copia.sh dova-20261012-0717.dump.gpg "postgres://usuario:clave@host:5432/base_de_prueba"
   ```
   El script comprueba la huella, pide la clave, verifica la copia y pide escribir `si` antes de reemplazar los datos.
3. Si está todo bien, repetir contra la base real (o apuntar el servicio `dova` a la base restaurada en Render → Environment → `DATABASE_URL`).

Requisitos para restaurar: `gpg` y las herramientas de PostgreSQL 16 (`pg_restore`, `psql`).

## Importante
- El repositorio de GitHub hoy es **público**. Las copias van cifradas, pero conviene hacerlo **privado** (Settings → General → Danger Zone → Change visibility); el despliegue en Render sigue funcionando igual.
- La base del plan **gratis** de Render vence a los 30 días y no tiene copias propias. Para uso real: plan pago de la base (trae copias diarias de Render) **y** estas copias propias, que quedan fuera de Render.
- Prueba hecha acá: copia de la base de prueba (1196 pacientes, 4025 turnos, 45 consentimientos firmados) → cifrada → restaurada en una base vacía y sobre una con datos: mismos totales. Con la clave equivocada o el archivo alterado, no restaura.
