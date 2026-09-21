import { CATALOG, PUBLIC_PROFILE } from './catalog'
import { SITE } from './site'

export const SITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${SITE.url}/#person`,
      name: SITE.author,
      alternateName: PUBLIC_PROFILE.alias,
      url: SITE.url,
      description: SITE.description,
      sameAs: PUBLIC_PROFILE.profiles.map(({ url }) => url),
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      author: { '@id': `${SITE.url}/#person` },
    },
  ],
}

export const DIRECTORY_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: `${SITE.url}/directory`,
  name: 'rgbjoy projects and experiments',
  about: { '@id': `${SITE.url}/#person` },
  isPartOf: { '@id': `${SITE.url}/#website` },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: CATALOG.length,
    itemListElement: CATALOG.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'CreativeWork',
        name: entry.title,
        url: entry.url,
        ...(entry.description ? { description: entry.description } : {}),
        keywords: [...entry.technologies, ...entry.keywords],
      },
    })),
  },
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
