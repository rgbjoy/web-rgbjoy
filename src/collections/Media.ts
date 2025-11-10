import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: () => true, // Allow authenticated users to create media
  },
  upload: {
    disableLocalStorage: true,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 300,
        height: undefined,
        position: 'centre',
      },
      {
        name: 'card',
        width: 600,
        height: undefined,
        position: 'centre',
      },
      {
        name: 'tablet',
        width: 1024,
        height: undefined,
        position: 'centre',
      },
    ],
    formatOptions: {
      format: 'webp',
      options: {
        quality: 80,
      },
    },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: false, // Temporarily make it optional to test upload
      defaultValue: 'Image', // Set a default value
    },
  ],
  admin: {
    components: {
      beforeListTable: ['src/components/RegenerateMediaButton#RegenerateAllMediaButton'],
      edit: {
        beforeDocumentControls: ['src/components/RegenerateMediaButton#RegenerateMediaButton'],
      },
    },
  },
}
