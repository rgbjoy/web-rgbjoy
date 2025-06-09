'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
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

export const MediaLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<{ image?: Media; title?: string }>()
  const [media, setMedia] = useState<Media | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)

    const fetchMedia = async () => {
      if (typeof data?.data?.image === 'number') {
        const res = await fetch(`/api/media/${data.data.image}`)
        if (res.ok) {
          const mediaObj = await res.json()
          setMedia(mediaObj)
        }
      }
      setTitle(data?.data?.title || '')
      setIsLoading(false)
    }
    fetchMedia()
  }, [data])

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
            <Image src={media.url} alt={''} width={64} height={64} />
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
