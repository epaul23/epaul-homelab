#!/usr/bin/env bash
set -euo pipefail

OUT="/srv/backup-staging/nextcloud"
TMP="$OUT/nextcloud-db.sql.gz.tmp"
FINAL="$OUT/nextcloud-db.sql.gz"

mkdir -p "$OUT"

docker exec nextcloud-db sh -c \
'mariadb-dump --single-transaction --quick --lock-tables=false -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
| gzip > "$TMP"

gzip -t "$TMP"
mv "$TMP" "$FINAL"
