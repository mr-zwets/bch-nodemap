# bch-nodemap

A live map and census of the Bitcoin Cash P2P network: how many nodes are reachable, which software and versions they run, where they are hosted, and whether they follow the chain tip.

It is a successor to Bitcoin Unlimited's [cashnodes](https://gitlab.com/bitcoinunlimited/cashnodes), whose crawler stopped on 2024-04-03. Its history (2020-11-28 → 2024-04-03) is imported so charts start years back.

## Layout

| Path | What |
|---|---|
| `crawler/` | Go. `cmd/crawler` crawls the network every 10 min and writes a snapshot; `cmd/import-cashnodes` imports the BU archive. Uses [`gcash/bchd/wire`](https://github.com/gcash/bchd) (master, for BIP155 addrv2). |
| `web/` | Nuxt app: API (server routes) and frontend. |
| `db/migrations/` | Postgres schema, the contract between crawler and web. |
| `archive/` | `fetch_cashnodes.py` downloads a sample of the BU snapshot archive into `archive/data/raw/`. |
| `scripts/` | `db.sh` (local Postgres without Docker), `geoip.sh` (DB-IP Lite databases). |
| `reference/` | Untouched clones of the original cashnodes repos (gitignored). |

## How the crawler works

1. Start from DNS seeds (the list BCHN ships) plus every node seen reachable in the last 7 days.
2. For each endpoint: TCP connect, `version` → `sendaddrv2` → `verack` → `getaddr`, collect `addr`/`addrv2` replies, then disconnect. No blocks or transactions are downloaded, so no synced node is needed.
3. Queue every newly learned, routable address seen in the last 24h; repeat until nothing new turns up (~1 min for mainnet with 500 workers).
4. Drop nodes of other chains that share the network magic (`Bitcoin ABC`/eCash, `Bitcoin SV`, `Lotus`), add GeoIP and reverse DNS, store the snapshot.

Onion (Tor v3) nodes are probed when `-tor 127.0.0.1:9050` is given; I2P/CJDNS addresses are counted as discovered but not probed.

## Local development

Requirements: Go ≥ 1.26, Node 24 + pnpm, `psql` client. No Docker or root needed.

```sh
scripts/db.sh setup          # portable Postgres 17 on 127.0.0.1:5433, creates db + applies migrations
scripts/geoip.sh             # DB-IP Lite city + ASN databases into .local/geoip

cd crawler && go build -o bin/crawler ./cmd/crawler && go build -o bin/import-cashnodes ./cmd/import-cashnodes && cd ..
crawler/bin/crawler -once    # one mainnet crawl → snapshot in the db
crawler/bin/crawler          # keep crawling every 10 minutes

python3 archive/fetch_cashnodes.py   # BU archive sample (hours; resumable)
crawler/bin/import-cashnodes         # import whatever has been downloaded (idempotent)

scripts/db.sh psql           # poke at the data
```

Useful crawler flags: `-network mainnet|testnet4|chipnet|regtest`, `-dry-run`, `-debug`, `-connect host:port,...`, `-no-dns-seeds`, `-workers`, `-tor`. Regtest example against a local node: `crawler/bin/crawler -network regtest -no-dns-seeds -connect 127.0.0.1:18444 -once -dry-run -debug` (use the port your regtest node listens on).

Tests: `cd crawler && go test ./...`

## Deployment

`docker-compose.yml` runs Postgres + crawler (+ web) on a single VPS. The crawler needs a long-running process with many outbound TCP connections, so it cannot run on serverless platforms. See `docker-compose.yml` for the required env vars.

## Data notes

- `snapshot_nodes.height` is the start height a node reports in its `version` message, so being 0–1 blocks behind is normal. Nodes far behind the tip are most likely stuck at a past network upgrade (e.g. all BCH Unlimited nodes as of Oct 2026).
- GeoIP data by [DB-IP](https://db-ip.com) (CC BY 4.0). MaxMind GeoLite2 `.mmdb` files work as drop-in replacements.
