'use client'

import NextImage from 'next/image'
import { useState, useEffect, memo } from 'react'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'
import { Media } from '@/payload-types'

interface DataType {
  title?: string
  [key: string]: { title?: string } | string | undefined
}

export default function RowLabel() {
  const { data, rowNumber } = useRowLabel<DataType>()
  const title =
    data.title ||
    Object.values(data).find(
      (val): val is { title: string } => typeof val === 'object' && val !== null && 'title' in val,
    )?.title ||
    rowNumber
  return <div>{title || rowNumber}</div>
}

const mediaCache = new Map<number, Media>()

const MediaLabelImpl: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<{ image?: Media; title?: string }>()
  const [media, setMedia] = useState<Media | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const id = typeof data?.data?.image === 'number' ? data.data.image : undefined
    if (!id) {
      setMedia(null)
      setTitle(data?.data?.title || '')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const cached = mediaCache.get(id)
    if (cached) {
      setMedia(cached)
      setTitle(data?.data?.title || '')
      setIsLoading(false)
      return
    }

    let aborted = false
    ;(async () => {
      const res = await fetch(`/api/media/${id}`)
      if (!aborted && res.ok) {
        const mediaObj = await res.json()
        mediaCache.set(id, mediaObj)
        setMedia(mediaObj)
        setTitle(data?.data?.title || '')
        setIsLoading(false)
      } else if (!aborted) {
        setMedia(null)
        setTitle(data?.data?.title || '')
        setIsLoading(false)
      }
    })()

    return () => {
      aborted = true
    }
  }, [data?.data?.image, data?.data?.title])

  // Check media type
  const isImage = media?.mimeType?.startsWith('image/') || false
  const isVideo = media?.mimeType?.startsWith('video/') || false

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '64px', gap: '16px' }}>
      {isLoading ? (
        <div>Loading...</div>
      ) : media?.url ? (
        <>
          {isImage ? (
            <NextImage src={media.url} alt={''} width={64} height={64} unoptimized />
          ) : isVideo ? (
            <video
              src={media.url}
              width={64}
              height={64}
              autoPlay
              loop
              muted
              style={{ objectFit: 'cover' }}
            />
          ) : null}
          <span>{title}</span>
        </>
      ) : (
        ''
      )}
    </div>
  )
}

export const MediaLabel = memo(MediaLabelImpl)
