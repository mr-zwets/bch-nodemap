import type { ConsensusStatus } from '../utils/consensus'

export type SnapshotSource = 'crawler' | 'cashnodes'

export interface SnapshotMeta {
  id: number
  takenAt: string
  source: SnapshotSource
  network: string
  reachable: number
  discovered: number | null
  durationMs: number | null
}

export interface ConsensusCounts {
  at_tip: number
  behind: number
  stalled: number
  unknown: number
}

export interface CountRow {
  key: string
  count: number
}

export interface ImplementationRow extends ConsensusCounts {
  key: string
  count: number
}

export interface VersionRow extends ConsensusCounts {
  key: string
  impl: string
  version: string
  count: number
}

export interface OrgRow {
  key: string
  asn: number | null
  count: number
}

export interface ProviderRow {
  /** normalised provider label (e.g. "HETZNER") or the shortened org name */
  key: string
  count: number
  /** raw AS organisation names merged into this row */
  orgs: string[]
  asns: number[]
}

export interface HeightRow {
  height: number | null
  /** tip - height (negative when ahead); null when the node sent no height */
  lag: number | null
  status: ConsensusStatus
  count: number
}

export interface SnapshotSummary {
  snapshot: SnapshotMeta
  /** total rows in snapshot_nodes (may differ from snapshot.reachable for imports) */
  nodes: number
  tip: { height: number | null; rule: string }
  /** false for cashnodes imports: their crawler kept long-lived connections, so start heights can be stale */
  heightsReliable: boolean
  consensus: ConsensusCounts
  /** user agent with the BIP14 comment stripped, as cashnodes displayed it */
  byUserAgent: CountRow[]
  /** exact user agent strings */
  byUserAgentRaw: CountRow[]
  byImplementation: ImplementationRow[]
  byVersion: VersionRow[]
  byCountry: CountRow[]
  byNet: CountRow[]
  /** hosting provider ("Network" tab), see shared/utils/provider.ts */
  byProvider: ProviderRow[]
  /** raw AS organisation + ASN */
  byOrg: OrgRow[]
  heights: HeightRow[]
}

export interface SnapshotListResponse {
  network: string
  page: number
  perPage: number
  total: number
  items: Array<Pick<SnapshotMeta, 'id' | 'takenAt' | 'source' | 'reachable'>>
}

export interface NodeRow {
  address: string
  port: number
  net: string
  protocolVersion: number | null
  userAgent: string | null
  impl: string
  version: string
  services: number | null
  height: number | null
  status: ConsensusStatus
  firstSeen: string | null
  latencyMs: number | null
  hostname: string | null
  country: string | null
  city: string | null
  lat: number | null
  lon: number | null
  asn: number | null
  org: string | null
  /** normalised hosting provider */
  provider: string
}

export interface NodesResponse {
  snapshot: SnapshotMeta
  tip: number | null
  heightsReliable: boolean
  /** rows matching the filters (before limit/offset) */
  total: number
  limit: number
  offset: number
  nodes: NodeRow[]
}

export type HistoryMetric = 'reachable' | 'implementation' | 'version' | 'provider'
export type HistoryBucket = 'day' | 'week'

export interface HistoryPoint {
  /** bucket start, ISO */
  t: string
  source: SnapshotSource
  /** snapshots that fell into the bucket */
  snapshots: number
  /** representative snapshot (implementation/version metrics) */
  snapshotId?: number
  /** node rows in the representative snapshot (implementation/version metrics) */
  total?: number
}

export interface HistorySeries {
  key: string
  impl?: string
  /** aligned with points; counts (implementation/version) or node counts (reachable) */
  data: Array<number | null>
}

export interface HistoryResponse {
  network: string
  metric: HistoryMetric
  bucket: HistoryBucket
  from: string | null
  to: string | null
  aggregation: string
  points: HistoryPoint[]
  series: HistorySeries[]
  /** stretches with no data longer than the gap threshold; charts must break the line here */
  gaps: Array<{ from: string; to: string }>
  /** contiguous runs per data source */
  sources: Array<{ source: SnapshotSource; from: string; to: string }>
}
