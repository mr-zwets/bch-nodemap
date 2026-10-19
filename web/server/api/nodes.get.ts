import type { NodeRow, NodesResponse } from '#shared/types/api'
import { CONSENSUS_STATUSES, consensusStatus, type ConsensusStatus } from '#shared/utils/consensus'
import { parseUserAgent } from '#shared/utils/ua'
import { providerOf } from '#shared/utils/provider'

const SORTS = ['address', 'ua', 'height', 'country', 'org', 'first_seen', 'latency'] as const

/**
 * Node rows of one snapshot. Text filters run in SQL; implementation and
 * consensus-status filters need the parsed user agent / the tip, so they run
 * here (a snapshot holds hundreds to a few thousand rows).
 */
export default defineEventHandler(async (event): Promise<NodesResponse> => {
  const q = getQuery(event)
  const snap = await resolveSnapshot(str(q, 'snapshot'), network(event))
  const search = str(q, 'q')
  const country = str(q, 'country')
  const ua = str(q, 'ua')
  const uaBase = str(q, 'ua_base')
  const provider = str(q, 'provider')
  const net = str(q, 'net')
  const impl = str(q, 'impl')
  const statusParam = str(q, 'status')
  const status = statusParam?.split(',').filter(Boolean) as ConsensusStatus[] | undefined
  if (status?.some((s) => !CONSENSUS_STATUSES.includes(s))) badRequest(`status must be among ${CONSENSUS_STATUSES.join(', ')}`)
  const sort = oneOf(q, 'sort', SORTS, 'address')
  const dir = oneOf(q, 'dir', ['asc', 'desc'] as const, 'asc')
  const limit = int(q, 'limit', 5000, 1, 10_000)
  const offset = int(q, 'offset', 0, 0, 1_000_000)

  const where = ['snapshot_id = $1']
  const params: unknown[] = [snap.id]
  const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => '\\' + m)}%`
  if (search) {
    const p = `$${params.push(like(search))}`
    where.push(
      `(address ilike ${p} or hostname ilike ${p} or user_agent ilike ${p} or org ilike ${p}
        or city ilike ${p} or country ilike ${p} or ('AS' || asn::text) ilike ${p})`,
    )
  }
  if (country) where.push(`country = $${params.push(country.toUpperCase())}`)
  if (ua) where.push(`user_agent ilike $${params.push(like(ua))}`)
  if (uaBase) where.push(`regexp_replace(user_agent, '\\(.*\\)', '') = $${params.push(uaBase)}`)
  if (net) where.push(`net = $${params.push(net)}`)

  type Row = Omit<NodeRow, 'impl' | 'version' | 'status' | 'provider'>
  const [tip, rows] = await Promise.all([
    snapshotTip(snap.id),
    query<Row>(
      `select address, port, net, protocol_version as "protocolVersion", user_agent as "userAgent",
              services, height, first_seen as "firstSeen", latency_ms as "latencyMs", hostname,
              country, city, lat, lon, asn, org
         from snapshot_nodes where ${where.join(' and ')}`,
      params,
    ),
  ])

  let nodes: NodeRow[] = rows.map((r) => {
    const p = parseUserAgent(r.userAgent)
    return { ...r, impl: p.impl, version: p.version, provider: providerOf(r.org, r.asn), status: consensusStatus(r.height, tip) }
  })
  if (impl) nodes = nodes.filter((n) => n.impl.toLowerCase() === impl.toLowerCase())
  if (status?.length) nodes = nodes.filter((n) => status.includes(n.status))
  if (provider) nodes = nodes.filter((n) => n.provider === provider)

  const key: Record<(typeof SORTS)[number], (n: NodeRow) => string | number | null> = {
    address: (n) => n.address,
    ua: (n) => n.userAgent,
    height: (n) => n.height,
    country: (n) => n.country,
    org: (n) => n.provider,
    first_seen: (n) => (n.firstSeen ? new Date(n.firstSeen).getTime() : null),
    latency: (n) => n.latencyMs,
  }
  const k = key[sort]
  const sign = dir === 'asc' ? 1 : -1
  nodes.sort((a, b) => {
    const x = k(a)
    const y = k(b)
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1 // nulls last
    return (x < y ? -1 : x > y ? 1 : 0) * sign || a.address.localeCompare(b.address)
  })

  setHeader(event, 'cache-control', 'public, max-age=60')
  return {
    snapshot: snap,
    tip,
    heightsReliable: heightsReliable(snap),
    total: nodes.length,
    limit,
    offset,
    nodes: nodes.slice(offset, offset + limit),
  }
})
