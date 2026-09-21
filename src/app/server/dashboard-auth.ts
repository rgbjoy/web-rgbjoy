import { env } from 'cloudflare:workers'
import { timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = '__Host-rgbjoy-dashboard'
const SESSION_SECONDS = 8 * 60 * 60
const issuer = 'rgbjoy-dashboard'

export async function verifyPassword(password: string) {
  if (!env.DASHBOARD_PASSWORD_HASH || !env.DASHBOARD_SESSION_SECRET) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const expected = env.DASHBOARD_PASSWORD_HASH
  return expected.length === actual.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export async function createSession() {
  if (!env.DASHBOARD_SESSION_SECRET) throw new Error('Dashboard is not configured')
  return new SignJWT({ role: 'owner' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer(issuer).setAudience(issuer)
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(new TextEncoder().encode(env.DASHBOARD_SESSION_SECRET))
}

export function sessionCookie(token: string, clear = false) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}`
}

export async function authorizeDashboard(request: Request) {
  if (!env.DASHBOARD_SESSION_SECRET || !env.DASHBOARD_PASSWORD_HASH) return false
  const token = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.DASHBOARD_SESSION_SECRET), {
      issuer, audience: issuer, algorithms: ['HS256'],
    })
    return payload.role === 'owner'
  } catch { return false }
}
