#!/usr/bin/env bash
# Apply db/migrations/*.sql not yet recorded in schema_migrations, each in its
# own transaction. Connects with the usual libpq environment (PGHOST, PGDATABASE,
# PGUSER, ...); scripts/db.sh sets those for local dev, deploy/deploy.sh for the VPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
psql -qtAc "set client_min_messages = warning; create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
for f in "$ROOT"/db/migrations/*.sql; do
  n="$(basename "$f")"
  if [ -z "$(psql -qtAc "select 1 from schema_migrations where name = '$n'")" ]; then
    echo "applying $n"
    psql -v ON_ERROR_STOP=1 -q -1 -f "$f"
    psql -qtAc "insert into schema_migrations (name) values ('$n')"
  fi
done
