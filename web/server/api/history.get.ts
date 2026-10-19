import type { HistoryBucket, HistoryMetric, HistoryPoint, HistoryResponse, HistorySeries, SnapshotSource } from '#shared/types/api'
import { implShort, parseUserAgent, VERSIONED_IMPLEMENTATIONS } from '#shared/utils/ua'
import { providerOf, UNKNOWN_PROVIDER } from '#shared/utils/provider'

const DAY = 86_400_000
/** A hole between consecutive points longer than this is reported as a gap (line break). */
const GAP_THRESHOLD: Record<HistoryBucket, number> = { day: 7 * DAY, week: 3 * 7 * DAY }

const AGGREGATION = {
  reachable:
    'Per bucket (UTC day / ISO week): mean of snapshots.reachable over every snapshot in the bucket, with min and max. When both sources fall in one bucket only crawler snapshots are used.',
  breakdown:
    'Per bucket (UTC day / ISO week): one representative snapshot, the latest one in the bucket (crawler preferred over cashnodes), whose node rows are counted. Values are node counts; divide by point.total for shares.',
}

/**
 * Time series across both data sources.
 *
 *   metric=reachable       series avg/min/max of reachable nodes per bucket
 *   metric=implementation  node count per implementation per bucket
 *   metric=version         node count per BCHN/BCHU release line (level=line, e.g. "BCHN 29")
 *                          or exact version (level=full); top N by peak share, rest folded into "Other"
 *   metric=provider        node count per hosting provider (shared/utils/provider.ts); top N by
 *                          peak share, rest and nodes without an AS organisation folded into "Other"
 *
 * Params: bucket=day|week (default: day for ranges up to ~13 months, else week),
 *         from, to (ISO dates), top (version/provider, 1-8, default 6),
 *         impl (version only: bchn|bchu|all, default all), level (version only: line|full)
 */
export default defineCachedEventHandler(
  async (event): Promise<HistoryResponse> => {
    const q = getQuery(event)
    const net = network(event)
    const metric = oneOf<HistoryMetric>(q, 'metric', ['reachable', 'implementation', 'version', 'provider'], 'reachable')
    const from = date(q, 'from')
    const to = date(q, 'to')
    if (from && to && from >= to) badRequest('from must be before to')

    let bucket = oneOf<HistoryBucket | 'auto'>(q, 'bucket', ['day', 'week', 'auto'], 'auto')
    if (bucket === 'auto') {
      const span = await query<{ lo: Date | null; hi: Date | null }>(
        `select min(taken_at) lo, max(taken_at) hi from snapshots
          where network = $1 and ($2::timestamptz is null or taken_at >= $2) and ($3::timestamptz is null or taken_at < $3)`,
        [net, from ?? null, to ?? null],
      )
      const lo = span[0]?.lo ? new Date(span[0].lo).getTime() : 0
      const hi = span[0]?.hi ? new Date(span[0].hi).getTime() : 0
      bucket = hi - lo > 400 * DAY ? 'week' : 'day'
    }
    const range = [net, bucket, from ?? null, to ?? null]
    const rangeWhere = `network = $1 and ($3::timestamptz is null or taken_at >= $3) and ($4::timestamptz is null or taken_at < $4)`

    let points: HistoryPoint[]
    let series: HistorySeries[]

    if (metric === 'reachable') {
      // snapshots table only: cheap even at hundreds of thousands of rows.
      const rows = await query<{ b: Date; source: SnapshotSource; n: number; avg: number; mn: number; mx: number }>(
        `select date_trunc($2, taken_at, 'UTC') as b, source, count(*)::int as n,
                avg(reachable)::float8 as avg, min(reachable) as mn, max(reachable) as mx
           from snapshots where ${rangeWhere}
          group by 1, 2 order by 1, (source = 'crawler') desc`,
        range,
      )
      const picked = rows.filter((r, i) => i === 0 || +rows[i - 1]!.b !== +r.b) // crawler row first per bucket
      points = picked.map((r) => ({ t: new Date(r.b).toISOString(), source: r.source, snapshots: r.n }))
      series = [
        { key: 'avg', data: picked.map((r) => Math.round(r.avg * 10) / 10) },
        { key: 'min', data: picked.map((r) => r.mn) },
        { key: 'max', data: picked.map((r) => r.mx) },
      ]
    } else {
      // Pick one snapshot per bucket first, then touch only those snapshots' rows
      // (primary-key range scans), so cost scales with buckets, not with total rows.
      const rows = await query<{
        b: Date
        id: number
        source: SnapshotSource
        n: number
        k: string | null
        asn: number | null
        c: number
      }>(
        `with s as (
           select id, source, taken_at, date_trunc($2, taken_at, 'UTC') as b
             from snapshots where ${rangeWhere}
         ), reps as (
           select distinct on (b) b, id, source, count(*) over (partition by b) as n
             from s order by b, (source = 'crawler') desc, taken_at desc
         )
         select r.b, r.id, r.source, r.n, x.k, x.asn, coalesce(x.c, 0) as c
           from reps r
           left join lateral (
             -- per representative snapshot: primary-key range scan on snapshot_nodes
             select ${metric === 'provider' ? 'org as k, asn' : 'user_agent as k, null::int as asn'}, count(*)::int as c
               from snapshot_nodes where snapshot_id = r.id
              group by 1, 2
           ) x on true
          order by r.b`,
        range,
      )

      const index = new Map<number, number>()
      points = []
      const counts: Array<Map<string, number>> = []
      const implOf = new Map<string, string>()
      const versionImpls = versionFilter(str(q, 'impl'))
      const level = oneOf(q, 'level', ['line', 'full'] as const, 'line')

      for (const r of rows) {
        let i = index.get(r.id)
        if (i === undefined) {
          i = points.push({ t: new Date(r.b).toISOString(), source: r.source, snapshots: r.n, snapshotId: r.id, total: 0 }) - 1
          index.set(r.id, i)
          counts.push(new Map())
        }
        if (r.c === 0) continue
        points[i]!.total! += r.c
        let key: string
        if (metric === 'provider') {
          key = providerOf(r.k, r.asn)
          if (key === UNKNOWN_PROVIDER) key = 'Other'
        } else {
          const p = parseUserAgent(r.k)
          key = p.impl
          if (metric === 'version') {
            const v = level === 'line' ? p.line : p.version
            key = versionImpls.includes(p.impl) && v ? `${implShort(p.impl)} ${v}` : 'Other'
          }
          implOf.set(key, p.impl)
        }
        const m = counts[i]!
        m.set(key, (m.get(key) ?? 0) + r.c)
      }
      // drop buckets whose representative snapshot has no node rows (e.g. import in progress)
      const keep = points.map((p) => (p.total ?? 0) > 0)
      points = points.filter((_, i) => keep[i])
      const kept = counts.filter((_, i) => keep[i])

      const keys = new Map<string, { total: number; peak: number }>()
      kept.forEach((m, i) => {
        const total = points[i]!.total!
        for (const [k, c] of m) {
          const e = keys.get(k) ?? { total: 0, peak: 0 }
          e.total += c
          e.peak = Math.max(e.peak, c / total)
          keys.set(k, e)
        }
      })

      let chosen: string[]
      if (metric === 'version' || metric === 'provider') {
        const top = int(q, 'top', 6, 1, 8)
        chosen = [...keys]
          .filter(([k]) => k !== 'Other')
          .sort((a, b) => b[1].peak - a[1].peak)
          .slice(0, top)
          .map(([k]) => k)
        if (metric === 'version') chosen.sort(compareVersionKeys)
      } else {
        chosen = [...keys].sort((a, b) => b[1].total - a[1].total).map(([k]) => k)
      }
      const chosenSet = new Set(chosen)
      const needOther = [...keys.keys()].some((k) => !chosenSet.has(k))
      series = chosen.map((k) => ({
        key: k,
        impl: metric === 'provider' ? undefined : metric === 'version' ? implOf.get(k) : k,
        data: kept.map((m) => m.get(k) ?? 0),
      }))
      if (needOther && (metric === 'version' || metric === 'provider')) {
        series.push({
          key: 'Other',
          data: kept.map((m) => [...m].reduce((s, [k, c]) => (chosenSet.has(k) ? s : s + c), 0)),
        })
      }
    }

    // gaps and source runs
    const gaps: HistoryResponse['gaps'] = []
    const sources: HistoryResponse['sources'] = []
    points.forEach((p, i) => {
      const prev = points[i - 1]
      if (prev && +new Date(p.t) - +new Date(prev.t) > GAP_THRESHOLD[bucket as HistoryBucket]) gaps.push({ from: prev.t, to: p.t })
      const run = sources[sources.length - 1]
      if (run && run.source === p.source) run.to = p.t
      else sources.push({ source: p.source, from: p.t, to: p.t })
    })

    return {
      network: net,
      metric,
      bucket: bucket as HistoryBucket,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      aggregation: metric === 'reachable' ? AGGREGATION.reachable : AGGREGATION.breakdown,
      points,
      series,
      gaps,
      sources,
    }
  },
  {
    name: 'history',
    maxAge: 600,
    swr: true,
    getKey: (event) => getRequestURL(event).search || '-',
  },
)

function versionFilter(impl: string | undefined): string[] {
  if (!impl || impl === 'all') return VERSIONED_IMPLEMENTATIONS
  if (impl === 'bchn') return ['Bitcoin Cash Node']
  if (impl === 'bchu') return ['BCH Unlimited']
  badRequest('impl must be bchn, bchu or all')
}

/** "BCHN 29" < "BCHN 29.1" < "BCHU 2.0": implementation, then numeric version. */
function compareVersionKeys(a: string, b: string): number {
  const [ia = '', va = ''] = a.split(' ')
  const [ib = '', vb = ''] = b.split(' ')
  if (ia !== ib) return ia.localeCompare(ib)
  const pa = va.split('.').map(Number)
  const pb = vb.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d) return d
  }
  return 0
}
