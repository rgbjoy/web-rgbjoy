'use client'
import { useEffect, useRef, useState } from 'react'
import { IMAGE_VARIANTS, mediaUrl, type MediaKind, type SiteMedia } from '../data/media'
import styles from './dashboard.module.css'

async function resize(file: File, kind: MediaKind) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, or WebP under 10 MB.')
  const image = await createImageBitmap(file)
  try {
    if (image.width * image.height > 40_000_000) throw new Error('Choose an image smaller than 40 megapixels.')
    if (kind === 'icon' && image.width !== image.height) throw new Error('Choose a square icon, ideally 512×512.')
    const data = new FormData()
    let preview: Blob | undefined
    for (const variant of IMAGE_VARIANTS[kind]) {
      const canvas = document.createElement('canvas')
      canvas.width = variant.width; canvas.height = variant.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not process this image.')
      const scale = Math.max(variant.width / image.width, variant.height / image.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, (variant.width - image.width * scale) / 2, (variant.height - image.height * scale) / 2, image.width * scale, image.height * scale)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not resize image.')), 'image/png'))
      if (!preview) preview = blob
      data.set(variant.file, blob, variant.file)
    }
    return { data, preview: preview! }
  } finally { image.close() }
}
export default function ImageUpload({ kind, current, onChange, onBusy }: { kind: MediaKind; current?: SiteMedia; onChange: (data: FormData | undefined) => void; onBusy: (busy: boolean) => void }) {
  const [pending, setPending] = useState<{ data: FormData; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const selection = useRef(0)
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.preview) }, [pending])
  const currentUrl = current ? mediaUrl(current.version, IMAGE_VARIANTS[kind][0].file) : kind === 'icon' ? '/default-icon.png' : undefined
  async function choose(file?: File) {
    if (!file) return
    const token = ++selection.current
    setBusy(true); onBusy(true); onChange(undefined); setMessage(''); setPending(null)
    try {
      const result = await resize(file, kind)
      if (selection.current === token) { setPending({ data: result.data, preview: URL.createObjectURL(result.preview) }); onChange(result.data) }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not process image.') }
    finally { if (selection.current === token) { setBusy(false); onBusy(false) } }
  }
  const src = pending?.preview || currentUrl
  return <section className={styles.imageUpload}>
    <h3>{kind === 'icon' ? 'Site icon · 512×512' : 'Social card · 1200×630'}</h3>
    <p>{kind === 'icon' ? 'Upload a square image. Favicon and Apple-touch sizes are created automatically.' : 'Used when a page is shared. Images are center-cropped to fit; preview before saving.'}</p>
    {src && <img className={kind === 'icon' ? styles.iconPreview : styles.socialPreview} src={src} alt={kind === 'icon' ? 'Site icon preview' : 'Social card preview'} /> /* eslint-disable-line @next/next/no-img-element */}
    <label>Choose {kind === 'icon' ? 'icon' : 'social image'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = '' }} /></label>

    <p role="status">{busy && !pending ? 'Processing image…' : message}</p>
  </section>
}
