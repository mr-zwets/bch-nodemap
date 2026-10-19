/**
 * Consensus / sync status of a node relative to the snapshot's tip.
 *
 * `height` is the start_height from the version message, i.e. the node's best
 * height when we connected, so 0-1 blocks of lag is normal.
 *
 *  - at_tip   within 2 blocks of the tip (or up to 6 ahead: a block found mid-crawl)
 *  - behind   3-144 blocks behind (≈ up to a day): syncing or just restarted
 *  - stalled  more than 144 blocks behind: almost certainly stuck or off consensus
 *  - unknown  no height reported, or far ahead of the tip (another chain)
 */
export type ConsensusStatus = 'at_tip' | 'behind' | 'stalled' | 'unknown'

export const CONSENSUS_STATUSES: ConsensusStatus[] = ['at_tip', 'behind', 'stalled', 'unknown']

export const AT_TIP_MAX_LAG = 2
export const BEHIND_MAX_LAG = 144
export const AHEAD_TOLERANCE = 6
/** The tip is the highest height reported by at least this many nodes. */
export const TIP_MIN_NODES = 3

export function consensusStatus(height: number | null | undefined, tip: number | null | undefined): ConsensusStatus {
  if (height == null || tip == null) return 'unknown'
  const lag = tip - height
  if (lag < -AHEAD_TOLERANCE) return 'unknown'
  if (lag <= AT_TIP_MAX_LAG) return 'at_tip'
  if (lag <= BEHIND_MAX_LAG) return 'behind'
  return 'stalled'
}

export const CONSENSUS_LABEL: Record<ConsensusStatus, string> = {
  at_tip: 'At tip',
  behind: 'Behind',
  stalled: 'Stalled',
  unknown: 'Unknown',
}

/**
 * BCH mainnet network upgrades: the last block before the new rules
 * (Bitcoin Cash Node's -upgradeNactivationheight defaults; 2022 from MTP).
 * Nodes that don't implement an upgrade stall at or shortly after it.
 */
export const NETWORK_UPGRADES: Array<{ height: number; label: string; detail: string }> = [
  { height: 740237, label: 'May 2022 upgrade', detail: 'Native introspection, bigger script integers' },
  { height: 792772, label: 'May 2023 upgrade', detail: 'CashTokens, P2SH32' },
  { height: 845890, label: 'May 2024 upgrade', detail: 'Adaptive block size limit (ABLA)' },
  { height: 898373, label: 'May 2025 upgrade', detail: 'VM limits, BigInt' },
  { height: 951144, label: 'May 2026 upgrade', detail: 'Bitops, loops, functions, P2S' },
]

/** A stall within a day (144 blocks) after an activation is attributed to that upgrade. */
const UPGRADE_WINDOW = 144

/**
 * Why/since when a node is stuck: the network upgrade it did not follow, or
 * else the approximate date of its last block (10-minute blocks back from the
 * tip at snapshot time). Null for nodes that are not stalled.
 */
export function stallLabel(
  height: number | null | undefined,
  tip: number | null | undefined,
  takenAt: string | Date,
): { label: string; detail?: string } | null {
  if (height == null || tip == null || consensusStatus(height, tip) !== 'stalled') return null
  const up = NETWORK_UPGRADES.find((u) => height >= u.height && height <= u.height + UPGRADE_WINDOW)
  if (up) return { label: up.label, detail: `${up.detail}; activated after block ${up.height.toLocaleString('en-US')}` }
  const t = new Date(new Date(takenAt).getTime() - (tip - height) * 600_000)
  return { label: `stuck since ~${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` }
}
