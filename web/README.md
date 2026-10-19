# bch-nodemap web

Nuxt 4 app (Nitro API + Vue frontend) for the bch-nodemap Bitcoin Cash P2P network explorer.
It reads the Postgres database the crawler (`../crawler`) and the cashnodes archive importer write to;
it never writes to it.

## Run

```sh
pnpm install
pnpm dev                 # http://localhost:3000, hot reload
pnpm typecheck           # nuxt typecheck (vue-tsc)
pnpm build               # -> .output/
node .output/server/index.mjs   # or: pnpm start
```

The build uses Nitro's `node-server` preset: copy `.output/` to any machine with Node ≥ 20 and run
`node .output/server/index.mjs` behind a reverse proxy (nginx/Caddy). Let the proxy gzip/brotli
HTML and JSON; the nodes page is ~550 kB uncompressed, ~55 kB gzipped.

## Environment

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `postgres://nodemap@127.0.0.1:5433/nodemap` | Postgres connection string |
| `DATABASE_POOL_MAX` | `10` | pg pool size |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `20000` | per-statement timeout |
| `PORT` / `HOST` | `3000` / all interfaces | listen address (Nitro) |

## API

All `GET`, JSON. `network` query param defaults to `mainnet`. Errors: `{ statusCode, statusMessage }` with 400/404/503.

| Route | Params | Returns |
|---|---|---|
| `/api/snapshots/latest` | `network` | `SnapshotSummary` of the newest snapshot |
| `/api/snapshots/:id` | | `SnapshotSummary` |
| `/api/snapshots` | `page`, `per_page` (≤500), `source`, `from`, `to` | `{ total, page, perPage, items: [{id, takenAt, source, reachable}] }` |
| `/api/nodes` | `snapshot=latest\|<id>`, `q`, `country`, `ua` (substring), `ua_base` (UA without BIP14 comment, exact), `impl`, `provider`, `status` (comma list), `net`, `sort`, `dir`, `limit`, `offset` | `{ snapshot, tip, heightsReliable, total, nodes: NodeRow[] }` |
| `/api/history` | `metric=reachable\|implementation\|version\|provider`, `bucket=auto\|day\|week`, `from`, `to`, `top` (1–8), `impl=bchn\|bchu\|all`, `level=line\|full` | `{ points, series, gaps, sources, aggregation }` |

Types are in `shared/types/api.ts`.

`SnapshotSummary` = snapshot meta, `tip`, `consensus` counts, and breakdowns `byUserAgent` (comment stripped,
as cashnodes showed it), `byUserAgentRaw`, `byImplementation` and `byVersion` (with per-status counts),
`byCountry`, `byNet` (ipv4/ipv6/onion/…), `byProvider` (normalised hosting provider), `byOrg` (raw AS org + ASN),
`heights`.

### Definitions

* **Implementation**: `shared/utils/ua.ts`. First `/name:version(...)/` segment of the user agent; names mapped to
  Bitcoin Cash Node, BCH Unlimited (incl. BUCash), BCHD, Bitcoin Verde, Knuth, Flowee / Rapids (Rapids = Flowee the
  Hub codebase); anything else keeps its raw name.
* **Tip / consensus**: `shared/utils/consensus.ts`. Tip = highest height reported by ≥ 3 nodes in the snapshot
  (else the max). `height` is the version-message start height. At tip: ≤ 2 blocks behind (or ≤ 6 ahead);
  behind: 3–144; stalled: > 144 (stuck / off consensus); unknown: no height or far ahead.
  Archive (`cashnodes`) snapshots kept long-lived connections, so their heights can be stale (`heightsReliable=false`).
* **Provider** ("Network" tab): `shared/utils/provider.ts`. Case-insensitive patterns plus well-known ASNs merge the
  entities of one company across MaxMind (archive) and DB-IP (crawler) names; unmatched orgs keep their shortened
  name; null org → `Unknown`.
* **History aggregation**: buckets are UTC days or ISO weeks (`auto` = day for ≤ 400 days, else week).
  `reachable`: mean / min / max of `snapshots.reachable` over all snapshots in the bucket.
  `implementation` / `version` / `provider`: one representative snapshot per bucket — the latest one, crawler
  preferred over cashnodes — whose rows are counted (cost scales with buckets, not rows). Values are node
  counts; divide by `points[i].total` for shares. Holes longer than 7 days (day buckets) or 3 weeks (week buckets)
  are returned in `gaps`; the charts insert a null there so lines break instead of interpolating.

Snapshot summaries are cached in memory by id (snapshots are immutable); `/api/history` responses are cached
for 10 minutes (stale-while-revalidate).

## Layout

```
app/        pages (/, /map, /nodes, /history), components, composables, client utils, CSS tokens
server/     api/ routes, utils/ (pg pool, params, snapshot summary)
shared/     types + UA / consensus / provider normalisation used by both sides
```

Map: d3-geo + world-atlas 110m TopoJSON, rendered server-side as SVG. Charts: ECharts (SVG renderer) via
vue-echarts, client-only. No external requests, fonts, cookies or analytics.

GeoIP data by [DB-IP](https://db-ip.com), licensed CC BY 4.0 — keep the footer attribution.
