export type InstagramShortLivedToken = {
  access_token: string
  user_id: string | number
}

export type InstagramLongLivedToken = {
  access_token: string
  token_type?: string
  expires_in?: number
}

export type InstagramTokenResult = {
  shortLived: InstagramShortLivedToken
  longLived: InstagramLongLivedToken | null
}

function normalizeCode(code: string): string {
  return code.replace(/#_$/, '').trim()
}

export async function exchangeCodeForShortLivedToken({
  appId,
  appSecret,
  redirectUri,
  code,
}: {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}): Promise<InstagramShortLivedToken> {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code: normalizeCode(code),
  })

  const response = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error_message' in payload
        ? String(payload.error_message)
        : typeof payload === 'object' && payload && 'error' in payload
          ? JSON.stringify(payload.error)
          : `Instagram token exchange failed (${response.status})`
    throw new Error(message)
  }

  const data =
    typeof payload === 'object' && payload && 'data' in payload && Array.isArray(payload.data)
      ? payload.data[0]
      : payload

  if (!data?.access_token) {
    throw new Error('Instagram token exchange returned no access_token')
  }

  return {
    access_token: String(data.access_token),
    user_id: data.user_id,
  }
}

export async function exchangeForLongLivedToken({
  appSecret,
  accessToken,
}: {
  appSecret: string
  accessToken: string
}): Promise<InstagramLongLivedToken | null> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: accessToken,
  })

  const response = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`)

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.access_token) {
    return null
  }

  return {
    access_token: String(payload.access_token),
    token_type: payload.token_type ? String(payload.token_type) : undefined,
    expires_in: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
  }
}

export async function exchangeInstagramCode({
  appId,
  appSecret,
  redirectUri,
  code,
}: {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}): Promise<InstagramTokenResult> {
  const shortLived = await exchangeCodeForShortLivedToken({
    appId,
    appSecret,
    redirectUri,
    code,
  })

  const longLived = await exchangeForLongLivedToken({
    appSecret,
    accessToken: shortLived.access_token,
  })

  return { shortLived, longLived }
}
