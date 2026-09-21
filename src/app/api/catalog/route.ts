import { PUBLIC_PROFILE, searchCatalog } from '../../data/catalog'
import { SITE } from '../../data/site'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  if (kind !== null && kind !== 'project' && kind !== 'experiment') {
    return Response.json(
      { error: 'kind must be project or experiment' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
  const entries = searchCatalog(params.get('q') ?? '', kind ?? undefined)
  return Response.json(
    {
      version: '1.0',
      profile: PUBLIC_PROFILE,
      source: `${SITE.url}/directory`,
      total: entries.length,
      entries,
    },
    { headers },
  )
}
