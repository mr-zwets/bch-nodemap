import type { SnapshotListResponse } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<SnapshotListResponse> => {
  const q = getQuery(event)
  const net = network(event)
  const page = int(q, 'page', 1, 1, 1_000_000)
  const perPage = int(q, 'per_page', 50, 1, 500)
  const source = str(q, 'source')
  if (source && source !== 'crawler' && source !== 'cashnodes') badRequest('source must be crawler or cashnodes')
  const from = date(q, 'from')
  const to = date(q, 'to')

  const where = ['network = $1']
  const params: unknown[] = [net]
  if (source) where.push(`source = $${params.push(source)}`)
  if (from) where.push(`taken_at >= $${params.push(from)}`)
  if (to) where.push(`taken_at < $${params.push(to)}`)
  const w = where.join(' and ')

  const [items, total] = await Promise.all([
    query<SnapshotListResponse['items'][number]>(
      `select id, taken_at as "takenAt", source, reachable
         from snapshots where ${w}
        order by taken_at desc
        limit ${perPage} offset ${(page - 1) * perPage}`,
      params,
    ),
    query<{ n: number }>(`select count(*)::int as n from snapshots where ${w}`, params),
  ])
  return { network: net, page, perPage, total: total[0]?.n ?? 0, items }
})
