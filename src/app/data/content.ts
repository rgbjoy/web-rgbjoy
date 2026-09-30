import { CATALOG } from './catalog'
import { EXPERIMENTS, type Experiment } from './experiments'

export type ContentSetting = { id: string; hidden: number; title: string; description: string }
export type SeoSetting = { path: string; title: string; description: string }
export type CatalogEntry = (typeof CATALOG)[number]

/** Visible experiments with their authored metadata, under the titles and descriptions set in the dashboard. */
export function catalogExperiments(entries: CatalogEntry[]): Experiment[] {
  return entries.flatMap((entry) => {
    if (entry.kind !== 'experiment') return []
    const source = EXPERIMENTS.find((item) => item.href === new URL(entry.url).pathname)
    return source ? [{ ...source, title: entry.title, description: entry.description ?? '' }] : []
  })
}

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
