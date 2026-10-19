import type { H3Event } from 'h3'

type Query = Record<string, unknown>

export function str(q: Query, key: string): string | undefined {
  const v = q[key]
  const s = Array.isArray(v) ? v[0] : v
  if (s == null) return undefined
  const t = String(s).trim()
  return t === '' ? undefined : t
}

export function int(q: Query, key: string, def: number, min: number, max: number): number {
  const s = str(q, key)
  if (s === undefined) return def
  const n = Number(s)
  if (!Number.isInteger(n)) badRequest(`${key} must be an integer`)
  return Math.min(max, Math.max(min, n))
}

export function oneOf<T extends string>(q: Query, key: string, allowed: readonly T[], def: T): T {
  const s = str(q, key)
  if (s === undefined) return def
  if (!(allowed as readonly string[]).includes(s)) badRequest(`${key} must be one of ${allowed.join(', ')}`)
  return s as T
}

export function date(q: Query, key: string): Date | undefined {
  const s = str(q, key)
  if (s === undefined) return undefined
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) badRequest(`${key} must be an ISO date`)
  return d
}

export function network(event: H3Event): string {
  const n = str(getQuery(event), 'network') ?? 'mainnet'
  if (!/^[a-z0-9]{1,16}$/.test(n)) badRequest('invalid network')
  return n
}

export function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}
