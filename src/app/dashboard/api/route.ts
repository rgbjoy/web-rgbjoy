import { validateInfoDocument, infoText } from '../../data/info-document'
import { env } from 'cloudflare:workers'
import { getSettings } from '../../server/content'
import { authorizeDashboard } from '../../server/dashboard-auth'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })

export async function GET(request: Request) {
  if (!await authorizeDashboard(request)) return json({ error: 'Sign in to manage this site.' }, 401)
  return json({ ...await getSettings() })
}

export async function POST(request: Request) {
  if (!await authorizeDashboard(request)) return json({ error: 'Sign in to manage this site.' }, 401)
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin.' }, 403)
  // Read a bounded stream even if Content-Length was omitted or forged.
  const reader = request.body?.getReader()
  if (!reader) return json({ error: 'Missing body.' }, 400)
  let text = ''
  let size = 0
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 16384) { await reader.cancel(); return json({ error: 'Request too large.' }, 413) }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  let body: Record<string, unknown>
  try { body = JSON.parse(text) } catch { return json({ error: 'Invalid JSON.' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid settings.' }, 400)
  const string = (key: string, max: number, required = false) => {
    const value = body[key]
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid ${key}.`)
    return value.trim()
  }
  try {
    if (body.type === 'delete-project') {
      const id = string('id', 200, true)
      const result = await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
      return result.meta.changes ? json({ ok: true }) : json({ error: 'Project not found.' }, 404)
    }
    if (body.type === 'project') {
      const title = string('title', 200, true)
      const url = string('url', 2000, true)
      try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() }
      catch { return json({ error: 'Use an http or https project URL without credentials.' }, 400) }
      const year = string('year', 100)
      const description = string('description', 2000)
      if (!Array.isArray(body.technologies) || body.technologies.length > 30 || body.technologies.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) return json({ error: 'Use up to 30 technology names, each under 80 characters.' }, 400)
      if (typeof body.hidden !== 'boolean') return json({ error: 'Invalid visibility.' }, 400)
      const technologies = JSON.stringify([...new Set((body.technologies as string[]).map(value => value.trim()))])
      if (body.id === null) {
        const id = `project:${crypto.randomUUID()}`
        await env.DB.prepare('INSERT INTO projects (id,title,url,year,description,technologies,hidden,position) VALUES (?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM projects))')
          .bind(id,title,url,year,description,technologies,Number(body.hidden)).run()
        return json({ ok: true, id }, 201)
      }
      const id = string('id', 200, true)
      const result = await env.DB.prepare("UPDATE projects SET title=?,url=?,year=?,description=?,technologies=?,hidden=?,updated_at=datetime('now') WHERE id=?")
        .bind(title,url,year,description,technologies,Number(body.hidden),id).run()
      return result.meta.changes ? json({ ok: true, id }) : json({ error: 'Project not found.' }, 404)
    }
    if (body.type === 'info') {
      const document = validateInfoDocument(body.document)
      await env.DB.prepare("UPDATE site_info SET body=?,lead=?,invite='',updated_at=datetime('now') WHERE id=1")
        .bind(JSON.stringify(document),infoText(document.root)).run()
      return json({ ok: true })
    }
    if (body.type === 'seo') {
      const id = string('id', 200, true)
      if (id !== '/') return json({ error: 'Unknown page.' }, 400)
      await env.DB.prepare(`INSERT INTO seo_settings (path,title,description) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET title=excluded.title,description=excluded.description,updated_at=datetime('now')`)
        .bind(id,string('title',200),string('description',2000)).run()
      return json({ ok: true })
    }
    return json({ error: 'Unknown settings type.' }, 400)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid ')) return json({ error: error.message }, 400)
    console.error('Dashboard save failed', error)
    return json({ error: 'Could not save. Please try again.' }, 500)
  }
}
