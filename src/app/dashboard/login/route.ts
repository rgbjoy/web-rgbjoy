import { env } from 'cloudflare:workers'
import { createSession, sessionCookie, verifyPassword } from '../../server/dashboard-auth'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
export async function POST(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403, headers })
  if (!env.DASHBOARD_PASSWORD_HASH || !env.DASHBOARD_SESSION_SECRET) return Response.json({ error: 'Dashboard login is not configured yet.' }, { status: 503, headers })
  const { success } = await env.DASHBOARD_LOGIN_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })
  if (!success) return Response.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } })
  const reader = request.body?.getReader()
  if (!reader) return Response.json({ error: 'Enter your password.' }, { status: 400, headers })
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 1024) { await reader.cancel(); return Response.json({ error: 'Request too large.' }, { status: 413, headers }) }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  let password: unknown
  try { password = JSON.parse(text)?.password } catch { /* Return the same response for invalid input. */ }
  if (typeof password !== 'string' || !await verifyPassword(password)) return Response.json({ error: 'Incorrect password.' }, { status: 401, headers })
  return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': sessionCookie(await createSession()) } })
}
