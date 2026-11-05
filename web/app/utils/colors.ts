import type { ConsensusStatus } from '#shared/utils/consensus'

/** Fixed implementation -> categorical slot (colour follows the entity, never its rank). */
const IMPL_SLOT: Record<string, string> = {
  'Bitcoin Cash Node': '--s2', // orange
  'BCH Unlimited': '--s1', // blue
  'BCHD': '--impl-bchd', // BCHD logo green
  'Rapids (Flowee fork)': '--s5', // pink
  'Bitcoin Verde': '--s4', // amber
  'Knuth': '--s3', // brown
  'Flowee': '--s6', // cyan
  'Vcash': '--impl-vcash', // dark green
}

export function implVar(impl: string | undefined): string {
  return (impl && IMPL_SLOT[impl]) || '--s-other'
}
export const implColor = (impl: string | undefined) => `var(${implVar(impl)})`

export const STATUS_VAR: Record<ConsensusStatus, string> = {
  at_tip: '--good',
  behind: '--warning',
  stalled: '--critical',
  unknown: '--unknown',
}
export const statusColor = (s: ConsensusStatus) => `var(${STATUS_VAR[s]})`

export const SLOT_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8']

/** Mix two #rrggbb colours; t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '').match(/../g)?.map((h) => parseInt(h, 16)) ?? [128, 128, 128]
  const pb = b.replace('#', '').match(/../g)?.map((h) => parseInt(h, 16)) ?? [128, 128, 128]
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * n distinguishable shades of one base colour, most prominent first: the base,
 * then alternately lighter and darker steps (up to ~55% towards white/black).
 */
export function shades(base: string, n: number): string[] {
  const out = [base]
  for (let i = 1; i < n; i++) {
    const step = Math.ceil(i / 2) / Math.ceil((n - 1) / 2 || 1)
    out.push(i % 2 ? mixHex(base, '#ffffff', 0.55 * step) : mixHex(base, '#000000', 0.45 * step))
  }
  return out
}

/** Base for breakdowns that are not about implementations (country, network, …): the site's BCH green. */
export const NEUTRAL_BASE = '#0ac18e'
