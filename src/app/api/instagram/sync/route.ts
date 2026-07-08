import { NextRequest, NextResponse } from 'next/server'
import { fetchInstagramMedia } from '@/utilities/instagram/fetchMedia'

export async function POST(request: NextRequest) {
  let body: { access_token?: string } | null = null

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const accessToken = body?.access_token?.trim()

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Missing access_token in request body' },
      { status: 400 },
    )
  }

  try {
    const media = await fetchInstagramMedia({ accessToken, limit: 9 })
    return NextResponse.json({
      ok: true,
      count: media.length,
      media,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Instagram sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
