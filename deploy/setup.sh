#!/usr/bin/env bash
# One-time (re-runnable) setup of a Debian 13 VPS for bch-nodemap. Run as root:
#   sudo bash setup.sh [domain]
# Expects Node.js, Caddy and PostgreSQL 17 to be installed already. Without a
# domain, Caddy serves plain HTTP on port 80; run again with the domain once
# its DNS points here, and Caddy fetches HTTPS certificates itself.
# Then deploy (build, migrate, start) with deploy/deploy.sh as the admin user.
set -euo pipefail

DOMAIN="${1:-}"
ADMIN="${ADMIN:-mrzwets}"           # login user allowed to deploy without a password
REPO=https://github.com/mr-zwets/bch-nodemap.git
DIR=/opt/bch-nodemap
GO_VERSION=1.27.3
GO_SHA256=65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40
PNPM_VERSION=12.16.1

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }
for c in node npm caddy psql; do command -v "$c" >/dev/null || { echo "$c missing; install the runtimes first"; exit 1; }; done
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get install -y -q git >/dev/null

if ! /usr/local/go/bin/go version 2>/dev/null | grep -q "go$GO_VERSION "; then
  echo "== Go $GO_VERSION"
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz"
  echo "$GO_SHA256  $tmp" | sha256sum -c --quiet
  rm -rf /usr/local/go && tar -C /usr/local -xzf "$tmp" && rm -f "$tmp"
fi
ln -sf /usr/local/go/bin/go /usr/local/bin/go

[ "$(pnpm --version 2>/dev/null)" = "$PNPM_VERSION" ] || { echo "== pnpm $PNPM_VERSION"; npm install -g --silent "pnpm@$PNPM_VERSION"; }

echo "== user and checkout"
# Home outside the checkout so Go/pnpm caches don't land in the repo.
id nodemap >/dev/null 2>&1 || adduser --system --group --home /var/lib/nodemap nodemap
install -d -o nodemap -g nodemap "$DIR"
[ -d "$DIR/.git" ] || runuser -u nodemap -- git clone -q "$REPO" "$DIR"

echo "== database"
pg() { runuser -u postgres -- psql -qtAc "$1"; }
[ "$(pg "select 1 from pg_roles where rolname = 'nodemap'")" = 1 ] || runuser -u postgres -- createuser nodemap
[ "$(pg "select 1 from pg_database where datname = 'nodemap'")" = 1 ] || runuser -u postgres -- createdb -O nodemap nodemap
# Debian's default pg_hba already has "local all all peer": the nodemap OS user
# logs in as the nodemap role over the socket, no password. Postgres listens on
# localhost only.

echo "== systemd units"
install -m 644 "$DIR"/deploy/nodemap-{web,crawler,geoip}.service "$DIR"/deploy/nodemap-geoip.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable nodemap-web.service nodemap-crawler.service >/dev/null 2>&1
systemctl enable --now nodemap-geoip.timer >/dev/null 2>&1

echo "== deploy permissions for $ADMIN"
# $ADMIN may act as nodemap (owns only the checkout and its db) and restart the
# app services without a password. Anything else still needs sudo's password.
cat > /etc/sudoers.d/nodemap-deploy <<EOF
$ADMIN ALL=(nodemap) NOPASSWD: ALL
$ADMIN ALL=(root) NOPASSWD: /usr/bin/systemctl restart nodemap-web.service, /usr/bin/systemctl restart nodemap-crawler.service, /usr/bin/systemctl restart nodemap-web.service nodemap-crawler.service
EOF
chmod 440 /etc/sudoers.d/nodemap-deploy
visudo -cqf /etc/sudoers.d/nodemap-deploy

echo "== caddy"
if [ -n "$DOMAIN" ]; then
  cat > /etc/caddy/Caddyfile <<EOF
# bch-nodemap: written by deploy/setup.sh
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
else
  cat > /etc/caddy/Caddyfile <<'EOF'
# bch-nodemap: written by deploy/setup.sh. Plain HTTP until a domain is set:
# re-run "sudo bash setup.sh example.org" and Caddy gets HTTPS itself.
:80 {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "Caddyfile invalid"; exit 1; }
systemctl reload caddy

echo
echo "setup done. Next, as $ADMIN: bash $DIR/deploy/deploy.sh"
