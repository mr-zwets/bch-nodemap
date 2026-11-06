#!/usr/bin/env bash
# Pull, build, migrate and restart bch-nodemap on the VPS. Run as the admin user
# (no password needed, see the sudoers rule in setup.sh):
#   bash /opt/bch-nodemap/deploy/deploy.sh
set -euo pipefail
DIR=/opt/bch-nodemap
as() { sudo -u nodemap -H "$@"; }
cd /  # our home is 0700; commands run as nodemap must not inherit it as cwd

echo "== pull"
as git -C "$DIR" pull -q --ff-only
as git -C "$DIR" log -1 --format='   %h %s'

echo "== crawler"
as bash -c "cd '$DIR/crawler' && CGO_ENABLED=0 go build -trimpath -o bin/crawler ./cmd/crawler && CGO_ENABLED=0 go build -trimpath -o bin/import-cashnodes ./cmd/import-cashnodes"

echo "== web"
as bash -c "cd '$DIR/web' && pnpm install --frozen-lockfile --silent && pnpm build >/dev/null"

if [ ! -f "$DIR/.local/geoip/dbip-city-lite.mmdb" ]; then
  echo "== geoip (first run)"
  as bash -c "cd '$DIR' && scripts/geoip.sh >/dev/null"
fi

echo "== migrate"
as env PGHOST=/var/run/postgresql PGDATABASE=nodemap "$DIR/scripts/migrate.sh"

echo "== restart"
sudo systemctl restart nodemap-web.service nodemap-crawler.service
for _ in $(seq 1 30); do
  curl -fs -o /dev/null http://127.0.0.1:3000/api/snapshots/head && break
  sleep 1
done
systemctl --no-pager --lines=0 status nodemap-web.service nodemap-crawler.service | grep -E "^●|Active:" || true
curl -fs http://127.0.0.1:3000/api/snapshots/head && echo || echo "web not answering yet; see: journalctl -u nodemap-web -n 50"
