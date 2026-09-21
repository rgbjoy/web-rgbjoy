import { sessionCookie } from '../../server/dashboard-auth'
export async function POST(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response(null, { status: 403 })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie('', true) } })
}
