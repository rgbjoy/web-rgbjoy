import { NextRequest, NextResponse } from 'next/server'
import { getInstagramConfig } from '@/utilities/instagram/config'
import { exchangeInstagramCode } from '@/utilities/instagram/exchange'
import {
  renderInstagramErrorPage,
  renderInstagramSuccessPage,
} from '@/utilities/instagram/successPage'
import { clearOAuthStateCookie, validateOAuthState } from '@/utilities/instagram/state'

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error')
  const errorDescription = request.nextUrl.searchParams.get('error_description')

  if (error) {
    const message = errorDescription || error
    return htmlResponse(renderInstagramErrorPage(message), 400)
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return htmlResponse(renderInstagramErrorPage('Missing authorization code or state.'), 400)
  }

  if (!validateOAuthState(request, state)) {
    return htmlResponse(renderInstagramErrorPage('Invalid or expired OAuth state. Try connecting again.'), 400)
  }

  try {
    const config = getInstagramConfig()
    const result = await exchangeInstagramCode({
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
      code,
    })

    const response = htmlResponse(renderInstagramSuccessPage(result))
    clearOAuthStateCookie(response)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    const response = htmlResponse(renderInstagramErrorPage(message), 500)
    clearOAuthStateCookie(response)
    return response
  }
}
