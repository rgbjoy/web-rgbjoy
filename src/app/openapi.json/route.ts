import { SITE } from '../data/site'

export const dynamic = 'force-static'

const string = { type: 'string' }
const strings = { type: 'array', items: string }

export function GET() {
  return Response.json(
    {
      openapi: '3.1.0',
      info: {
        title: 'rgbjoy public portfolio API',
        version: '1.0.0',
        description:
          "Read Tom Fletcher's public profile, projects, and experiments. No authentication required. All search terms must match; matching is case-insensitive. Content is authored portfolio data, not a crawl of external project sites.",
      },
      servers: [{ url: SITE.url }],
      paths: {
        '/api/catalog': {
          get: {
            operationId: 'searchPortfolio',
            summary: 'Read or search rgbjoy projects and experiments',
            parameters: [
              {
                name: 'q',
                in: 'query',
                description:
                  'Words to match across titles, descriptions, technologies, and keywords.',
                schema: string,
              },
              {
                name: 'kind',
                in: 'query',
                schema: { type: 'string', enum: ['project', 'experiment'] },
              },
            ],
            responses: {
              '200': {
                description:
                  'Public profile and all matching entries; an empty search result has total 0 and entries [].',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['version', 'profile', 'source', 'total', 'entries'],
                      properties: {
                        version: string,
                        profile: {
                          type: 'object',
                          required: ['name', 'alias', 'url', 'description', 'profiles'],
                          properties: {
                            name: string,
                            alias: string,
                            url: string,
                            description: string,
                            profiles: {
                              type: 'array',
                              items: {
                                type: 'object',
                                required: ['name', 'url'],
                                properties: { name: string, url: string },
                              },
                            },
                          },
                        },
                        source: string,
                        total: { type: 'integer', minimum: 0 },
                        entries: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: [
                              'id',
                              'kind',
                              'title',
                              'url',
                              'description',
                              'technologies',
                              'keywords',
                            ],
                            properties: {
                              id: string,
                              kind: { type: 'string', enum: ['project', 'experiment'] },
                              title: string,
                              url: { type: 'string', format: 'uri' },
                              description: { type: ['string', 'null'] },
                              year: {
                                type: 'string',
                                description:
                                  'Projects only: year or authored status label such as Coming soon or Ongoing.',
                              },
                              category: string,
                              publishedMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
                              status: { type: 'string', enum: ['live', 'wip', 'archived'] },
                              technologies: strings,
                              keywords: strings,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              '400': {
                description: 'Invalid kind filter.',
                content: {
                  'application/json': {
                    schema: { type: 'object', required: ['error'], properties: { error: string } },
                  },
                },
              },
            },
          },
        },
      },
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}
