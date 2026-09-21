import { getSettings, getPublicCatalog, getSeo, getInfo } from "../server/content"
import { catalogMarkdown } from '../data/catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getSettings()
  return new Response(catalogMarkdown(await getPublicCatalog(settings), (await getSeo(settings)).description, (await getInfo(settings)).author), {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
