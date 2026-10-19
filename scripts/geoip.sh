#!/usr/bin/env bash
# Download free DB-IP Lite GeoIP databases (CC BY 4.0, no account needed).
# They use the MaxMind .mmdb format, so MaxMind GeoLite2 files can be dropped in instead.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/.local/geoip"
mkdir -p "$DIR"
for kind in city asn; do
  for month in "$(date -u +%Y-%m)" "$(date -u -d '-1 month' +%Y-%m)"; do
    url="https://download.db-ip.com/free/dbip-$kind-lite-$month.mmdb.gz"
    if curl -sfL "$url" | gunzip > "$DIR/dbip-$kind-lite.mmdb.tmp"; then
      mv "$DIR/dbip-$kind-lite.mmdb.tmp" "$DIR/dbip-$kind-lite.mmdb"
      echo "$kind: $month"; break
    fi
  done
done
ls -la "$DIR"
