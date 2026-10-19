const nf = new Intl.NumberFormat('en-US')
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n))
export const fmtPct = (part: number, whole: number, digits = 1) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : '—'

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().slice(0, 10)
}

export function fmtAgo(iso: string | Date | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`
  if (s < 86400 * 730) return `${Math.round(s / (86400 * 30.4))} months ago`
  return `${(s / (86400 * 365.25)).toFixed(1)} years ago`
}

let regionNames: Intl.DisplayNames | undefined
export function countryName(code: string | null | undefined): string {
  if (!code || code === 'unknown') return 'Unknown'
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export const NET_LABEL: Record<string, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  onion: 'Tor (onion)',
  i2p: 'I2P',
  cjdns: 'CJDNS',
}

export function endpoint(address: string, port: number): string {
  return address.includes(':') && !address.endsWith('.onion') ? `[${address}]:${port}` : `${address}:${port}`
}

/** ISO 3166-1 alpha-2 -> flag emoji (regional indicator pair); '' for anything else. */
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
