import { mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

export const database = new Database(':memory:')
database.exec(readFileSync(new URL('../migrations/0001_content.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0002_projects_and_info.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0003_site_media.sql', import.meta.url), 'utf8'))
database.exec(readFileSync(new URL('../migrations/0004_info_document.sql', import.meta.url), 'utf8'))
export const testEnv = {
  DASHBOARD_PASSWORD_HASH: '',
  DASHBOARD_SESSION_SECRET: '',
  DASHBOARD_LOGIN_LIMIT: { limit: async () => ({ success: true }) },
  DB: {
    prepare: (sql: string) => ({ sql, bind: (...values: (string | number | null)[]) => ({
      run: async () => { const result = database.query(sql).run(...values); return { meta: { changes: result.changes } } },
    }) }),
    batch: async (statements: { sql: string }[]) => statements.map(({ sql }) => ({ results: database.query(sql).all() })),
  },
}
mock.module('cloudflare:workers', () => ({ env: testEnv }))
