import { infoDocument, validateInfoDocument, infoText } from './info-document'
import { describe, expect, test } from 'bun:test'
import { GET } from '../api/catalog/route'
import { GET as getText } from '../llms.txt/route'
import { GET as getSchema } from '../openapi.json/route'
import { GET as getPrompt } from '../prompt.md/route'
import sitemap from '../sitemap'
import { CATALOG } from './catalog'
import { EXPERIMENTS } from './experiments'
import { PROJECTS } from './projects'
import { serializeJsonLd } from './structured-data'

describe('public portfolio discovery', () => {
  test('serves the conversation guide as fetcher-compatible plain text with the full catalog', async () => {
    const response = await getPrompt()
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    const text = await response.text()
    expect(text).toContain('## Start the conversation')
    for (const entry of CATALOG) expect(text).toContain(`](${entry.url})`)
  })

  test('publishes every authored entry with unique IDs and absolute URLs', async () => {
    const response = await GET(new Request('https://rgbjoy.com/api/catalog'))
    const data = await response.json() as { profile: { alias: string }; total: number; entries: { id: string; url: string }[] }
    expect(data.profile.alias).toBe('rgbjoy')
    expect(data.total).toBe(PROJECTS.length + EXPERIMENTS.length)
    expect(new Set(data.entries.map((entry: { id: string }) => entry.id)).size).toBe(data.total)
    for (const entry of data.entries) expect(new URL(entry.url).protocol).toBe('https:')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('combines case-insensitive search terms and type filters', async () => {
    const data = await (await GET(
      new Request('https://rgbjoy.com/api/catalog?q=PAYLOAD%20next.js&kind=project'),
    )).json() as { entries: { title: string; kind: string }[]; total: number }
    expect(data.entries.map((entry: { title: string }) => entry.title)).toEqual([
      'tenniswoodsmiles.com',
    ])
    const experiments = await (await GET(
      new Request('https://rgbjoy.com/api/catalog?q=shader&kind=experiment'),
    )).json() as { entries: { title: string; kind: string }[]; total: number }
    expect(experiments.total).toBeGreaterThan(0)
    expect(
      experiments.entries.every((entry: { kind: string }) => entry.kind === 'experiment'),
    ).toBe(true)
  })

  test('returns empty results and rejects invalid filters', async () => {
    const data = await (await GET(
      new Request('https://rgbjoy.com/api/catalog?q=nonexistent-portfolio-entry'),
    )).json() as { entries: { title: string; kind: string }[]; total: number }
    expect(data.entries).toEqual([])
    expect(data.total).toBe(0)
    expect((await GET(new Request('https://rgbjoy.com/api/catalog?kind=private'))).status).toBe(400)
  })

  test('preserves unknown details and unfinished work', () => {
    expect(CATALOG.find((entry) => entry.title === 'oib.beer')?.description).toBeNull()
    expect(CATALOG.find((entry) => entry.title === 'golfisweird.com')).toMatchObject({
      year: 'Coming soon',
    })
    expect(CATALOG.find((entry) => entry.title === 'Island Generator')).toMatchObject({
      status: 'wip',
    })
  })

  test('text and sitemap stay in sync with the authored catalog', async () => {
    const text = await (await getText()).text()
    for (const entry of CATALOG) expect(text).toContain(`](${entry.url})`)
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain('https://rgbjoy.com/directory')
    for (const experiment of EXPERIMENTS)
      expect(urls).toContain(`https://rgbjoy.com${experiment.href}`)
    expect(urls.every((url) => new URL(url).hostname === 'rgbjoy.com')).toBe(true)
  })

  test('documents the working API and safely embeds authored text', async () => {
    const schema = await getSchema().json() as { paths: Record<string, { get: { operationId: string } }> }
    expect(schema.paths['/api/catalog'].get.operationId).toBe('searchPortfolio')
    const value = { description: '</script><script>alert(1)</script>' }
    expect(serializeJsonLd(value)).not.toContain('<')
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value)
  })
})

test('D1 visibility and text overrides propagate to every discovery format', async () => {
  const { database } = await import('../../../tests/cloudflare-env')
  const hidden = CATALOG.find(entry => entry.kind === 'experiment')!
  const edited = CATALOG.find(entry => entry.kind === 'project')!
  database.query('INSERT INTO content_settings (id, hidden) VALUES (?, 1)').run(hidden.id)
  database.query('UPDATE projects SET title=?,description=? WHERE id=?').run('Updated project', 'Updated description', edited.id)
  try {
    const data = await (await GET(new Request('https://rgbjoy.com/api/catalog'))).json() as { entries: { id: string; title: string; description: string }[] }
    expect(data.entries.some(entry => entry.id === hidden.id)).toBe(false)
    expect(data.entries.find(entry => entry.id === edited.id)).toMatchObject({ title: 'Updated project', description: 'Updated description' })
    for (const response of [await getText(), await getPrompt()]) {
      const text = await response.text()
      expect(text).not.toContain(`](${hidden.url})`)
      expect(text).toContain('Updated project')
    }
    expect((await sitemap()).some(entry => entry.url === hidden.url)).toBe(false)
  } finally {
    database.exec('DELETE FROM content_settings')
    database.query('UPDATE projects SET title=?,description=? WHERE id=?').run(edited.title, edited.description ?? '', edited.id)
  }
})

test('dashboard rejects anonymous and forged identity requests', async () => {
  const { GET, POST } = await import('../dashboard/api/route')
  const request = new Request('https://rgbjoy.com/dashboard/api', { headers: { 'Cf-Access-Authenticated-User-Email': 'tom@rgbjoy.com', 'Cf-Access-Jwt-Assertion': 'forged' } })
  expect((await GET(request)).status).toBe(401)
  expect((await POST(request)).status).toBe(401)
})

test('password login issues a protected session and rejects forged sessions, origins and excessive attempts', async () => {
  const { testEnv } = await import('../../../tests/cloudflare-env')
  const { createHash } = await import('node:crypto')
  const { POST: login } = await import('../dashboard/login/route')
  const { POST: logout } = await import('../dashboard/logout/route')
  const { authorizeDashboard } = await import('../server/dashboard-auth')
  testEnv.DASHBOARD_PASSWORD_HASH = createHash('sha256').update('test-only-password').digest('hex')
  testEnv.DASHBOARD_SESSION_SECRET = 'test-only-signing-key-with-at-least-thirty-two-bytes'
  const request = (password: string, origin = 'https://rgbjoy.com') => new Request('https://rgbjoy.com/dashboard/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  })
  try {
    expect((await login(request('wrong'))).status).toBe(401)
    expect((await login(request('test-only-password', 'https://evil.example'))).status).toBe(403)
    const response = await login(request('test-only-password'))
    expect(response.status).toBe(200)
    const cookie = response.headers.get('Set-Cookie')!
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) expect(cookie).toContain(attribute)
    const authenticated = new Request('https://rgbjoy.com/dashboard/api', { headers: { Cookie: cookie.split(';')[0] } })
    expect(await authorizeDashboard(authenticated)).toBe(true)
    expect(await authorizeDashboard(new Request(authenticated, { headers: { Cookie: cookie.split(';')[0] + 'tampered' } }))).toBe(false)
    testEnv.DASHBOARD_SESSION_SECRET = 'rotated-key-invalidates-existing-sessions'
    expect(await authorizeDashboard(authenticated)).toBe(false)
    testEnv.DASHBOARD_LOGIN_LIMIT.limit = async () => ({ success: false })
    expect((await login(request('test-only-password'))).status).toBe(429)
    const signedOut = await logout(new Request('https://rgbjoy.com/dashboard/logout', { method: 'POST', headers: { Origin: 'https://rgbjoy.com' } }))
    expect(signedOut.headers.get('Set-Cookie')).toContain('Max-Age=0')
  } finally {
    testEnv.DASHBOARD_PASSWORD_HASH = ''
    testEnv.DASHBOARD_SESSION_SECRET = ''
    testEnv.DASHBOARD_LOGIN_LIMIT.limit = async () => ({ success: true })
  }
})

test('dashboard creates, edits, hides and deletes D1 projects and saves Info', async () => {
  const { testEnv, database } = await import('../../../tests/cloudflare-env')
  const { POST: save, GET: dashboard } = await import('../dashboard/api/route')
  const { createSession, SESSION_COOKIE } = await import('../server/dashboard-auth')
  const { getInfo } = await import('../server/content')
  testEnv.DASHBOARD_PASSWORD_HASH = 'configured-for-session-test'
  testEnv.DASHBOARD_SESSION_SECRET = 'test-only-session-secret-at-least-thirty-two-bytes'
  const token = await createSession()
  const cookie = `${SESSION_COOKIE}=${token}`
  const write = (body: unknown, origin = 'https://rgbjoy.com') => save(new Request('https://rgbjoy.com/dashboard/api', {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
  const oldInfo = await getInfo()
  let id = ''
  try {
    const project = { type: 'project', id: null, title: 'A new project', url: 'https://example.com/new', year: '2027', description: 'Created through the dashboard.', technologies: ['TypeScript'], hidden: false }
    expect((await write({ ...project, url: 'javascript:alert(1)' })).status).toBe(400)
    expect((await write(project, 'https://evil.example')).status).toBe(403)
    const created = await write(project)
    expect(created.status).toBe(201)
    id = ((await created.json()) as { id: string }).id
    const listing = await (await GET(new Request('https://rgbjoy.com/api/catalog?q=new%20project'))).json() as { entries: { id: string }[] }
    expect(listing.entries.some(entry => entry.id === id)).toBe(true)
    expect(await (await getPrompt()).text()).toContain('https://example.com/new')
    expect((await write({ ...project, id, title: 'Revised project', hidden: true })).status).toBe(200)
    const hidden = await (await GET(new Request('https://rgbjoy.com/api/catalog'))).json() as { entries: { id: string }[] }
    expect(hidden.entries.some(entry => entry.id === id)).toBe(false)
    const admin = await (await dashboard(new Request('https://rgbjoy.com/dashboard/api', { headers: { Cookie: cookie } }))).json() as { projects: { id: string; hidden: number }[] }
    expect(admin.projects.find(project => project.id === id)?.hidden).toBe(1)
    expect((await write({ type: 'delete-project', id })).status).toBe(200)
    expect((await write({ ...project, id })).status).toBe(404)
    expect((await write({ type: 'info', document: infoDocument({ ...oldInfo, body: null, lead: 'Updated introduction.' }) })).status).toBe(200)
    expect((await getInfo()).lead).toStartWith('Updated introduction.')
    expect((await getInfo()).author).toBe(oldInfo.author)
    const profile = await (await GET(new Request('https://rgbjoy.com/api/catalog'))).json() as { profile: { name: string } }
    expect(profile.profile.name).toBe(oldInfo.author)
    expect(await (await getText()).text()).toContain(oldInfo.author)
  } finally {
    if (id) database.query('DELETE FROM projects WHERE id=?').run(id)
    database.query('UPDATE site_info SET body=NULL,author=?,email=?,lead=?,invite=?,link_label=? WHERE id=1').run(oldInfo.author,oldInfo.email,oldInfo.lead,oldInfo.invite,oldInfo.link_label)
    testEnv.DASHBOARD_PASSWORD_HASH = ''
    testEnv.DASHBOARD_SESSION_SECRET = ''
  }
})

test('SEO reads only the single site-wide record', async () => {
  const { database } = await import('../../../tests/cloudflare-env')
  const { getSeo, getSettings } = await import('../server/content')
  const original = await getSeo()
  try {
    database.query("UPDATE seo_settings SET title='Global title',description='Global description' WHERE path='/'").run()
    expect(await getSeo()).toEqual({ title: 'Global title', description: 'Global description' })
    expect((await getSettings()).seo.map(row => row.path)).toEqual(['/'])
    const data = await (await GET(new Request('https://rgbjoy.com/api/catalog'))).json() as { profile: { description: string } }
    expect(data.profile.description).toBe('Global description')
  } finally { database.query("UPDATE seo_settings SET title=?,description=? WHERE path='/'").run(original.title,original.description) }
})

test('image validation checks PNG pixels, dimensions and corruption', async () => {
  const { normalizePng } = await import('../server/media')
  const { PNG } = await import('pngjs')
  const png = new PNG({ width: 32, height: 32 })
  png.data.fill(255)
  const bytes = PNG.sync.write(png)
  const buffer = Uint8Array.from(bytes).buffer
  const output = normalizePng(buffer, 32, 32)
  expect(PNG.sync.read(output).width).toBe(32)
  expect(() => normalizePng(buffer, 512, 512)).toThrow()
  expect(() => normalizePng(new TextEncoder().encode('<svg onload="alert(1)"></svg>').buffer, 32, 32)).toThrow()
  const corrupted = Uint8Array.from(bytes); corrupted[corrupted.length - 1] ^= 255
  expect(() => normalizePng(corrupted.buffer, 32, 32)).toThrow()
  const { POST: upload } = await import('../dashboard/media/route')
  expect((await upload(new Request('https://rgbjoy.com/dashboard/media?kind=icon', { method: 'POST' }))).status).toBe(401)
})


test('bio document preserves legacy copy and rejects unsafe links and unsupported nodes', () => {
  const document = infoDocument({ author: 'Name', email: 'test@example.com', lead: 'Hello.', invite: 'Please', link_label: 'contact me' })
  expect(infoText(validateInfoDocument(document).root)).toBe('Hello. Please contact me.')
  const link = document.root.children![0].children![1]
  link.url = 'javascript:alert(1)'
  expect(() => validateInfoDocument(document)).toThrow('Invalid link')
  link.url = '#contact'
  link.type = 'script'
  expect(() => validateInfoDocument(document)).toThrow('Invalid bio formatting')
  expect(() => validateInfoDocument({root: {type: 'root', children: []}})).toThrow('Invalid bio')
})

test('Lexical can reopen the migrated and validated bio document', async () => {
  const { createEditor } = await import('lexical')
  const { LinkNode } = await import('@lexical/link')
  const editor = createEditor({ nodes: [LinkNode], onError: error => { throw error } })
  const migrated = infoDocument({ author: 'Name', email: 'test@example.com', lead: 'Hello.', invite: 'Please', link_label: 'contact me' })
  const state = editor.parseEditorState(JSON.stringify(migrated))
  const validated = validateInfoDocument(state.toJSON())
  expect(infoText(validated.root)).toBe('Hello. Please contact me.')
  expect(() => editor.parseEditorState(JSON.stringify(validated))).not.toThrow()
})

test('shared cache reuses snapshots and rotates after every content table changes', async () => {
  const { database, cacheEntries, cacheStats } = await import('../../../tests/cloudflare-env')
  const { getSettings } = await import('../server/content')
  cacheEntries.clear()
  const batches = cacheStats.batches
  await getSettings()
  await getSettings()
  expect(cacheStats.batches - batches).toBe(1)
  const writes = [
    "UPDATE site_info SET lead=lead WHERE id=1",
    "UPDATE seo_settings SET title=title WHERE path='/'",
    "UPDATE projects SET hidden=hidden WHERE id=(SELECT id FROM projects LIMIT 1)",
    "INSERT INTO site_media (kind,version) VALUES ('social','test-cache-version')",
    "DELETE FROM site_media WHERE kind='social'",
    "INSERT INTO content_settings (id) VALUES ('cache-test')",
    "DELETE FROM content_settings WHERE id='cache-test'",
  ]
  for (const sql of writes) {
    const before = cacheStats.batches
    database.exec(sql)
    await getSettings()
    await getSettings()
    expect(cacheStats.batches - before).toBe(1)
  }
  // Losing the cache (expiry/eviction) only causes a fresh fill.
  cacheEntries.clear()
  const before = cacheStats.batches
  await getSettings()
  expect(cacheStats.batches - before).toBe(1)
})

test('cache failures fall back to D1 and rolled-back writes do not invalidate', async () => {
  const { database, cacheStats } = await import('../../../tests/cloudflare-env')
  const { getSettings } = await import('../server/content')
  const original = await getSettings()
  cacheStats.fail = true
  try { expect(await getSettings()).toEqual(original) } finally { cacheStats.fail = false }
  const before = cacheStats.batches
  database.exec("BEGIN; UPDATE site_info SET lead='Rolled back'; ROLLBACK;")
  expect(await getSettings()).toEqual(original)
  expect(cacheStats.batches).toBe(before)
})

test('Projects tab saves edits together and rejects invalid batches without partial writes', async () => {
  const { testEnv, database } = await import('../../../tests/cloudflare-env')
  const { POST } = await import('../dashboard/api/route')
  const { createSession, SESSION_COOKIE } = await import('../server/dashboard-auth')
  testEnv.DASHBOARD_PASSWORD_HASH = 'test-configured'
  testEnv.DASHBOARD_SESSION_SECRET = 'test-session-secret-thirty-two-characters-long'
  const cookie = `${SESSION_COOKIE}=${await createSession()}`
  const save = (projects: unknown[]) => POST(new Request('https://rgbjoy.com/dashboard/api', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://rgbjoy.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'projects', projects }) }))
  const project = { id: 'project:batch-test', isNew: true, title: 'Batch project', url: 'https://example.com', year: '2026', description: '', technologies: [], hidden: false }
  try {
    expect((await save([project, { ...project, id: 'project:bad', url: 'javascript:bad' }])).status).toBe(400)
    expect(database.query('SELECT id FROM projects WHERE id=?').get(project.id)).toBeNull()
    expect((await save([project])).status).toBe(200)
    expect((await save([{ ...project, isNew: false, hidden: true }])).status).toBe(200)
    expect(database.query('SELECT hidden FROM projects WHERE id=?').get(project.id)).toEqual({ hidden: 1 })
    const second = { ...project, id: 'project:batch-test-2', title: 'Second project' }
    expect((await save([second, { ...project, isNew: false }])).status).toBe(200)
    expect(database.query('SELECT id, position FROM projects WHERE id IN (?,?) ORDER BY position').all(project.id, second.id)).toEqual([{ id: second.id, position: 0 }, { id: project.id, position: 1 }])
    expect((await save([{ ...second, isNew: false, removed: true }, { ...project, isNew: false }])).status).toBe(200)
    expect(database.query('SELECT position FROM projects WHERE id=?').get(project.id)).toEqual({ position: 0 })
    expect((await save([{ ...project, isNew: false, removed: true }])).status).toBe(200)
    expect(database.query('SELECT id FROM projects WHERE id=?').get(project.id)).toBeNull()
  } finally {
    database.query('DELETE FROM projects WHERE id IN (?,?)').run(project.id, 'project:batch-test-2')
    testEnv.DASHBOARD_PASSWORD_HASH = ''; testEnv.DASHBOARD_SESSION_SECRET = ''
  }
})

test('SEO tab saves text and both images together, preserving published data on upload failure', async () => {
  const { testEnv, database, mediaObjects, mediaState } = await import('../../../tests/cloudflare-env')
  const { POST } = await import('../dashboard/media/route')
  const { createSession, SESSION_COOKIE } = await import('../server/dashboard-auth')
  const { IMAGE_VARIANTS } = await import('./media')
  const { PNG } = await import('pngjs')
  testEnv.DASHBOARD_PASSWORD_HASH = 'test-configured'
  testEnv.DASHBOARD_SESSION_SECRET = 'test-session-secret-thirty-two-characters-long'
  const cookie = `${SESSION_COOKIE}=${await createSession()}`
  const original = database.query("SELECT title,description FROM seo_settings WHERE path='/'").get() as { title: string; description: string }
  const originalMedia = database.query('SELECT kind,version FROM site_media').all() as {kind:string;version:string}[]
  const save = (data: FormData) => POST(new Request('https://rgbjoy.com/dashboard/media?kind=seo', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://rgbjoy.com' }, body: data }))
  try {
    const data = new FormData()
    data.set('title', 'Saved together'); data.set('description', 'Unified SEO save')
    for (const [kind, variants] of Object.entries(IMAGE_VARIANTS)) for (const variant of variants) {
      const png = new PNG({ width: variant.width, height: variant.height }); png.data.fill(255)
      data.set(`${kind}:${variant.file}`, new Blob([Uint8Array.from(PNG.sync.write(png))], {type:'image/png'}), variant.file)
    }
    mediaState.fail = true
    expect((await save(data)).status).toBe(500)
    expect(database.query("SELECT title,description FROM seo_settings WHERE path='/'").get()).toEqual(original)
    expect(database.query('SELECT kind,version FROM site_media').all()).toEqual(originalMedia)
    mediaState.fail = false
    expect((await save(data)).status).toBe(200)
    expect(database.query("SELECT title FROM seo_settings WHERE path='/'").get()).toEqual({title:'Saved together'})
    const rows = database.query('SELECT kind,version FROM site_media').all() as {kind:string;version:string}[]
    expect(rows.length).toBe(2)
    expect(rows[0].version).toBe(rows[1].version)
    expect(mediaObjects.size).toBe(4)
  } finally {
    mediaState.fail = false; mediaObjects.clear()
    database.query("UPDATE seo_settings SET title=?,description=? WHERE path='/'").run(original.title,original.description)
    database.exec('DELETE FROM site_media')
    for (const row of originalMedia) database.query('INSERT INTO site_media (kind,version) VALUES (?,?)').run(row.kind,row.version)
    testEnv.DASHBOARD_PASSWORD_HASH = ''; testEnv.DASHBOARD_SESSION_SECRET = ''
  }
})
