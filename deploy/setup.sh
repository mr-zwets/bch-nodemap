#!/usr/bin/env bash
# One-time (re-runnable) setup of a Debian 13 VPS for bch-nodemap. Copy this
# deploy/ directory to the admin user's home and run it from there as root:
#   scp -r deploy vps:            # from a checkout you trust
#   sudo bash deploy/setup.sh [domain|none]
# Unit files are installed from this directory, never from the nodemap-owned
# checkout, so nothing nodemap can write ever ends up running as root.
# Expects Node.js, Caddy and PostgreSQL 17 to be installed already.
# Without a domain Caddy serves plain HTTP on :80. Give the domain once its DNS
# points here and Caddy fetches HTTPS certificates itself; later runs without an
# argument keep it ("none" goes back to plain HTTP).
# Re-running installs units but restarts nothing; the next deploy does.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
ADMIN="${ADMIN:-mrzwets}"           # login user allowed to deploy without a password
REPO=https://github.com/mr-zwets/bch-nodemap.git
DIR=/opt/bch-nodemap
CONF=/etc/default/nodemap
GO_VERSION=1.27.3
GO_SHA256=65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40
PNPM_VERSION=12.16.1

die() { echo "error: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
# sudo keeps the caller's cwd (a 0700 home); commands run as nodemap/postgres can't read it.
cd /
for c in node npm caddy psql; do command -v "$c" >/dev/null || die "$c missing; install the runtimes first"; done
for f in nodemap-web.service nodemap-crawler.service nodemap-geoip.service nodemap-geoip.timer; do
  [ -f "$SRC/$f" ] || die "$SRC/$f missing; copy the whole deploy/ directory"
done
id "$ADMIN" >/dev/null 2>&1 || die "admin user $ADMIN does not exist"

# Domain: argument wins and is remembered; no argument keeps the saved one.
if [ $# -ge 1 ]; then
  DOMAIN="$1"; [ "$DOMAIN" = none ] && DOMAIN=""
else
  DOMAIN="$( [ -f "$CONF" ] && . "$CONF"; echo "${NODEMAP_DOMAIN:-}")"
fi
if [ -n "$DOMAIN" ]; then
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "not a domain name: $DOMAIN"
  [[ "$DOMAIN" != www.* ]] || die "give the bare domain; www. is added and redirected automatically"
fi
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -q >/dev/null
apt-get install -y -q git >/dev/null

if ! /usr/local/go/bin/go version 2>/dev/null | grep -q "go$GO_VERSION "; then
  echo "== Go $GO_VERSION"
  tmp="$(mktemp)"
  curl -fsSL --max-time 600 -o "$tmp" "https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz"
  echo "$GO_SHA256  $tmp" | sha256sum -c --quiet
  rm -rf /usr/local/go && tar -C /usr/local -xzf "$tmp" && rm -f "$tmp"
fi
ln -sf /usr/local/go/bin/go /usr/local/bin/go

[ "$(pnpm --version 2>/dev/null)" = "$PNPM_VERSION" ] || { echo "== pnpm $PNPM_VERSION"; npm install -g --silent "pnpm@$PNPM_VERSION"; }

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  echo "== 2 GB swap (headroom for builds)"
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap -q /swapfile; }
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness = 10' > /etc/sysctl.d/90-swappiness.conf
sysctl -q -p /etc/sysctl.d/90-swappiness.conf

echo "== user and checkout"
# Home outside the checkout so Go/pnpm caches and web releases don't land in the repo.
id nodemap >/dev/null 2>&1 || adduser --system --group --home /var/lib/nodemap nodemap
install -d -o nodemap -g nodemap "$DIR"
[ -d "$DIR/.git" ] || runuser -u nodemap -- git clone -q "$REPO" "$DIR"

echo "== database"
pg() { runuser -u postgres -- psql -qtAc "$1"; }
[ "$(pg "select 1 from pg_roles where rolname = 'nodemap'")" = 1 ] || runuser -u postgres -- createuser nodemap
[ "$(pg "select 1 from pg_database where datname = 'nodemap'")" = 1 ] \
  || runuser -u postgres -- createdb -E UTF8 -T template0 --locale=C.UTF-8 -O nodemap nodemap
# Debian's default pg_hba has "local all all peer": the nodemap OS user logs in as
# the nodemap role over the socket, no password. Postgres listens on localhost only.

echo "== systemd units"
install -m 644 "$SRC"/nodemap-{web,crawler,geoip}.service "$SRC"/nodemap-geoip.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable nodemap-web.service nodemap-crawler.service >/dev/null 2>&1
systemctl enable --now nodemap-geoip.timer >/dev/null 2>&1

echo "== permissions for $ADMIN"
# $ADMIN may act as nodemap (owns only the checkout, its releases and its db) and
# restart the app services without a password. Anything else still needs sudo's
# password. Validated before installing: a broken sudoers.d file disables sudo
# entirely, and root can't log in over SSH.
tmp="$(mktemp)"
cat > "$tmp" <<EOF
$ADMIN ALL=(nodemap) NOPASSWD: ALL
$ADMIN ALL=(root) NOPASSWD: /usr/bin/systemctl restart nodemap-web.service, /usr/bin/systemctl restart nodemap-crawler.service, /usr/bin/systemctl restart nodemap-web.service nodemap-crawler.service
EOF
visudo -cqf "$tmp" || { rm -f "$tmp"; die "sudoers rule invalid, not installed"; }
install -m 440 -o root -g root "$tmp" /etc/sudoers.d/nodemap-deploy
rm -f "$tmp"
usermod -aG systemd-journal "$ADMIN"   # read service logs without sudo

echo "== caddy"
if [ -n "$DOMAIN" ]; then
  cat > /etc/caddy/Caddyfile.new <<EOF
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
  cat > /etc/caddy/Caddyfile.new <<'EOF'
# bch-nodemap: written by deploy/setup.sh. Plain HTTP until a domain is set:
# re-run "sudo bash deploy/setup.sh example.org" and Caddy gets HTTPS itself.
:80 {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
fi
# Validate before replacing the live config.
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 \
  || die "new Caddyfile invalid, kept the old one (see /etc/caddy/Caddyfile.new)"
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
echo "NODEMAP_DOMAIN=$DOMAIN" > "$CONF"
systemctl reload caddy
echo "   serving: ${DOMAIN:-plain HTTP on :80}"

echo
echo "setup done. Deploy as $ADMIN (log in again first for the journal group): bash $SRC/deploy.sh"
