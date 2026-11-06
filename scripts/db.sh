#!/usr/bin/env bash
# Local development Postgres without root or Docker.
# Uses portable PostgreSQL binaries in .local/pg (zonky embedded-postgres build).
#   scripts/db.sh setup     download binaries, init cluster, create db, migrate
#   scripts/db.sh start|stop|status
#   scripts/db.sh migrate   apply db/migrations/*.sql not yet applied
#   scripts/db.sh psql [args]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
L="$ROOT/.local"
PG="$L/pg/bin"
PORT="${PGPORT:-5433}"
PGVER="17.6.0"
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=nodemap PGDATABASE=nodemap

download() {
  [ -x "$PG/postgres" ] && return
  mkdir -p "$L/pg"
  local url="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/$PGVER/embedded-postgres-binaries-linux-amd64-$PGVER.jar"
  curl -sfL -o "$L/pg.jar" "$url"
  python3 -c "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);n=[x for x in z.namelist() if x.endswith('.txz')][0];open(sys.argv[2],'wb').write(z.read(n))" "$L/pg.jar" "$L/pg.txz"
  tar -xJf "$L/pg.txz" -C "$L/pg"
  rm -f "$L/pg.jar" "$L/pg.txz"
}

start() {
  mkdir -p "$L/run"
  "$PG/pg_ctl" -D "$L/data" status >/dev/null 2>&1 && return
  "$PG/pg_ctl" -D "$L/data" -l "$L/pg.log" -w \
    -o "-p $PORT -k $L/run -c listen_addresses=127.0.0.1" start
}

migrate() { "$ROOT/scripts/migrate.sh"; }

case "${1:-}" in
  setup)
    download
    [ -d "$L/data" ] || "$PG/initdb" -D "$L/data" -U nodemap --auth=trust -E UTF8 >/dev/null
    start
    psql -d postgres -qtAc "select 1 from pg_database where datname='nodemap'" | grep -q 1 || createdb nodemap
    migrate ;;
  start) start ;;
  stop) "$PG/pg_ctl" -D "$L/data" stop ;;
  status) "$PG/pg_ctl" -D "$L/data" status ;;
  migrate) migrate ;;
  psql) shift; psql "$@" ;;
  *) echo "usage: $0 setup|start|stop|status|migrate|psql"; exit 1 ;;
esac
