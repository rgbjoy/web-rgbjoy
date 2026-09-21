import { mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

export const database = new Database(':memory:')
database.exec(readFileSync(new URL('../migrations/0001_content.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0002_projects_and_info.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0003_site_media.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0004_info_document.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0005_content_cache.sql', import.meta.url), 'utf8'))
export const cacheEntries = new Map<string, Response>()
export const cacheStats = { reads: 0, writes: 0, batches: 0, fail: false }
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => ({
  match: async (request: Request) => { if (cacheStats.fail) throw new Error('Cache unavailable'); cacheStats.reads++; return cacheEntries.get(request.url)?.clone() },
  put: async (request: Request, response: Response) => { if (cacheStats.fail) throw new Error('Cache unavailable'); cacheStats.writes++; cacheEntries.set(request.url, response.clone()) },
}) } })
export const testEnv = {
  MEDIA_PUBLIC_URL: 'https://web-rgbjoy.test',
  DASHBOARD_PASSWORD_HASH: '',
  DASHBOARD_SESSION_SECRET: '',
  DASHBOARD_LOGIN_LIMIT: { limit: async () => ({ success: true }) },
  DB: {
    prepare: (sql: string) => ({ sql, first: async () => database.query(sql).get(), bind: (...values: (string | number | null)[]) => ({
      run: async () => { const result = database.query(sql).run(...values); return { meta: { changes: result.changes } } },
    }) }),
    batch: async (statements: { sql: string }[]) => { cacheStats.batches++; return statements.map(({ sql }) => ({ results: database.query(sql).all() })) },
  },
}
mock.module('cloudflare:workers', () => ({ env: testEnv }))
