import { CATALOG } from './catalog'

export type ContentSetting = { id: string; hidden: number; title: string; description: string }
export type SeoSetting = { path: string; title: string; description: string }
export type CatalogEntry = (typeof CATALOG)[number]

export function applyContentSettings(settings: ContentSetting[], includeHidden = false) {
  const byId = new Map(settings.map((setting) => [setting.id, setting]))
  return CATALOG.flatMap((entry) => {
    const setting = byId.get(entry.id)
    if (setting?.hidden && !includeHidden) return []
    return [{ ...entry, title: setting?.title || entry.title, ...(setting?.description ? { description: setting.description } : {}) }]
  })
}

export type StoredProject = {
  id: string; title: string; url: string; year: string; description: string;
  technologies: string[]; hidden: number; position: number
}
export type SiteInfo = { body?: string | null; author: string; email: string; lead: string; invite: string; link_label: string; available_for_work: number }
