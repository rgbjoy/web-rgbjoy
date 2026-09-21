import { SITE } from "../data/site"
import { env } from 'cloudflare:workers'
import { cache } from 'react'
import { applyContentSettings, type ContentSetting, type SeoSetting, type StoredProject, type SiteInfo, type CatalogEntry } from '../data/content'

async function readSettings() {
  const [content, seo, projects, info, media] = await env.DB.batch([
    env.DB.prepare('SELECT id, hidden, title, description FROM content_settings'),
    env.DB.prepare("SELECT path, title, description FROM seo_settings WHERE path = '/'"),
    env.DB.prepare('SELECT * FROM projects ORDER BY position, id'),
    env.DB.prepare('SELECT author, email, lead, invite, link_label, body FROM site_info WHERE id = 1'),
    env.DB.prepare('SELECT kind, version FROM site_media'),
  ])
  if (!info.results[0]) throw new Error('Site info is missing; apply D1 migrations')
  return {
    media: media.results as { kind: 'icon' | 'social'; version: string }[],
    content: content.results as ContentSetting[], seo: seo.results as SeoSetting[],
    projects: (projects.results as (Omit<StoredProject, 'technologies'> & { technologies: string })[]).map(row => ({ ...row, technologies: JSON.parse(row.technologies) as string[] })),
    info: info.results[0] as SiteInfo,
  }
}

type Settings = Awaited<ReturnType<typeof readSettings>>

// React deduplicates reads during a server render. Cloudflare's named cache
// shares snapshots between requests in a location; D1 supplies the global key.
export const getSettings = cache(async (): Promise<Settings> => {
  // Non-session D1 queries use the primary, avoiding replica lag after a save.
  const state = await env.DB.prepare('SELECT revision FROM content_revision WHERE id = 1').first<{ revision: number }>()
  if (!state) throw new Error('Content revision is missing; apply D1 migrations')
  let storage: Cache | undefined
  const key = new Request(new URL(`/__content-cache/schema-1/${state.revision}`, env.MEDIA_PUBLIC_URL))
  try {
    // A named cache is internal, separate from public HTTP response caching.
    storage = await caches.open('rgbjoy-content-v1')
    const hit = await storage.match(key)
    if (hit) return await hit.json() as Settings
  } catch { console.warn('Content cache read unavailable; reading D1') }
  const settings = await readSettings()
  if (storage) {
    try {
      await storage.put(key, Response.json(settings, { headers: { 'Cache-Control': 'public, max-age=3600' } }))
    } catch { console.warn('Content cache write unavailable; using D1 result') }
  }
  return settings
})
export async function getInfo(settings?: Settings) { return (settings ?? await getSettings()).info }
export async function getPublicCatalog(snapshot?: Settings): Promise<CatalogEntry[]> {
  const settings = snapshot ?? await getSettings()
  return [
    ...settings.projects.filter(project => !project.hidden).map(project => ({
      id: project.id, kind: 'project' as const, title: project.title, url: project.url,
      year: project.year, description: project.description || null, technologies: project.technologies, keywords: [],
    })),
    ...applyContentSettings(settings.content).filter(entry => entry.kind === 'experiment'),
  ]
}
export async function getSeo(settings?: Settings) {
  const setting = (settings ?? await getSettings()).seo.find(row => row.path === '/')
  return { title: setting?.title || SITE.title, description: setting?.description || SITE.description }
}
