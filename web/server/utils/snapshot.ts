import type {
  ConsensusCounts,
  HeightRow,
  ImplementationRow,
  OrgRow,
  ProviderRow,
  SnapshotMeta,
  SnapshotSummary,
  VersionRow,
} from '#shared/types/api'
import { consensusStatus, TIP_MIN_NODES, type ConsensusStatus } from '#shared/utils/consensus'
import { parseUserAgent, EMPTY_UA } from '#shared/utils/ua'
import { providerOf, stripUaComment } from '#shared/utils/provider'

const META_COLS = `id, taken_at as "takenAt", source, network, reachable, discovered, duration_ms as "durationMs"`

export async function latestSnapshot(network: string): Promise<SnapshotMeta | undefined> {
  const rows = await query<SnapshotMeta>(
    `select ${META_COLS} from snapshots where network = $1 order by taken_at desc limit 1`,
    [network],
  )
  return rows[0]
}

export async function snapshotById(id: number): Promise<SnapshotMeta | undefined> {
  const rows = await query<SnapshotMeta>(`select ${META_COLS} from snapshots where id = $1`, [id])
  return rows[0]
}

/** Resolve "latest" or a numeric id to a snapshot, 404 if missing. */
export async function resolveSnapshot(ref: string | undefined, network: string): Promise<SnapshotMeta> {
  let snap: SnapshotMeta | undefined
  if (!ref || ref === 'latest') {
    snap = await latestSnapshot(network)
  } else {
    const id = Number(ref)
    if (!Number.isSafeInteger(id) || id <= 0) badRequest('snapshot must be "latest" or a positive integer id')
    snap = await snapshotById(id)
  }
  if (!snap) throw createError({ statusCode: 404, statusMessage: 'Snapshot not found' })
  return snap
}

export const TIP_RULE = `highest height reported by at least ${TIP_MIN_NODES} nodes (falls back to the maximum height)`

/** Tip of a snapshot: the highest height reported by >= TIP_MIN_NODES nodes. */
export async function snapshotTip(id: number): Promise<number | null> {
  const rows = await query<{ tip: number | null }>(
    `select coalesce(
        (select height from snapshot_nodes
          where snapshot_id = $1 and height is not null
          group by height having count(*) >= $2
          order by height desc limit 1),
        (select max(height) from snapshot_nodes where snapshot_id = $1)
     ) as tip`,
    [id, TIP_MIN_NODES],
  )
  return rows[0]?.tip ?? null
}

export const heightsReliable = (s: SnapshotMeta) => s.source === 'crawler'

const emptyCounts = (): ConsensusCounts => ({ at_tip: 0, behind: 0, stalled: 0, unknown: 0 })

// Snapshot contents never change once written, so summaries are cached by id.
const summaryCache = new Map<number, SnapshotSummary>()
const SUMMARY_CACHE_MAX = 256

export async function snapshotSummary(snap: SnapshotMeta): Promise<SnapshotSummary> {
  const cached = summaryCache.get(snap.id)
  // A snapshot younger than 2 minutes could still be being written: don't cache it.
  const fresh = Date.now() - new Date(snap.takenAt).getTime() < 120_000
  if (cached) return cached

  // One pass over the snapshot's rows (primary-key range scan) with grouping sets.
  type Row = {
    g: number
    user_agent: string | null
    height: number | null
    country: string | null
    net: string | null
    org: string | null
    asn: number | null
    c: number
  }
  const [tip, rows] = await Promise.all([
    snapshotTip(snap.id),
    query<Row>(
      `select grouping(user_agent, height, country, net, org, asn) as g,
              user_agent, height, country, net, org, asn, count(*)::int as c
         from snapshot_nodes
        where snapshot_id = $1
        group by grouping sets ((user_agent, height), (country), (net), (org, asn))`,
      [snap.id],
    ),
  ])

  // grouping() bitmask over (user_agent, height, country, net, org, asn): 1 = column aggregated away
  const G_UA_HEIGHT = 0b001111
  const G_COUNTRY = 0b110111
  const G_NET = 0b111011
  const G_ORG = 0b111100

  const consensus = emptyCounts()
  const byUA = new Map<string, number>()
  const byUARaw = new Map<string, number>()
  const byProvider = new Map<string, ProviderRow>()
  const byImpl = new Map<string, ImplementationRow>()
  const byVersion = new Map<string, VersionRow>()
  const heights = new Map<string, HeightRow>()
  const byCountry: Array<{ key: string; count: number }> = []
  const byNet: Array<{ key: string; count: number }> = []
  const byOrg: OrgRow[] = []
  let nodes = 0

  for (const r of rows) {
    switch (r.g) {
      case G_UA_HEIGHT: {
        nodes += r.c
        const status: ConsensusStatus = consensusStatus(r.height, tip)
        consensus[status] += r.c
        const ua = r.user_agent || EMPTY_UA
        byUARaw.set(ua, (byUARaw.get(ua) ?? 0) + r.c)
        const base = stripUaComment(ua)
        byUA.set(base, (byUA.get(base) ?? 0) + r.c)
        const p = parseUserAgent(r.user_agent)
        const impl = byImpl.get(p.impl) ?? { key: p.impl, count: 0, ...emptyCounts() }
        impl.count += r.c
        impl[status] += r.c
        byImpl.set(p.impl, impl)
        const vkey = p.version ? `${p.product} ${p.version}` : p.product
        const ver = byVersion.get(vkey) ?? { key: vkey, impl: p.impl, version: p.version, count: 0, ...emptyCounts() }
        ver.count += r.c
        ver[status] += r.c
        byVersion.set(vkey, ver)
        const hk = String(r.height)
        const h = heights.get(hk) ?? {
          height: r.height,
          lag: r.height != null && tip != null ? tip - r.height : null,
          status,
          count: 0,
        }
        h.count += r.c
        heights.set(hk, h)
        break
      }
      case G_COUNTRY:
        byCountry.push({ key: r.country ?? 'unknown', count: r.c })
        break
      case G_NET:
        byNet.push({ key: r.net ?? 'unknown', count: r.c })
        break
      case G_ORG:
      {
        byOrg.push({ key: r.org ?? (r.asn != null ? `AS${r.asn}` : 'unknown'), asn: r.asn, count: r.c })
        const label = providerOf(r.org, r.asn)
        const p = byProvider.get(label) ?? { key: label, count: 0, orgs: [], asns: [] }
        p.count += r.c
        if (r.org && !p.orgs.includes(r.org)) p.orgs.push(r.org)
        if (r.asn != null && !p.asns.includes(r.asn)) p.asns.push(r.asn)
        byProvider.set(label, p)
        break
      }
    }
  }

  const desc = <T extends { count: number; key: string }>(a: T, b: T) => b.count - a.count || a.key.localeCompare(b.key)
  const summary: SnapshotSummary = {
    snapshot: snap,
    nodes,
    tip: { height: tip, rule: TIP_RULE },
    heightsReliable: heightsReliable(snap),
    consensus,
    byUserAgent: [...byUA].map(([key, count]) => ({ key, count })).sort(desc),
    byUserAgentRaw: [...byUARaw].map(([key, count]) => ({ key, count })).sort(desc),
    byImplementation: [...byImpl.values()].sort(desc),
    byVersion: [...byVersion.values()].sort(desc),
    byCountry: byCountry.sort(desc),
    byNet: byNet.sort(desc),
    byProvider: [...byProvider.values()].sort(desc),
    byOrg: byOrg.sort(desc),
    heights: [...heights.values()].sort((a, b) => (b.height ?? -1) - (a.height ?? -1)),
  }

  if (!fresh && nodes > 0) {
    if (summaryCache.size >= SUMMARY_CACHE_MAX) summaryCache.delete(summaryCache.keys().next().value!)
    summaryCache.set(snap.id, summary)
  }
  return summary
}
