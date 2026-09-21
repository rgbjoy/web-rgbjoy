'use client'

import { createContext, useContext } from 'react'
import type { CatalogEntry, SiteInfo } from '../data/content'
import { EXPERIMENTS } from '../data/experiments'

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
    experiments: entries.flatMap((entry) => {
      if (entry.kind !== 'experiment') return []
      const source = EXPERIMENTS.find((item) => item.href === new URL(entry.url).pathname)
      return source ? [{ ...source, title: entry.title, description: entry.description ?? '' }] : []
    }),
  }
}
