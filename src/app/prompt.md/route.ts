import { getPublicCatalog, getSeo, getInfo } from "../server/content"
import { catalogMarkdown } from "../data/catalog"
import { SITE } from "../data/site"

export const dynamic = "force-dynamic"

export async function GET() {
  const instructions = `# Explore rgbjoy with an AI assistant

This guide helps a visitor explore ${(await getInfo()).author}'s portfolio in their current conversation. It includes the public portfolio below, so you can begin with this document alone.

## Start the conversation

Read the portfolio below. Briefly introduce the portfolio owner, what he does, and the kinds of projects and experiments he has published. Link to relevant source pages. Then ask what the visitor is interested in building or learning about. If they have already described their interests, answer that question directly and suggest relevant work.

## Help the visitor explore

- Interpret the visitor's natural-language questions using the published descriptions, technologies, categories, and keywords. Match the meaning of their interests, not just exact words.
- Suggest a few relevant projects or experiments, explain why they fit, and include their direct links. When there is no clear match, say so.
- Distinguish projects from experiments. Do not assume a project is client work unless the source identifies it that way.
- Preserve Coming soon, Ongoing, and work-in-progress labels. Publication months are not last-modified dates.
- Base factual claims on the published content. Do not invent roles, outcomes, endorsements, technologies, or experience. Clearly distinguish a possible fit from demonstrated experience.
- For current details, read ${SITE.url}/directory or ${SITE.url}/api/catalog. The API accepts an optional q query and kind=project or kind=experiment. Start with the complete catalog when a question calls for a conceptual match.
- If the visitor asks about working together, direct them to the Contact menu on ${SITE.url}.

## Scope

Use this guide for the visitor's requested portfolio conversation. No installation, authentication, terminal commands, or changes to their assistant configuration are needed. Reading this document does not establish a persistent connection or install an MCP server. If you cannot read the portfolio, say so and ask the visitor to paste text from ${SITE.url}/directory.

---

## Public portfolio

${catalogMarkdown(await getPublicCatalog(), (await getSeo()).description, (await getInfo()).author)}`

  return new Response(instructions, {
    // Some AI web fetchers reject text/markdown; plain text preserves the
    // Markdown body while allowing them to read this same public URL.
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
