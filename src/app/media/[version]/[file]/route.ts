import { env } from 'cloudflare:workers'
import { IMAGE_VARIANTS } from '../../../data/media'
const files: string[] = Object.values(IMAGE_VARIANTS).flat().map(variant => variant.file)
export async function GET(request: Request, context: { params: Promise<{ version: string; file: string }> }) {
  const { version, file } = await context.params
  if (!/^[a-f0-9-]{36}$/.test(version) || !files.includes(file)) return new Response('Not found', { status: 404 })
  const object = await env.MEDIA.get(`${version}/${file}`)
  if (!object) return new Response('Not found', { status: 404 })
  const headers = { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: object.httpEtag }
  if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers })
  return new Response(object.body, { headers })
}
