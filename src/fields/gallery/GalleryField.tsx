'use client'

import React, { useCallback, useState, useRef } from 'react'
import {
  useField,
  FieldLabel,
  Button,
  useForm,
  useFormFields,
  TextInput,
  TextareaInput,
  useListDrawer,
} from '@payloadcms/ui'
import type { ArrayFieldClientProps } from 'payload'
import type { Media } from '@/payload-types'
import NextImage from 'next/image'
import './gallery.scss'
import Image from 'next/image'

type GalleryFieldProps = ArrayFieldClientProps

export const GalleryField: React.FC<GalleryFieldProps> = ({ field, path }) => {
  const fieldPath = path || field.name
  const { dispatchFields, getDataByPath } = useForm()

  const { value, setValue } = useField<
    Array<{
      image: Media | number
      title?: string
      description?: string
    }>
  >({
    path: fieldPath,
  })

  // Get the actual value from the form using useFormFields - this will be reactive
  const formValue = useFormFields(([fields]) => {
    const fieldData = fields[fieldPath]
    return fieldData?.value
  })

  // Also try getDataByPath as a fallback - make it reactive
  const actualValue = React.useMemo(() => {
    try {
      const data = getDataByPath(fieldPath)
      return data
    } catch (_error) {
      return undefined
    }
  }, [getDataByPath, fieldPath])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openDrawerIndex, setOpenDrawerIndex] = useState<number | null>(null)

  // Keep track of the last known good gallery value to prevent disappearing after save
  const lastKnownGalleryValueRef = useRef<
    Array<{ image: Media | number; title?: string; description?: string }>
  >([])

  const handleOpenMoreDrawer = useCallback((index: number) => {
    setOpenDrawerIndex(index)
  }, [])

  // Set up ListDrawer for selecting existing media
  const [ListDrawer, , { openDrawer, closeDrawer }] = useListDrawer({
    collectionSlugs: ['media'],
    selectedCollection: 'media',
    uploads: true,
  })

  // Handle media selection from the drawer
  const handleMediaSelect = useCallback(
    (args: { collectionSlug: string; doc: any; docID: string }) => {
      const { doc } = args
      const mediaId = typeof doc.id === 'string' ? parseInt(doc.id, 10) : doc.id

      // Get current value
      const currentValue = Array.isArray(formValue)
        ? formValue
        : Array.isArray(value)
          ? value
          : Array.isArray(actualValue)
            ? actualValue
            : []

      // Check if this media is already in the gallery
      const alreadyExists = currentValue.some((item) => {
        const itemId = typeof item.image === 'number' ? item.image : item.image?.id
        return itemId === mediaId
      })

      if (alreadyExists) {
        return
      }

      // Add the selected media to the gallery
      const newValue = [...currentValue, { image: mediaId, title: '', description: '' }]

      // Update the ref FIRST to ensure memo uses the latest value
      lastKnownGalleryValueRef.current = newValue

      // Update gallery
      dispatchFields({
        type: 'UPDATE',
        path: fieldPath,
        value: newValue,
      })
      setValue(newValue)

      // Close the drawer after selection
      closeDrawer()
    },
    [dispatchFields, fieldPath, formValue, value, actualValue, setValue, closeDrawer],
  )

  // Prioritize value (from useField) over formValue since value updates immediately via setValue
  // formValue can be stale or delayed, so value is more reliable for our custom component
  // actualValue (from getDataByPath) can be stale, so use it as fallback only
  // IMPORTANT: If we have a more recent value in the ref (from a delete operation), prioritize it
  const galleryValue = React.useMemo(() => {
    // Always ensure we return an array, even if the value is undefined or not an array
    // Prioritize value first since it updates immediately via setValue
    // After save, Payload might temporarily return the document ID (number) instead of the array
    // So we need to check if the value is a number and ignore it
    let result: Array<{ image: Media | number; title?: string; description?: string }> | null = null
    let source = 'none'

    // Prioritize value over formValue - value updates immediately via setValue
    if (Array.isArray(value)) {
      result = value
      source = 'value'
    } else if (Array.isArray(formValue)) {
      result = formValue
      source = 'formValue'
    } else if (Array.isArray(actualValue)) {
      // Only use actualValue if it matches our ref
      // If ref differs (more or fewer items), prefer the ref as it's more recent
      if (
        lastKnownGalleryValueRef.current.length > 0 &&
        actualValue.length !== lastKnownGalleryValueRef.current.length
      ) {
        // actualValue differs from ref - ref is more recent (from add/delete operation)
        result = lastKnownGalleryValueRef.current
        source = 'ref (prevent stale actualValue)'
      } else {
        result = actualValue
        source = 'actualValue'
      }
    }

    // If we found a valid array, check if we should use it or prefer the ref
    if (result) {
      // If the ref was recently updated (different length or content), prefer it over stale sources
      // This prevents stale actualValue/formValue from overriding recent changes
      if (
        lastKnownGalleryValueRef.current.length > 0 &&
        (source === 'actualValue' || source === 'formValue') &&
        (result.length !== lastKnownGalleryValueRef.current.length ||
          JSON.stringify(result) !== JSON.stringify(lastKnownGalleryValueRef.current))
      ) {
        // Source is stale, use ref instead
        return lastKnownGalleryValueRef.current
      }

      // Update ref if result is different
      if (JSON.stringify(result) !== JSON.stringify(lastKnownGalleryValueRef.current)) {
        lastKnownGalleryValueRef.current = result
      }
      return result
    }

    // If none are arrays, return the last known good value to prevent disappearing after save
    // This handles the case where after save, the value might temporarily be undefined or a number
    return lastKnownGalleryValueRef.current
  }, [value, formValue, actualValue])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type.startsWith('image/') || file.type === 'video/mp4',
      )

      if (files.length === 0) return

      setUploading(true)

      try {
        // Get initial gallery value from the reactive galleryValue, ensuring we have the latest state
        // Use a function to get the latest value from the form state
        const getCurrentGalleryValue = () => {
          const currentFormValue = getDataByPath(fieldPath)
          if (Array.isArray(currentFormValue)) {
            return [...currentFormValue]
          }
          // Fallback to galleryValue if getDataByPath doesn't work
          return Array.isArray(galleryValue) ? [...galleryValue] : []
        }

        let currentGalleryValue = getCurrentGalleryValue()

        // Upload files sequentially and update gallery after each successful upload
        for (const file of files) {
          try {
            // Upload the file
            try {
              // Ensure alt field is always valid
              const altText = file.name.replace(/\.[^/.]+$/, '').trim() || 'Uploaded Image'

              // Create FormData for file upload
              const formData = new FormData()
              formData.append('file', file, file.name)

              // Prepare alt text - always use a non-empty default
              const finalAltText = altText && altText.trim().length > 0 ? altText.trim() : 'Image'
              formData.append('alt', finalAltText)

              let response: Response
              try {
                response = await fetch('/api/media', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    // Don't set Content-Type - let browser set it with boundary for multipart/form-data
                  },
                  body: formData,
                })
              } catch {
                continue
              }

              if (!response.ok) {
                continue
              }

              // Parse response
              let result: any
              try {
                result = await response.json()
              } catch {
                continue
              }

              // Check if result has errors property
              if ('errors' in result && result.errors) {
                continue
              }

              // Extract ID from result - Payload REST API can return different formats:
              // 1. { doc: { id, ... } } - standard format
              // 2. { id, ... } - direct format
              // 3. The result itself might be the document
              let id: number | string | undefined

              if (result.doc && result.doc.id) {
                // Standard format: { doc: { id, ... } }
                id = result.doc.id
              } else if (result.id) {
                // Direct format: { id, ... }
                id = result.id
              } else if (typeof result === 'object' && result && 'id' in result) {
                // Result itself is the document
                id = result.id
              }

              if (!id) {
                continue
              }

              // Convert string ID to number if needed
              const mediaId = typeof id === 'string' ? parseInt(id, 10) : id

              // Verify we got a valid ID
              if (isNaN(mediaId) || mediaId <= 0) {
                continue
              }

              // Add the new media to our accumulator
              const newGalleryValue = [
                ...currentGalleryValue,
                { image: mediaId, title: '', description: '' },
              ]

              // Update the accumulator for the next iteration
              currentGalleryValue = newGalleryValue

              // Update the ref FIRST to ensure memo uses the latest value
              lastKnownGalleryValueRef.current = newGalleryValue

              // Update gallery immediately after each successful upload
              dispatchFields({
                type: 'UPDATE',
                path: fieldPath,
                value: newGalleryValue,
              })
              setValue(newGalleryValue)

              // Update the media document with the alt field if needed
              // Payload with S3 storage may require fields to be set after upload
              if (finalAltText && finalAltText !== 'Image') {
                try {
                  await fetch(`/api/media/${mediaId}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      alt: finalAltText,
                    }),
                  })
                } catch (_updateError) {
                  // Don't fail the upload if alt update fails
                }
              }
            } catch {
              // Upload error - continue to next file
            }
          } catch {
            // Error processing file - continue to next file
          }

          // Add a small delay between uploads to avoid rate limiting
          if (files.indexOf(file) < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200))
          }
        }
      } catch {
        // Error uploading file
      } finally {
        setUploading(false)
      }
    },
    [dispatchFields, fieldPath, getDataByPath, galleryValue, setValue],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(
        (file) => file.type.startsWith('image/') || file.type === 'video/mp4',
      )

      if (files.length === 0) return

      setUploading(true)

      try {
        // Get initial gallery value from the reactive galleryValue, ensuring we have the latest state
        // Use a function to get the latest value from the form state
        const getCurrentGalleryValue = () => {
          const currentFormValue = getDataByPath(fieldPath)
          if (Array.isArray(currentFormValue)) {
            return [...currentFormValue]
          }
          // Fallback to galleryValue if getDataByPath doesn't work
          return Array.isArray(galleryValue) ? [...galleryValue] : []
        }

        let currentGalleryValue = getCurrentGalleryValue()

        // Upload files sequentially and update gallery after each successful upload
        for (const file of files) {
          try {
            // Upload the file
            try {
              // Ensure alt field is always valid
              const altText = file.name.replace(/\.[^/.]+$/, '').trim() || 'Uploaded Image'

              // Create FormData for file upload
              const formData = new FormData()
              formData.append('file', file, file.name)

              // Prepare alt text - always use a non-empty default
              const finalAltText = altText && altText.trim().length > 0 ? altText.trim() : 'Image'
              formData.append('alt', finalAltText)

              let response: Response
              try {
                response = await fetch('/api/media', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    // Don't set Content-Type - let browser set it with boundary for multipart/form-data
                  },
                  body: formData,
                })
              } catch {
                continue
              }

              if (!response.ok) {
                continue
              }

              // Parse response
              let result: any
              try {
                result = await response.json()
              } catch {
                continue
              }

              // Check if result has errors property
              if ('errors' in result && result.errors) {
                continue
              }

              // Extract ID from result - Payload REST API can return different formats:
              // 1. { doc: { id, ... } } - standard format
              // 2. { id, ... } - direct format
              // 3. The result itself might be the document
              let id: number | string | undefined

              if (result.doc && result.doc.id) {
                // Standard format: { doc: { id, ... } }
                id = result.doc.id
              } else if (result.id) {
                // Direct format: { id, ... }
                id = result.id
              } else if (typeof result === 'object' && result && 'id' in result) {
                // Result itself is the document
                id = result.id
              }

              if (!id) {
                continue
              }

              // Convert string ID to number if needed
              const mediaId = typeof id === 'string' ? parseInt(id, 10) : id

              // Verify we got a valid ID
              if (isNaN(mediaId) || mediaId <= 0) {
                continue
              }

              // Add the new media to our accumulator
              const newGalleryValue = [
                ...currentGalleryValue,
                { image: mediaId, title: '', description: '' },
              ]

              // Update the accumulator for the next iteration
              currentGalleryValue = newGalleryValue

              // Update the ref FIRST to ensure memo uses the latest value
              lastKnownGalleryValueRef.current = newGalleryValue

              // Update gallery immediately after each successful upload
              dispatchFields({
                type: 'UPDATE',
                path: fieldPath,
                value: newGalleryValue,
              })
              setValue(newGalleryValue)

              // Update the media document with the alt field if needed
              // Payload with S3 storage may require fields to be set after upload
              if (finalAltText && finalAltText !== 'Image') {
                try {
                  await fetch(`/api/media/${mediaId}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      alt: finalAltText,
                    }),
                  })
                } catch (_updateError) {
                  // Don't fail the upload if alt update fails
                }
              }
            } catch {
              // Upload error - continue to next file
            }
          } catch {
            // Error processing file - continue to next file
          }

          // Add a small delay between uploads to avoid rate limiting
          if (files.indexOf(file) < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200))
          }
        }
      } catch {
        // Error uploading file
      } finally {
        setUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [dispatchFields, fieldPath, getDataByPath, galleryValue, setValue],
  )

  const handleRemove = useCallback(
    (index: number) => {
      // Use the reactive galleryValue which should be up-to-date
      const currentValue = Array.isArray(galleryValue) ? [...galleryValue] : []

      if (index < 0 || index >= currentValue.length) {
        return
      }

      // Calculate new value
      const newValue = currentValue.filter((_, i) => i !== index)

      // Update the ref FIRST to prevent stale values from being used in memo recalculation
      lastKnownGalleryValueRef.current = newValue

      // Use REMOVE_ROW - this is the proper way to remove items from array fields
      // This should update the form state correctly without reading stale values
      dispatchFields({
        type: 'REMOVE_ROW',
        path: fieldPath,
        rowIndex: index,
      })

      // Update via setValue to ensure immediate UI update
      // This should work now that REMOVE_ROW has updated the form state
      setValue(newValue)
    },
    [dispatchFields, fieldPath, galleryValue, setValue],
  )

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      // Use the reactive galleryValue which is always up-to-date
      const currentValue = Array.isArray(galleryValue) ? [...galleryValue] : []

      // Calculate new value by moving the item
      const newValue = [...currentValue]
      const [movedItem] = newValue.splice(fromIndex, 1)
      if (movedItem) {
        newValue.splice(toIndex, 0, movedItem)
      }

      // Update the ref FIRST to ensure memo uses the latest value
      lastKnownGalleryValueRef.current = newValue

      // Use MOVE_ROW to sync with form state
      dispatchFields({
        type: 'MOVE_ROW',
        path: fieldPath,
        moveFromIndex: fromIndex,
        moveToIndex: toIndex,
      })

      // Then update via setValue to ensure immediate UI update
      setValue(newValue)
    },
    [dispatchFields, fieldPath, galleryValue, setValue],
  )

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="gallery-field">
      <FieldLabel label={field.label} required={field.required} />
      {field.admin?.description && (
        <div className="field-description">
          {typeof field.admin.description === 'string' ? field.admin.description : null}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/mp4"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Media Library Drawer */}
      <ListDrawer
        selectedCollection="media"
        onSelect={handleMediaSelect}
        enableRowSelections={false}
      />

      {/* Action Buttons */}
      <div className="gallery-actions">
        <Button
          buttonStyle="secondary"
          onClick={(e) => {
            e.stopPropagation()
            openDrawer()
          }}
          className="select-media-button"
        >
          Select from Media Library
        </Button>
      </div>

      {/* Drop Zone */}
      <div
        className={`gallery-drop-zone ${isDragging ? 'is-dragging' : ''} ${uploading ? 'uploading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleDropZoneClick}
      >
        <div className="drop-zone-content">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p>
            {uploading ? 'Uploading...' : 'Drag and drop images or videos here, or click to upload'}
          </p>
        </div>
      </div>

      {/* Gallery Grid */}
      {galleryValue.length > 0 && (
        <div className="gallery-grid">
          {galleryValue.map((item, index) => {
            // Handle both cases: image can be an ID (number) or a populated Media object
            const imageId = typeof item.image === 'number' ? item.image : item.image?.id
            const image =
              typeof item.image === 'object' && item.image !== null && 'url' in item.image
                ? item.image
                : null

            const itemPath = `${fieldPath}.${index}`
            const titlePath = `${itemPath}.title`
            const descriptionPath = `${itemPath}.description`

            // Check if this is a video (mp4)
            const isVideo = image?.mimeType?.startsWith('video/') || image?.mimeType === 'video/mp4'

            return (
              <div key={index} className="gallery-item-wrapper">
                <div className="gallery-item">
                  {isVideo && image?.url ? (
                    <video
                      src={image.url}
                      muted
                      autoPlay
                      loop
                      playsInline
                      className="gallery-video"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : image?.url ? (
                    <NextImage
                      src={image.url}
                      alt={image.alt || ''}
                      unoptimized
                      width={image.width || 0}
                      height={image.height || 0}
                    />
                  ) : imageId ? (
                    <GalleryImageLoader id={imageId} />
                  ) : (
                    <div className="gallery-item-loading">Loading...</div>
                  )}
                  <div className="gallery-item-actions">
                    {index > 0 && (
                      <Button
                        buttonStyle="none"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMove(index, index - 1)
                        }}
                        className="move-button"
                      >
                        ←
                      </Button>
                    )}
                    {index < galleryValue.length - 1 && (
                      <Button
                        buttonStyle="none"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMove(index, index + 1)
                        }}
                        className="move-button"
                      >
                        →
                      </Button>
                    )}
                    <Button
                      buttonStyle="none"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(index)
                      }}
                      className="remove-button"
                    >
                      ×
                    </Button>
                    <Button
                      buttonStyle="none"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenMoreDrawer(index)
                      }}
                      className="more-button"
                    >
                      +
                    </Button>
                  </div>
                </div>
                {openDrawerIndex === index && (
                  <GalleryItemDrawer
                    titlePath={titlePath}
                    descriptionPath={descriptionPath}
                    onClose={() => setOpenDrawerIndex(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Component for the "+ more" drawer
const GalleryItemDrawer: React.FC<{
  titlePath: string
  descriptionPath: string
  onClose: () => void
}> = ({ titlePath, descriptionPath, onClose }) => {
  const { value: titleValue, setValue: setTitleValue } = useField<string>({ path: titlePath })
  const { value: descriptionValue, setValue: setDescriptionValue } = useField<string>({
    path: descriptionPath,
  })

  return (
    <div className="gallery-item-drawer">
      <div className="gallery-item-drawer-content">
        <Button buttonStyle="none" onClick={onClose} className="close-drawer-button">
          ×
        </Button>
        <div className="gallery-item-drawer-fields">
          <div className="gallery-item-field">
            <FieldLabel label="Title" htmlFor={titlePath} />
            <TextInput path={titlePath} value={titleValue || ''} onChange={setTitleValue} />
          </div>
          <div className="gallery-item-field">
            <FieldLabel label="Description" htmlFor={descriptionPath} />
            <TextareaInput
              path={descriptionPath}
              value={descriptionValue || ''}
              onChange={(e) => setDescriptionValue(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Component to load media by ID (image or video)
const GalleryImageLoader: React.FC<{ id: number }> = ({ id }) => {
  const [media, setMedia] = useState<Media | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  React.useEffect(() => {
    fetch(`/api/media/${id}`, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) {
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          setMedia(data)
        }
        setIsLoading(false)
      })
      .catch(() => {
        setIsLoading(false)
      })
  }, [id])

  if (isLoading) return <div className="gallery-item-loading">Loading...</div>
  if (!media?.url) return null

  // Check if this is a video
  const isVideo = media.mimeType?.startsWith('video/') || media.mimeType === 'video/mp4'

  if (isVideo) {
    return (
      <video
        src={media.url}
        muted
        autoPlay
        loop
        playsInline
        className="gallery-video"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }

  return (
    <Image
      src={media.url}
      alt={media.alt || ''}
      width={media.width || 0}
      height={media.height || 0}
      unoptimized
    />
  )
}
