import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

const STATE_COOKIE = 'instagram_oauth_state'
const STATE_MAX_AGE_SECONDS = 60 * 10

function getStateSecret(): string {
  return process.env.INSTAGRAM_APP_SECRET || process.env.PAYLOAD_SECRET || 'instagram-oauth-state'
}

function signState(value: string): string {
  const signature = createHmac('sha256', getStateSecret()).update(value).digest('base64url')
  return `${value}.${signature}`
}

function verifySignedState(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null

  const value = signed.slice(0, lastDot)
  const signature = signed.slice(lastDot + 1)
  const expected = createHmac('sha256', getStateSecret()).update(value).digest('base64url')

  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return value
  } catch {
    return null
  }
}

export function createOAuthState(): string {
  return randomBytes(24).toString('base64url')
}

export function setOAuthStateCookie(response: NextResponse, state: string): void {
  response.cookies.set(STATE_COOKIE, signState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/instagram',
    maxAge: STATE_MAX_AGE_SECONDS,
  })
}

export function validateOAuthState(request: NextRequest, stateFromQuery: string): boolean {
  const cookieValue = request.cookies.get(STATE_COOKIE)?.value
  if (!cookieValue) return false

  const expected = verifySignedState(cookieValue)
  if (!expected) return false

  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(stateFromQuery)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/instagram',
    maxAge: 0,
  })
}
