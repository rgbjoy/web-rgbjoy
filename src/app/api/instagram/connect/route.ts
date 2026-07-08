import { NextResponse } from 'next/server'
import { buildInstagramAuthUrl, getInstagramConfig } from '@/utilities/instagram/config'
import { createOAuthState, setOAuthStateCookie } from '@/utilities/instagram/state'

export async function GET() {
  try {
    const config = getInstagramConfig()
    const state = createOAuthState()
    const authUrl = buildInstagramAuthUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
    })

    const response = NextResponse.redirect(authUrl)
    setOAuthStateCookie(response, state)
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Instagram connect failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
