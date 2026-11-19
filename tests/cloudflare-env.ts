// Stands in for `cloudflare:workers` under Vitest (aliased in vitest.config.ts):
// D1 on Node's built-in SQLite, plus the cache and R2 the server code touches.
// Tests import the handles below to inspect state and inject failures.
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

type Row = Record<string, unknown>

/** Node's SQLite behind the small query/transaction API the tests are written
 *  against. Rows come back as plain objects, and a missing row as null, the
 *  way D1's first() reports it. */
function openDatabase() {
  const db = new DatabaseSync(':memory:')
  return {
    exec: (sql: string) => db.exec(sql),
    query: (sql: string) => {
      const statement = db.prepare(sql)
      return {
        get: (...values: SQLInputValue[]) => {
          const row = statement.get(...values) as Row | undefined
          return row ? { ...row } : null
        },
        all: (...values: SQLInputValue[]) => (statement.all(...values) as Row[]).map((row) => ({ ...row })),
        run: (...values: SQLInputValue[]) => statement.run(...values),
      }
    },
    /** Wraps fn so a call runs it in one transaction, rolled back if it throws. */
    transaction: <T>(fn: () => T) => () => {
      db.exec('BEGIN')
      try {
        const result = fn()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}

export const database = openDatabase()
database.exec(readFileSync(new URL('../migrations/0001_content.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0002_projects_and_info.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0003_site_media.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0004_info_document.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0005_content_cache.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0006_availability_and_seo.sql', import.meta.url), 'utf8'))
export const cacheEntries = new Map<string, Response>()
export const cacheStats = { reads: 0, writes: 0, batches: 0, fail: false }
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => ({
  match: async (request: Request) => { if (cacheStats.fail) throw new Error('Cache unavailable'); cacheStats.reads++; return cacheEntries.get(request.url)?.clone() },
  put: async (request: Request, response: Response) => { if (cacheStats.fail) throw new Error('Cache unavailable'); cacheStats.writes++; cacheEntries.set(request.url, response.clone()) },
}) } })
export const mediaObjects = new Map<string, unknown>()
export const mediaState = { fail: false }
export const testEnv = {
  MEDIA: {
    put: async (key: string, value: unknown) => { if (mediaState.fail) throw new Error('Test storage failure'); mediaObjects.set(key, value) },
    delete: async (keys: string[]) => { for (const key of keys) mediaObjects.delete(key) },
  },
  MEDIA_PUBLIC_URL: 'https://web-rgbjoy.test',
  DASHBOARD_PASSWORD_HASH: '',
  DASHBOARD_SESSION_SECRET: '',
  DASHBOARD_LOGIN_LIMIT: { limit: async () => ({ success: true }) },
  DB: {
    prepare: (sql: string) => ({ sql, first: async () => database.query(sql).get(), bind: (...values: (string | number | null)[]) => ({ sql, values,
      run: async () => { const result = database.query(sql).run(...values); return { meta: { changes: result.changes } } },
    }) }),
    batch: async (statements: { sql: string; values?: (string | number | null)[] }[]) => { cacheStats.batches++; return database.transaction(() => statements.map(({ sql, values = [] }) => ({ results: database.query(sql).all(...values) })))() },
  },
}
/** What the server code imports as `env` from `cloudflare:workers`. */
export const env = testEnv
