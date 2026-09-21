import { getSettings } from '../server/content'
import { mediaUrl } from '../data/media'
export async function GET(request: Request) {
  const icon = (await getSettings()).media.find(image => image.kind === 'icon')
  const path = icon ? mediaUrl(icon.version, 'icon-32.png') : '/default-favicon.ico'
  return new Response(null, { status: 302, headers: { Location: new URL(path, request.url).href, 'Cache-Control': 'no-cache' } })
}
