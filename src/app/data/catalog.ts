import { EXPERIMENTS } from './experiments'
import { LINKS } from './links'
import { PROJECTS } from './projects'
import { SITE } from './site'

export const PUBLIC_PROFILE = {
  name: SITE.author,
  alias: 'rgbjoy',
  url: SITE.url,
  description: SITE.description,
  profiles: LINKS.map(({ title, href }) => ({ name: title, url: href })),
}

export const CATALOG = [
  ...PROJECTS.map((project) => ({
    id: `project:${new URL(project.href).hostname}`,
    kind: 'project' as const,
    title: project.title,
    url: project.href,
    description: project.description ?? null,
    year: project.year,
    technologies: project.tech ?? [],
    keywords: [] as string[],
  })),
  ...EXPERIMENTS.map((experiment) => ({
    id: `experiment:${experiment.href.split('/').pop()}`,
    kind: 'experiment' as const,
    title: experiment.title,
    url: new URL(experiment.href, SITE.url).href,
    description: experiment.description,
    category: experiment.group,
    publishedMonth: experiment.date,
    status: experiment.status,
    technologies: experiment.tech,
    keywords: experiment.keywords ?? [],
  })),
]

export function searchCatalog(query = '', kind?: 'project' | 'experiment', entries = CATALOG) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter((entry) => {
    if (kind && entry.kind !== kind) return false
    const text = [
      entry.title,
      entry.url,
      entry.description,
      ...entry.technologies,
      ...entry.keywords,
      entry.kind === 'experiment' ? entry.category : entry.year,
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

export function catalogMarkdown(entries = CATALOG, description: string = SITE.description, author: string = SITE.author) {
  return [
    `# rgbjoy — ${author}`,
    '',
    `> rgbjoy is the online identity and portfolio of ${author}. ${description}`,
    '',
    '## About this directory',
    '',
    "This directory contains the projects and interactive experiments listed on rgbjoy.com. Descriptions and technologies come from the portfolio's authored content. Missing descriptions are not inferred. Project year labels may include Coming soon or Ongoing; experiment dates are publication months, not last-modified dates.",
    '',
    '## Read and explore',
    '',
    `- [Conversation guide](${SITE.url}/prompt.md): Instructions and portfolio context for exploring rgbjoy with an AI assistant.`,
    `- [Project directory](${SITE.url}/directory): Accessible HTML with every entry.`,
    `- [JSON catalog](${SITE.url}/api/catalog): Public, read-only profile and entries. Optional q search and kind=project or kind=experiment filters.`,
    `- [OpenAPI schema](${SITE.url}/openapi.json): API request and response documentation.`,
    '',
    '## Projects and experiments',
    '',
    ...entries.flatMap((entry) => [
      `### [${entry.title}](${entry.url})`,
      '',
      entry.description ?? 'No description has been published for this project.',
      '',
      entry.kind === 'project'
        ? `Type: project. Year / status: ${entry.year}.`
        : `Type: experiment. Category: ${entry.category}. Published: ${entry.publishedMonth}. Status: ${entry.status}.`,
      ...(entry.technologies.length ? [`Technologies: ${entry.technologies.join(', ')}.`] : []),
      '',
    ]),
    '## Profiles',
    '',
    ...LINKS.map((link) => `- [${link.title}](${link.href})`),
    '',
  ].join('\n')
}
