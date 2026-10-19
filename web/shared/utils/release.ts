/**
 * Release tagging: compare an advertised version with the newest official
 * release of its implementation (see server/utils/releases.ts).
 */

export interface Release {
  /** normalised version, e.g. "29.2.0" */
  version: string
  tag: string
  releasedAt: string | null
  url: string
}

/** implementation (as in parseUserAgent().impl) -> newest release */
export type ReleaseMap = Record<string, Release>

export type ReleaseTag = 'latest' | 'dev' | 'out-of-consensus' | null

/**
 * Oldest version per implementation that implements the current network
 * upgrade; older versions reject valid blocks and fall off the chain.
 * `min: null` = no published release supports the current rules.
 * Update this when a network upgrade activates.
 */
export const CONSENSUS_MIN: Record<string, { min: string | null; reason: string }> = {
  'Bitcoin Cash Node': {
    min: '29.0.0',
    reason: 'Bitcoin Cash Node before v29.0.0 does not implement the May 15, 2026 network upgrade',
  },
  'BCH Unlimited': {
    min: null,
    reason: 'No BCH Unlimited release implements the May 2025 and May 2026 network upgrades',
  },
}

export function outOfConsensus(impl: string, version: string): string | null {
  const rule = CONSENSUS_MIN[impl]
  if (!rule || !version || !parts(version).length) return null
  if (rule.min === null || compareVersions(version, rule.min) < 0) return rule.reason
  return null
}

/** "BCHunlimited2.1.0.0" / "v29.2.0" -> [2,1,0,0] / [29,2,0] */
function parts(v: string): number[] {
  const m = v.match(/\d+(\.\d+)*/)
  return m ? m[0].split('.').map(Number) : []
}

/** Numeric compare; missing trailing parts count as 0, so 2.1.0 == 2.1.0.0. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

export function normaliseVersion(tag: string): string {
  return parts(tag).join('.')
}

/**
 * "out-of-consensus" when the version predates the current network upgrade
 * (takes precedence), "latest" when equal to the newest release, "dev" when
 * newer than it (unreleased build).
 */
export function releaseTag(impl: string, version: string, releases: ReleaseMap | null | undefined): ReleaseTag {
  if (outOfConsensus(impl, version)) return 'out-of-consensus'
  const rel = releases?.[impl]
  if (!rel || !version || !parts(version).length) return null
  const c = compareVersions(version, rel.version)
  return c === 0 ? 'latest' : c > 0 ? 'dev' : null
}
