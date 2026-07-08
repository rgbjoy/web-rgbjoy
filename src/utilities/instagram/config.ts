import { getServerSideURL } from '@/utilities/getURL'

export type InstagramConfig = {
  appId: string
  appSecret: string
  redirectUri: string
}

export function getInstagramConfig(): InstagramConfig {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET must be set')
  }

  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI || `${getServerSideURL()}/api/instagram/callback`

  return { appId, appSecret, redirectUri }
}

export function buildInstagramAuthUrl({
  appId,
  redirectUri,
  state,
}: {
  appId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'instagram_business_basic',
    state,
  })

  return `https://www.instagram.com/oauth/authorize?${params.toString()}`
}
