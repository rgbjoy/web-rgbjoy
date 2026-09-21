import { getPublicCatalog, getSeo, getInfo } from "../server/content"
import { catalogMarkdown } from '../data/catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(catalogMarkdown(await getPublicCatalog(), (await getSeo()).description, (await getInfo()).author), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
