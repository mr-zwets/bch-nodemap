import pg from 'pg'

// int8 (bigint, count(*)) -> JS number. Every bigint we read (ids, counts,
// service bits) is far below 2^53.
pg.types.setTypeParser(20, (v: string) => Number(v))

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://nodemap@127.0.0.1:5433/nodemap',
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 20_000),
      application_name: 'bch-nodemap-web',
    })
    pool.on('error', (err) => console.error('[db] idle client error', err))
  }
  return pool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const res = await getPool().query<T>(text, params)
    return res.rows
  } catch (err) {
    console.error('[db] query failed:', (err as Error).message)
    throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  }
}
