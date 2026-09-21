import { SITE } from "../data/site"
import { env } from 'cloudflare:workers'
import { cache } from 'react'
import { applyContentSettings, type ContentSetting, type SeoSetting, type StoredProject, type SiteInfo, type CatalogEntry } from '../data/content'

// Request-scoped deduplication; project records always come from D1.
export const getSettings = cache(async () => {
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
})
export async function getInfo() { return (await getSettings()).info }
export async function getPublicCatalog(): Promise<CatalogEntry[]> {
  const settings = await getSettings()
  return [
    ...settings.projects.filter(project => !project.hidden).map(project => ({
      id: project.id, kind: 'project' as const, title: project.title, url: project.url,
      year: project.year, description: project.description || null, technologies: project.technologies, keywords: [],
    })),
    ...applyContentSettings(settings.content).filter(entry => entry.kind === 'experiment'),
  ]
}
export async function getSeo() {
  const setting = (await getSettings()).seo.find(row => row.path === '/')
  return { title: setting?.title || SITE.title, description: setting?.description || SITE.description }
}
