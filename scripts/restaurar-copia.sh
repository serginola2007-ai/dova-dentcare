#!/usr/bin/env bash
# Restaura una copia cifrada de DOVA en una base PostgreSQL.
# Uso: scripts/restaurar-copia.sh dova-AAAAMMDD-HHMM.dump.gpg "postgres://usuario:clave@host:5432/base"
# Pide la clave de la copia (DOVA_BACKUP_CLAVE) por teclado, o la toma de la variable DOVA_BACKUP_CLAVE.
# La base de destino se REEMPLAZA: probar primero en una base vacía.
set -euo pipefail
archivo=${1:?Falta el archivo .dump.gpg}
destino=${2:?Falta la URL de la base de destino}
[ -f "$archivo" ] || { echo "No existe $archivo"; exit 1; }
if [ -f "$archivo.sha256" ]; then (cd "$(dirname "$archivo")" && sha256sum -c "$(basename "$archivo").sha256") || { echo "El archivo no coincide con su huella: está dañado o fue alterado"; exit 1; }; fi
clave=${DOVA_BACKUP_CLAVE:-}
if [ -z "$clave" ]; then read -rsp "Clave de la copia: " clave; echo; fi
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; chmod 700 "$tmp"
printf '%s' "$clave" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 -d -o "$tmp/copia.dump" "$archivo" || { echo "Clave incorrecta o archivo dañado"; exit 1; }
pg_restore --list "$tmp/copia.dump" > /dev/null
if [ "${CONFIRMAR:-}" != "si" ]; then
  read -rp "Esto REEMPLAZA los datos de la base de destino. Escribí si para seguir: " ok
  [ "$ok" = "si" ] || { echo "Cancelado"; exit 1; }
fi
pg_restore --clean --if-exists --no-owner --no-acl --single-transaction -d "$destino" "$tmp/copia.dump"
echo "Restaurada. Pacientes: $(psql "$destino" -Atc 'SELECT count(*) FROM pacientes'), turnos: $(psql "$destino" -Atc 'SELECT count(*) FROM turnos')"
