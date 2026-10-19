/**
 * Hosting-provider normalisation for the "Network" breakdown.
 *
 * AS organisation names differ between GeoIP vendors (the cashnodes archive
 * used MaxMind names, the crawler uses DB-IP) and between the legal entities
 * of one company (Contabo GmbH / Contabo Inc., Google LLC / Google Ireland
 * Limited, Choopa / The Constant Company / Vultr, Online S.a.s. / Scaleway).
 * Each provider is matched by case-insensitive name patterns and, as a
 * fallback, by well-known AS numbers, so series line up across sources.
 *
 * Unmatched organisations keep their own (shortened) name; there is no MISC
 * bucket. Rows without an organisation are "Unknown".
 */

interface Provider {
  label: string
  re: RegExp
  asns?: number[]
}

const PROVIDERS: Provider[] = [
  { label: 'HETZNER', re: /hetzner/i, asns: [24940, 212317, 213230, 215859] },
  { label: 'OVH', re: /\bovh/i, asns: [16276, 35540] },
  { label: 'AWS', re: /amazon|\baws\b/i, asns: [16509, 14618, 8987] },
  { label: 'GOOGLE', re: /google(?!\s*fiber)/i, asns: [15169, 396982, 43515, 19527, 36040] },
  { label: 'VULTR', re: /choopa|constant company|vultr/i, asns: [20473] },
  { label: 'DIGITALOCEAN', re: /digital ?ocean/i, asns: [14061] },
  { label: 'CONTABO', re: /contabo/i, asns: [51167, 40021, 141995] },
  { label: 'SCALEWAY', re: /scaleway|^online s\.?a\.?s\.?$/i, asns: [12876] },
  { label: 'AZURE', re: /microsoft/i, asns: [8075, 8068, 8069] },
  { label: 'AKAMAI/LINODE', re: /linode|akamai/i, asns: [63949] },
  { label: 'TERASWITCH', re: /teraswitch/i, asns: [397423] },
  { label: 'ALIBABA', re: /alibaba|aliyun/i, asns: [45102, 37963, 24429] },
  { label: 'TENCENT', re: /tencent/i, asns: [132203, 45090] },
  { label: 'ORACLE', re: /oracle/i, asns: [31898] },
  { label: 'LEASEWEB', re: /leaseweb/i, asns: [60781, 16265, 30633, 28753] },
  { label: 'IONOS', re: /ionos|1&1 internet|1and1/i, asns: [8560] },
  { label: 'NETCUP', re: /netcup/i, asns: [197540] },
  { label: 'RACKSPACE', re: /rackspace/i },
  { label: 'HOSTINGER', re: /hostinger/i },
  { label: 'NAMECHEAP', re: /namecheap/i },
  { label: 'CHERRY SERVERS', re: /cherry servers/i },
  { label: 'HIVELOCITY', re: /hivelocity/i },
  { label: 'ZENLAYER', re: /zenlayer/i },
  { label: 'WORLDSTREAM', re: /worldstream/i },
  { label: 'NFORCE', re: /nforce/i },
  { label: 'QUADRANET', re: /quadranet/i },
  { label: 'SELECTEL', re: /selectel/i },
  { label: 'COMCAST', re: /comcast/i, asns: [7922] },
  { label: 'CHARTER', re: /charter comm|spectrum/i },
  { label: 'VERIZON', re: /verizon|^mci communications/i, asns: [701] },
  { label: 'AT&T', re: /^at&t/i, asns: [7018] },
  { label: 'DEUTSCHE TELEKOM', re: /deutsche telekom/i, asns: [3320] },
  { label: 'VODAFONE', re: /vodafone/i },
  { label: 'ORANGE', re: /^orange\b/i },
  { label: 'TELSTRA', re: /telstra/i },
]

const BY_ASN = new Map<number, string>()
for (const p of PROVIDERS) for (const a of p.asns ?? []) BY_ASN.set(a, p.label)

export const UNKNOWN_PROVIDER = 'Unknown'

const LEGAL_SUFFIX =
  /[\s,]+(llc|l\.l\.c\.|inc\.?|incorporated|gmbh|ag|b\.?v\.?|n\.?v\.?|ltd\.?|limited|pty|plc\.?|s\.?a\.?s?\.?|s\.?r\.?l\.?|sp\. z o\.o\.|d\.o\.o\.|ab|as|oy|aps|kft\.?|corp\.?|corporation|co\.?|company|ltda|pjsc|jsc|ooo|s\.?a\.? de c\.?v\.?)$/i

/** Strip legal-entity suffixes and cap the length of an AS organisation name. */
export function shortOrg(org: string): string {
  let s = org.trim()
  for (let i = 0; i < 4; i++) {
    const t = s.replace(LEGAL_SUFFIX, '').replace(/[\s,.]+$/, '')
    if (t === s || t.length < 2) break
    s = t
  }
  return s.length > 34 ? s.slice(0, 33).trimEnd() + '…' : s
}

export function providerOf(org: string | null | undefined, asn?: number | null): string {
  const o = org?.trim()
  if (o) {
    for (const p of PROVIDERS) if (p.re.test(o)) return p.label
  }
  if (asn != null) {
    const byAsn = BY_ASN.get(asn)
    if (byAsn) return byAsn
  }
  return o ? shortOrg(o) : UNKNOWN_PROVIDER
}

/** Providers with a fixed chart colour, in slot order (colour follows the entity). */
export const MAJOR_PROVIDERS = ['VULTR', 'HETZNER', 'AWS', 'OVH', 'DIGITALOCEAN', 'GOOGLE', 'CONTABO', 'SCALEWAY']

/** "/Bitcoin Cash Node:29.0.0(EB32.0)/" -> "/Bitcoin Cash Node:29.0.0/" — same as SQL regexp_replace(user_agent, '\(.*\)', ''). */
export function stripUaComment(ua: string): string {
  return ua.replace(/\(.*\)/, '')
}
