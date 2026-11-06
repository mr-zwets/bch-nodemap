#!/usr/bin/env bash
# Pull, build, migrate and restart bch-nodemap on the VPS. Run as the admin user
# from your own copy of deploy/ (not the nodemap-owned checkout):
#   bash ~/deploy/deploy.sh
# Nothing live is touched until everything has built and the migrations ran:
# the crawler is built to bin/*.new and moved into place, the web server runs
# from a copied release under /var/lib/nodemap/web that a symlink switches to.
# No password needed, see the sudoers rule in setup.sh.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/bch-nodemap
RELEASES=/var/lib/nodemap/web
as() { sudo -u nodemap -H "$@"; }
cd /  # our home is 0700; commands run as nodemap must not inherit it as cwd

echo "== pull"
as git -C "$DIR" pull -q --ff-only
as git -C "$DIR" log -1 --format='   %h %s'
sha="$(as git -C "$DIR" rev-parse --short HEAD)"
if ! diff -rq "$DIR/deploy" "$SRC" >/dev/null 2>&1; then
  echo "   note: deploy/ in the repo differs from $SRC; review it, copy it over and re-run setup.sh if units changed"
fi

echo "== crawler"
as bash -c "cd '$DIR/crawler' && CGO_ENABLED=0 go build -trimpath -o bin/crawler.new ./cmd/crawler && CGO_ENABLED=0 go build -trimpath -o bin/import-cashnodes.new ./cmd/import-cashnodes"

echo "== web"
as bash -c "cd '$DIR/web' && pnpm install --frozen-lockfile --silent && pnpm build >/dev/null"
rel="$RELEASES/$(date -u +%Y%m%d%H%M%S)-$sha"
as mkdir -p "$RELEASES"
as cp -a "$DIR/web/.output" "$rel"

if [ ! -f "$DIR/.local/geoip/dbip-city-lite.mmdb" ]; then
  echo "== geoip (first run)"
  as bash -c "cd '$DIR' && scripts/geoip.sh >/dev/null"
fi

echo "== migrate"
as env PGHOST=/var/run/postgresql PGDATABASE=nodemap "$DIR/scripts/migrate.sh"

echo "== switch and restart"
as mv "$DIR/crawler/bin/crawler.new" "$DIR/crawler/bin/crawler"
as mv "$DIR/crawler/bin/import-cashnodes.new" "$DIR/crawler/bin/import-cashnodes"
as ln -sfn "$rel" "$RELEASES/current.new"
as mv -T "$RELEASES/current.new" "$RELEASES/current"
sudo systemctl restart nodemap-web.service nodemap-crawler.service
# keep the 3 newest releases (current is the newest)
as bash -c "ls -1d '$RELEASES'/2*-* | sort -r | tail -n +4 | xargs -r rm -rf"

for _ in $(seq 1 30); do
  curl -fs -o /dev/null http://127.0.0.1:3000/api/snapshots/head && break
  sleep 1
done
systemctl --no-pager --lines=0 status nodemap-web.service nodemap-crawler.service | grep -E "^●|Active:" || true
curl -fs http://127.0.0.1:3000/api/snapshots/head && echo || echo "web not answering yet; see: journalctl -u nodemap-web -n 50"
