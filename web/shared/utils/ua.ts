/**
 * User-agent normalisation shared by the API and the UI.
 *
 * A BCH user agent looks like "/Bitcoin Cash Node:29.0.0(EB32.0)/". The first
 * "/name:version(comments)/" segment identifies the node software; anything
 * after it (BIP14 allows nesting) is ignored.
 */

export const KNOWN_IMPLEMENTATIONS = [
  'Bitcoin Cash Node',
  'BCH Unlimited',
  'BCHD',
  'Bitcoin Verde',
  'Knuth',
  'Flowee',
  'Rapids (Flowee fork)',
] as const

const ALIASES: Array<[RegExp, string]> = [
  [/^bitcoin cash node$/i, 'Bitcoin Cash Node'],
  [/^(bch unlimited|bucash|bitcoin unlimited)$/i, 'BCH Unlimited'],
  [/^bchd$/i, 'BCHD'],
  [/^bitcoin ?verde$/i, 'Bitcoin Verde'],
  [/^(knuth|kth)$/i, 'Knuth'],
  [/^flowee( the hub)?$/i, 'Flowee'],
  // codeberg.org/JohnGalt/rapids: Flowee the Hub codebase, published as a separate project
  [/^rapids$/i, 'Rapids (Flowee fork)'],
]

/** Product names that differ from the implementation family they are grouped under. */
const PRODUCT: Array<[RegExp, string]> = []

const SHORT: Record<string, string> = {
  'Bitcoin Cash Node': 'BCHN',
  'BCH Unlimited': 'BCHU',
  'BCHD': 'BCHD',
  'Bitcoin Verde': 'Verde',
  'Knuth': 'Knuth',
  'Flowee': 'Flowee',
  'Rapids (Flowee fork)': 'Rapids',
}

export interface ParsedUserAgent {
  /** Implementation family used for share breakdowns, e.g. "Bitcoin Cash Node", or the raw name. */
  impl: string
  /** Product name for version listings, equals impl unless PRODUCT overrides it. */
  product: string
  /** Version string as advertised, e.g. "29.0.0" (empty when absent). */
  version: string
  /** Release line used for adoption curves: "29" for BCHN, "2.0" for BCHU. */
  line: string
}

export const EMPTY_UA = '(empty)'

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = (ua ?? '').trim()
  const seg = s.replace(/^\/+/, '').split('/')[0] ?? ''
  if (!seg) return { impl: EMPTY_UA, product: EMPTY_UA, version: '', line: '' }
  const colon = seg.indexOf(':')
  const name = (colon >= 0 ? seg.slice(0, colon) : seg).trim()
  const version = colon >= 0 ? seg.slice(colon + 1).replace(/\(.*$/, '').trim() : ''
  let impl = name || EMPTY_UA
  for (const [re, canonical] of ALIASES) {
    if (re.test(name)) {
      impl = canonical
      break
    }
  }
  const product = PRODUCT.find(([re]) => re.test(name))?.[1] ?? impl
  const parts = version.split('.').filter(Boolean)
  const line = impl === 'Bitcoin Cash Node' ? (parts[0] ?? '') : parts.slice(0, 2).join('.')
  return { impl, product, version, line }
}

export function implShort(impl: string): string {
  return SHORT[impl] ?? impl
}

/** Implementations tracked in the version-adoption series. */
export const VERSIONED_IMPLEMENTATIONS = ['Bitcoin Cash Node', 'BCH Unlimited']
