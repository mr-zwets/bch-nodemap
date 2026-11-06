#!/usr/bin/env bash
# Download free DB-IP Lite GeoIP databases (CC BY 4.0, no account needed).
# They use the MaxMind .mmdb format, so MaxMind GeoLite2 files can be dropped in instead.
# Exits non-zero if a database could not be updated (the old file is kept).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/.local/geoip"
mkdir -p "$DIR"
failed=0
for kind in city asn; do
  ok=0
  for month in "$(date -u +%Y-%m)" "$(date -u -d '-1 month' +%Y-%m)"; do
    url="https://download.db-ip.com/free/dbip-$kind-lite-$month.mmdb.gz"
    if curl -sfL --max-time 300 "$url" | gunzip > "$DIR/dbip-$kind-lite.mmdb.tmp"; then
      mv "$DIR/dbip-$kind-lite.mmdb.tmp" "$DIR/dbip-$kind-lite.mmdb"
      echo "$kind: $month"; ok=1; break
    fi
  done
  rm -f "$DIR/dbip-$kind-lite.mmdb.tmp"
  [ "$ok" = 1 ] || { echo "$kind: download failed, kept the old file" >&2; failed=1; }
done
ls -la "$DIR"
exit "$failed"
