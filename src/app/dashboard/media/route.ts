import { env } from 'cloudflare:workers'
import { authorizeDashboard } from '../../server/dashboard-auth'
import { IMAGE_VARIANTS, type MediaKind } from '../../data/media'
import { normalizePng } from '../../server/media'

const headers = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
export async function POST(request: Request) {
  if (!await authorizeDashboard(request)) return json({ error: 'Sign in to upload images.' }, 401)
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin.' }, 403)
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind !== 'icon' && kind !== 'social') return json({ error: 'Unknown image type.' }, 400)
  const reader = request.body?.getReader()
  if (!reader) return json({ error: 'Choose an image.' }, 400)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 6 * 1024 * 1024) { await reader.cancel(); return json({ error: 'Image upload is too large.' }, 413) }
    chunks.push(value)
  }
  const normalized: { file: string; bytes: Buffer }[] = []
  try {
    const body = Buffer.concat(chunks)
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' } }).formData()
    for (const variant of IMAGE_VARIANTS[kind as MediaKind]) {
      const file = form.get(variant.file)
      if (!(file instanceof File)) return json({ error: 'Missing image sizes. Select the image again.' }, 400)
      normalized.push({ file: variant.file, bytes: normalizePng(await file.arrayBuffer(), variant.width, variant.height) })
    }
  } catch (error) { console.warn('Image validation failed', error instanceof Error ? error.message : 'decode error'); return json({ error: 'Invalid image. Choose a PNG, JPEG, or WebP and try again.' }, 400) }
  const version = crypto.randomUUID()
  try {
    for (const image of normalized) await env.MEDIA.put(`${version}/${image.file}`, image.bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } })
    await env.DB.prepare("INSERT INTO site_media (kind,version) VALUES (?,?) ON CONFLICT(kind) DO UPDATE SET version=excluded.version,updated_at=datetime('now')").bind(kind,version).run()
    return json({ ok: true, version })
  } catch (error) {
    // Only remove this failed upload; existing live images remain untouched.
    await env.MEDIA.delete(normalized.map(image => `${version}/${image.file}`)).catch(() => {})
    console.error('Image upload failed', error)
    return json({ error: 'Could not save the image. Please try again.' }, 500)
  }
}
