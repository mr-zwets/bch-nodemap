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
