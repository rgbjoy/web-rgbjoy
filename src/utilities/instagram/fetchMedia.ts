export type InstagramMediaItem = {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
}

const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'

export async function fetchInstagramMedia({
  accessToken,
  limit = 9,
}: {
  accessToken: string
  limit?: number
}): Promise<InstagramMediaItem[]> {
  const params = new URLSearchParams({
    fields: MEDIA_FIELDS,
    limit: String(limit),
    access_token: accessToken,
  })

  const response = await fetch(`https://graph.instagram.com/me/media?${params.toString()}`)

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? JSON.stringify(payload.error)
        : `Instagram media fetch failed (${response.status})`
    throw new Error(message)
  }

  const items = Array.isArray(payload?.data) ? payload.data : []
  return items.filter((item) => {
    const type = String(item?.media_type || '')
    return type === 'IMAGE' || type === 'CAROUSEL_ALBUM' || type === 'VIDEO'
  })
}
