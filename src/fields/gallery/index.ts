import type { ArrayField } from 'payload'

export const galleryField = (overrides?: Partial<ArrayField>): ArrayField => {
  return {
    name: 'gallery',
    type: 'array',
    label: 'Gallery',
    minRows: 0,
    fields: [
      {
        name: 'image',
        type: 'upload',
        relationTo: 'media',
        required: true,
      },
    ],
    admin: {
      components: {
        Field: {
          path: '@/fields/gallery/GalleryField#GalleryField',
        },
      },
      description: 'Drag and drop multiple images to create a gallery',
      ...overrides?.admin,
    },
    ...overrides,
  }
}
