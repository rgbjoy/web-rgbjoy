'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type RegenerateButtonProps = {
  label: string
  endpoint: string
  disabled?: boolean
}

const RegenerateButton: React.FC<RegenerateButtonProps> = ({ label, endpoint, disabled }) => {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 5000)
  }

  const handleRegenerate = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        showMessage(data.message)
      } else {
        showMessage('Failed to start regeneration.')
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Error occurred.')
    }
    setLoading(false)
  }

  return (
    <div style={{ margin: '1em 0' }}>
      <button onClick={handleRegenerate} disabled={loading || disabled}>
        {loading ? 'Regenerating...' : label}
      </button>
      {message && <div>{message}</div>}
    </div>
  )
}

// Per-document button
export const RegenerateMediaButton: React.FC = () => {
  const { id } = useDocumentInfo()
  if (!id) return null
  return <RegenerateButton label="Regenerate This Media" endpoint={`/api/regenerate-media/${id}`} />
}

// Global button
export const RegenerateAllMediaButton: React.FC = () => (
  <RegenerateButton label="Regenerate All Media" endpoint="/api/regenerate-media" />
)
