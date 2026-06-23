import { GlobalConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { revalidateGlobal } from '../hooks/revalidateGlobal'

export const Art: GlobalConfig = {
  slug: 'art',
  label: 'Art Page',
  typescript: {
    interface: 'Art',
  },
  graphQL: {
    name: 'Art',
  },
  admin: {
    group: 'Content',
    preview: (doc, { req }) => {
      return `${req.protocol}//${req.headers.get('host')}/${doc.globalType}`
    },
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'header',
      type: 'text',
      label: 'Page Title',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Page Content',
      editor: lexicalEditor({}),
    },
    {
      name: 'gallery',
      type: 'array',
      label: 'Gallery',
      minRows: 0,
      labels: {
        singular: 'Gallery item',
        plural: 'Gallery items',
      },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'title',
          type: 'text',
          label: 'Title',
        },
        {
          name: 'description',
          type: 'textarea',
          label: 'Description',
        },
      ],
      admin: {
        components: {
          Field: {
            path: 'src/fields/gallery/GalleryField#GalleryField',
          },
        },
        description: 'Drag files to upload. Drag the ⋮⋮ handle to reorder items in the grid.',
      },
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal],
  },
}
