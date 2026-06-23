'use client'

import React, { useCallback, useState, useRef, useSyncExternalStore } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useField,
  FieldLabel,
  Button,
  useForm,
  TextInput,
  TextareaInput,
  useListDrawer,
} from '@payloadcms/ui'
import type { ArrayFieldClientProps } from 'payload'
import type { Media } from '@/payload-types'
import NextImage from 'next/image'
import './gallery.css'
import Image from 'next/image'

type GalleryItem = {
  image: Media | number
  title?: string
  description?: string
}

type GalleryFieldProps = ArrayFieldClientProps

const subscribeToClientMount = () => () => {}
const getClientMounted = () => true
const getServerMounted = () => false

export const GalleryField: React.FC<GalleryFieldProps> = ({ field, path, schemaPath: schemaPathFromProps }) => {
  const fieldPath = path || field.name
  const schemaPath = schemaPathFromProps ?? field.name
  const { getDataByPath, addFieldRow, removeFieldRow, moveFieldRow } = useForm()

  const { rows } = useField({
    hasRows: true,
    path: fieldPath,
    potentiallyStalePath: path,
  })

  const getGalleryData = useCallback((): GalleryItem[] => {
    try {
      const data = getDataByPath(fieldPath)
      return Array.isArray(data) ? (data as GalleryItem[]) : []
    } catch (_error) {
      return []
    }
  }, [getDataByPath, fieldPath])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openDrawerRowId, setOpenDrawerRowId] = useState<string | null>(null)
  const isSortableReady = useSyncExternalStore(
    subscribeToClientMount,
    getClientMounted,
    getServerMounted,
  )

  const galleryItems = React.useMemo(() => {
    const data = getGalleryData()
    if (!rows?.length) {
      return data.map((item, index) => ({
        rowId: String(index),
        item,
        index,
      }))
    }

    return rows.map((row, index) => ({
      rowId: row.id,
      item: data[index],
      index,
    }))
  }, [getGalleryData, rows])

  const handleOpenMoreDrawer = useCallback((rowId: string) => {
    setOpenDrawerRowId(rowId)
  }, [])

  const handleCloseMoreDrawer = useCallback(() => {
    setOpenDrawerRowId(null)
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
      const currentValue = getGalleryData()

      // Check if this media is already in the gallery
      const alreadyExists = currentValue.some((item) => {
        const itemId = typeof item.image === 'number' ? item.image : item.image?.id
        return itemId === mediaId
      })

      if (alreadyExists) {
        return
      }

      // Add the selected media to the gallery
      addFieldRow({
        path: fieldPath,
        schemaPath,
        rowIndex: currentValue.length,
        subFieldState: {
          image: { initialValue: mediaId, valid: true, value: mediaId },
          title: { initialValue: '', valid: true, value: '' },
          description: { initialValue: '', valid: true, value: '' },
        },
      })

      closeDrawer()
    },
    [addFieldRow, fieldPath, schemaPath, getGalleryData, closeDrawer],
  )

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
          return []
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
              const rowIndex = currentGalleryValue.length
              currentGalleryValue = [
                ...currentGalleryValue,
                { image: mediaId, title: '', description: '' },
              ]

              addFieldRow({
                path: fieldPath,
                schemaPath,
                rowIndex,
                subFieldState: {
                  image: { initialValue: mediaId, valid: true, value: mediaId },
                  title: { initialValue: '', valid: true, value: '' },
                  description: { initialValue: '', valid: true, value: '' },
                },
              })

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
    [addFieldRow, fieldPath, schemaPath, getDataByPath],
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
          return []
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
              const rowIndex = currentGalleryValue.length
              currentGalleryValue = [
                ...currentGalleryValue,
                { image: mediaId, title: '', description: '' },
              ]

              addFieldRow({
                path: fieldPath,
                schemaPath,
                rowIndex,
                subFieldState: {
                  image: { initialValue: mediaId, valid: true, value: mediaId },
                  title: { initialValue: '', valid: true, value: '' },
                  description: { initialValue: '', valid: true, value: '' },
                },
              })

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
    [addFieldRow, fieldPath, schemaPath, getDataByPath],
  )

  const handleRemove = useCallback(
    (index: number) => {
      removeFieldRow({
        path: fieldPath,
        rowIndex: index,
      })
    },
    [removeFieldRow, fieldPath],
  )

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return

      moveFieldRow({
        path: fieldPath,
        moveFromIndex: fromIndex,
        moveToIndex: toIndex,
      })
    },
    [moveFieldRow, fieldPath],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = rows?.findIndex((row) => row.id === active.id) ?? -1
      const newIndex = rows?.findIndex((row) => row.id === over.id) ?? -1
      if (oldIndex === -1 || newIndex === -1) return

      handleReorder(oldIndex, newIndex)
    },
    [rows, handleReorder],
  )

  const sortableItemIds = rows?.map((row) => row.id) ?? []

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

      {/* Gallery Grid — dnd-kit IDs differ between SSR and client, so sortable mounts after hydration */}
      {galleryItems.length > 0 &&
        (isSortableReady ? (
          <DndContext
            id="art-gallery-field"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableItemIds} strategy={rectSortingStrategy}>
              <div className="gallery-grid">
                {galleryItems.map(({ rowId, item, index }) =>
                  item ? (
                    <SortableGalleryItem
                      key={rowId}
                      id={rowId}
                      item={item}
                      index={index}
                      fieldPath={fieldPath}
                      openDrawerRowId={openDrawerRowId}
                      onOpenMoreDrawer={handleOpenMoreDrawer}
                      onCloseMoreDrawer={handleCloseMoreDrawer}
                      onRemove={handleRemove}
                    />
                  ) : null,
                )}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="gallery-grid">
            {galleryItems.map(({ rowId, item, index }) =>
              item ? (
                <GalleryGridItem
                  key={rowId}
                  id={rowId}
                  item={item}
                  index={index}
                  fieldPath={fieldPath}
                  openDrawerRowId={openDrawerRowId}
                  onOpenMoreDrawer={handleOpenMoreDrawer}
                  onCloseMoreDrawer={handleCloseMoreDrawer}
                  onRemove={handleRemove}
                />
              ) : null,
            )}
          </div>
        ))}
    </div>
  )
}

type GalleryGridItemProps = {
  id: string
  index: number
  item: GalleryItem
  fieldPath: string
  openDrawerRowId: string | null
  onOpenMoreDrawer: (rowId: string) => void
  onCloseMoreDrawer: () => void
  onRemove: (index: number) => void
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  wrapperRef?: (node: HTMLElement | null) => void
  wrapperStyle?: React.CSSProperties
  isDragging?: boolean
}

const GalleryGridItem: React.FC<GalleryGridItemProps> = ({
  id,
  index,
  item,
  fieldPath,
  openDrawerRowId,
  onOpenMoreDrawer,
  onCloseMoreDrawer,
  onRemove,
  dragHandleProps,
  wrapperRef,
  wrapperStyle,
  isDragging = false,
}) => {
  const imageId = typeof item.image === 'number' ? item.image : item.image?.id
  const image =
    typeof item.image === 'object' && item.image !== null && 'url' in item.image ? item.image : null

  const itemPath = `${fieldPath}.${index}`
  const titlePath = `${itemPath}.title`
  const descriptionPath = `${itemPath}.description`
  const isVideo = image?.mimeType?.startsWith('video/') || image?.mimeType === 'video/mp4'

  return (
    <div ref={wrapperRef} style={wrapperStyle} className="gallery-item-wrapper">
      <div className={`gallery-item ${isDragging ? 'is-dragging' : ''}`}>
        <button
          type="button"
          className="gallery-drag-handle"
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          ⋮⋮
        </button>
        {isVideo && image?.url ? (
          <video
            key={`media-video-${imageId}-${image.url}`}
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
            key={`media-${imageId}-${image.url}`}
            src={image.url}
            alt={image.alt || ''}
            unoptimized
            width={image.width || 0}
            height={image.height || 0}
          />
        ) : imageId ? (
          <GalleryImageLoader key={`media-${imageId}`} id={imageId} />
        ) : (
          <div className="gallery-item-loading">Loading...</div>
        )}
        <div className="gallery-item-actions">
          <Button
            buttonStyle="none"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(index)
            }}
            className="remove-button"
          >
            ×
          </Button>
          <Button
            buttonStyle="none"
            onClick={(e) => {
              e.stopPropagation()
              onOpenMoreDrawer(id)
            }}
            className="more-button"
          >
            +
          </Button>
        </div>
      </div>
      {openDrawerRowId === id && (
        <GalleryItemDrawer
          titlePath={titlePath}
          descriptionPath={descriptionPath}
          onClose={onCloseMoreDrawer}
        />
      )}
    </div>
  )
}

const SortableGalleryItem: React.FC<Omit<GalleryGridItemProps, 'dragHandleProps' | 'wrapperRef' | 'wrapperStyle' | 'isDragging'>> = (
  props,
) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  })

  return (
    <GalleryGridItem
      {...props}
      wrapperRef={setNodeRef}
      wrapperStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
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
    let cancelled = false

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
        if (cancelled) return
        if (data) {
          setMedia(data)
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (isLoading) return <div className="gallery-item-loading">Loading...</div>
  if (!media?.url) return null

  // Check if this is a video
  const isVideo = media.mimeType?.startsWith('video/') || media.mimeType === 'video/mp4'

  if (isVideo) {
    return (
      <video
        key={`media-video-${id}-${media.url}`}
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
      key={`media-image-${id}-${media.url}`}
      src={media.url}
      alt={media.alt || ''}
      width={media.width || 0}
      height={media.height || 0}
      unoptimized
    />
  )
}
