'use client'

import React, { useState } from 'react'
import { useDocumentInfo, useAuth, Button } from '@payloadcms/ui'

type RegenerateButtonProps = {
  label: string
  endpoint: string
  disabled?: boolean
}

const RegenerateButton: React.FC<RegenerateButtonProps> = ({ label, endpoint, disabled }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!user || user.role !== 'admin') {
    return null
  }

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
    <>
      <Button
        className="btn--style-pill btn--size-small"
        onClick={handleRegenerate}
        disabled={loading || disabled}
      >
        {loading ? 'Regenerating...' : label}
      </Button>
      {message && <div>{message}</div>}
    </>
  )
}

// Per-document button
export const RegenerateMediaButton: React.FC = () => {
  const { id } = useDocumentInfo()
  if (!id) return null
  return <RegenerateButton label="Regenerate Media" endpoint={`/api/regenerate-media/${id}`} />
}

// Global button
export const RegenerateAllMediaButton: React.FC = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Only show to users with a certain role, e.g., 'admin'
  if (!user || user.role !== 'admin') {
    return null
  }

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 5000)
  }

  const handleRegenerate = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/regenerate-media', { method: 'POST' })
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
    <>
      <Button
        className="btn--style-pill btn--size-small"
        onClick={handleRegenerate}
        disabled={loading}
      >
        {loading ? 'Regenerating...' : 'Regenerate All Media'}
      </Button>
      {message && <div>{message}</div>}
    </>
  )
}
