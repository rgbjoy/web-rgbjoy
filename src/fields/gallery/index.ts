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
          path: 'src/fields/gallery/GalleryField#GalleryField',
        },
      },
      description: 'Drag files to upload. Drag the ⋮⋮ handle to reorder items in the grid.',
      ...overrides?.admin,
    },
    ...overrides,
  }
}
