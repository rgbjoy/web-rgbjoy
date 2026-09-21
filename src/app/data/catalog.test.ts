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
    const response = getPrompt()
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    const text = await response.text()
    expect(text).toContain('## Start the conversation')
    for (const entry of CATALOG) expect(text).toContain(`](${entry.url})`)
  })

  test('publishes every authored entry with unique IDs and absolute URLs', async () => {
    const response = GET(new Request('https://rgbjoy.com/api/catalog'))
    const data = await response.json()
    expect(data.profile.alias).toBe('rgbjoy')
    expect(data.total).toBe(PROJECTS.length + EXPERIMENTS.length)
    expect(new Set(data.entries.map((entry: { id: string }) => entry.id)).size).toBe(data.total)
    for (const entry of data.entries) expect(new URL(entry.url).protocol).toBe('https:')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('combines case-insensitive search terms and type filters', async () => {
    const data = await GET(
      new Request('https://rgbjoy.com/api/catalog?q=PAYLOAD%20next.js&kind=project'),
    ).json()
    expect(data.entries.map((entry: { title: string }) => entry.title)).toEqual([
      'tenniswoodsmiles.com',
    ])
    const experiments = await GET(
      new Request('https://rgbjoy.com/api/catalog?q=shader&kind=experiment'),
    ).json()
    expect(experiments.total).toBeGreaterThan(0)
    expect(
      experiments.entries.every((entry: { kind: string }) => entry.kind === 'experiment'),
    ).toBe(true)
  })

  test('returns empty results and rejects invalid filters', async () => {
    const data = await GET(
      new Request('https://rgbjoy.com/api/catalog?q=nonexistent-portfolio-entry'),
    ).json()
    expect(data.entries).toEqual([])
    expect(data.total).toBe(0)
    expect(GET(new Request('https://rgbjoy.com/api/catalog?kind=private')).status).toBe(400)
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
    const text = await getText().text()
    for (const entry of CATALOG) expect(text).toContain(`](${entry.url})`)
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toContain('https://rgbjoy.com/directory')
    for (const experiment of EXPERIMENTS)
      expect(urls).toContain(`https://rgbjoy.com${experiment.href}`)
    expect(urls.every((url) => new URL(url).hostname === 'rgbjoy.com')).toBe(true)
  })

  test('documents the working API and safely embeds authored text', async () => {
    const schema = await getSchema().json()
    expect(schema.paths['/api/catalog'].get.operationId).toBe('searchPortfolio')
    const value = { description: '</script><script>alert(1)</script>' }
    expect(serializeJsonLd(value)).not.toContain('<')
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value)
  })
})
