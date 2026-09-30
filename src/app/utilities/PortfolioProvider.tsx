'use client'

import { createContext, useContext } from 'react'
import { catalogExperiments, type CatalogEntry, type SiteInfo } from '../data/content'

const PortfolioContext = createContext<CatalogEntry[]>([])
const InfoContext = createContext<SiteInfo | null>(null)
export function useInfo() {
  const info = useContext(InfoContext)
  if (!info) throw new Error("Missing site info provider")
  return info
}
export function PortfolioProvider({ entries, info, children }: { entries: CatalogEntry[]; info: SiteInfo; children: React.ReactNode }) {
  return <InfoContext.Provider value={info}><PortfolioContext.Provider value={entries}>{children}</PortfolioContext.Provider></InfoContext.Provider>
}
export function usePortfolio() {
  const entries = useContext(PortfolioContext)
  return {
    projects: entries.flatMap((entry) => entry.kind === 'project' ? [{ title: entry.title, href: entry.url, year: entry.year, description: entry.description ?? undefined, tech: entry.technologies }] : []),
    experiments: catalogExperiments(entries),
  }
}

export type PortfolioProject = ReturnType<typeof usePortfolio>["projects"][number]
